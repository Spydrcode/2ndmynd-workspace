/**
 * CompanyPack - layered evidence graph from multiple CSV uploads
 * Merges quotes, invoices, calendar, payments, receipts into a unified structure
 */

import type { DataPackStatus } from "./data_pack_v0";

// ─────────────────────────────────────────────────────────────────────────────
// Layer document types
// ─────────────────────────────────────────────────────────────────────────────

export type QuoteDoc = {
  id?: string;
  status?: DataPackStatus;
  created_at?: string;
  approved_at?: string;
  total?: number;
  source_file?: string;
};

export type InvoiceDoc = {
  id?: string;
  related_quote_id?: string;
  status?: DataPackStatus;
  issued_at?: string;
  paid_at?: string;
  total?: number;
  source_file?: string;
};

export type CalendarEvent = {
  id?: string;
  related_quote_id?: string;
  status?: DataPackStatus;
  scheduled_at?: string;
  completed_at?: string;
  title?: string;
  duration_minutes?: number;
  source_file?: string;
};

export type PaymentTxn = {
  id?: string;
  invoice_id?: string;
  amount?: number;
  payment_date?: string;
  method?: string;
  source_file?: string;
};

export type ReceiptTxn = {
  id?: string;
  vendor?: string;
  amount?: number;
  date?: string;
  category?: string;
  source_file?: string;
};

export type CustomerDoc = {
  id?: string;
  name?: string;
  status?: DataPackStatus;
  created_at?: string;
  city?: string;
  state?: string;
  source_file?: string;
};

