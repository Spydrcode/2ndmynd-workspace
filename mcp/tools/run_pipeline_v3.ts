/**
 * PIPELINE v3: Decision Closure Orchestrator (Coherence Engine)
 * 
 * Implements Intent → Tension → Choice pipeline.
 * DOCTRINE:
 * - We are NOT a dashboard/KPI/benchmarking company.
 * - No external comparisons, no golden standards, no peer benchmarks.
 * - Calm, non-judgmental language anchored to the owner's stated intent.
 * - Finite conclusions, max 2 paths, explicit non-actions, clean exits.
 */

// LEGACY-ACTIVE: run_pipeline_v3 remains in service for current product flows.
// v4 kernel entrypoint is src/intelligence_v4/pipeline/run_pipeline_v4.ts.
import crypto from "node:crypto";
import Ajv, { type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import type { SnapshotV2 } from "../../lib/decision/v2/conclusion_schema_v2";
import type {
  DecisionClosureArtifact,
  OwnerIntentProfile,
  BusinessRealityModel,
  StructuralFinding,
  PrimaryConstraint,
  DecisionPath,
  CommitmentGate,
  CommitmentPlan,
  AccountabilitySpec,
  OutcomeReview,
  DoctrineChecks,
} from "../../schemas/decision_closure";
import { endStateSchema } from "../../schemas/decision_closure";
import { handler as computeSignals, type ComputedSignals } from "./compute_signals_v2";
import { handler as validateDoctrine } from "./validate_doctrine_v1";
import { checkFlipFlop, lockConclusion } from "./locked_state_persistence";
import { runCoherenceEngine, runCoherenceEngineV3, type IntentIntake } from "../../src/lib/coherence/index";
import { coherenceToLegacyArtifact } from "../../src/lib/coherence/bridge_legacy";
import { computeCoherenceDrift } from "../../src/lib/coherence/coherence_drift";
import { presentCoherenceSnapshot, type PresentedCoherenceArtifact } from "../../src/lib/present/present_coherence";
import type { CoherenceSnapshot, CoherenceDrift } from "../../src/lib/types/coherence_engine";
import type { OwnerIntentIntake, IntentOverrides } from "../../src/lib/types/intent_intake";
import { getStore } from "../../src/lib/intelligence/store";
import ownerIntentIntakeSchema from "../../schemas/owner_intent_intake.schema.json";

const ajv = new Ajv({ allErrors: true, strict: true, allowUnionTypes: true });
addFormats(ajv);
const validateOwnerIntentIntake = ajv.compile(
  ownerIntentIntakeSchema as Record<string, unknown>
) as ValidateFunction<OwnerIntentIntake>;

export const tool = {
  name: "pipeline.run_v3",
  description: "Full Decision Closure Pipeline with 3 modes: initial (generate paths), commit (record choice), monthly_review (validate outcomes)",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["mode", "client_id"],
    properties: {
      mode: {
        type: "string",
        enum: ["initial", "commit", "monthly_review"],
        description: "initial: generate paths | commit: record choice + lock | monthly_review: validate outcomes",
      },
      client_id: {
        type: "string",
        description: "Client identifier for locked state persistence",
      },
      snapshot: {
        type: "object",
        description: "snapshot_v2 with activity signals (required for initial and monthly_review)",
      },
      owner_intent: {
        type: "object",
        description: "OwnerIntentProfile (legacy, optional for initial)",
      },
      intent_intake: {
        type: "object",
        description: "IntentIntake for Coherence Engine (legacy free-text format)",
      },
      owner_intent_intake: {
        ...ownerIntentIntakeSchema,
        description: "OwnerIntentIntake (7-question format, preferred for initial mode)",
      },
      intent_overrides: {
        type: "object",
        additionalProperties: false,
        required: ["overrides"],
        properties: {
          run_id: { type: "string" },
          updated_at: { type: "string" },
          overrides: {
            type: "array",
            maxItems: 10,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["tag", "confirmed"],
              properties: {
                tag: { type: "string" },
                confirmed: { type: "boolean" },
                recorded_at: { type: "string" },
              },
            },
          },
        },
      },
      owner_choice: {
        type: "string",
        enum: ["path_A", "path_B", "neither"],
        description: "Required for commit mode",
      },
      explicit_non_actions: {
        type: "array",
        items: { type: "string" },
        minItems: 1,
        description: "Required for commit mode when choice is path_A or path_B",
      },
      minimal_actions: {
        type: "array",
        description: "Optional for commit mode",
      },
      prior_artifact: {
        type: "object",
        description: "Required for commit and monthly_review modes",
      },
      commitment_details: {
        type: "object",
        description: "For monthly_review: prior commitment details",
      },
      prior_coherence_snapshot: {
        type: "object",
        description: "For monthly_review: previous CoherenceSnapshot for drift analysis",
      },
      run_id: {
        type: "string",
      },
    },
  },
} as const;

