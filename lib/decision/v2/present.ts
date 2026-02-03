import type { ConclusionV2, SnapshotV2 } from "./conclusion_schema_v2";
import { describeEvidenceSignal, parseEvidenceSignal } from "./signal_catalog";
import type { DecisionArtifactV1 } from "../../../src/lib/types/decision_artifact";
import type { BenchmarkResult } from "../../../src/lib/benchmarks/types";
import type { LayerFusionResult } from "../../../src/lib/intelligence/layer_fusion/types";
import { buildDecisionArtifact } from "../../../src/lib/present/build_decision_artifact";

export type PresentedArtifact = {
  header: {
    title: string;
    run_id: string;
    created_at: string | null;
    confidence: "low" | "medium" | "high" | "unknown";
    source: "mock" | "live" | "unknown";
  };
  takeaway: string;
  next_action: string;
  micro_steps: string[];
  why_heavy: string;
  evidence_chips: Array<{
    label: string;
    value: string;
    explanation: string;
    severity: "low" | "medium" | "high";
  }>;
  data_health: {
    quotes_count: number | null;
    invoices_count: number | null;
    date_range: string | null;
    coverage_text: string;
  };
  data_warnings: string[];
  technical_details?: {
    signals: Array<{ key: string; value: string }>;
  };
  pressure_map?: Array<{
    id: string;
    severity: "low" | "medium" | "high";
    statement: string;
    percentile?: number;
  }>;
  benchmarks?: {
    cohort_label: string;
    top_signals: Array<{
      metric_key: string;
      label: string;
      percentile: number;
    }>;
  };
  boundary?: string;
};

function inferSource(mode: unknown): PresentedArtifact["header"]["source"] {
  const v = typeof mode === "string" ? mode.toLowerCase() : "";
  if (v.includes("mock")) return "mock";
  if (v.includes("live")) return "live";
  return "unknown";
}

function asSnapshotV2(value: unknown): SnapshotV2 | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.snapshot_version !== "snapshot_v2") return null;
  return value as SnapshotV2;
}

function asConclusionV2(value: unknown): ConclusionV2 | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.conclusion_version !== "conclusion_v2") return null;
  return value as ConclusionV2;
}