export type UnknownTable = {
  filename: string;
  headers: string[];
  row_count: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// Layers structure
// ─────────────────────────────────────────────────────────────────────────────

export type CompanyPackLayers = {
  intent_quotes?: QuoteDoc[];
  billing_invoices?: InvoiceDoc[];
  schedule_events?: CalendarEvent[];
  cash_payments?: PaymentTxn[];
  cost_receipts?: ReceiptTxn[];
  crm_customers?: CustomerDoc[];
  unknown_tables?: UnknownTable[];
};

// ─────────────────────────────────────────────────────────────────────────────
// File tracking
// ─────────────────────────────────────────────────────────────────────────────

export type FileAttempt = {
  filename: string;
  size?: number;
  detected_types: Array<{ type: string; confidence: string }>;
  status: "success" | "partial" | "error";
  rows_parsed?: number;
  error?: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Recognition summary
// ─────────────────────────────────────────────────────────────────────────────

export type LayerRecognitionCounts = {
  files_seen: number;
  rows_total: number;
  rows_parsed: number;
  rows_in_window: number | null;
  rows_outside_window: number | null;
  date_parse_success: number;
  date_parse_fail: number;
};

export type RecognitionSummary = {
  by_type: {
    quotes: LayerRecognitionCounts;
    invoices: LayerRecognitionCounts;
    calendar: LayerRecognitionCounts;
    payments: LayerRecognitionCounts;
    receipts: LayerRecognitionCounts;
    crm: LayerRecognitionCounts;
    unknown: LayerRecognitionCounts;
  };
  warnings: string[];
  readiness: "blocked" | "partial" | "ready";
};

// ─────────────────────────────────────────────────────────────────────────────
// Link tracking
// ─────────────────────────────────────────────────────────────────────────────

export type CompanyPackLinks = {
  quote_to_invoice_matches: number;
  invoice_to_payment_matches: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// CompanyPack main type
// ─────────────────────────────────────────────────────────────────────────────

export type CompanyPack = {
  version: "company_pack_v1";
  source_tool: string;
  created_at: string;
  files_attempted: FileAttempt[];
  layers: CompanyPackLayers;
  links: CompanyPackLinks;
  recognition_summary: RecognitionSummary;
};

// ─────────────────────────────────────────────────────────────────────────────
// Factory functions
// ─────────────────────────────────────────────────────────────────────────────

export function createEmptyCompanyPack(sourceTool: string): CompanyPack {
  return {
    version: "company_pack_v1",
    source_tool: sourceTool,
    created_at: new Date().toISOString(),
    files_attempted: [],
    layers: {},
    links: {
      quote_to_invoice_matches: 0,
      invoice_to_payment_matches: 0,
    },
    recognition_summary: {
      by_type: {
        quotes: createEmptyLayerCounts(),
        invoices: createEmptyLayerCounts(),
        calendar: createEmptyLayerCounts(),
        payments: createEmptyLayerCounts(),
        receipts: createEmptyLayerCounts(),
        crm: createEmptyLayerCounts(),
        unknown: createEmptyLayerCounts(),
      },
      warnings: [],
      readiness: "blocked",
    },
  };
}

export function createEmptyLayerCounts(): LayerRecognitionCounts {
  return {
    files_seen: 0,
    rows_total: 0,
    rows_parsed: 0,
    rows_in_window: null,
    rows_outside_window: null,
    date_parse_success: 0,
    date_parse_fail: 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Layer coverage helpers
// ─────────────────────────────────────────────────────────────────────────────

export type LayerCoverage = {
  intent: boolean; // quotes
  billing: boolean; // invoices
  capacity: boolean; // calendar/jobs
  cash: boolean; // payments
  cost: boolean; // receipts
  crm: boolean; // customers
};

export function getLayerCoverage(pack: CompanyPack): LayerCoverage {
  return {
    intent: (pack.layers.intent_quotes?.length ?? 0) > 0,
    billing: (pack.layers.billing_invoices?.length ?? 0) > 0,
    capacity: (pack.layers.schedule_events?.length ?? 0) > 0,
    cash: (pack.layers.cash_payments?.length ?? 0) > 0,
    cost: (pack.layers.cost_receipts?.length ?? 0) > 0,
    crm: (pack.layers.crm_customers?.length ?? 0) > 0,
  };
}

export function computePackReadiness(
  pack: CompanyPack,
  filesUploadedByType: { invoices: boolean; quotes: boolean }
): "blocked" | "partial" | "ready" {
  const coverage = getLayerCoverage(pack);

  // Blocked: nothing usable at all
  if (!coverage.intent && !coverage.billing && !coverage.capacity) {
    return "blocked";
  }

  // Partial: file uploaded but layer empty (recognition failure)
  if (filesUploadedByType.invoices && !coverage.billing) {
    return "partial";
  }
  if (filesUploadedByType.quotes && !coverage.intent) {
    return "partial";
  }

  // Ready: at least intent+billing or capacity exists
  if (coverage.intent && coverage.billing) {
    return "ready";
  }
  if (coverage.intent || coverage.billing) {
    return "ready"; // Still useful with one layer
  }

  return "partial";
}

// ─────────────────────────────────────────────────────────────────────────────
// Compute link matches between layers
// ─────────────────────────────────────────────────────────────────────────────

export function computePackLinks(pack: CompanyPack): CompanyPackLinks {
  let quote_to_invoice_matches = 0;
  let invoice_to_payment_matches = 0;

  const quoteIds = new Set(
    (pack.layers.intent_quotes ?? []).map((q) => q.id).filter(Boolean) as string[]
  );
  const invoiceIds = new Set(
    (pack.layers.billing_invoices ?? []).map((inv) => inv.id).filter(Boolean) as string[]
  );

  // Count invoices that have a matching quote ID (crude heuristic)
  // In real data, you'd match by quote_id field on invoice
  // For now, just count non-empty overlaps
  for (const inv of pack.layers.billing_invoices ?? []) {
    if (inv.id && quoteIds.has(inv.id)) {
      quote_to_invoice_matches++;
    }
  }

  // Count payments that reference an invoice
  for (const pmt of pack.layers.cash_payments ?? []) {
    if (pmt.invoice_id && invoiceIds.has(pmt.invoice_id)) {
      invoice_to_payment_matches++;
    }
  }

  return { quote_to_invoice_matches, invoice_to_payment_matches };
}