export type RunPipelineV3Args = {
  mode: "initial" | "commit" | "monthly_review";
  client_id: string;
  snapshot?: SnapshotV2;
  owner_intent?: OwnerIntentProfile;
  intent_intake?: IntentIntake;
  owner_intent_intake?: OwnerIntentIntake;
  intent_overrides?: IntentOverrides;
  owner_choice?: "path_A" | "path_B" | "neither";
  explicit_non_actions?: string[];
  minimal_actions?: Array<{
    action: string;
    deadline_days: number;
    responsible: "owner" | "team" | "external";
  }>;
  prior_artifact?: DecisionClosureArtifact;
  commitment_details?: {
    commitment_plan: CommitmentPlan;
    accountability_spec: AccountabilitySpec;
    previous_signals: ComputedSignals;
    actions_completed?: string[];
  };
  prior_coherence_snapshot?: CoherenceSnapshot;
  run_id?: string;
};

export async function handler(args: RunPipelineV3Args): Promise<{
  artifact: DecisionClosureArtifact;
  coherence_snapshot: CoherenceSnapshot | null;
  presented_coherence_v1: PresentedCoherenceArtifact | null;
  coherence_drift: CoherenceDrift | null;
  intent_overrides: IntentOverrides | null;
  summary: string;
  end_cleanly?: boolean;
  coherence?: CoherenceSnapshot;
  drift?: CoherenceDrift;
}> {
  const run_id = args.run_id ?? crypto.randomUUID();
  const now = new Date().toISOString();
  const resolvedArgs: RunPipelineV3Args = { ...args, run_id };

  if (resolvedArgs.owner_intent_intake && !validateOwnerIntentIntake(resolvedArgs.owner_intent_intake)) {
    throw new Error("We couldn't validate the intake; please retry.");
  }

  const loadedOverrides = await resolveIntentOverrides(resolvedArgs);

  // Route to appropriate mode handler
  let result:
    | {
        artifact: DecisionClosureArtifact;
        coherence_snapshot?: CoherenceSnapshot;
        coherence_drift?: CoherenceDrift;
        summary: string;
        end_cleanly?: boolean;
      }
    | {
        artifact: DecisionClosureArtifact;
        summary: string;
        end_cleanly?: boolean;
      };

  switch (args.mode) {
    case "initial":
      result = await handleInitialMode({ ...resolvedArgs, intent_overrides: loadedOverrides }, run_id, now);
      break;
    case "commit":
      result = await handleCommitMode(resolvedArgs, run_id, now);
      break;
    case "monthly_review":
      result = await handleMonthlyReviewMode({ ...resolvedArgs, intent_overrides: loadedOverrides }, run_id, now);
      break;
    default:
      throw new Error(`Unknown mode: ${args.mode}`);
  }

  const coherence_snapshot = "coherence_snapshot" in result ? result.coherence_snapshot ?? null : null;
  const coherence_drift = "coherence_drift" in result ? result.coherence_drift ?? null : null;
  const presented_coherence_v1 = coherence_snapshot
    ? presentCoherenceSnapshot(coherence_snapshot, coherence_drift ?? undefined)
    : null;

  return {
    artifact: result.artifact,
    coherence_snapshot,
    presented_coherence_v1,
    coherence_drift,
    intent_overrides: loadedOverrides ?? null,
    summary: result.summary,
    end_cleanly: result.end_cleanly,
    coherence: coherence_snapshot ?? undefined,
    drift: coherence_drift ?? undefined,
  };
}

// ============================================================================
// MODE 1: INITIAL - Generate Decision Paths
// ============================================================================

