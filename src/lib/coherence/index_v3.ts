/**
 * Coherence Engine Orchestrator (v3)
 *
 * Wire: IntentIntake | OwnerIntentIntake + ComputedSignals + Snapshot → CoherenceSnapshot
 *
 * Supports:
 * - Legacy IntentIntake (free-text) — backward compatible
 * - New OwnerIntentIntake (7-question) — with value-confidence inference
 *
 * This is the single entry point for consumers.
 */

import { buildOwnerIntentModel, type IntentIntake } from "./build_owner_intent";
import { buildFromIntake } from "./build_owner_intent_v3";
import { buildRealitySignals } from "./build_reality_signals";
import { generateCoherenceTensions } from "./generate_tensions";
import { generateDecisionPaths } from "./generate_paths";
import { inferValueEvidence, computeValueConfidence } from "./value_confidence";
import { computeValuePropAlignment } from "./value_alignment";
import { computeDataCoverage, computeValueVisibilityImpact } from "./data_coverage";
import type { CoherenceSnapshot, OwnerIntentModel } from "../types/coherence_engine";
import type { OwnerIntentIntake, OwnerIntentModel as IntentModelV3, IntentOverrides } from "../types/intent_intake";
import type { ComputedSignals } from "../../../mcp/tools/compute_signals_v2";
import type { SnapshotV2 } from "../../../lib/decision/v2/conclusion_schema_v2";
import {
  PRIORITY_LABELS,
  NON_NEGOTIABLE_LABELS,
  ANTI_GOAL_LABELS,
  CONSTRAINT_LABELS,
} from "../types/intent_intake";

// ============================================================================
// INPUT TYPES
// ============================================================================

export type CoherenceEngineInput = {
  run_id: string;
  intake: IntentIntake;
  computedSignals: ComputedSignals;
  snapshot: SnapshotV2;
};

export type CoherenceEngineInputV3 = {
  run_id: string;
  intake: OwnerIntentIntake;
  computedSignals: ComputedSignals;
  snapshot: SnapshotV2;
  /** Optional owner overrides from confirmation hooks. */
  overrides?: IntentOverrides;
};

// ============================================================================
// MAIN ORCHESTRATOR
// ============================================================================

/**
 * Run the coherence engine with legacy IntentIntake.
 * Produces CoherenceSnapshot without value-confidence.
 */
export function runCoherenceEngine(input: CoherenceEngineInput): CoherenceSnapshot {
  const { run_id, intake, computedSignals, snapshot } = input;

  // S1: Build intent + signals
  const intent = buildOwnerIntentModel(intake);
  const signals = buildRealitySignals({ computedSignals, snapshot });

  // S1.5: Compute value-prop alignment (reuses intent.value_confidence if present)
  const value_prop_alignment = computeValuePropAlignment({
    intent,
    reality_signals: signals.signals,
  });

  // S2: Generate tensions (with alignment context)
  const tensions = generateCoherenceTensions(intent, signals, value_prop_alignment);

  // S3: Generate decision paths
  const paths = generateDecisionPaths(intent, signals, tensions);

  // S4: Data coverage + visibility impact
  const data_coverage = computeDataCoverage({ snapshot, signals });
  const value_visibility = computeValueVisibilityImpact(value_prop_alignment, data_coverage);

  // Overall confidence
  const overallConfidence = computeOverallConfidence(intent, signals);

  return {
    version: "coherence_v1",
    run_id,
    created_at: new Date().toISOString(),
    intent,
    signals,
    value_prop_alignment,
    tensions,
    paths,
    data_coverage,
    value_visibility,
    end_state: {
      state: "awaiting_commitment",
      timestamp: new Date().toISOString(),
    },
    confidence: overallConfidence,
  };
}

/**
 * Run the coherence engine with the new 7-question OwnerIntentIntake.
 * Includes value-confidence inference and conflict-aware tension filtering.
 */
