/**
 * Cohort Engine Types
 * 
 * The Cohort/Shape Engine classifies business signals into clusters.
 * Output: cohort_id + expected_ranges for benchmarkable metrics.
 * 
 * AUGMENTATIVE ONLY: Adds context, never overwrites computed metrics.
 */

/**
 * Cohort Engine Model Metadata
 */
export interface CohortEngineMeta {
  model_version: string;
  trained_at: string;
  n_clusters: number;
  features_used: string[];
  schema_hash: string;
  training_rows: number;
  silhouette_score: number;
  stability_ari?: number; // Adjusted Rand Index for stability check
  outlier_rate?: number;
  min_cluster_size?: number;
  promoted: boolean;
}

/**
 * Cohort Inference Result
 * 
 * Contains cluster assignment + expected ranges for key metrics.
 */
export interface CohortInference {
  cohort_id: number;
  cohort_label: string;
  confidence: number;
  distance_to_centroid: number;
  expected_ranges: {
    metric_key: string;
    min: number;
    max: number;
    median: number;
    p25: number;
    p75: number;
  }[];
}

/**
 * Cohort Engine Config
 */
export interface CohortEngineConfig {
  enabled: boolean;
  modelVersion: string;
  modelPath: string;
  pythonScript: string;
  requirePythonWiring: boolean;
}

/**
 * Get Cohort Engine Config from Environment
 */
export function getCohortEngineConfig(): CohortEngineConfig {
  const enabled = process.env.COHORT_ENGINE_ENABLED === "true";
  const modelVersion = process.env.COHORT_ENGINE_MODEL_VERSION ?? "latest";
  const requirePythonWiring = process.env.REQUIRE_PYTHON_WIRING === "1";
  
  return {
    enabled,
    modelVersion,
    modelPath: `models/cohort_engine/${modelVersion}`,
    pythonScript: "packages/cohort_engine/infer_cohort.py",
    requirePythonWiring,
  };
}

/**
 * Benchmarkable Metrics (subset for expected_ranges)
 * 
 * These are the metrics we provide expected ranges for.
 * Must be numeric, stable, and interpretable.
 */
export const BENCHMARKABLE_METRICS = [
  "avg_job_value",
  "total_revenue",
  "total_jobs",
  "avg_days_to_invoice",
  "avg_payment_lag_days",
  "pct_jobs_paid_on_time",
  "pct_quoted_won",
  "avg_quote_to_win_days",
  "avg_job_duration_days",
  "pct_jobs_with_followup",
  "avg_items_per_job",
  "revenue_concentration_top3",
] as const;

export type BenchmarkableMetric = typeof BENCHMARKABLE_METRICS[number];
