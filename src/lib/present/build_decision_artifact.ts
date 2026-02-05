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
import { translatePressure, type PressureKey, normalizePressureKey, resolvePressureTranslation } from "../pressures";
import { getIndustryAnchor, getIndustryGroup } from "../industry";

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
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function buildWindow(snapshot: SnapshotV2, _layer_fusion?: LayerFusionResult | null): SnapshotWindowV1 {
  const lookback = snapshot.window.lookback_days;
  let rule: SnapshotWindowV1["rule"] = "last_90_days";
  if (lookback === 365) rule = "last_12_months";
  else if (lookback === 90) rule = "last_90_days";
  else rule = "custom";

  // Get exclusions from snapshot
  const excluded_counts = {
    quotes_outside_window: snapshot.exclusions?.quotes_outside_window_count ?? 0,
    invoices_outside_window: snapshot.exclusions?.invoices_outside_window_count ?? 0,
    calendar_outside_window: snapshot.exclusions?.calendar_outside_window_count ?? 0,
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
 * Reserved for future use when layer_fusion is fully integrated
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
 * Uses industry-aware pressure translations for owner-felt language
 */
function buildPressureMap(
  layer_fusion: LayerFusionResult | null,
  snapshot: SnapshotV2,
  benchmarks: BenchmarkPackV1 | undefined,
  evidence_summary: string,
  visuals_summary: string,
  industry: IndustryBucket | null,
  industry_key?: string | null,
  cohort_label?: string
): PressureSignalV1[] {
  if (!layer_fusion || layer_fusion.pressure_patterns.length === 0) {
    return [];
  }

  // Get industry group for resolution
  const industry_group = getIndustryGroup(industry_key ?? cohort_label);

  // Map layer fusion patterns to pressure signals (max 3) using industry-aware translation
  const pressureMap: PressureSignalV1[] = [];

  for (const pattern of layer_fusion.pressure_patterns.slice(0, 3)) {
    // Resolve pressure translation with industry awareness
    const resolved = resolvePressureTranslation({
      pressure_key: pattern.pressure_key as PressureKey,
      industry_key,
      industry_group,
      cohort_label,
    });

    // Normalize pressure key for mapping
    const canonicalKey = normalizePressureKey(pattern.pressure_key as PressureKey);
    
    // Map canonical key to PressureSignalV1 key (for backward compatibility)
    let key: PressureSignalV1["key"] = "rhythm_volatility";
    if (canonicalKey === "follow_up_drift") {
      key = "follow_up_drift";
    } else if (canonicalKey === "capacity_pressure") {
      key = "capacity_squeeze";
    } else if (canonicalKey === "concentration_risk") {
      key = "fragility";
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
      sentence: resolved.owner_felt_line,
      benchmark_ref,
      percentile,
      recommended_move: resolved.recommended_move,
      boundary: resolved.boundary,
    });
  }

  return pressureMap;
}

/**
 * Build takeaway with concrete numbers
 * Format: owner-felt line + quantified evidence with benchmark comparison
 */
function buildTakeaway(
  layer_fusion: LayerFusionResult | null,
  conclusion: ConclusionV2 | null,
  snapshot: SnapshotV2,
  benchmarks: BenchmarkPackV1 | undefined,
  evidence_summary: string,
  visuals_summary: string,
  industry: IndustryBucket | null,
  industry_key?: string | null,
  cohort_label?: string
): string {
  // Get top pressure from fusion result
  const topPressure = layer_fusion?.pressure_patterns?.[0];
  
  if (topPressure && benchmarks) {
    // Normalize pressure key
    const canonicalKey = normalizePressureKey(topPressure.pressure_key as PressureKey);
    
    // Get industry group
    const industry_group = getIndustryGroup(industry_key ?? cohort_label);
    
    // Resolve industry-aware pressure translation
    const resolved = resolvePressureTranslation({
      pressure_key: topPressure.pressure_key as PressureKey,
      industry_key,
      industry_group,
      cohort_label,
    });
    
    // Map pressure to benchmark metric
    const metricKeyMap: Record<string, string> = {
      concentration_risk: "revenue_concentration_top5_share",
      follow_up_drift: "quote_age_over_14d_share",
      capacity_pressure: "approved_to_scheduled_p50_days",
      cashflow_drag: "invoiced_to_paid_p50_days",
      rhythm_volatility: "weekly_volume_volatility_index",
      low_conversion: "quote_to_job_conversion_rate",
      decision_lag: "approved_to_scheduled_p50_days",
    };
    
    const metricKey = metricKeyMap[canonicalKey];
    const metric = metricKey ? benchmarks.metrics.find((m) => m.key === metricKey) : undefined;
    
    // Build quantified evidence clause with benchmark comparison
    let evidenceClause = "";
    if (metric) {
      const valueStr = metric.unit === "%" 
        ? `~${Math.round(metric.value)}%`
        : metric.unit === "days"
        ? `${Math.round(metric.value)} days`
        : `${metric.value.toFixed(1)}`;
      
      const medianStr = metric.unit === "%"
        ? `~${Math.round(metric.peer_median)}%`
        : metric.unit === "days"
        ? `${Math.round(metric.peer_median)} days`
        : `${metric.peer_median.toFixed(1)}`;
      
      const percentileStr = `${Math.round(metric.percentile)}`;
      
      evidenceClause = `${valueStr} (peer median ${medianStr}, ${percentileStr}${metric.percentile >= 50 ? 'th' : 'th'} percentile${metric.direction === "higher_is_risk" && metric.percentile > 70 ? ' risk' : ''})`;
    }
    
    // Combine owner-felt line + quantified evidence
    if (resolved.owner_felt_line && evidenceClause) {
      return `${resolved.owner_felt_line} ${evidenceClause}.`;
    } else if (resolved.owner_felt_line) {
      return `${resolved.owner_felt_line} ${evidence_summary}.`;
    }
  }
  
  // Fallback to conclusion
  if (conclusion?.one_sentence_pattern) {
    return `${conclusion.one_sentence_pattern.replace(/\s+$/, "")} ${evidence_summary}.`;
  }
  
  // Last resort: snapshot summary
  const quotes = snapshot.activity_signals?.quotes?.quotes_count ?? 0;
  const invoices = snapshot.activity_signals?.invoices?.invoices_count ?? 0;
  const lookback = snapshot.window?.lookback_days ?? 90;
  return `Analyzed ${quotes} quotes and ${invoices} invoices from the last ${lookback} days.`;
}

/**
 * Build why_heavy explanation with industry anchor
 */
function buildWhyHeavy(
  layer_fusion: LayerFusionResult | null,
  conclusion: ConclusionV2 | null,
  benchmarks: BenchmarkPackV1 | undefined,
  evidence_summary: string,
  visuals_summary: string,
  industry: IndustryBucket | null,
  cohort_label: string | undefined
): string {
  if (layer_fusion) {
    const top = layer_fusion.pressure_patterns[0];
    if (top) {
      // Use pressure translation why_line with benchmark binding
      const translated = translatePressure(top.pressure_key as PressureKey, {
        evidence_summary,
        visuals_summary,
        benchmarks,
        industry,
      });
      
      let why = translated.why_line || top.statement;

      // Add disambiguation: what is NOT the issue from benchmarks
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

      // Add industry anchor sentence (always)
      const industryAnchor = getIndustryAnchor(industry, cohort_label);
      why += ` ${industryAnchor}`;

      return why;
    }
  }

  if (conclusion?.why_this_now) {
    return conclusion.why_this_now;
  }

  return "Patterns are still emerging from the available data.";
}

/**
 * Build boundary condition from templates
 */
function buildBoundary(
  layer_fusion: LayerFusionResult | null,
  conclusion: ConclusionV2 | null,
  mapping_confidence: BuildArtifactInput["mapping_confidence"],
  evidence_summary: string,
  visuals_summary: string,
  benchmarks: BenchmarkPackV1 | undefined,
  industry: IndustryBucket | null
): string {
  if (mapping_confidence === "low") {
    // Use mapping_low_confidence pressure boundary template
    const translated = translatePressure("mapping_low_confidence", {
      evidence_summary,
      visuals_summary,
      benchmarks,
      industry,
    });
    return translated.boundary || "Confirm data mappings before acting.";
  }

  if (layer_fusion && layer_fusion.warnings.length > 0) {
    return "Review data coverage; linkage between layers may be incomplete.";
  }

  // Use top pressure boundary template if available
  if (layer_fusion && layer_fusion.pressure_patterns.length > 0) {
    const top = layer_fusion.pressure_patterns[0];
    const translated = translatePressure(top.pressure_key as PressureKey, {
      evidence_summary,
      visuals_summary,
      benchmarks,
      industry,
    });
    return translated.boundary || "Do not act if this conflicts with your direct operational knowledge.";
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

  // Get industry bucket for voice hints
  const industry = business_profile?.industry_bucket ?? null;
  const industry_key = business_profile?.industry_key ?? null;
  const cohort_label = benchmarks?.cohort_label;

  // Build evidence summary for pressure translations
  const quotes_count = snapshot.activity_signals?.quotes?.quotes_count ?? 0;
  const invoices_count = snapshot.activity_signals?.invoices?.invoices_count ?? 0;
  const lookback_days = snapshot.window?.lookback_days ?? 90;
  const evidence_summary = `Based on ${quotes_count} quotes and ${invoices_count} invoices in the last ${lookback_days} days`;
  
  // Build visuals summary
  const visuals_summary = benchmarks?.metrics
    .filter(m => m.percentile !== undefined && (m.percentile > 70 || m.percentile < 30))
    .map(m => `${m.label}: ${m.percentile}th percentile`)
    .join(", ") || "No significant outliers";

  // Build pressure map with industry awareness
  const pressure_map = buildPressureMap(layer_fusion ?? null, snapshot, benchmarks, evidence_summary, visuals_summary, industry, industry_key, cohort_label);

  // Build narrative components with industry awareness
  const takeaway = buildTakeaway(layer_fusion ?? null, conclusion ?? null, snapshot, benchmarks, evidence_summary, visuals_summary, industry, industry_key, cohort_label);
  const why_heavy = buildWhyHeavy(layer_fusion ?? null, conclusion ?? null, benchmarks, evidence_summary, visuals_summary, industry, cohort_label);
  const boundary = buildBoundary(layer_fusion ?? null, conclusion ?? null, mapping_confidence, evidence_summary, visuals_summary, benchmarks, industry);

  // Build next steps using industry-aware pressure translations, bind real numbers
  let next_7_days: string[];
  if (readiness_level === "ready" && layer_fusion && layer_fusion.pressure_patterns.length > 0) {
    // Get industry group for resolution
    const industry_group = getIndustryGroup(industry_key ?? cohort_label);
    
    // Get top 3 pressures and resolve each with industry awareness
    const actions = layer_fusion.pressure_patterns.slice(0, 3).map((pattern) => {
      const resolved = resolvePressureTranslation({
        pressure_key: pattern.pressure_key as PressureKey,
        industry_key,
        industry_group,
        cohort_label,
      });
      
      // Use recommended_move from resolved translation
      let action = resolved.recommended_move;
      
      // Find matching benchmark metric to bind numbers
      const canonicalKey = normalizePressureKey(pattern.pressure_key as PressureKey);
      const metricKeyMap: Record<string, string> = {
        concentration_risk: "revenue_concentration_top5_share",
        follow_up_drift: "quote_age_over_14d_share",
        capacity_pressure: "approved_to_scheduled_p50_days",
        cashflow_drag: "invoiced_to_paid_p50_days",
        rhythm_volatility: "weekly_volume_volatility_index",
        low_conversion: "quote_to_job_conversion_rate",
        decision_lag: "approved_to_scheduled_p50_days",
      };
      
      const metricKey = metricKeyMap[canonicalKey];
      if (metricKey && benchmarks) {
        const metric = benchmarks.metrics.find((m) => m.key === metricKey);
        if (metric) {
          const valueStr = metric.unit === "%" 
            ? `${Math.round(metric.value)}%`
            : metric.unit === "days"
            ? `${Math.round(metric.value)} days`
            : `${metric.value.toFixed(1)}`;
          
          // Bind number into action if it contains placeholders or append it
          if (!action.match(/\d+%|\d+ days/)) {
            // No number in action, append context
            action = `${action} (current: ${valueStr})`;
          }
        }
      }
      
      return action;
    });
    next_7_days = actions;
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
