export type IndustryKey = "hvac" | "plumbing" | "electrical" | "landscaping" | "cleaning" | "unknown";
export type LearningSource = "mock" | "real";
export type WindowRule = "last_90_days" | "cap_100_closed" | "last_12_months" | "custom";
export type BoundaryClass = "confirm_mappings" | "stable" | "follow_up" | "capacity" | "pricing" | "unknown";

export type SignalsV1Record = Record<string, number | string | null>;

export interface TrainingExampleV1 {
  id: string;
  created_at: string;
  run_id: string;
  source: LearningSource;
  industry_key: IndustryKey;
  feature_schema: "signals_v1";
  pipeline_version: string;
  generator_version?: string;
  features: SignalsV1Record;
  targets: {
    pressure_keys: string[];
    boundary_class: BoundaryClass;
    benchmark?: Array<{
      key: string;
      percentile: number;
      value: number;
      peer_median: number;
    }>;
  };
  labels?: {
    reviewer_score?: 0 | 1 | 2 | 3;
    reviewer_notes?: string;
    client_feedback?: "up" | "down";
    client_feedback_reason?: string;
    mapping_was_wrong?: boolean;
    outcome_next_step_chosen?: boolean;
  };
}

export interface DatasetFilters {
  source?: LearningSource;
  industry_key?: IndustryKey;
  since?: string;
  has_labels?: boolean;
  run_id?: string;
}

export interface TrainingJobStatus {
  job_id: string;
  status: "queued" | "running" | "done" | "error";
  started_at?: string;
  completed_at?: string;
  model_name: string;
  model_version?: string;
  model_versions?: Record<string, string | undefined>;
  examples_count?: number;
  metrics?: Record<string, number>;
  report_path?: string;
  error?: string;
}
