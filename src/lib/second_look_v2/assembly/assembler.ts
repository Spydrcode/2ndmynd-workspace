import type { SnapshotV2 } from "@/lib/decision/v2/conclusion_schema_v2";
import type { BusinessProfile } from "@/src/lib/intelligence/web_profile";
import type { LayerFusionResult } from "@/src/lib/intelligence/layer_fusion/types";

import {
  SecondLookArtifactV2Schema,
  type EvidenceBucket,
  type InstallSpec,
  type SecondLookArtifactV2,
  uniqueLensesFromModules,
} from "../contracts/second_look_artifact_v2";
import type {
  SecondLookIntakeV2,
  OwnerValueEnum,
  PressureSourceEnum,
} from "../contracts/second_look_intake_v2";
import { selectModules } from "./selector";

export type AssembleSecondLookV2Params = {
  intake: SecondLookIntakeV2;
  snapshot: SnapshotV2;
  business_profile?: BusinessProfile | null;
  layer_fusion?: LayerFusionResult | null;
  rag_context?: unknown;
};

const PRESSURE_LABELS: Record<PressureSourceEnum, string> = {
  customers_expectations: "customer expectations",
  scheduling_dispatch: "scheduling and dispatch pressure",
  quality_callbacks: "quality callback pressure",
  team_hiring_training: "team hiring and training pressure",
  sales_followup: "sales follow-up pressure",
  vendors_inventory: "vendor and inventory pressure",
  compliance_risk: "compliance risk pressure",
  owner_interruptions: "owner interruption pressure",
  tools_message_overload: "message overload pressure",
  cash_timing: "cash timing pressure",
};

const VALUE_LABELS: Record<OwnerValueEnum, string> = {
  safety_compliance: "safety and compliance",
  customer_communication: "customer communication",
  reliability_ontime: "reliability and on-time delivery",
  reputation_reviews: "reputation and reviews",
  team_stability: "team stability",
  cash_stability: "cash stability",
  growth: "growth",
  quality_craftsmanship: "quality craftsmanship",
  speed: "speed",
  simplicity: "simplicity",
  premium_positioning: "premium positioning",
  community_relationships: "community relationships",
};

function deriveConfidence(snapshot: SnapshotV2, layerFusion?: LayerFusionResult | null) {
  const quotes = snapshot.activity_signals.quotes.quotes_count;
  const invoices = snapshot.activity_signals.invoices.invoices_count;
  const total = quotes + invoices;
  const warnings = layerFusion?.warnings.length ?? 0;

  if (total >= 120 && warnings === 0) {
    return {
      confidence: "high" as const,
      confidence_reason: "Data coverage is strong across this window with low synthesis warnings.",
    };
  }

  if (total >= 30) {
    return {
      confidence: "medium" as const,
      confidence_reason: "Coverage is sufficient for a stable second look, with some limits noted.",
    };
  }

  return {
    confidence: "low" as const,
    confidence_reason: "Coverage is limited, so recommendations are focused on low-risk installs first.",
  };
}

function buildPrimaryConstraint(
  intake: SecondLookIntakeV2,
  snapshot: SnapshotV2,
  layerFusion?: LayerFusionResult | null
) {
  const primaryPressure = intake.pressure_sources_top2[0] ?? "owner_interruptions";
  const secondaryPressure = intake.pressure_sources_top2[1];

  const statement = `Primary constraint: ${PRESSURE_LABELS[primaryPressure]} is crowding out ${VALUE_LABELS[intake.owner_values_top3[0]]}.`;
  const why_this = secondaryPressure
    ? `This is prioritized because ${PRESSURE_LABELS[primaryPressure]} and ${PRESSURE_LABELS[secondaryPressure]} are reinforcing each other in the same operating window.`
    : `This is prioritized because ${PRESSURE_LABELS[primaryPressure]} repeatedly increases owner load in this window.`;

  const evidence_buckets: EvidenceBucket[] = [
    {
      bucket_id: "window-coverage",
      label: "Window coverage",
      summary: `${snapshot.window.lookback_days}-day window with ${snapshot.activity_signals.quotes.quotes_count} quotes and ${snapshot.activity_signals.invoices.invoices_count} invoices.`,
      signal_count: 2,
    },
  ];

  const topPattern = layerFusion?.pressure_patterns?.[0];
  if (topPattern) {
    evidence_buckets.push({
      bucket_id: `layer-fusion-${topPattern.id}`,
      label: "Pressure synthesis",
      summary: `${topPattern.statement} (severity: ${topPattern.severity}).`,
      signal_count: topPattern.evidence.length,
    });
  }

  return { statement, why_this, evidence_buckets };
}

function uniqueInstalls(installs: InstallSpec[]): InstallSpec[] {
  const seen = new Set<string>();
  const result: InstallSpec[] = [];

  for (const item of installs) {
    if (seen.has(item.install_id)) continue;
    seen.add(item.install_id);
    result.push(item);
  }

  return result;
}

function fallbackInstall(id: string, what: string, why: string): InstallSpec {
  return {
    install_id: id,
    what,
    why,
    owner_time_minutes: 30,
    executor: "owner",
    done_when: "The install is running on a weekly cadence with explicit ownership.",
  };
}

