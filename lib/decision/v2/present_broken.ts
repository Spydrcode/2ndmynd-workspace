import type { ConclusionV2, SnapshotV2 } from "./conclusion_schema_v2";
import { describeEvidenceSignal, parseEvidenceSignal } from "./signal_catalog";
import type { PredictiveContext } from "@/src/lib/intelligence/predictive/predictive_context";
import type { RunManifest } from "@/src/lib/intelligence/run_manifest";
import type { ArchetypeDetectionResult, ArchetypeWatchList, WatchListItem } from "@/src/lib/intelligence/archetypes/types";
import type { LayerCoverage } from "@/src/lib/intelligence/company_pack";
import type { LayerFusionResult } from "@/src/lib/intelligence/layer_fusion/types";
import type { BenchmarkResult } from "@/src/lib/benchmarks/types";

export type LayerCoverageDisplay = {
  recognized: string[];
  missing: string[];
  partial_warning?: string;
};

export type PresentedArtifact = {
  header: {
    title: string;
    run_id: string;
    created_at: string | null;
    confidence: "low" | "medium" | "high" | "unknown";
    source: "mock" | "live" | "unknown";
    window_summary?: string; // e.g., "Last 90 days (23 quotes, 45 invoices)"
  };
  takeaway: string;
  next_action: string;
  micro_steps: string[];
  why_heavy: string;
  boundary?: string;
  pressure_map?: Array<{
    key: string;
    label: string;
    sentence: string;
    percentile?: number;
    severity: "low" | "medium" | "high";
  }>;
  benchmarks?: {
    cohort_label: string;
    top_signals: Array<{
      metric_label: string;
      value_display: string;
      percentile: number;
      interpretation: string;
    }>;
  };
  evidence_chips: Array<{
    label: string;
    value: string;
    explanation: string;
    severity: "low" | "medium" | "high";
  }>;
  data_health: {
    quotes_count: number | null;
    invoices_count: number | null;
    calendar_count: number | null;
    date_range: string | null;
    coverage_text: string;
  };
  data_warnings: string[];
  layer_coverage?: LayerCoverageDisplay;
  predictive_watch_list?: Array<{
    topic: string;
    why: string;
    what_to_watch: string;
  }>;
  technical_details?: {
    manifest_summary: string;
    archetype_hints?: string;
    signals: Array<{ key: string; value: string }>;
  };
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

function asLayerFusionResult(value: unknown): LayerFusionResult | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (!record.summary || typeof record.summary !== "object") return null;
  if (!Array.isArray(record.pressure_patterns)) return null;
  if (typeof record.recommended_focus !== "string") return null;
  return value as LayerFusionResult;
}

function focusToNextAction(
  focus: LayerFusionResult["recommended_focus"]
): { next_action: string; micro_steps: string[] } {
  switch (focus) {
    case "follow_up":
      return {
        next_action: "Pick one owner for quote follow-up and keep a simple 48-hour rhythm for mid-sized work.",
        micro_steps: ["Define “mid-sized” in dollars for your business.", "Do one follow-up pass every weekday."],
      };
    case "scheduling":
      return {
        next_action: "Protect one calm scheduling pass each week so approved work lands cleanly without re-planning loops.",
        micro_steps: ["Assign one person as the schedule “closer”.", "Batch reschedules into a single daily window."],
      };
    case "invoicing":
      return {
        next_action: "Run a twice-weekly invoicing pass so scheduled work doesn’t wait to be billed.",
        micro_steps: ["Invoice within 48 hours of completion.", "Keep a short “ready to invoice” list."],
      };
    case "collections":
      return {
        next_action: "Set a light collections rhythm for unpaid invoices so cash timing doesn’t become background pressure.",
        micro_steps: ["Do two touches per week on anything >21 days unpaid.", "Use one template message to stay consistent."],
      };
    case "pricing":
      return {
        next_action: "Stabilize by building a repeatable path to mid-sized jobs, not more one-offs.",
        micro_steps: [
          "Choose one offer that reliably produces mid-sized work.",
          "Tighten your minimum job threshold where it makes sense.",
        ],
      };
    case "data_fix":
    default:
      return {
        next_action: "Fix the export mapping (especially dates and invoice columns), then re-run this snapshot.",
        micro_steps: [],
      };
  }
}

