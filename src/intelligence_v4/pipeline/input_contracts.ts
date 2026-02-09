import type { StageConfidence, StageName } from "./contracts";

export const STAGE_INPUT_SCHEMA_VERSION = {
  quant_signals: "stage_input_quant_v1",
  emyth_owner_load: "stage_input_emyth_v1",
  competitive_lens: "stage_input_competitive_v1",
  blue_ocean: "stage_input_blue_ocean_v1",
  synthesis_decision: "stage_input_synthesis_v1",
} as const;

export type StageInputSchemaVersion = (typeof STAGE_INPUT_SCHEMA_VERSION)[StageName];

export type StageInputDataLimitsV1 = {
  window_start: string;
  window_end: string;
  max_records: number;
  notes: string[];
};

export type StageInputEvidenceIndexV1 = {
  refs: string[];
};

export type StageInputBase<
  TStage extends StageName,
  TSchema extends StageInputSchemaVersion,
  TContext,
> = {
  schema_version: TSchema;
  stage_name: TStage;
  client_id: string;
  run_id: string;
  industry: string;
  data_limits: StageInputDataLimitsV1;
  evidence_index: StageInputEvidenceIndexV1;
  context: TContext;
};

export type StageInputQuantContextV1 = {
  buckets: {
    concentration_bucket: string;
    volatility_bucket: string;
    seasonality_bucket: string;
    decision_latency_bucket: string;
    throughput_bucket: string;
    capacity_squeeze_bucket: string;
    lead_source_bucket?: string;
    job_type_mix_bucket?: string;
  };
  derived_counts: {
    invoice_count_bucket: string;
    estimate_count_bucket: string;
    job_count_bucket?: string;
    customer_count_bucket?: string;
  };
  notes: string[];
};

export type QuantSummarySignalV1 = {
  id: string;
  label: string;
  value_bucket: string;
  direction: "up" | "down" | "flat" | "mixed" | "unknown";
  confidence: StageConfidence;
  evidence_refs: string[];
};

export type QuantSummaryPatternV1 = {
  id: string;
  description: string;
  confidence: StageConfidence;
  evidence_refs: string[];
};

export type StageInputQuantSummaryV1 = {
  signals: QuantSummarySignalV1[];
  patterns: QuantSummaryPatternV1[];
  anomalies: QuantSummaryPatternV1[];
};

export type StageInputEmythContextV1 = {
  quant_summary: StageInputQuantSummaryV1;
  owner_context?: {
    team_size_bucket?: string;
    owner_role_bucket?: string;
    service_mix_bucket?: string;
  };
};

export type StageInputCompetitiveContextV1 = {
  quant_summary: StageInputQuantSummaryV1;
  owner_load_summary: {
    owner_bottleneck: boolean;
    pressure_sources: string[];
    structural_gaps: string[];
  };
  market_context?: {
    region_bucket?: string;
    primary_services?: string[];
    competitor_set_refs?: string[];
  };
};

export type StageInputBlueOceanContextV1 = {
  primary_constraint_candidate: string;
  capacity_bounds?: {
    hours_bucket?: string;
    crew_count_bucket?: string;
    schedule_fill_bucket?: string;
  };
  competitive_pressure_summary: string[];
};

export type StageInputSynthesisContextV1 = {
  quant_summary: StageInputQuantSummaryV1;
  owner_load_summary: {
    owner_bottleneck: boolean;
    pressure_sources: string[];
    structural_gaps: string[];
  };
  competitive_summary: {
    market_pressures: string[];
    strengths: string[];
    vulnerabilities: string[];
    collapsed_view: string;
  };
  blue_ocean_summary: {
    asymmetric_move_ids: string[];
    rejected_moves: string[];
    capacity_guardrail: string;
  };
};

export type StageInputQuantV1 = StageInputBase<
  "quant_signals",
  "stage_input_quant_v1",
  StageInputQuantContextV1
>;

export type StageInputEmythV1 = StageInputBase<
  "emyth_owner_load",
  "stage_input_emyth_v1",
  StageInputEmythContextV1
>;

export type StageInputCompetitiveV1 = StageInputBase<
  "competitive_lens",
  "stage_input_competitive_v1",
  StageInputCompetitiveContextV1
>;

export type StageInputBlueOceanV1 = StageInputBase<
  "blue_ocean",
  "stage_input_blue_ocean_v1",
  StageInputBlueOceanContextV1
>;

export type StageInputSynthesisV1 = StageInputBase<
  "synthesis_decision",
  "stage_input_synthesis_v1",
  StageInputSynthesisContextV1
>;

export type StageInputByStage = {
  quant_signals: StageInputQuantV1;
  emyth_owner_load: StageInputEmythV1;
  competitive_lens: StageInputCompetitiveV1;
  blue_ocean: StageInputBlueOceanV1;
  synthesis_decision: StageInputSynthesisV1;
};