export function presentArtifact(params: {
  run_id: string;
  created_at: string | null;
  mode?: string | null;
  artifact: {
    conclusion: unknown;
    snapshot: unknown | null;
    input_health: { date_range: string | null; records_count: number | null; coverage_warnings: string[] } | null;
    data_warnings?: string[] | null;
    readiness_level?: "diagnose" | "ready" | "complete" | null;
    layer_fusion?: LayerFusionResult | null;
    benchmarks?: BenchmarkResult | null;
    mapping_confidence?: "low" | "medium" | "high" | null;
    business_profile?: any;
  };
}): PresentedArtifact {
  const snapshot = asSnapshotV2(params.artifact.snapshot);
  const conclusion = asConclusionV2(params.artifact.conclusion);

  // Check if we should build a DecisionArtifact
  const readiness_level = params.artifact.readiness_level;
  const layer_fusion = params.artifact.layer_fusion;
  const benchmarks = params.artifact.benchmarks;
  const shouldBuildDecisionArtifact = 
    readiness_level === "ready" && 
    layer_fusion && 
    snapshot;

  let decision_artifact: DecisionArtifactV1 | undefined;
  if (shouldBuildDecisionArtifact && layer_fusion) {
    try {
      decision_artifact = buildDecisionArtifact({
        snapshot,
        conclusion: conclusion ?? undefined,
        layer_fusion: layer_fusion,
        business_profile: params.artifact.business_profile ?? null,
        readiness_level: readiness_level as "ready",
        diagnose_mode: false,
        mapping_confidence: params.artifact.mapping_confidence ?? "high",
        benchmarks: benchmarks ?? undefined,
      });
    } catch (error) {
      // Fall back to legacy presentation
      console.error("Failed to build decision artifact:", error);
      decision_artifact = undefined;
    }
  }

  // If we have a decision artifact, use it to populate the presented artifact
  if (decision_artifact) {
    const pressure_map = decision_artifact.pressure_map?.map(p => ({
      id: p.key,
      severity: "medium" as const,
      statement: p.sentence,
      percentile: p.percentile,
    }));

    const benchmarks = decision_artifact.benchmarks ? {
      cohort_label: decision_artifact.benchmarks.cohort_label,
      top_signals: decision_artifact.benchmarks.metrics.slice(0, 3).map(m => ({
        metric_key: m.key,
        label: m.label,
        percentile: m.percentile,
      })),
    } : undefined;

    const quotes_count = snapshot?.activity_signals.quotes.quotes_count ?? null;
    const invoices_count = snapshot?.activity_signals.invoices.invoices_count ?? null;

    return {
      header: {
        title: "Business snapshot",
        run_id: params.run_id,
        created_at: params.created_at,
        confidence: decision_artifact.confidence.level,
        source: inferSource(params.mode),
      },
      takeaway: decision_artifact.takeaway,
      next_action: decision_artifact.next_7_days?.[0] ?? "No immediate actions required.",
      micro_steps: decision_artifact.next_7_days ?? [],
      why_heavy: decision_artifact.why_heavy,
      evidence_chips: [], // Could map from pressure_map if needed
      data_health: {
        quotes_count,
        invoices_count,
        date_range: params.artifact.input_health?.date_range ?? null,
        coverage_text: params.artifact.input_health?.coverage_warnings.length 
          ? params.artifact.input_health.coverage_warnings.join(" ")
          : "Coverage looks complete.",
      },
      data_warnings: Array.isArray(params.artifact.data_warnings)
        ? (params.artifact.data_warnings.filter((w) => typeof w === "string") as string[])
        : [],
      technical_details: undefined,
      pressure_map,
      benchmarks,
      boundary: decision_artifact.boundary,
    };
  }

  // Legacy presentation (when conclusion is available but no layer_fusion)
  const confidence =
    conclusion?.confidence === "low" || conclusion?.confidence === "medium" || conclusion?.confidence === "high"
      ? conclusion.confidence
      : snapshot?.window.sample_confidence ?? "unknown";

  const evidenceSignals = Array.isArray(conclusion?.evidence_signals) ? (conclusion.evidence_signals as string[]) : [];
  const technical_signals: Array<{ key: string; value: string }> = [];
  const evidence_chips = evidenceSignals
    .map((raw) => {
      const parsed = parseEvidenceSignal(raw);
      if (!parsed) return null;
      technical_signals.push({ key: parsed.path, value: parsed.raw_value });
      return describeEvidenceSignal(parsed, snapshot);
    })
    .filter(Boolean) as PresentedArtifact["evidence_chips"];

  const inputHealth = params.artifact.input_health;
  const coverageWarnings = inputHealth?.coverage_warnings ?? [];
  const coverage_text = coverageWarnings.length ? coverageWarnings.join(" ") : "Coverage looks complete.";

  const quotes_count = snapshot?.activity_signals.quotes.quotes_count ?? null;
  const invoices_count = snapshot?.activity_signals.invoices.invoices_count ?? null;

  const data_warnings = Array.isArray(params.artifact.data_warnings)
    ? (params.artifact.data_warnings.filter((w) => typeof w === "string") as string[])
    : [];

  const takeaway =
    typeof conclusion?.one_sentence_pattern === "string" && conclusion.one_sentence_pattern.trim().length
      ? conclusion.one_sentence_pattern.trim()
      : "Snapshot is still assembling.";

  const next_action =
    typeof conclusion?.decision === "string" && conclusion.decision.trim().length
      ? conclusion.decision.trim()
      : "Decision pending.";

  const why_heavy =
    typeof conclusion?.why_this_now === "string" && conclusion.why_this_now.trim().length
      ? conclusion.why_this_now.trim()
      : "Supporting context is still loading.";

  const micro_steps = Array.isArray(conclusion?.optional_next_steps)
    ? (conclusion.optional_next_steps.filter((s: unknown) => typeof s === "string").slice(0, 2) as string[])
    : [];

  return {
    header: {
      title: "Business snapshot",
      run_id: params.run_id,
      created_at: params.created_at,
      confidence,
      source: inferSource(params.mode),
    },
    takeaway,
    next_action,
    micro_steps,
    why_heavy,
    evidence_chips,
    data_health: {
      quotes_count,
      invoices_count,
      date_range: inputHealth?.date_range ?? null,
      coverage_text,
    },
    data_warnings,
    technical_details: technical_signals.length > 0 ? { signals: technical_signals } : undefined,
  };
}
