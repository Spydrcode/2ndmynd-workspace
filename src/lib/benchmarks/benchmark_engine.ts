/**
 * Benchmark engine: compute business performance vs cohort peers
 */

import type { SnapshotV2 } from "@/lib/decision/v2/conclusion_schema_v2";
import type { BenchmarkMetric, BenchmarkResult, CohortMetrics } from "./types";
import { selectCohort, COHORT_DEFINITIONS } from "./cohorts";

const BENCHMARK_VERSION = "v1.0.0";

/**
 * Compute percentile rank for a value against a reference distribution
 * Uses linear interpolation between p25, median, and p75
 */
function percentileRank(
  value: number,
  reference: [number, number, number] // [p25, median, p75]
): number {
  const [p25, median, p75] = reference;

  if (value <= p25) {
    // Extrapolate below p25 (assume p0 is at p25 * 0.5 or 0)
    const p0 = Math.max(0, p25 * 0.5);
    const range = p25 - p0;
    if (range <= 0) return 25;
    const position = ((value - p0) / range) * 25;
    return Math.max(0, Math.min(25, position));
  } else if (value <= median) {
    // Interpolate p25 to p50
    const range = median - p25;
    if (range <= 0) return 25;
    const position = ((value - p25) / range) * 25 + 25;
    return Math.min(50, position);
  } else if (value <= p75) {
    // Interpolate p50 to p75
    const range = p75 - median;
    if (range <= 0) return 50;
    const position = ((value - median) / range) * 25 + 50;
    return Math.min(75, position);
  } else {
    // Extrapolate above p75 (assume p100 is at p75 * 1.5 or p75 + same range)
    const range = p75 - median;
    const p100 = p75 + range;
    const totalRange = p100 - p75;
    if (totalRange <= 0) return 75;
    const position = ((value - p75) / totalRange) * 25 + 75;
    return Math.min(100, position);
  }
}

/**
 * Create a benchmark metric with interpretation
 */
function createMetric(
  value: number,
  reference: [number, number, number],
  directionality: BenchmarkMetric["directionality"],
  metricLabel: string
): BenchmarkMetric {
  const [p25, median, p75] = reference;
  const percentile = percentileRank(value, reference);

  let interpretation_hint = "";
  if (directionality === "lower_is_better") {
    if (percentile < 25) {
      interpretation_hint = `${metricLabel} is in the top quartile (strong)`;
    } else if (percentile < 50) {
      interpretation_hint = `${metricLabel} is better than typical`;
    } else if (percentile < 75) {
      interpretation_hint = `${metricLabel} is near typical`;
    } else {
      interpretation_hint = `${metricLabel} is higher than most peers (review)`;
    }
  } else if (directionality === "higher_is_better") {
    if (percentile > 75) {
      interpretation_hint = `${metricLabel} is in the top quartile (strong)`;
    } else if (percentile > 50) {
      interpretation_hint = `${metricLabel} is better than typical`;
    } else if (percentile > 25) {
      interpretation_hint = `${metricLabel} is near typical`;
    } else {
      interpretation_hint = `${metricLabel} is lower than most peers (review)`;
    }
  } else {
    interpretation_hint = `${metricLabel} is at ${percentile.toFixed(0)}th percentile`;
  }

  return {
    value,
    peer_median: median,
    peer_p25: p25,
    peer_p75: p75,
    percentile: Math.round(percentile),
    directionality,
    interpretation_hint,
  };
}

/**
 * Compute Gini coefficient for invoice size distribution
 * 0 = perfect equality, 1 = perfect inequality
 */
function computeGini(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].filter((v) => v > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;

  const n = sorted.length;
  const sum = sorted.reduce((a, b) => a + b, 0);
  if (sum === 0) return 0;

  let numerator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (2 * (i + 1) - n - 1) * sorted[i];
  }

  return numerator / (n * sum);
}

/**
 * Compute coefficient of variation for weekly volume
 */
function computeCV(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return 0;
  const variance = values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (values.length - 1);
  return Math.sqrt(variance) / mean;
}

/**
 * Compute median from array
 */
function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

