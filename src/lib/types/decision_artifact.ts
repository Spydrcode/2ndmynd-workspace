/**
 * Decision Artifact V1 - Client-facing, finite decision output
 * 
 * This is the primary output format for business snapshots.
 * Doctrine: Not a dashboard/KPI product. Deliver a finite decision artifact.
 */

export type ConfidenceLevel = "high" | "medium" | "low";

export type BenchmarkMetricV1 = {
  key: string; // e.g. "revenue_concentration_top5_share"
  label: string; // human readable
  unit: "%" | "days" | "$" | "count" | "ratio";
  value: number;
  peer_median: number;
  percentile: number; // 0-100
  direction: "higher_is_risk" | "lower_is_risk" | "neutral";
};

export type BenchmarkPackV1 = {
  cohort_id: string; // e.g. "trades_hvac_service"
  cohort_label: string; // e.g. "HVAC & trades (service)"
  version: string; // e.g. "v0"
  metrics: BenchmarkMetricV1[];
};

export type PressureSignalV1 = {
  key: "fragility" | "follow_up_drift" | "conversion_friction" | "capacity_squeeze" | "rhythm_volatility" | string;
  label: string;
  sentence: string; // 1 line max
  benchmark_ref?: string; // key from BenchmarkMetricV1
  percentile?: number; // if available
  recommended_move: string; // 1 line
  boundary: string; // 1 line
};

export type SnapshotWindowV1 = {
  start_date: string; // ISO date
  end_date: string; // ISO date
  rule: "last_90_days" | "last_12_months" | "cap_100_closed" | "custom";
  excluded_counts: {
    quotes_outside_window: number;
    invoices_outside_window: number;
    calendar_outside_window: number;
  };
};

export type EvidenceSummaryV1 = {
  quotes_count: number;
  invoices_count: number;
  calendar_count: number;
  paid_invoices_count: number;
  window_start: string;
  window_end: string;
};

export type WebsiteOpportunityV1 = {
  title: string;
  why: string;
  suggested_tool?: string;
};

export type VisualsSummaryV1 = {
  weekly_volume_series?: Array<{ week_start: string; quotes: number; invoices: number }>;
  invoice_size_buckets?: Array<{ bucket: string; count: number }>;
  quote_age_buckets?: Array<{ bucket: string; count: number }>;
};

export type LearningNoteV1 = {
  applied: boolean;
  changes: string[];
  model_versions?: {
    pressure_selector?: string;
    boundary_classifier?: string;
    calibrator?: string;
  };
};

export type DecisionArtifactV1 = {
  version: "v1";
  takeaway: string;
  why_heavy: string;
  next_7_days: string[];
  boundary: string;
  window: SnapshotWindowV1;
  confidence: { level: ConfidenceLevel; reason: string };
  pressure_map: PressureSignalV1[];
  benchmarks?: BenchmarkPackV1;
  evidence_summary?: EvidenceSummaryV1;
  website_opportunities?: WebsiteOpportunityV1[];
  visuals_summary?: VisualsSummaryV1;
  learning_note?: LearningNoteV1;
};