function buildWhyHeavyFromFusion(layer: LayerFusionResult, benchmarks?: BenchmarkResult): string {
  const parts: string[] = [];
  const top = layer.pressure_patterns[0];
  
  if (top?.statement) {
    parts.push(top.statement);
  }

  // Add benchmark context if available
  if (benchmarks) {
    const topMetric = Object.entries(benchmarks.metrics)
      .map(([key, metric]) => ({ key, ...metric }))
      .filter((m) => m.percentile > 75 || m.percentile < 25)
      .sort((a, b) => Math.abs(50 - b.percentile) - Math.abs(50 - a.percentile))[0];

    if (topMetric) {
      const better = topMetric.directionality === "lower_is_better" ? topMetric.percentile < 50 : topMetric.percentile > 50;
      if (!better) {
        parts.push(`This is not a cash cycle issue—${topMetric.interpretation_hint.toLowerCase()}.`);
      }
    }
function buildTakeawayFromBenchmarks(layer: LayerFusionResult, benchmarks: BenchmarkResult): string {
  const top = layer.pressure_patterns[0];
  if (!top) return "Your snapshot is assembling.";

  // Find the most relevant benchmark metric
  const topMetric = Object.entries(benchmarks.metrics)
    .map(([key, metric]) => ({ key, ...metric }))
    .filter((m) => m.percentile > 60 || m.percentile < 40) // Show when notably different
    .sort((a, b) => Math.abs(50 - b.percentile) - Math.abs(50 - a.percentile))[0];

  if (!topMetric) {
    return top.statement;
  }

  const better = topMetric.directionality === "lower_is_better" ? topMetric.percentile < 50 : topMetric.percentile > 50;
  const position = better ? "better than typical" : "higher than most peers";
  
  // Format the value nicely
  let valueDisplay = `${(topMetric.value * 100).toFixed(0)}%`;
  if (topMetric.key.includes("p50_days")) {
    valueDisplay = `${topMetric.value.toFixed(1)} days`;
  } else if (topMetric.key.includes("gini")) {
    valueDisplay = `${(topMetric.value * 100).toFixed(0)}% variance`;
  }

  return `${top.statement} Your ${topMetric.key.replace(/_/g, " ")} is ${valueDisplay} (${position} in ${benchmarks.cohort_label}).`;
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
    predictive_context?: PredictiveContext | null;
    predictive_watch_list?: ArchetypeWatchList | null;
    archetypes?: ArchetypeDetectionResult | null;
    run_manifest?: RunManifest | null;
    readiness_level?: "blocked" | "partial" | "ready" | null;
    diagnose_mode?: boolean | null;
    layer_coverage?: LayerCoverage | null;
    layer_fusion?: unknown | null;
    benchmarks?: unknown | null;
    mapping_confidence?: "low" | "medium" | "high" | null;
  };
}): PresentedArtifact {
  const snapshot = asSnapshotV2(params.artifact.snapshot);
  const conclusion = asConclusionV2(params.artifact.conclusion);
  const readinessLevel = params.artifact.readiness_level ?? null;
  const diagnoseMode = params.artifact.diagnose_mode === true;
  const layerFusion = asLayerFusionResult(params.artifact.layer_fusion);
  const benchmarks = params.artifact.benchmarks as BenchmarkResult | null | undefined;
  const mappingConfidence = params.artifact.mapping_confidence ?? null

  return parts.slice(0, 2).join(" ");
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
    predictive_context?: PredictiveContext | null;
    predictive_watch_list?: ArchetypeWatchList | null;
    archetypes?: ArchetypeDetectionResult | null;
    run_manifest?: RunManifest | null;
    readiness_level?: "blocked" | "partial" | "ready" | null;
    diagnose_mode?: boolean | null;
    layer_coverage?: LayerCoverage | null;
    layer_fusion?: unknown | null;
  };
}): PresentedArtifact {
  const snapshot = asSnapshotV2(params.artifact.snapshot);
  const conclusion = asConclusionV2(params.artifact.conclusion);
  const readinessLevel = params.artifact.readiness_level ?? null;
  const diagnoseMode = params.artifact.diagnose_mode === true;
  const layerFusion = asLayerFusionResult(params.artifact.layer_fusion);

  const confidence =
    diagnoseMode && !conclusion
      ? "unknown"
      : conclusion?.confidence === "low" || conclusion?.confidence === "medium" || conclusion?.confidence === "high"
        ? conclusion.confidence
        : snapshot?.window.sample_confidence ?? "unknown";

  const evidenceSignals = Array.isArray(conclusion?.evidence_signals) ? (conclusion.evidence_signals as string[]) : [];
  const technical_signals: Array<{ key: string; value: string }> = [];
  const evidence_chips_from_signals = evidenceSignals
    .map((raw) => {
      const parsed = parseEvidenceSignal(raw);
      if (!parsed) return null;
      technical_signals.push({ key: parsed.path, value: parsed.raw_value });
      return describeEvidenceSignal(parsed, snapshot);
    })
    .filter(Boolean) as PresentedArtifact["evidence_chips"];

  const inputHebenchmarks 
      ? buildTakeawayFromBenchmarks(layerFusion, benchmarks)
      : layerFusion.pressure_patterns[0].statement;
    const mapped = focusToNextAction(layerFusion.recommended_focus);
    next_action = mapped.next_action;
    micro_steps = mapped.micro_steps;
    why_heavy = buildWhyHeavyFromFusion(layerFusion, benchmarksuotes.quotes_count ?? null;
  const invoices_count = snapshot?.activity_signals.invoices.invoices_count ?? null;
  const calendar_count = layerFusion?.summary.calendar_recognized ?? null;

  const data_warnings = Array.isArray(params.artifact.data_warnings)
    ? (params.artifact.data_warnings.filter((w) => typeof w === "string") as string[])
    : [];

  let takeaway =
    typeof conclusion?.one_sentence_pattern === "string" && conclusion.one_sentence_pattern.trim().length
      ? conclusion.one_sentence_pattern.trim()
      : "Snapshot is still assembling.";

  let next_action =
    typeof conclusion?.decision === "string" && conclusion.decision.trim().length
      ? conclusion.decision.trim()
      : "Decision pending.";

  let why_heavy =
    typeof conclusion?.why_this_now === "string" && conclusion.why_this_now.trim().length
      ? conclusion.why_this_now.trim()
      : "Supporting context is still loading.";

  let micro_steps = Array.isArray(conclusion?.optional_next_steps)
    ? (conclusion.optional_next_steps.filter((s: unknown) => typeof s === "string").slice(0, 2) as string[])
    : [];

  if (!diagnoseMode && readinessLevel === "ready" && layerFusion?.pressure_patterns?.length) {
    takeaway = layerFusion.pressure_patterns[0].statement;
    const mapped = focusToNextAction(layerFusion.recommended_focus);
    next_action = mapped.next_action;
    micro_steps = mapped.micro_steps;
    why_heavy = buildWhyHeavyFromFusion(layerFusion);
  }

  if (!conclusion && diagnoseMode) {
    takeaway =
      readinessLevel === "blocked"
        ? "We couldn’t read usable quotes or invoices from these uploads yet."
        : "We can’t safely conclude yet because some inputs didn’t land cleanly.";
    next_action =
      "Fix the export mapping (especially dates and invoice columns), then re-run this snapshot.";
    why_heavy =
      "This is a diagnose-mode snapshot: it shows what we could recognize, but it suppresses business conclusions until invoices and quotes are grounded.";
  }

  // Predictive watch list - prefer archetype-based over industry-based (limit to top 4 items)
  const predictive_watch_list = diagnoseMode
    ? undefined
    : params.artifact.predictive_watch_list?.items
    ? params.artifact.predictive_watch_list.items.slice(0, 4).map((item: WatchListItem) => ({
        topic: item.topic,
        why: item.why,
        what_to_watch: item.what_to_watch,
      }))
    : params.artifact.predictive_context
    ? params.artifact.predictive_context.watch_list.slice(0, 4).map((item: { topic: string; why_it_matters: string; what_to_watch: string }) => ({
        topic: item.topic,
        why: item.why_it_matters,
        what_to_watch: item.what_to_watch,
      }))
    : undefined;

  // Technical details - manifest summary & archetype hints
  let manifest_summary = "No manifest available";
  if (params.artifact.run_manifest) {
    const manifest = params.artifact.run_manifest;
    const succeeded = manifest.steps.filter((s) => s.status === "succeeded").length;
    const skipped = manifest.steps.filter((s) => s.status === "skipped").length;
    const failed = manifest.steps.filter((s) => s.status === "failed").length;
    manifest_summary = `${succeeded} steps succeeded`;
    if (skipped > 0) manifest_summary += `, ${skipped} skipped`;
    if (failed > 0) manifest_summary += `, ${failed} failed`;
    if (manifest.lock_id) manifest_summary += ` (lock: ${manifest.lock_id.slice(0, 8)})`;
  }

  const archetype_hints = params.artifact.archetypes?.archetypes.length
    ? params.artifact.archetypes.archetypes
        .map((a) => `${a.id} (${a.confidence})`)
        .join(", ")
    : undefined;

  // Build layer coverage display
  let layer_coverage_display: LayerCoverageDisplay | undefined;
  if (params.artifact.layer_coverage) {
    const lc = params.artifact.layer_coverage;
    const recognized: string[] = [];
    const missing: string[] = [];

    if (lc.intent) recognized.push("Quotes");
    else missing.push("Quotes");
    if (lc.billing) recognized.push("Invoices");
    else missing.push("Invoices");
    if (lc.capacity) recognized.push("Calendar");
    else missing.push("Calendar");
    if (lc.cash) recognized.push("Payments");
    if (lc.cost) recognized.push("Receipts");
    if (lc.crm) recognized.push("Customers");

    const partial_warning =
      diagnoseMode && readinessLevel === "partial"
        ? "Some files were uploaded but not recognized. Check column headers and date formats."
        : undefined;

    layer_coverage_display = { recognized, missing, partial_warning };
  }

  const fusion_chips: PresentedArtifact["evidence_chips"] = layerFusion
    ? [
        {
          label: "Quotes recognized",
          value: String(layerFusion.summary.quotes_recognized),
          explanation: "How many quote records were recognized across the uploaded files.",
          severity: "low",
        },
        {
          label: "Invoices recognized",
          value: String(layerFusion.summary.invoices_recognized),
          explanation: "How many invoice records were recognized across the uploaded files.",
          severity: layerFusion.summary.invoices_recognized === 0 ? "high" : "low",
        },
        {
          label: "Calendar recognized",
          value: String(layerFusion.summary.calendar_recognized),
          explanation: "How many calendar/schedule records were recognized across the uploaded files.",
          severity: "low",
        },
      ]
    : [];

  const timing_chips: PresentedArtifact["evidence_chips"] = layerFusion
    ? ([
        typeof layerFusion.timing.approved_to_scheduled_p50_days === "number"
          ? {
              label: "Approved → scheduled (p50)",
              value: `~${layerFusion.timing.approved_to_scheduled_p50_days.toFixed(1)} days`,
              explanation: "Median time from approval to the first scheduled slot (linked items only).",
              severity:
                layerFusion.timing.approved_to_scheduled_p50_days > 10
                  ? "high"
                  : layerFusion.timing.approved_to_scheduled_p50_days > 4
                    ? "medium"
                    : "low",
            }
          : null,
        typeof layerFusion.timing.scheduled_to_invoiced_p50_days === "number"
          ? {
              label: "Scheduled → invoiced (p50)",
              value: `~${layerFusion.timing.scheduled_to_invoiced_p50_days.toFixed(1)} days`,
              explanation: "Median time from scheduled work to the first invoice (linked items only).",
              severity:
                layerFusion.timing.scheduled_to_invoiced_p50_days > 10
                  ? "high"
                  : layerFusion.timing.scheduled_to_invoiced_p50_days > 4
                    ? "medium"
  // Build window summary
  const windowSummary = snapshot
    ? `Last ${snapshot.window.lookback_days} days (${snapshot.activity_signals.quotes.quotes_count} quotes, ${snapshot.activity_signals.invoices.invoices_count} invoices)`
    : undefined;

  // Build pressure map
  const pressureMap = layerFusion?.pressure_patterns?.slice(0, 3).map((p) => ({
    key: p.id,
    label: p.id.replace(/_/g, " "),
    sentence: p.statement,
    percentile: p.percentile,
    severity: p.severity,
  }));

  // Build benchmark summary for display
  let benchmarkDisplay: PresentedArtifact["benchmarks"] | undefined;
  if (benchmarks) {
    const topSignals = Object.entries(benchmarks.metrics)
      .map(([key, metric]) => {
        let valueDisplay = `${(metric.value * 100).toFixed(0)}%`;
        if (key.includes("p50_days")) {
          valueDisplay = `${metric.value.toFixed(1)} days`;
        } else if (key.includes("gini")) {
          valueDisplay = `${(metric.value * 100).toFixed(0)}% variance`;
        }
        return {
          metric_label: key.replace(/_/g, " "),
          value_display: valueDisplay,
          percentile: metric.percentile,
          interpretation: metric.interpretation_hint,
        };
      })
      .filter((s) => s.percentile > 60 || s.percentile < 40) // Only show notable differences
      .slice(0, 3);

    benchmarkDisplay = {
      cohort_label: benchmarks.cohort_label,
      top_signals: topSignals,
    };
  }

  // Extract boundary from conclusion
  const boundary = typeof conclusion?.boundary === "string" && conclusion.boundary.trim().length
    ? conclusion.boundary.trim()
    : mappingConfidence === "low"
      ? "Confirm data mappings before acting."
      : undefined;

  return {
    header: {
      title: "Business snapshot",
      run_id: params.run_id,
      created_at: params.created_at,
      confidence,
      source: inferSource(params.mode),
      window_summary: windowSummary,
    },
    takeaway,
    next_action,
    micro_steps,
    why_heavy,
    boundary,
    pressure_map: pressureMap,
    benchmarks: benchmarkDisplaence,
      source: inferSource(params.mode),
    },
    takeaway,
    next_action,
    micro_steps,
    why_heavy,
    evidence_chips: [...fusion_chips, ...timing_chips, ...evidence_chips_from_signals],
    data_health: {
      quotes_count,
      invoices_count,
      calendar_count,
      date_range: inputHealth?.date_range ?? null,
      coverage_text,
    },
    data_warnings,
    layer_coverage: layer_coverage_display,
    predictive_watch_list,
    technical_details: {
      manifest_summary,
      archetype_hints,
      signals: technical_signals,
    },
  };
}