export type BenchmarkInput = {
  snapshot: SnapshotV2;
  industryTags: string[];
  // Optional aggregate data from company pack for deeper metrics
  invoiceTotals?: number[];
  weeklyInvoiceCounts?: number[];
  quoteAges?: number[]; // days since created for open quotes
  approvedToScheduledDays?: number[];
  invoicedToPaidDays?: number[];
  quoteToJobConversionRate?: number;
};

/**
 * Main benchmark computation function
 */
export function computeBenchmarks(input: BenchmarkInput): BenchmarkResult {
  const cohort = selectCohort(input.industryTags);
  const now = new Date().toISOString();

  // Extract or compute metrics from snapshot and optional pack data
  const {
    snapshot,
    invoiceTotals = [],
    weeklyInvoiceCounts = [],
    quoteAges = [],
    approvedToScheduledDays = [],
    invoicedToPaidDays = [],
    quoteToJobConversionRate,
  } = input;

  // 1. Revenue concentration (top 5 share) - use Gini as proxy if not available
  // For now, use Gini coefficient as a fragility proxy
  const giniValue = invoiceTotals.length > 0 ? computeGini(invoiceTotals) : 0.5;
  
  // Approximate top 5 concentration from Gini (rough heuristic: concentration ≈ Gini * 0.5)
  const concentrationValue = Math.min(1, giniValue * 0.6 + 0.1);

  // 2. Invoice size distribution (Gini)
  const invoiceSizeGini = giniValue;

  // 3. Quote age over 14 days share
  const quotesOver14d = quoteAges.filter((age) => age > 14).length;
  const quoteAgeOver14dShare = quoteAges.length > 0 ? quotesOver14d / quoteAges.length : 0.3;

  // 4. Approved to scheduled p50
  const approvedToScheduledP50 = approvedToScheduledDays.length > 0 
    ? median(approvedToScheduledDays) ?? 5 
    : 5;

  // 5. Invoiced to paid p50
  const invoicedToPaidP50 = invoicedToPaidDays.length > 0 
    ? median(invoicedToPaidDays) ?? 21 
    : 21;

  // 6. Weekly volume volatility
  const volumeCV = weeklyInvoiceCounts.length > 0 ? computeCV(weeklyInvoiceCounts) : 0.35;

  // Build metrics
  const metrics: CohortMetrics = {
    revenue_concentration_top5_share: createMetric(
      concentrationValue,
      cohort.reference.revenue_concentration_top5_share,
      "lower_is_better",
      "Revenue concentration"
    ),
    invoice_size_distribution_gini: createMetric(
      invoiceSizeGini,
      cohort.reference.invoice_size_distribution_gini,
      "lower_is_better",
      "Invoice size variance"
    ),
    quote_age_over_14d_share: createMetric(
      quoteAgeOver14dShare,
      cohort.reference.quote_age_over_14d_share,
      "lower_is_better",
      "Quote follow-up lag"
    ),
    approved_to_scheduled_p50_days: createMetric(
      approvedToScheduledP50,
      cohort.reference.approved_to_scheduled_p50_days,
      "lower_is_better",
      "Approved → scheduled time"
    ),
    invoiced_to_paid_p50_days: createMetric(
      invoicedToPaidP50,
      cohort.reference.invoiced_to_paid_p50_days,
      "lower_is_better",
      "Cash collection time"
    ),
    weekly_volume_volatility_index: createMetric(
      volumeCV,
      cohort.reference.weekly_volume_volatility_index,
      "lower_is_better",
      "Volume rhythm consistency"
    ),
  };

  // Optional: quote to job conversion
  if (quoteToJobConversionRate !== undefined && cohort.reference.quote_to_job_conversion_rate) {
    metrics.quote_to_job_conversion_rate = createMetric(
      quoteToJobConversionRate,
      cohort.reference.quote_to_job_conversion_rate,
      "higher_is_better",
      "Quote → job conversion"
    );
  }

  return {
    cohort_id: cohort.id,
    cohort_label: cohort.label,
    benchmark_version: BENCHMARK_VERSION,
    computed_at: now,
    metrics,
  };
}
