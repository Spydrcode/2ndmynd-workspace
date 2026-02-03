/**
 * Decision Artifact Builder - Synthesize client-facing decision output
 * 
 * Rules:
 * - Use layer_fusion when readiness_level === "ready"
 * - Otherwise fallback to conclusion/snapshot heuristics
 * - Always produce complete artifact with concrete numbers
 */

import type { SnapshotV2, ConclusionV2 } from "@/lib/decision/v2/conclusion_schema_v2";
import type { LayerFusionResult } from "../intelligence/layer_fusion/types";
import type { BusinessProfile } from "../intelligence/web_profile";
import type { BenchmarkResult } from "../benchmarks/types";
import type {
  DecisionArtifactV1,
  PressureSignalV1,
  SnapshotWindowV1,
  BenchmarkPackV1,
  BenchmarkMetricV1,
  ConfidenceLevel,
} from "../types/decision_artifact";
import { computeBenchmarks } from "../benchmarks/benchmark_engine";

type BuildArtifactInput = {
  snapshot: SnapshotV2;
  conclusion?: ConclusionV2 | null;
  layer_fusion?: LayerFusionResult | null;
  business_profile: BusinessProfile | null;
  readiness_level: "blocked" | "partial" | "ready" | null;
  diagnose_mode?: boolean;
  mapping_confidence?: "low" | "medium" | "high" | null;
  benchmarks?: BenchmarkResult | null;
};

/**
 * Build window metadata with exclusions
 */
function buildWindow(snapshot: SnapshotV2, layer_fusion?: LayerFusionResult | null): SnapshotWindowV1 {
  const lookback = snapshot.window.lookback_days;
  let rule: SnapshotWindowV1["rule"] = "last_90_days";
  if (lookback === 365) rule = "last_12_months";
  else if (lookback === 90) rule = "last_90_days";
  else rule = "custom";

  // Get exclusions from layer fusion or default to 0
  const excluded_counts = {
    quotes_outside_window: 0,
    invoices_outside_window: 0,
    calendar_outside_window: 0,
  };

  return {
    start_date: snapshot.window?.slice_start ?? "",
    end_date: snapshot.window?.slice_end ?? "",
    rule,
    excluded_counts,
  };
}

/**
 * Build confidence assessment
 */
function buildConfidence(
  snapshot: SnapshotV2,
  readiness_level: BuildArtifactInput["readiness_level"],
  mapping_confidence: BuildArtifactInput["mapping_confidence"],
  diagnose_mode: boolean
): { level: ConfidenceLevel; reason: string } {
  if (diagnose_mode) {
    return {
      level: "low",
      reason: "Diagnose mode: business conclusions suppressed until inputs are grounded.",
    };
  }

  if (readiness_level === "blocked") {
    return {
      level: "low",
      reason: "Could not recognize usable quotes or invoices from uploads.",
    };
  }

  if (mapping_confidence === "low") {
    return {
      level: "medium",
      reason: "Data mapping may be incomplete. Review field mappings before acting.",
    };
  }

  const sampleConfidence = snapshot.window.sample_confidence;
  if (sampleConfidence === "high") {
    return { level: "high", reason: "Sufficient data and clear patterns detected." };
  } else if (sampleConfidence === "medium") {
    return { level: "medium", reason: "Moderate data coverage; patterns are emerging." };
  } else {
    return { level: "low", reason: "Limited data; patterns are preliminary." };
  }
}

/**
 * Map layer fusion focus to next steps
 */
function focusToNextSteps(focus: LayerFusionResult["recommended_focus"]): string[] {
  switch (focus) {
    case "follow_up":
      return [
        "Pick one owner for quote follow-up and keep a simple 48-hour rhythm for mid-sized work.",
        "Define \"mid-sized\" in dollars for your business.",
      ];
    case "scheduling":
      return [
        "Protect one calm scheduling pass each week so approved work lands cleanly.",
        "Assign one person as the schedule \"closer\".",
      ];
    case "invoicing":
      return [
        "Run a twice-weekly invoicing pass so scheduled work doesn't wait to be billed.",
        "Invoice within 48 hours of completion.",
      ];
    case "collections":
      return [
        "Set a light collections rhythm for unpaid invoices so cash timing doesn't become background pressure.",
        "Do two touches per week on anything >21 days unpaid.",
      ];
    case "pricing":
      return [
        "Stabilize by building a repeatable path to mid-sized jobs, not more one-offs.",
        "Choose one offer that reliably produces mid-sized work.",
      ];
    case "data_fix":
    default:
      return ["Fix the export mapping (especially dates and invoice columns), then re-run this snapshot."];
  }
}

/**
 * Build pressure map from layer fusion or heuristics
 */