async function handleInitialMode(
  args: RunPipelineV3Args,
  run_id: string,
  now: string
): Promise<{
  artifact: DecisionClosureArtifact;
  coherence_snapshot: CoherenceSnapshot;
  coherence_drift?: CoherenceDrift;
  summary: string;
  end_cleanly?: boolean;
}> {
  if (!args.snapshot) {
    throw new Error("Mode 'initial' requires snapshot");
  }
  if (!args.owner_intent_intake && !args.intent_intake && !args.owner_intent) {
    throw new Error("Mode 'initial' requires owner_intent_intake (preferred), intent_intake, or owner_intent (legacy)");
  }

  // SYSTEM 1: Compute signals from snapshot
  const computedSignals = await computeSignals({
    snapshot: args.snapshot,
    include_concentration: true,
  });

  // Run the Coherence Engine — prefer 7-question intake (v3), fall back to legacy
  let coherence: CoherenceSnapshot;
  if (args.owner_intent_intake) {
    // New 7-question intake → full value-confidence inference
    coherence = runCoherenceEngineV3({
      run_id,
      intake: args.owner_intent_intake,
      computedSignals,
      snapshot: args.snapshot,
      overrides: args.intent_overrides,
    });
  } else {
    // Legacy IntentIntake or adapted OwnerIntentProfile
    const intake: IntentIntake = args.intent_intake ?? legacyIntentToIntake(args.owner_intent!);
    coherence = runCoherenceEngine({
      run_id,
      intake,
      computedSignals,
      snapshot: args.snapshot,
    });
  }

  // Bridge to legacy artifact for doctrine validation + commit/review compat
  const artifact = coherenceToLegacyArtifact(coherence);
  artifact.client_id = args.client_id;

  // Validate doctrine (strict mode)
  try {
    const validation = await validateDoctrine({ artifact, strict: true });
    artifact.doctrine_checks = validation.doctrine_checks;
  } catch (error) {
    throw new Error(`DOCTRINE GATE BLOCKED: ${error instanceof Error ? error.message : String(error)}`);
  }

  const summary = generateCoherenceSummary(coherence);

  return { artifact, coherence_snapshot: coherence, coherence_drift: undefined, summary, end_cleanly: false };
}

// Adapt legacy OwnerIntentProfile to IntentIntake
function legacyIntentToIntake(legacy: OwnerIntentProfile): IntentIntake {
  return {
    value_proposition_statement: `Business focused on ${legacy.primary_priority}`,
    priorities_ranked: [legacy.primary_priority],
    non_negotiables: legacy.non_negotiables,
    anti_goals: [],
    definition_of_success: `Achieve ${legacy.primary_priority} within ${legacy.time_horizon.replace("_", " ")}`,
    boundaries: {
      risk: legacy.risk_appetite === "low" ? "Conservative approach" : undefined,
    },
    context_notes: `Change appetite: ${legacy.change_appetite}. Time horizon: ${legacy.time_horizon}.`,
  };
}

// ============================================================================
// MODE 2: COMMIT - Record Owner Choice + Lock Conclusion
// ============================================================================

