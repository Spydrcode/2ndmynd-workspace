import { z } from "zod";

export const QuoteStatusSchema = z.enum([
  "sent",
  "approved",
  "rejected",
  "draft",
  "unknown",
]);
export type QuoteStatus = z.infer<typeof QuoteStatusSchema>;

export const InvoiceStatusSchema = z.enum([
  "sent",
  "paid",
  "overdue",
  "void",
  "unknown",
]);
export type InvoiceStatus = z.infer<typeof InvoiceStatusSchema>;

export const MoneyBucketSchema = z.enum(["micro", "small", "medium", "large", "jumbo"]);
export type MoneyBucket = z.infer<typeof MoneyBucketSchema>;
export const MONEY_BUCKETS = MoneyBucketSchema.options;

export const DecisionLagBucketSchema = z.enum([
  "same_day",
  "1_3_days",
  "4_7_days",
  "8_14_days",
  "15_30_days",
  "over_30_days",
  "unknown",
]);
export type DecisionLagBucket = z.infer<typeof DecisionLagBucketSchema>;
export const DECISION_LAG_BUCKETS = DecisionLagBucketSchema.options;

export const CashLagBucketSchema = z.enum([
  "same_day",
  "1_7_days",
  "8_21_days",
  "22_45_days",
  "over_45_days",
  "unknown",
]);
export type CashLagBucket = z.infer<typeof CashLagBucketSchema>;
export const CASH_LAG_BUCKETS = CashLagBucketSchema.options;

const IsoDateTimeSchema = z.string().datetime();
const ProportionSchema = z.number().finite().min(0).max(1);

export const QuoteRecordSchema = z.object({
  quote_id: z.string().min(1),
  created_at: IsoDateTimeSchema,
  quoted_amount: z.number().finite(),
  status: QuoteStatusSchema,
  approved_at: IsoDateTimeSchema.nullish(),
});
export type QuoteRecord = z.infer<typeof QuoteRecordSchema>;

export const InvoiceRecordSchema = z.object({
  invoice_id: z.string().min(1),
  created_at: IsoDateTimeSchema,
  invoice_amount: z.number().finite(),
  status: InvoiceStatusSchema,
  paid_at: IsoDateTimeSchema.nullish(),
  related_quote_id: z.string().nullish(),
});
export type InvoiceRecord = z.infer<typeof InvoiceRecordSchema>;

export const JobValueDistributionSchema = z.object({
  micro: ProportionSchema,
  small: ProportionSchema,
  medium: ProportionSchema,
  large: ProportionSchema,
  jumbo: ProportionSchema,
});

export const DecisionLagDistributionSchema = z.object({
  same_day: ProportionSchema,
  "1_3_days": ProportionSchema,
  "4_7_days": ProportionSchema,
  "8_14_days": ProportionSchema,
  "15_30_days": ProportionSchema,
  over_30_days: ProportionSchema,
  unknown: ProportionSchema,
});

export const CompanyProfileSchema = z.object({
  run_id: z.string().min(1),
  computed_at: IsoDateTimeSchema,
  sample_size: z.object({
    quotes: z.number().int().min(0),
    invoices: z.number().int().min(0),
  }),
  job_value_distribution: JobValueDistributionSchema,
  decision_lag_distribution: DecisionLagDistributionSchema,
  revenue_concentration: z.object({
    top_10_percent_jobs_share: ProportionSchema,
    top_25_percent_jobs_share: ProportionSchema,
  }),
  quote_to_invoice_flow: z.object({
    approved: ProportionSchema,
    stalled: ProportionSchema,
    dropped: ProportionSchema,
  }),
  notes: z.array(z.string()).optional(),
});
export type CompanyProfile = z.infer<typeof CompanyProfileSchema>;

export const BaselineProfileSchema = z.object({
  cohort_id: z.string().min(1),
  version: z.string().min(1),
  sample_size: z.number().int().min(0),
  created_at: IsoDateTimeSchema,
  job_value_distribution: JobValueDistributionSchema,
  decision_lag_distribution: DecisionLagDistributionSchema,
  revenue_concentration: z.object({
    top_10_percent_jobs_share: ProportionSchema,
    top_25_percent_jobs_share: ProportionSchema,
  }),
  quote_to_invoice_flow: z.object({
    approved: ProportionSchema,
    stalled: ProportionSchema,
    dropped: ProportionSchema,
  }),
});
export type BaselineProfile = z.infer<typeof BaselineProfileSchema>;

export const DeviationSummarySchema = z.object({
  cohort_id: z.string().min(1),
  run_id: z.string().min(1),
  computed_at: IsoDateTimeSchema,
  significant_overindex: z.array(z.string()),
  significant_underindex: z.array(z.string()),
  concentration_risk: z.enum(["low", "medium", "high"]),
  deviation_notes: z.array(z.string()),
  recommended_decision: z.string().min(1),
});
export type DeviationSummary = z.infer<typeof DeviationSummarySchema>;

export const ArtifactSchema = z.object({
  title: z.string().min(1),
  created_at: IsoDateTimeSchema,
  cohort_id: z.string().min(1),
  sections: z.array(
    z.object({
      heading: z.string().min(1),
      body: z.string().min(1),
    })
  ),
  charts: z.array(
    z.object({
      id: z.enum(["jobValue", "decisionLag", "concentration"]),
      title: z.string().min(1),
    })
  ),
});
export type Artifact = z.infer<typeof ArtifactSchema>;

const RangeSchema = z.object({
  min: ProportionSchema,
  max: ProportionSchema,
});

const MaxOnlySchema = z.object({
  max: ProportionSchema,
});

export const HealthyEnvelopeSchema = z.object({
  envelope_id: z.string().min(1),
  version: z.string().min(1),
  created_at: IsoDateTimeSchema,
  job_value_ranges: z.object({
    micro: RangeSchema,
    small: RangeSchema,
    medium: RangeSchema,
    large: RangeSchema,
    jumbo: RangeSchema,
  }),
  decision_lag_ranges: z.object({
    same_day: RangeSchema,
    "1_3_days": RangeSchema,
    "4_7_days": RangeSchema,
    "8_14_days": RangeSchema,
    "15_30_days": RangeSchema,
    over_30_days: RangeSchema,
    unknown: RangeSchema,
  }),
  revenue_concentration_ranges: z.object({
    top_10_percent_jobs_share: MaxOnlySchema,
    top_25_percent_jobs_share: MaxOnlySchema,
  }),
});
export type HealthyEnvelope = z.infer<typeof HealthyEnvelopeSchema>;

export const HealthBandSchema = z.enum(["within_range", "borderline", "outside_range"]);
export type HealthBand = z.infer<typeof HealthBandSchema>;

export const HealthComparisonSchema = z.object({
  envelope_id: z.string().min(1),
  run_id: z.string().min(1),
  computed_at: IsoDateTimeSchema,
  results: z.object({
    job_mix: HealthBandSchema,
    decision_lag: HealthBandSchema,
    concentration: HealthBandSchema,
  }),
  outside_keys: z.array(z.string()),
  health_notes: z.array(z.string()),
});
export type HealthComparison = z.infer<typeof HealthComparisonSchema>;
