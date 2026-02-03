/**
 * Core types for mock dataset generation
 */

export type IndustryKey = "hvac" | "plumbing" | "electrical" | "landscaping" | "cleaning";

export type Season = "summer" | "winter" | "shoulder";

export interface MaterialSpec {
  name: string;
  unitCost: number;
  sellPrice: number;
  qtyRange?: [number, number];
}

export interface JobTypeSpec {
  name: string;
  baseWeightBySeason: Record<Season, number>;
  typicalDurationHours: [number, number];
  ticketRange: {
    p25: number;
    p50: number;
    p75: number;
    p90: number;
  };
  materialsPool: MaterialSpec[];
}

export interface IndustryTemplate {
  key: IndustryKey;
  displayName: string;
  defaultLaborRate: number;
  techNames: string[];
  serviceAreas: string[];
  seasonalMultiplierByMonth: Record<number, number>;
  jobTypes: JobTypeSpec[];
  paymentDelayDays: { p50: number; p90: number };
  quoteCloseRate: number;
  followUpLagDays: { p50: number; p90: number };
  revisitRate: number;
}

export interface Customer {
  id: string;
  name: string;
  address: string;
  phone: string;
  email: string;
}

export interface Quote {
  id: string;
  customer_id: string;
  created_at: string;
  job_type: string;
  amount_estimate: number;
  status: "Sent" | "Approved" | "Rejected" | "Draft";
  approved_at?: string;
}

export interface Job {
  id: string;
  quote_id: string;
  status: "Scheduled" | "Completed" | "In Progress" | "Canceled";
  tech: string;
  scheduled_start: string;
  scheduled_end: string;
  completed_at?: string;
}

export interface Invoice {
  id: string;
  job_id: string;
  quote_id: string;
  issued_at: string;
  due_at: string;
  subtotal: number;
  tax: number;
  total: number;
  status: "Open" | "Paid" | "Overdue";
  paid_at?: string;
}

export interface InvoiceItem {
  invoice_id: string;
  name: string;
  qty: number;
  unit_price: number;
  line_total: number;
}

export interface CalendarEvent {
  id: string;
  tech: string;
  start: string;
  end: string;
  title: string;
  job_id?: string;
}

export interface GeneratedDataset {
  customers: Customer[];
  quotes: Quote[];
  jobs: Job[];
  invoices: Invoice[];
  invoice_items: InvoiceItem[];
  calendar_events: CalendarEvent[];
}

export interface ScenarioFlags {
  top_heavy?: boolean;
  distributed?: boolean;
  slow_pay?: boolean;
  fast_pay?: boolean;
  high_approval?: boolean;
  low_approval?: boolean;
  overbooked?: boolean;
  underbooked?: boolean;
  seasonal_peak?: boolean;
  seasonal_low?: boolean;
}

export interface GenerationOptions {
  industry: IndustryKey;
  seed: number;
  days: number;
  startDate: Date;
  endDate: Date;
  scenario?: ScenarioFlags;
}

export interface WebsiteContext {
  url: string;
  businessName: string;
  city: string;
  state: string;
  serviceKeywords: string[];
  rawText: string;
}

export interface BundleManifest {
  industry: IndustryKey;
  seed: number;
  days: number;
  startDate: string;
  endDate: string;
  scenario: ScenarioFlags;
  websiteContext?: WebsiteContext;
  generatedAt: string;
  counts: {
    customers: number;
    quotes: number;
    jobs: number;
    invoices: number;
    calendar_events: number;
  };
}

export interface PipelineResult {
  bundlePath: string;
  zipPath: string;
  manifest: BundleManifest;
  analysisResult?: any;
  error?: string;
}