async function handleCommitMode(
  args: RunPipelineV3Args,
  run_id: string,
  now: string
): Promise<{ artifact: DecisionClosureArtifact; summary: string; end_cleanly?: boolean }> {
  if (!args.prior_artifact || !args.owner_choice) {
    throw new Error("Mode 'commit' requires prior_artifact and owner_choice");
  }

  const priorArtifact = args.prior_artifact;

  // Update commitment gate
  const commitmentGate: CommitmentGate = {
    owner_choice: args.owner_choice,
    commitment_made: args.owner_choice !== "neither",
    chosen_at: args.owner_choice !== "neither" ? now : undefined,
    reason_if_declined: args.owner_choice === "neither" ? "Owner declined to commit" : undefined,
  };

  // CLEAN EXIT if owner chooses "neither"
  if (args.owner_choice === "neither") {
    const artifact: DecisionClosureArtifact = {
      ...priorArtifact,
      run_id,
      created_at: now,
      commitment_gate: commitmentGate,
      action_plan: undefined,
      accountability: undefined,
      end_state: {
        state: "clean_exit",
        reason: "Owner declined to commit to any path",
        timestamp: now,
      },
      doctrine_checks: {
        ...priorArtifact.doctrine_checks,
        non_actions_present: false, // No commitment, no non-actions required
      },
    };

    // Validate clean exit
    try {
      const validation = await validateDoctrine({ artifact, strict: true });
      artifact.doctrine_checks = validation.doctrine_checks;
    } catch (error) {
      throw new Error(`DOCTRINE GATE BLOCKED: ${error instanceof Error ? error.message : String(error)}`);
    }

    return {
      artifact,
      summary: "Owner declined to commit. Clean exit.",
      end_cleanly: true,
    };
  }

  // COMMITMENT FLOW - Check anti-flip-flop
  const chosenPath = args.owner_choice === "path_A" ? "A" : "B";
  const flipCheck = await checkFlipFlop(
    args.client_id,
    priorArtifact.primary_constraint.constraint_id,
    chosenPath
  );

  if (!flipCheck.allowed) {
    throw new Error(`ANTI-FLIP-FLOP BLOCKED: ${flipCheck.reason}`);
  }

  // Validate explicit_non_actions required
  if (!args.explicit_non_actions || args.explicit_non_actions.length === 0) {
    throw new Error("DOCTRINE VIOLATION: explicit_non_actions required when committing to a path");
  }

  // Build action plan
  const actionPlan: CommitmentPlan = {
    plan_version: "commitment_v1",
    chosen_path: chosenPath,
    time_box_days: 90,
    minimal_actions: args.minimal_actions ?? [],
    explicit_non_actions: args.explicit_non_actions,
    created_at: now,
  };

  // Build accountability spec from chosen path
  const chosenPathDetails = priorArtifact.decision_paths.find((p) => p.path_id === chosenPath);
  const accountability: AccountabilitySpec = {
    spec_version: "accountability_v1",
    re_evaluation_triggers: chosenPathDetails?.proof_of_concept_signals.map((poc) => ({
      trigger: poc.signal,
      check_frequency_days: Math.min(poc.time_window_days, 30),
      trigger_fired: false,
    })) ?? [{ trigger: "Monthly review", check_frequency_days: 30, trigger_fired: false }],
    failure_conditions: chosenPathDetails?.exit_conditions ?? ["No progress after 30 days"],
    success_metrics: chosenPathDetails?.proof_of_concept_signals.map((poc) => ({
      metric: poc.signal,
      target: poc.expected_outcome,
    })) ?? [{ metric: "Pressure reduction", target: "Measurable decrease" }],
    created_at: now,
  };

  // Lock conclusion
  await lockConclusion(
    args.client_id,
    priorArtifact.primary_constraint.constraint_id,
    chosenPath,
    accountability.failure_conditions
  );

  // Assemble committed artifact
  const artifact: DecisionClosureArtifact = {
    ...priorArtifact,
    run_id,
    created_at: now,
    commitment_gate: commitmentGate,
    action_plan: actionPlan,
    accountability,
    end_state: {
      state: "committed",
      reason: `Owner committed to Path ${chosenPath}`,
      timestamp: now,
    },
    doctrine_checks: {
      ...priorArtifact.doctrine_checks,
      non_actions_present: true,
      all_checks_passed: true,
    },
  };

  // Validate committed artifact (strict mode)
  try {
    const validation = await validateDoctrine({ artifact, strict: true });
    artifact.doctrine_checks = validation.doctrine_checks;
  } catch (error) {
    throw new Error(`DOCTRINE GATE BLOCKED: ${error instanceof Error ? error.message : String(error)}`);
  }

  const summary = `Owner committed to Path ${chosenPath}. Action plan created with ${actionPlan.minimal_actions.length} actions and ${actionPlan.explicit_non_actions.length} explicit non-actions.`;

  return { artifact, summary, end_cleanly: false };
}

// ============================================================================
// MODE 3: MONTHLY_REVIEW - Validate Outcomes + Pivot Decision
// ============================================================================