function buildPressureMap(
  layer_fusion: LayerFusionResult | null,
  benchmarks: BenchmarkPackV1 | undefined
): PressureSignalV1[] {
  if (!layer_fusion || layer_fusion.pressure_patterns.length === 0) {
    return [];
  }

  // Map layer fusion patterns to pressure signals (max 3)
  const pressureMap: PressureSignalV1[] = [];

  for (const pattern of layer_fusion.pressure_patterns.slice(0, 3)) {
    let key: PressureSignalV1["key"] = "rhythm_volatility";
    let recommended_move = "Monitor and track patterns.";
    let boundary = "Do not act until patterns stabilize.";

    if (pattern.id === "followup_drift") {
      key = "follow_up_drift";
      recommended_move = "Assign one owner and set a 48-hour follow-up rhythm.";
      boundary = "If most quotes are seasonal inquiries, maintain light touch.";
    } else if (pattern.id === "capacity_pressure") {
      key = "capacity_squeeze";
      recommended_move = "Protect a weekly scheduling pass to avoid re-planning loops.";
      boundary = "If schedule is full by design, this is expected.";
    } else if (pattern.id === "concentration_risk") {
      key = "fragility";
      recommended_move = "Build repeatable paths to mid-sized jobs.";
      boundary = "If your model is high-ticket/low-volume, this is expected.";
    }

    // Find matching benchmark if available
    let benchmark_ref: string | undefined;
    let percentile: number | undefined;

    if (benchmarks) {
      for (const metric of benchmarks.metrics) {
        if (
          (key === "follow_up_drift" && metric.key.includes("quote_age")) ||
          (key === "capacity_squeeze" && metric.key.includes("approved_to_scheduled")) ||
          (key === "fragility" && metric.key.includes("concentration"))
        ) {
          benchmark_ref = metric.key;
          percentile = metric.percentile;
          break;
        }
      }
    }

    pressureMap.push({
      key,
      label: pattern.id.replace(/_/g, " "),
      sentence: pattern.statement,
      benchmark_ref,
      percentile,
      recommended_move,
      boundary,
    });
  }

  return pressureMap;
}

/**
 * Build takeaway with concrete numbers
 */
function buildTakeaway(
  layer_fusion: LayerFusionResult | null,
  conclusion: ConclusionV2 | null,
  snapshot: SnapshotV2,
  benchmarks: BenchmarkPackV1 | undefined
): string {
  // Prefer layer fusion when available
  let takeaway: string | undefined;
  
  // Try layer_fusion.one_sentence first (if present)
  if (layer_fusion && "one_sentence" in layer_fusion && layer_fusion.one_sentence) {
    takeaway = layer_fusion.one_sentence as string;
  } 
  // Fall back to pressure_patterns[0].statement
  else if (layer_fusion && layer_fusion.pressure_patterns.length > 0) {
    takeaway = layer_fusion.pressure_patterns[0].statement;
  }

  if (takeaway) {
    // Add benchmark comparison if available
    if (benchmarks && benchmarks.metrics.length > 0) {
      const topMetric = benchmarks.metrics.find((m) => m.percentile > 65 || m.percentile < 35);
      if (topMetric) {
        const position = topMetric.percentile > 50 ? "higher than most peers" : "better than typical";
        takeaway += ` Your ${topMetric.label.toLowerCase()} is ${topMetric.percentile}th percentile (${position} in ${benchmarks.cohort_label}).`;
      }
    }

    return takeaway;
  }

  // Fallback to conclusion
  if (conclusion?.one_sentence_pattern) {
    return conclusion.one_sentence_pattern;
  }

  // Last resort: snapshot summary
  const quotes = snapshot.activity_signals?.quotes?.quotes_count ?? 0;
  const invoices = snapshot.activity_signals?.invoices?.invoices_count ?? 0;
  const lookback = snapshot.window?.lookback_days ?? 90;
  return `Analyzed ${quotes} quotes and ${invoices} invoices from the last ${lookback} days.`;
}

/**
 * Build why_heavy explanation
 */
function buildWhyHeavy(
  layer_fusion: LayerFusionResult | null,
  conclusion: ConclusionV2 | null,
  benchmarks: BenchmarkPackV1 | undefined
): string {
  if (layer_fusion) {
    const top = layer_fusion.pressure_patterns[0];
    if (top) {
      let why = top.statement;

      // Add context about what is NOT the issue from benchmarks
      if (benchmarks) {
        const goodMetrics = benchmarks.metrics.filter(
          (m) =>
            (m.direction === "higher_is_risk" && m.percentile < 40) ||
            (m.direction === "lower_is_risk" && m.percentile > 60)
        );
        if (goodMetrics.length > 0) {
          why += ` This is not a ${goodMetrics[0].label.toLowerCase()} issue—that's tracking well.`;
        }
      }

      return why;
    }
  }

  if (conclusion?.why_this_now) {
    return conclusion.why_this_now;
  }

  return "Patterns are still emerging from the available data.";
}

