import type { SnapshotV2 } from "@/lib/decision/v2/conclusion_schema_v2";

export type LayerCoverageFlags = {
  intent: boolean; // quotes
  billing: boolean; // invoices
  capacity: boolean; // calendar/jobs
  cash: boolean; // paid_at or payments
  cost: boolean; // input costs / receipts
  crm: boolean; // customers
};

export type LayerFusionPressurePattern = {
  id:
    | "capacity_pressure"
    | "followup_drift"
    | "billing_gap"
    | "collections_drag"
    | "concentration_risk"
    | "data_fix";
  severity: "low" | "medium" | "high";
  statement: string;
  evidence: string[]; // aggregate-only, no IDs
  metric_ref?: string; // e.g., "approved_to_scheduled_p50_days"
  percentile?: number; // benchmark percentile if available
  recommended_move?: string; // short action hint
  boundary?: string; // when NOT to act
};

export type LayerFusionTiming = {
  quote_created_to_approved_p50_days?: number;
  approved_to_scheduled_p50_days?: number;
  scheduled_to_invoiced_p50_days?: number;
  invoiced_to_paid_p50_days?: number;
};

export type LayerFusionLinkage = {
  linkage_weak: boolean;
  quote_to_invoice_match_rate?: number;
  quote_to_job_match_rate?: number;
  job_to_invoice_match_rate?: number;
};

export type LayerFusionResult = {
  computed_at: string;
  lookback_days: number;
  coverage: LayerCoverageFlags;
  linkage: LayerFusionLinkage;
  timing: LayerFusionTiming;
  pressure_patterns: LayerFusionPressurePattern[];
  recommended_focus:
    | "follow_up"
    | "scheduling"
    | "invoicing"
    | "collections"
    | "pricing"
    | "data_fix";
  warnings: string[];
  summary: {
    quotes_recognized: number;
    invoices_recognized: number;
    calendar_recognized: number;
  };
};

export type BuildLayerFusionArgs = {
  companyPack: unknown; // DataPackV0 or CompanyPack; fused output is aggregate-only
  snapshot_v2: SnapshotV2;
  lookbackDays?: number;
  diagnose_mode?: boolean;
};