async function handleMonthlyReviewMode(
  args: RunPipelineV3Args,
  run_id: string,
  now: string
): Promise<{
  artifact: DecisionClosureArtifact;
  coherence_snapshot?: CoherenceSnapshot;
  coherence_drift?: CoherenceDrift;
  summary: string;
  end_cleanly?: boolean;
}> {
  if (!args.snapshot || !args.commitment_details || !args.prior_artifact) {
    throw new Error("Mode 'monthly_review' requires snapshot, commitment_details, and prior_artifact");
  }

  // Compute current signals
  const currentSignals = await computeSignals({
    snapshot: args.snapshot,
    include_concentration: true,
  });

  // If we have a prior coherence snapshot + intake, compute drift
  let drift: CoherenceDrift | undefined;
  let currentCoherence: CoherenceSnapshot | undefined;

  if (args.prior_coherence_snapshot && (args.intent_intake || args.owner_intent_intake)) {
    // Build current coherence snapshot for drift comparison
    if (args.owner_intent_intake) {
      currentCoherence = runCoherenceEngineV3({
        run_id,
        intake: args.owner_intent_intake,
        computedSignals: currentSignals,
        snapshot: args.snapshot,
        overrides: args.intent_overrides,
      });
    } else {
      currentCoherence = runCoherenceEngine({
        run_id,
        intake: args.intent_intake!,
        computedSignals: currentSignals,
        snapshot: args.snapshot,
      });
    }

    drift = computeCoherenceDrift({
      previous: args.prior_coherence_snapshot,
      current: currentCoherence,
    });
    currentCoherence.review = {
      ...(currentCoherence.review ?? {}),
      drift,
    };
  }

  // Call outcome review
  const { handler: reviewOutcomes } = await import("./review_outcomes_v1");
  const outcomeReview = await reviewOutcomes({
    commitment_plan: args.commitment_details.commitment_plan,
    accountability_spec: args.commitment_details.accountability_spec,
    current_signals: currentSignals,
    previous_signals: args.commitment_details.previous_signals,
    actions_completed: args.commitment_details.actions_completed,
  });

  // Determine end state based on pivot recommendation
  let endState: { state: "under_review" | "pivot_required" | "committed"; reason?: string; timestamp: string };
  if (outcomeReview.pivot_recommendation === "pivot" || outcomeReview.pivot_recommendation === "end") {
    endState = {
      state: "pivot_required",
      reason: `Outcome review recommends: ${outcomeReview.pivot_recommendation}`,
      timestamp: now,
    };
  } else {
    endState = {
      state: "under_review",
      reason: `Outcome review recommends: ${outcomeReview.pivot_recommendation}`,
      timestamp: now,
    };
  }

  // Assemble artifact with outcome review
  const artifact: DecisionClosureArtifact = {
    ...args.prior_artifact,
    run_id,
    created_at: now,
    outcome_review: outcomeReview,
    end_state: endState,
  };

  // Validate
  try {
    const validation = await validateDoctrine({ artifact, strict: true });
    artifact.doctrine_checks = validation.doctrine_checks;
  } catch (error) {
    throw new Error(`DOCTRINE GATE BLOCKED: ${error instanceof Error ? error.message : String(error)}`);
  }

  const summary = `Monthly review complete. Recommendation: ${outcomeReview.pivot_recommendation}. Implementation: ${outcomeReview.implementation_status}. Strategy: ${outcomeReview.strategy_assessment}.${drift ? ` Drift: ${drift.summary}` : ""}`;

  return {
    artifact,
    coherence_snapshot: currentCoherence,
    coherence_drift: drift,
    summary,
    end_cleanly: outcomeReview.pivot_recommendation === "end",
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function normalizeIntentOverrides(
  raw: IntentOverrides,
  fallbackRunId?: string
): IntentOverrides | undefined {
  if (!raw || !Array.isArray(raw.overrides)) return undefined;
  const cleaned = raw.overrides
    .filter((item) => item && typeof item.tag === "string" && typeof item.confirmed === "boolean")
    .slice(0, 10)
    .map((item) => ({
      tag: item.tag,
      confirmed: item.confirmed,
      recorded_at:
        typeof item.recorded_at === "string" && item.recorded_at.length > 0
          ? item.recorded_at
          : new Date().toISOString(),
    }));
  if (cleaned.length === 0) return undefined;
  return {
    run_id: raw.run_id || fallbackRunId || "",
    overrides: cleaned,
    updated_at:
      typeof raw.updated_at === "string" && raw.updated_at.length > 0
        ? raw.updated_at
        : new Date().toISOString(),
  };
}

async function resolveIntentOverrides(args: RunPipelineV3Args): Promise<IntentOverrides | undefined> {
  const explicit = args.intent_overrides
    ? normalizeIntentOverrides(args.intent_overrides, args.run_id)
    : undefined;
  if (explicit) return explicit;

  const runCandidates = [args.run_id, args.prior_coherence_snapshot?.run_id].filter(
    (value): value is string => typeof value === "string" && value.length > 0
  );
  if (runCandidates.length === 0) return undefined;

  const store = getStore();
  for (const runId of runCandidates) {
    const run = await store.getRun(runId);
    const results = run?.results_json;
    if (!results || typeof results !== "object") continue;
    const candidate = (results as Record<string, unknown>).intent_overrides;
    if (!candidate || typeof candidate !== "object") continue;
    const normalized = normalizeIntentOverrides(candidate as IntentOverrides, runId);
    if (normalized) return normalized;
  }
  return undefined;
}

// Generate human-readable summary from CoherenceSnapshot
function generateCoherenceSummary(cs: CoherenceSnapshot): string {
  let summary = `# Coherence Analysis\n\n`;
  summary += `**Run ID:** ${cs.run_id}\n`;
  summary += `**Created:** ${cs.created_at}\n`;
  summary += `**Confidence:** ${cs.confidence.level} — ${cs.confidence.reason}\n\n`;

  summary += `## Your Intent\n`;
  summary += `**Value Proposition:** ${cs.intent.value_proposition.statement}\n`;
  summary += `**Priorities:** ${cs.intent.priorities_ranked.join(" → ")}\n`;
  if (cs.intent.detected_contradictions && cs.intent.detected_contradictions.length > 0) {
    summary += `**Note:** ${cs.intent.detected_contradictions.join("; ")}\n`;
  }
  summary += `\n`;

  summary += `## Reality Signals\n`;
  summary += `${cs.signals.signals.length} observations from ${cs.signals.window.records_used} records `;
  summary += `(${cs.signals.window.start_date} to ${cs.signals.window.end_date})\n`;
  if (cs.signals.missing_data.length > 0) {
    summary += `Missing data: ${cs.signals.missing_data.join(", ")}\n`;
  }
  summary += `\n`;

  summary += `## Tensions (${cs.tensions.length})\n`;
  for (const t of cs.tensions) {
    summary += `\n### ${t.intent_anchor} (severity: ${t.severity}/100)\n`;
    summary += `${t.claim}\n`;
  }

  summary += `\n## Decision Paths\n`;
  for (const p of cs.paths) {
    summary += `\n### ${p.name === "path_A" ? "Path A" : p.name === "path_B" ? "Path B" : "Neither"}: ${p.thesis}\n`;
    summary += `- **Protects:** ${p.protects.join(", ")}\n`;
    summary += `- **Trades off:** ${p.trades_off.join("; ")}\n`;
    summary += `- **First 7 days:** ${p.seven_day_plan.steps.map((s) => s.title).join(" → ")}\n`;
  }

  summary += `\n---\n`;
  summary += `**Next Step:** Choose Path A, Path B, or decline to commit.\n`;
  return summary;
}

// Legacy summary generator (for commit/review modes that still use the old artifact)
function generateSummary(artifact: DecisionClosureArtifact): string {
  let summary = `# Decision Closure Report\n\n`;
  summary += `**Run ID:** ${artifact.run_id}\n`;
  summary += `**Created:** ${artifact.created_at}\n\n`;
  summary += `## Primary Tension\n`;
  summary += `${artifact.primary_constraint.constraint_description}\n\n`;
  summary += `## Decision Paths (Choose ONE)\n`;
  artifact.decision_paths.forEach((path) => {
    summary += `\n### Path ${path.path_id}: ${path.path_name}\n`;
    summary += `- **Resolves:** ${path.pressure_resolved}\n`;
    summary += `- **Trade-offs:** ${path.trade_offs.join(", ")}\n`;
    summary += `- **Confidence:** ${path.confidence}\n`;
  });
  summary += `\n---\n`;
  summary += `**Next Step:** Owner must choose Path A, Path B, or decline to commit.\n`;
  return summary;
}
