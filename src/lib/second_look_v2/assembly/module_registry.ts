import type { SnapshotV2 } from "@/lib/decision/v2/conclusion_schema_v2";
import type { BusinessProfile } from "@/src/lib/intelligence/web_profile";
import type { LayerFusionResult } from "@/src/lib/intelligence/layer_fusion/types";

import type {
  ModuleOutput,
  InstallSpec,
  EvidenceBucket,
  SecondLookLens,
} from "../contracts/second_look_artifact_v2";
import type {
  SecondLookIntakeV2,
  OwnerValueEnum,
  PressureSourceEnum,
} from "../contracts/second_look_intake_v2";

export type ModuleVariant = "full" | "compressed";

export type ModuleTrigger = {
  always?: boolean;
  owner_values?: OwnerValueEnum[];
  pressure_sources?: PressureSourceEnum[];
  emyth_roles?: SecondLookIntakeV2["emyth_role_split"][];
};

export type ModuleDefinition = {
  module_id:
    | "emyth_role_relief"
    | "porter_value_chain"
    | "blue_ocean_errc"
    | "constructive_installs"
    | "safety_risk_protocols"
    | "customer_comms_system"
    | "dispatch_rhythm"
    | "reputation_promise"
    | "team_handoff_ladder"
    | "cash_timing_relief";
  lens: SecondLookLens;
  triggers: ModuleTrigger;
  requires: string[];
  generate: (ctx: ModuleContext) => ModuleOutput;
};

export type ModuleContext = {
  intake: SecondLookIntakeV2;
  snapshot: SnapshotV2;
  business_profile?: BusinessProfile | null;
  layer_fusion?: LayerFusionResult | null;
  rag_context?: unknown;
  variant: ModuleVariant;
};

function buildEvidenceBuckets(
  snapshot: SnapshotV2,
  layerFusion: LayerFusionResult | null | undefined,
  label: string
): EvidenceBucket[] {
  const buckets: EvidenceBucket[] = [
    {
      bucket_id: "snapshot-activity",
      label,
      summary: `Window: ${snapshot.window.lookback_days} days with ${snapshot.activity_signals.quotes.quotes_count} quotes and ${snapshot.activity_signals.invoices.invoices_count} invoices.`,
      signal_count: 2,
    },
  ];

  const topPressure = layerFusion?.pressure_patterns?.[0];
  if (topPressure) {
    buckets.push({
      bucket_id: `layer-fusion-${topPressure.id}`,
      label: "Pressure pattern",
      summary: `${topPressure.statement} (severity: ${topPressure.severity}).`,
      signal_count: topPressure.evidence.length,
    });
  }

  return buckets;
}

function install(
  install_id: string,
  what: string,
  why: string,
  owner_time_minutes: number,
  executor: InstallSpec["executor"],
  done_when: string
): InstallSpec {
  return {
    install_id,
    what,
    why,
    owner_time_minutes,
    executor,
    done_when,
  };
}