export function runCoherenceEngineV3(input: CoherenceEngineInputV3): CoherenceSnapshot {
  const { run_id, intake, computedSignals, snapshot, overrides } = input;

  // S1: Build signals from CSV
  const signals = buildRealitySignals({ computedSignals, snapshot });

  // S2: Build intent model from 7-question intake
  const intentV3 = buildFromIntake(intake);

  // S3: Compute value-confidence (3-signal method)
  const valueEvidence = inferValueEvidence(intake, signals);
  let valueConfidence = computeValueConfidence(valueEvidence);

  // S3.5: Apply owner overrides to value-confidence (if any)
  if (overrides && overrides.overrides.length > 0) {
    valueConfidence = applyOverridesToConfidence(valueConfidence, overrides);
  }

  // S4: Convert to internal format for tension/path generators
  const intent = intentV3ToInternal(intentV3, valueConfidence);

  // S4.5: Compute value-prop alignment (reuses intent.value_confidence)
  const value_prop_alignment = computeValuePropAlignment({
    intent,
    reality_signals: signals.signals,
  });

  // S5: Generate tensions — only for anchors with confidence >= med
  //     (or low if explicitly selected by owner, marked "needs confirmation")
  const tensions = generateCoherenceTensions(intent, signals, value_prop_alignment);
  const filteredTensions = filterTensionsByConfidence(tensions, intent);

  // S6: Generate decision paths
  const paths = generateDecisionPaths(intent, signals, filteredTensions);

  // S7: Data coverage + visibility impact
  const data_coverage = computeDataCoverage({ snapshot, signals });
  const value_visibility = computeValueVisibilityImpact(value_prop_alignment, data_coverage);

  // Overall confidence
  const overallConfidence = computeOverallConfidence(intent, signals);

  return {
    version: "coherence_v1",
    run_id,
    created_at: new Date().toISOString(),
    intent,
    signals,
    value_prop_alignment,
    tensions: filteredTensions,
    paths,
    data_coverage,
    value_visibility,
    end_state: {
      state: "awaiting_commitment",
      timestamp: new Date().toISOString(),
    },
    confidence: overallConfidence,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Convert v3 OwnerIntentModel (from intent_intake.ts) to internal format
 * (from coherence_engine.ts) that generators expect.
 */
function intentV3ToInternal(
  v3: IntentModelV3,
  valueConfidence: ReturnType<typeof computeValueConfidence>
): OwnerIntentModel {
  // Convert tag IDs to human-readable labels so regex matchers work
  const priorityLabels = v3.priorities_ranked.map(
    p => PRIORITY_LABELS[p] ?? p
  );
  const nnLabels = v3.non_negotiables.map(
    n => NON_NEGOTIABLE_LABELS[n] ?? n
  );
  const agLabels = v3.anti_goals.map(
    a => ANTI_GOAL_LABELS[a] ?? a
  );

  // Extract boundaries from context_notes + constraint
  const constraintLabel = CONSTRAINT_LABELS[v3.primary_constraint] ?? v3.primary_constraint;
  const boundaries: OwnerIntentModel["boundaries"] = {};
  if (v3.context_notes) {
    // Try to parse out boundary types from free text
    if (/time|hour|weekend|schedul|family/i.test(v3.context_notes)) {
      boundaries.time = v3.context_notes;
    }
    if (/stress|burnout|overwhelm|peace/i.test(v3.context_notes)) {
      boundaries.stress = v3.context_notes;
    }
    if (/debt|risk|loan|financ|conserv/i.test(v3.context_notes)) {
      boundaries.risk = v3.context_notes;
    }
    if (/reput|brand|name|trust/i.test(v3.context_notes)) {
      boundaries.reputation = v3.context_notes;
    }
    if (/compli|regulat|license|insur|code/i.test(v3.context_notes)) {
      boundaries.compliance = v3.context_notes;
    }
  }

  return {
    version: "intent_v2",
    value_proposition: v3.value_proposition,
    priorities_ranked: priorityLabels,
    non_negotiables: nnLabels,
    boundaries,
    definition_of_success: v3.definition_of_success,
    anti_goals: agLabels,
    context_notes: v3.context_notes,
    confidence: v3.confidence,
    detected_contradictions: v3.detected_conflicts.map(c => c.description),
    detected_conflicts: v3.detected_conflicts,
    value_confidence: valueConfidence,
    primary_constraint: v3.primary_constraint,
    captured_at: v3.captured_at,
  };
}

/**
 * Filter tensions by value-confidence. Only keep tensions whose intent anchors
 * are backed by at least medium confidence. Low-confidence tensions are annotated
 * "needs confirmation" but kept if directly selected by owner.
 */
function filterTensionsByConfidence(
  tensions: import("../types/coherence_engine").CoherenceTension[],
  intent: OwnerIntentModel
): import("../types/coherence_engine").CoherenceTension[] {
  if (!intent.value_confidence || intent.value_confidence.length === 0) {
    return tensions; // No confidence data — return all
  }

  return tensions.filter(t => {
    // Find the lowest confidence among value props related to this tension's anchor
    const relatedConf = intent.value_confidence?.find(vc =>
      t.intent_anchor.toLowerCase().includes(vc.tag.replace(/_/g, " "))
    );

    // If no related confidence found, keep the tension
    if (!relatedConf) return true;

    // Keep if confidence >= med
    if (relatedConf.confidence === "high" || relatedConf.confidence === "med") return true;

    // Keep low-confidence tensions if explicitly declared by owner, but mark
    if (relatedConf.sources.declared) {
      t.confidence = "low"; // downgrade tension confidence
      return true;
    }

    // Drop if purely inferred with low confidence
    return false;
  });
}

function computeOverallConfidence(
  intent: OwnerIntentModel,
  signals: import("../types/coherence_engine").RealitySignals
): { level: import("../types/coherence_engine").IntentConfidence; reason: string } {
  const intentConf = intent.confidence === "high" ? 2 : intent.confidence === "med" ? 1 : 0;
  const signalDataQuality = signals.missing_data.length === 0 ? 2 : signals.missing_data.length <= 2 ? 1 : 0;
  const overallScore = Math.round((intentConf + signalDataQuality) / 2);
  const level = overallScore >= 2 ? "high" : overallScore >= 1 ? "med" : "low";

  return {
    level,
    reason:
      level === "high"
        ? "Intent was clearly stated and data quality is strong."
        : level === "med"
          ? "Some ambiguity in intent or limited data availability."
          : "Intent was unclear or significant data gaps exist.",
  };
}

// Re-exports for consumers
export { type IntentIntake } from "./build_owner_intent";
export { type OwnerIntentIntake, type IntentOverrides } from "../types/intent_intake";

// ============================================================================
// OVERRIDE APPLICATION
// ============================================================================

/**
 * Apply owner overrides to value-confidence scores.
 * - confirmed=true  → bump confidence to "high" (owner explicitly confirmed)
 * - confirmed=false → reduce score to 0, confidence to "low" (owner said it shifted)
 */
function applyOverridesToConfidence(
  valueConfidence: ReturnType<typeof computeValueConfidence>,
  overrides: IntentOverrides
): ReturnType<typeof computeValueConfidence> {
  return valueConfidence.map((vc) => {
    const override = overrides.overrides.find((o) => o.tag === vc.tag);
    if (!override) return vc;

    if (override.confirmed) {
      return {
        ...vc,
        confidence: "high" as const,
        sources: { ...vc.sources, declared: true },
        notes: [...(vc.notes ?? []), "Owner confirmed this value."],
      };
    } else {
      return {
        ...vc,
        score: 0,
        confidence: "low" as const,
        notes: [...(vc.notes ?? []), "Owner indicated this priority has shifted."],
      };
    }
  });
}
