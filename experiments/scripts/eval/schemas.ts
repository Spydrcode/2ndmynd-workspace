export type Bucket = "low" | "med" | "high" | "unknown";
export type SpeedBucket = "fast" | "med" | "slow" | "unknown";
export type LoadBucket = "light" | "balanced" | "overloaded" | "unknown";

export type QuoteRecord = {
  id?: string;
  total?: number | string;
  status?: string;
  created_at?: string;
  closed_at?: string;
  discount_amount?: number | string;
  discount_percent?: number | string;
  [k: string]: any;
};

export type InvoiceRecord = {
  id?: string;
  total?: number | string;
  status?: string;
  created_at?: string;
  due_at?: string;
  paid_at?: string;
  balance_due?: number | string;
  [k: string]: any;
};

export type QuotesSnapshot = {
  source: "jobber";
  type: "quotes";
  window: { days: number; records: number };
  signals: {
    avg_quote_bucket: Bucket;
    quote_size_variance_bucket: "stable" | "variable" | "unknown";
    close_rate_bucket: Bucket;
    quote_to_close_latency_bucket: SpeedBucket;
    discounting_pattern: "none" | "rare" | "frequent_small_discounts" | "deep_discounts" | "unknown";
  };
  evidence: string[];
  constraints: { tone: string; avoid: string[] };
};

export type InvoicesSnapshot = {
  source: "jobber";
  type: "invoices";
  window: { days: number; records: number };
  signals: {
    avg_invoice_bucket: Bucket;
    invoice_aging_bucket: Bucket | "unknown";
    paid_ratio_bucket: Bucket;
    time_to_invoice_bucket: SpeedBucket | "unknown";
  };
  evidence: string[];
  constraints: { tone: string; avoid: string[] };
};

export type CombinedSnapshot = {
  source: "jobber";
  type: "combined";
  window: { days: number; quotes: number; invoices: number };
  signals: {
    avg_quote_vs_avg_invoice: "quote_higher" | "invoice_higher" | "similar" | "unknown";
    throughput_mismatch: "selling_gt_billing" | "billing_gt_selling" | "balanced" | "unknown";
    pricing_drift_risk: "low" | "med" | "high" | "unknown";
    capacity_pressure_signal: "low" | "med" | "high" | "unknown";
  };
  evidence: string[];
  constraints: { tone: string; avoid: string[] };
};

export type ModelOutput = {
  summary: string;
  top_patterns: Array<{ pattern: string; why_it_matters: string }>;
  next_steps: Array<{ step: string; reason: string; effort: "low" | "med" | "high" }>;
  questions_to_confirm: string[];
  confidence: "low" | "med" | "high";
};