function buildBoundaries(intake: SecondLookIntakeV2): string[] {
  const boundaries: string[] = [];

  if (intake.owner_values_top3.includes("safety_compliance")) {
    boundaries.push("Do not bypass safety or compliance steps to recover schedule.");
  }

  if (intake.owner_values_top3.includes("customer_communication")) {
    boundaries.push("Do not make delivery promises unless dispatch ownership is explicit.");
  }

  boundaries.push("Do not launch more than one new install owner in the same week.");

  return boundaries.slice(0, 3);
}

function buildPlan(installs: InstallSpec[], intake: SecondLookIntakeV2) {
  const seven = installs.slice(0, 7);
  const thirtySource = installs.slice(2, 9);

  const thirty =
    thirtySource.length > 0
      ? thirtySource
      : [
          fallbackInstall(
            "30d-review",
            "Run a 30-day install review and remove one process that reintroduces pressure.",
            "Locks in gains and prevents drift back to reactive operations."
          ),
        ];

  return {
    actions_7_days: seven,
    actions_30_days: thirty.slice(0, 7),
    boundaries: buildBoundaries(intake),
  };
}

function ensureInstalls(modules: Array<{ installs?: InstallSpec[] }>): InstallSpec[] {
  const collected = uniqueInstalls(modules.flatMap((module) => module.installs ?? []));

  if (collected.length > 0) {
    return collected;
  }

  return [
    fallbackInstall(
      "default-constraint-install",
      "Name one owner for the primary constraint and define the first escalation rule.",
      "Creates immediate structure without adding new operational complexity."
    ),
  ];
}

export function assembleSecondLookV2(params: AssembleSecondLookV2Params): SecondLookArtifactV2 {
  const { intake, snapshot, business_profile, layer_fusion, rag_context } = params;
  const selectedModules = selectModules(intake, { snapshot, layer_fusion });

  const modules = selectedModules.map((module) =>
    module.generate({
      intake,
      snapshot,
      business_profile,
      layer_fusion,
      rag_context,
      variant: module.variant,
    })
  );

  const installs = ensureInstalls(modules);
  const confidence = deriveConfidence(snapshot, layer_fusion);
  const primaryConstraint = buildPrimaryConstraint(intake, snapshot, layer_fusion);
  const valuesSummary = intake.owner_values_top3.map((value) => VALUE_LABELS[value]).join(", ");
  const lessSummary = intake.pressure_sources_top2.map((pressure) => PRESSURE_LABELS[pressure]).join(" and ");

  const pathAInstalls = installs.slice(0, 3);
  const pathBInstalls = installs.slice(2, 5).length > 0 ? installs.slice(2, 5) : installs.slice(0, 3);

  const artifactCandidate: SecondLookArtifactV2 = {
    meta: {
      business_name: intake.business_name,
      generated_at: new Date().toISOString(),
      snapshot_window: intake.snapshot_window,
      confidence: confidence.confidence,
      confidence_reason: confidence.confidence_reason,
    },
    north_star: {
      values_top3: intake.owner_values_top3,
      non_negotiables_summary: `Protect ${valuesSummary} while reducing owner rescue load.`,
      wants_less_of_summary: `Owner wants less of ${lessSummary}.`,
    },
    primary_constraint: primaryConstraint,
    lenses_included: uniqueLensesFromModules(selectedModules),
    modules,
    decision_paths: {
      path_A: {
        label: "Path A: Stabilize the constraint",
        thesis: `Build reliability around ${PRESSURE_LABELS[intake.pressure_sources_top2[0]]} before adding new complexity.`,
        why: "This path reduces immediate pressure and protects values under current load.",
        tradeoffs: ["May delay optional growth experiments for 30 days."],
        installs: pathAInstalls,
      },
      path_B: {
        label: "Path B: Re-shape flow while operating",
        thesis: "Keep operations moving while redesigning one handoff and one communication loop.",
        why: "This path balances pressure relief with gradual operating redesign.",
        tradeoffs: ["Requires tighter team discipline during transition."],
        installs: pathBInstalls,
      },
      neither: {
        copy: "Pause for now and only run evidence-clarity installs until confidence improves.",
      },
    },
    plan: buildPlan(installs, intake),
    support_options: {
      self_implement: "Use one module owner per week and track done-when completion only.",
      ongoing_help: "2ndmynd can facilitate a weekly install cadence and escalation tuning.",
    },
    talk_track_90s: `Conclusion: the primary constraint is ${PRESSURE_LABELS[intake.pressure_sources_top2[0]]}. Path A stabilizes it first. Path B re-shapes flow while running. Neither is valid if capacity is too tight this week.`,
    appendix: {
      notes: [
        "Evidence is summarized from aggregate buckets only.",
        "No raw customer-level records are used in this artifact.",
      ],
      evidence_tables: [
        {
          quotes_count: snapshot.activity_signals.quotes.quotes_count,
          invoices_count: snapshot.activity_signals.invoices.invoices_count,
          lookback_days: snapshot.window.lookback_days,
        },
      ],
    },
  };

  return SecondLookArtifactV2Schema.parse(artifactCandidate);
}