/**
 * Build boundary condition
 */
function buildBoundary(
  layer_fusion: LayerFusionResult | null,
  conclusion: ConclusionV2 | null,
  mapping_confidence: BuildArtifactInput["mapping_confidence"]
): string {
  if (mapping_confidence === "low") {
    return "Confirm data mappings before acting.";
  }

  if (layer_fusion && layer_fusion.warnings.length > 0) {
    return "Review data coverage; linkage between layers may be incomplete.";
  }

  if (conclusion?.boundary) {
    return conclusion.boundary;
  }

  return "Do not act if this conflicts with your direct operational knowledge.";
}

/**
 * Main builder function
 */
export function buildDecisionArtifact(input: BuildArtifactInput): DecisionArtifactV1 {
  const { snapshot, conclusion, layer_fusion, business_profile, readiness_level, diagnose_mode, mapping_confidence } =
    input;

  // Build window
  const window = buildWindow(snapshot, layer_fusion);

  // Build confidence
  const confidence = buildConfidence(snapshot, readiness_level, mapping_confidence, diagnose_mode ?? false);

  // Use provided benchmarks or compute them (but not if explicitly set to null)
  let benchmarkResult: BenchmarkResult | undefined = input.benchmarks ?? undefined;
  
  if (benchmarkResult === undefined && !("benchmarks" in input)) {
    // benchmarks not provided at all, compute them
    const industryTags = [
      business_profile?.industry_bucket,
      ...(business_profile?.services ?? [])
    ].filter((tag): tag is string => Boolean(tag));
    
    benchmarkResult = computeBenchmarks({ snapshot, industryTags });
  } else if (input.benchmarks === null) {
    // explicitly set to null, don't compute
    benchmarkResult = undefined;
  }
  
  // Map benchmark keys to human-readable labels
  const labelMap: Record<string, string> = {
    revenue_concentration_top5_share: "Revenue concentration",
    invoice_size_distribution_gini: "Invoice size variation",
    quote_age_over_14d_share: "Quote follow-up lag",
    quote_to_job_conversion_rate: "Quote conversion",
    approved_to_scheduled_p50_days: "Approved → scheduled lag",
    invoiced_to_paid_p50_days: "Invoice → paid cycle",
    weekly_volume_volatility_index: "Volume volatility",
  };
  
  const benchmarks: BenchmarkPackV1 | undefined = benchmarkResult?.cohort_id ? {
    cohort_id: benchmarkResult.cohort_id,
    cohort_label: benchmarkResult.cohort_label,
    version: benchmarkResult.benchmark_version,
    metrics: Object.entries(benchmarkResult.metrics).map(([key, metric]) => ({
      key,
      label: labelMap[key] ?? key.replace(/_/g, " "),
      unit: (key.includes("share") || key.includes("rate") || key.includes("gini") ? "%" : 
             key.includes("days") ? "days" : 
             key.includes("index") ? "ratio" : "%") as BenchmarkMetricV1["unit"],
      value: metric.value,
      peer_median: metric.peer_median,
      percentile: metric.percentile,
      direction: (metric.directionality === "higher_is_better" ? "lower_is_risk" :
                  metric.directionality === "lower_is_better" ? "higher_is_risk" :
                  "neutral") as BenchmarkMetricV1["direction"],
    })),
  } : undefined;

  // Build pressure map
  const pressure_map = buildPressureMap(layer_fusion ?? null, benchmarks);

  // Build narrative components
  const takeaway = buildTakeaway(layer_fusion ?? null, conclusion, snapshot, benchmarks);
  const why_heavy = buildWhyHeavy(layer_fusion ?? null, conclusion, benchmarks);
  const boundary = buildBoundary(layer_fusion ?? null, conclusion, mapping_confidence);

  // Build next steps
  let next_7_days: string[];
  if (readiness_level === "ready" && layer_fusion) {
    next_7_days = focusToNextSteps(layer_fusion.recommended_focus);
  } else if (conclusion?.optional_next_steps && conclusion.optional_next_steps.length > 0) {
    next_7_days = conclusion.optional_next_steps.slice(0, 3);
  } else {
    next_7_days = ["Review data coverage and re-run snapshot when inputs are complete."];
  }

  return {
    version: "v1",
    takeaway,
    why_heavy,
    next_7_days: next_7_days.slice(0, 3),
    boundary,
    window,
    confidence,
    pressure_map,
    benchmarks,
  };
}
