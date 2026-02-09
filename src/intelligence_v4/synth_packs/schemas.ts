export const SYNTH_INDUSTRIES = [
  "agency",
  "saas_micro",
  "professional_services",
  "ecommerce_ops",
  "logistics_dispatch",
  "home_services_generic",
] as const;

export type SynthIndustry = (typeof SYNTH_INDUSTRIES)[number];

export type SynthPackManifest = {
  pack_id: string;
  industry: SynthIndustry;
  seed: number;
  window_start: string;
  window_end: string;
  notes: string[];
  expected_patterns?: string[];
  emyth_role?: "technician" | "manager" | "entrepreneur" | "mixed";
  business_name?: string;
};

export type EstimateCsvRow = {
  EstimateID: string;
  Status: "draft" | "sent" | "approved" | "rejected";
  CreatedAt: string;
  ApprovedAt: string;
  Total: string;
};

export type InvoiceCsvRow = {
  InvoiceID: string;
  QuoteID: string;
  Status: "open" | "paid" | "overdue";
  IssuedAt: string;
  PaidAt: string;
  Total: string;
};

export type ScheduleCsvRow = {
  JobID: string;
  QuoteID: string;
  Status: "scheduled" | "in_progress" | "completed" | "canceled";
  StartDate: string;
  StartTime: string;
  EndDate: string;
  EndTime: string;
  Total: string;
};

export type SynthPackCsv = {
  estimates: EstimateCsvRow[];
  invoices: InvoiceCsvRow[];
  schedule?: ScheduleCsvRow[];
};

export type GeneratedSynthPack = {
  manifest: SynthPackManifest;
  csv: SynthPackCsv;
};

export type GenerateSynthPackParams = {
  pack_id: string;
  industry: SynthIndustry;
  seed: number;
  window_days: number;
  anchor_date?: string;
};