export const MODULE_REGISTRY: ModuleDefinition[] = [
  {
    module_id: "emyth_role_relief",
    lens: "emyth",
    triggers: { always: true },
    requires: ["snapshot.activity_signals", "layer_fusion.summary"],
    generate: ({ intake, snapshot, layer_fusion, variant }) => ({
      module_id: "emyth_role_relief",
      title: "Role Relief (E-Myth)",
      narrative:
        variant === "compressed"
          ? `Keep ${intake.emyth_role_split} work focused by removing repeat interruptions and assigning a clear first responder.`
          : `Your current split is ${intake.emyth_role_split}. This module reduces owner pullback into repeated interruptions by defining what the team resolves first and what truly requires owner judgment.`,
      bullets: [
        "Name one default responder for routine friction.",
        "Escalate only exceptions with safety, cash, or customer promise impact.",
      ],
      installs: [
        install(
          "emyth-role-ladder",
          "Create a 3-level handoff ladder (team solve, team lead review, owner only).",
          "Protects owner attention for true constraint decisions.",
          35,
          "owner",
          "Team can classify incoming issues without pausing owner work."
        ),
      ],
      evidence_buckets: buildEvidenceBuckets(snapshot, layer_fusion, "Owner pressure context"),
    }),
  },
  {
    module_id: "porter_value_chain",
    lens: "porter",
    triggers: { always: true },
    requires: ["snapshot.activity_signals", "snapshot.quote_age_buckets"],
    generate: ({ snapshot, layer_fusion, variant }) => ({
      module_id: "porter_value_chain",
      title: "Value Chain Friction (Porter)",
      narrative:
        variant === "compressed"
          ? "Pinpoint one handoff where value gets delayed between demand, scheduling, delivery, and billing."
          : "Map the current handoff from incoming demand to completed billing. The goal is to remove one recurring friction point that creates repeated owner rescue work.",
      bullets: [
        "Demand intake -> qualification",
        "Scheduling/dispatch -> completion",
        "Completion -> invoice/payment",
      ],
      installs: [
        install(
          "porter-handoff-map",
          "Draft one-page handoff map with a single owner per stage.",
          "Removes ambiguity and repeated backtracking.",
          30,
          "team",
          "Each stage has one accountable owner and one escalation path."
        ),
      ],
      evidence_buckets: buildEvidenceBuckets(snapshot, layer_fusion, "Flow evidence"),
    }),
  },
  {
    module_id: "blue_ocean_errc",
    lens: "blue_ocean",
    triggers: { always: true },
    requires: ["snapshot.window", "snapshot.activity_signals"],
    generate: ({ snapshot, layer_fusion, variant }) => ({
      module_id: "blue_ocean_errc",
      title: "Offer Clarity (Blue Ocean ERRC)",
      narrative:
        variant === "compressed"
          ? "Keep this short in stabilization mode: define one thing to eliminate and one thing to reinforce for calmer operations."
          : "Use ERRC (eliminate, reduce, raise, create) to sharpen the promise around work you can deliver reliably without adding pressure.",
      bullets:
        variant === "compressed"
          ? [
              "Eliminate one avoidable service promise that causes escalation.",
              "Raise one promise tied to reliability and communication.",
            ]
          : [
              "Eliminate: low-value commitments that generate interruptions.",
              "Reduce: handoffs with no clear owner.",
              "Raise: reliability and proactive customer updates.",
              "Create: one concise promise script for the team.",
            ],
      evidence_buckets: buildEvidenceBuckets(snapshot, layer_fusion, "Offer-shape evidence"),
    }),
  },
  {
    module_id: "constructive_installs",
    lens: "constructive",
    triggers: { always: true },
    requires: ["snapshot.window", "layer_fusion.pressure_patterns"],
    generate: ({ snapshot, layer_fusion }) => ({
      module_id: "constructive_installs",
      title: "Constructive Installs",
      narrative: "Convert the conclusion into finite installs with clear owners, effort, and done-when conditions.",
      installs: [
        install(
          "constructive-weekly-cadence",
          "Run one weekly 25-minute install check (what was installed, what slipped, next block).",
          "Keeps changes finite and prevents drift.",
          25,
          "owner",
          "A single install board is current and next-week commitments are explicit."
        ),
        install(
          "constructive-boundary-check",
          "Add a boundary check before accepting urgent exceptions.",
          "Prevents reactive overload from reappearing.",
          15,
          "team",
          "Urgent requests are either accepted by rule or deferred with clear copy."
        ),
      ],
      evidence_buckets: buildEvidenceBuckets(snapshot, layer_fusion, "Install coverage evidence"),
    }),
  },
  {
    module_id: "safety_risk_protocols",
    lens: "safety_risk",
    triggers: {
      owner_values: ["safety_compliance"],
      pressure_sources: ["compliance_risk"],
    },
    requires: ["layer_fusion.pressure_patterns", "snapshot.activity_signals"],
    generate: ({ snapshot, layer_fusion }) => ({
      module_id: "safety_risk_protocols",
      title: "Safety and Escalation Protocols",
      narrative:
        "Stabilize safety-critical decisions with a short escalation protocol that does not depend on owner availability for every event.",
      bullets: [
        "Define severity bands for compliance-sensitive events.",
        "Set owner-only triggers for exceptions, not routine checks.",
      ],
      installs: [
        install(
          "safety-escalation-grid",
          "Create a one-page escalation grid for compliance and safety scenarios.",
          "Keeps risk handling consistent under schedule pressure.",
          45,
          "owner",
          "Team can route safety events by severity within 5 minutes."
        ),
      ],
      evidence_buckets: buildEvidenceBuckets(snapshot, layer_fusion, "Safety/compliance evidence"),
    }),
  },
  {
    module_id: "customer_comms_system",
    lens: "customer_comms",
    triggers: {
      owner_values: ["customer_communication"],
      pressure_sources: ["tools_message_overload"],
    },
    requires: ["snapshot.quote_age_buckets", "layer_fusion.pressure_patterns"],
    generate: ({ snapshot, layer_fusion }) => ({
      module_id: "customer_comms_system",
      title: "Customer Communication System",
      narrative:
        "Install a simple communication rhythm so customers know what happens next without continuous owner intervention.",
      bullets: [
        "One owner per active customer thread.",
        "One default update cadence by job stage.",
      ],
      installs: [
        install(
          "comms-cadence-script",
          "Create three message templates: received, scheduled, delayed.",
          "Reduces ad-hoc replies and missed promises.",
          30,
          "team",
          "Team can send stage updates with no custom drafting for routine cases."
        ),
      ],
      evidence_buckets: buildEvidenceBuckets(snapshot, layer_fusion, "Customer communication evidence"),
    }),
  },
  {
    module_id: "dispatch_rhythm",
    lens: "constructive",
    triggers: {
      pressure_sources: ["scheduling_dispatch"],
    },
    requires: ["snapshot.weekly_volume_series", "layer_fusion.timing"],
    generate: ({ snapshot, layer_fusion }) => ({
      module_id: "dispatch_rhythm",
      title: "Dispatch Rhythm",
      narrative:
        "Introduce a fixed dispatch rhythm with one protected planning pass and one contingency pass per day.",
      installs: [
        install(
          "dispatch-dual-pass",
          "Run dispatch in two passes: planned commitments first, then exception routing.",
          "Improves reliability and lowers interruption churn.",
          40,
          "team",
          "Daily dispatch closes with all exceptions tagged owner-only or team-resolvable."
        ),
      ],
      evidence_buckets: buildEvidenceBuckets(snapshot, layer_fusion, "Scheduling and dispatch evidence"),
    }),
  },
  {
    module_id: "reputation_promise",
    lens: "customer_comms",
    triggers: {
      owner_values: ["reputation_reviews"],
    },
    requires: ["snapshot.activity_signals", "snapshot.window"],
    generate: ({ snapshot, layer_fusion }) => ({
      module_id: "reputation_promise",
      title: "Reputation Promise",
      narrative:
        "Translate reliability into a visible customer promise and a simple recovery script when timing slips.",
      installs: [
        install(
          "reputation-recovery-script",
          "Create one service recovery script for late or rescheduled work.",
          "Protects trust when operations are under pressure.",
          20,
          "team",
          "All customer-facing staff use the same promise and recovery language."
        ),
      ],
      evidence_buckets: buildEvidenceBuckets(snapshot, layer_fusion, "Trust and reliability evidence"),
    }),
  },
  {
    module_id: "team_handoff_ladder",
    lens: "emyth",
    triggers: {
      owner_values: ["team_stability"],
      pressure_sources: ["team_hiring_training"],
    },
    requires: ["snapshot.activity_signals", "layer_fusion.summary"],
    generate: ({ snapshot, layer_fusion }) => ({
      module_id: "team_handoff_ladder",
      title: "Team Handoff Ladder",
      narrative:
        "Define onboarding-to-execution handoff levels so new team members can resolve routine work with predictable support.",
      installs: [
        install(
          "team-handoff-rubric",
          "Define level 1/2/3 handoff rubric for field and office roles.",
          "Reduces quality drift during hiring and training load.",
          35,
          "owner",
          "New team members can self-classify work and request escalation correctly."
        ),
      ],
      evidence_buckets: buildEvidenceBuckets(snapshot, layer_fusion, "Team stability evidence"),
    }),
  },
  {
    module_id: "cash_timing_relief",
    lens: "constructive",
    triggers: {
      pressure_sources: ["cash_timing"],
      owner_values: ["cash_stability"],
    },
    requires: ["snapshot.activity_signals.invoices", "layer_fusion.timing"],
    generate: ({ snapshot, layer_fusion }) => ({
      module_id: "cash_timing_relief",
      title: "Cash Timing Relief",
      narrative:
        "Install a lightweight billing and follow-through rhythm to reduce avoidable cash timing strain.",
      installs: [
        install(
          "cash-followthrough-loop",
          "Schedule two short invoice follow-through windows each week.",
          "Improves predictability without aggressive policy changes.",
          30,
          "team",
          "Open invoice queue is reviewed twice weekly with a named owner."
        ),
      ],
      evidence_buckets: buildEvidenceBuckets(snapshot, layer_fusion, "Cash timing evidence"),
    }),
  },
];

export function getModuleRegistry(): ModuleDefinition[] {
  return MODULE_REGISTRY;
}

export function getModuleById(moduleId: ModuleDefinition["module_id"]): ModuleDefinition {
  const moduleDef = MODULE_REGISTRY.find((item) => item.module_id === moduleId);
  if (!moduleDef) {
    throw new Error(`Unknown module id: ${moduleId}`);
  }
  return moduleDef;
}
