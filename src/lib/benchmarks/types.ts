/**
 * Benchmark types for comparing business performance against cohort peers
 */

export type BenchmarkMetric = {
  value: number;
  peer_median: number;
  peer_p25: number;
  peer_p75: number;
  percentile: number; // 0-100
  directionality: "higher_is_better" | "lower_is_better" | "neutral";
  interpretation_hint: string;
};

export type CohortMetrics = {
  // Fragility
  revenue_concentration_top5_share: BenchmarkMetric;
  invoice_size_distribution_gini: BenchmarkMetric;

  // Follow-up drift
  quote_age_over_14d_share: BenchmarkMetric;

  // Conversion friction (optional if mapping exists)
  quote_to_job_conversion_rate?: BenchmarkMetric;

  // Capacity/ops handoff
  approved_to_scheduled_p50_days: BenchmarkMetric;

  // Cash cycle
  invoiced_to_paid_p50_days: BenchmarkMetric;

  // Rhythm
  weekly_volume_volatility_index: BenchmarkMetric;
};

export type BenchmarkResult = {
  cohort_id: string;
  cohort_label: string;
  benchmark_version: string;
  computed_at: string;
  metrics: CohortMetrics;
};

export type CohortDefinition = {
  id: string;
  label: string;
  description: string;
  // Reference distributions (p25, median, p75) for each metric
  reference: {
    revenue_concentration_top5_share: [number, number, number]; // [p25, median, p75]
    invoice_size_distribution_gini: [number, number, number];
    quote_age_over_14d_share: [number, number, number];
    quote_to_job_conversion_rate?: [number, number, number];
    approved_to_scheduled_p50_days: [number, number, number];
    invoiced_to_paid_p50_days: [number, number, number];
    weekly_volume_volatility_index: [number, number, number];
  };
};
