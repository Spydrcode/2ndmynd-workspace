import { buildSnapshotV2 } from "@/lib/decision/v2/snapshot/build_snapshot_v2";
import { SnapshotV2 } from "@/lib/decision/v2/conclusion_schema_v2";
import { DataPackStats, DataPackV0 } from "./data_pack_v0";
import { parseFlexibleTimestamp } from "./dates";
import {
  CompanyPack,
  getLayerCoverage,
  type LayerCoverage,
} from "./company_pack";

export type InputRecognitionReport = {
  quotes_detected_count: number;
  invoices_detected_count: number;
  invoices_paid_detected_count: number;
  calendar_detected_count: number;
  reasons_dropped: string[];
  files_attempted: Array<{
    filename: string;
    type_guess: string;
    status: "success" | "error";
    error?: string;
  }>;
  by_type: Record<
    string,
    {
      files_seen: number;
      rows_total: number;
      rows_parsed: number;
      rows_in_window: number | null;
      rows_outside_window: number | null;
      date_parse_success_count: number | null;
      date_parse_fail_count: number | null;
      drop_reasons_top3: string[];
    }
  >;
  layer_coverage: LayerCoverage;
  readiness: "blocked" | "partial" | "ready";
};

function toISODate(value?: string) {
  if (!value) return null;
  const d = parseFlexibleTimestamp(value);
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

function pickTopReasons(counts: Map<string, number>, limit: number) {
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key]) => key);
}

function inferReportDateFromDataPack(pack: DataPackV0): string | undefined {
  let max: Date | null = null;
  const consider = (value?: string) => {
    if (!value) return;
    const d = parseFlexibleTimestamp(value);
    if (!d) return;
    if (!max || d.getTime() > max.getTime()) max = d;
  };

  for (const q of pack.quotes ?? []) {
    consider(q.created_at);
    consider(q.approved_at);
  }
  for (const inv of pack.invoices ?? []) {
    consider(inv.issued_at);
    consider(inv.paid_at);
  }
  for (const j of pack.jobs ?? []) {
    consider(j.scheduled_at);
    consider(j.completed_at);
  }
  for (const c of pack.customers ?? []) {
    consider(c.created_at);
  }

  return max ? max.toISOString() : undefined;
}

function inferReportDateFromCompanyPack(companyPack: CompanyPack): string | undefined {
  let max: Date | null = null;
  const consider = (value?: string) => {
    if (!value) return;
    const d = parseFlexibleTimestamp(value);
    if (!d) return;
    if (!max || d.getTime() > max.getTime()) max = d;
  };

  for (const q of companyPack.layers.intent_quotes ?? []) {
    consider(q.created_at);
    consider(q.approved_at);
  }
  for (const inv of companyPack.layers.billing_invoices ?? []) {
    consider(inv.issued_at);
    consider(inv.paid_at);
  }
  for (const j of companyPack.layers.schedule_events ?? []) {
    consider(j.scheduled_at);
    consider(j.completed_at);
  }
  for (const c of companyPack.layers.crm_customers ?? []) {
    consider(c.created_at);
  }

  return max ? max.toISOString() : undefined;
}

export function buildSnapshotFromPack(
  pack: DataPackV0,
  options?: { report_date?: string; lookback_days?: number; pack_stats?: DataPackStats | null }
): { snapshot: SnapshotV2; input_recognition: InputRecognitionReport } {
  const lookback_days = options?.lookback_days ?? 365;
  const inferred_report_date = inferReportDateFromDataPack(pack);
  const quotes = (pack.quotes ?? []).map((q) => ({
    created_at: q.created_at,
    approved_at: q.approved_at,
    status: q.status,
    total: q.total,
  }));

  const invoices = (pack.invoices ?? []).map((inv) => ({
    issued_at: inv.issued_at,
    paid_at: inv.paid_at,
    status: inv.status,
    total: inv.total,
  }));

  const snapshot = buildSnapshotV2({
    quotes,
    invoices,
    report_date: options?.report_date ?? inferred_report_date,
    lookback_days,
  });

  const droppedOverall = new Map<string, number>();
  const droppedQuotes = new Map<string, number>();
  const droppedInvoices = new Map<string, number>();
  const sliceStart = snapshot.window.slice_start;
  const sliceEnd = snapshot.window.slice_end;

  let quotesDateOk = 0;
  let quotesDateFail = 0;
  for (const q of pack.quotes ?? []) {
    const created = toISODate(q.created_at);
    if (!created) {
      quotesDateFail += 1;
      droppedQuotes.set(
        "Quote rows missing a usable created date.",
        (droppedQuotes.get("Quote rows missing a usable created date.") ?? 0) + 1
      );
      continue;
    }
    quotesDateOk += 1;
    if (created < sliceStart || created > sliceEnd) {
      droppedQuotes.set(
        "Quote rows outside the snapshot window.",
        (droppedQuotes.get("Quote rows outside the snapshot window.") ?? 0) + 1
      );
    }
  }

  let invoicesDateOk = 0;
  let invoicesDateFail = 0;
  for (const inv of pack.invoices ?? []) {
    const issued = toISODate(inv.issued_at);
    if (!issued) {
      invoicesDateFail += 1;
      droppedInvoices.set(
        "Invoice rows missing a usable issued/created date.",
        (droppedInvoices.get("Invoice rows missing a usable issued/created date.") ?? 0) + 1
      );
      continue;
    }
    invoicesDateOk += 1;
    if (issued < sliceStart || issued > sliceEnd) {
      droppedInvoices.set(
        "Invoice rows outside the snapshot window.",
        (droppedInvoices.get("Invoice rows outside the snapshot window.") ?? 0) + 1
      );
    }
  }

  for (const [k, v] of droppedQuotes.entries()) {
    droppedOverall.set(k, (droppedOverall.get(k) ?? 0) + v);
  }
  for (const [k, v] of droppedInvoices.entries()) {
    droppedOverall.set(k, (droppedOverall.get(k) ?? 0) + v);
  }
  if (quotesDateFail > 0) {
    droppedOverall.set(
      "Expected quote Created At like 2025-02-03 09:45:00 (or ISO).",
      (droppedOverall.get("Expected quote Created At like 2025-02-03 09:45:00 (or ISO).") ?? 0) + 1
    );
  }

  const stats = options?.pack_stats ?? null;
  const fileCategories = stats?.file_categories ?? {};
  const rowsByType = stats?.rows_by_type ?? {};
  const filesAttempted = (stats?.files_attempted ?? [])
    .slice()
    .sort((a, b) => a.filename.localeCompare(b.filename));

  const by_type: InputRecognitionReport["by_type"] = {};
  const typeKeys = new Set<string>([
    ...Object.keys(fileCategories),
    ...Object.keys(rowsByType),
    "quotes",
    "invoices",
    "calendar",
    "jobs",
  ]);
  typeKeys.forEach((type) => {
    const rows_total = rowsByType[type] ?? 0;
    const files_seen = fileCategories[type] ?? 0;

    const isQuotes = type === "quotes";
    const isInvoices = type === "invoices";

    const rows_in_window = isQuotes
      ? snapshot.activity_signals.quotes.quotes_count
      : isInvoices
        ? snapshot.activity_signals.invoices.invoices_count
        : null;

    const date_parse_success_count = isQuotes ? quotesDateOk : isInvoices ? invoicesDateOk : null;
    const date_parse_fail_count = isQuotes ? quotesDateFail : isInvoices ? invoicesDateFail : null;

    const rows_outside_window =
      rows_in_window !== null && date_parse_success_count !== null
        ? Math.max(0, date_parse_success_count - rows_in_window)
        : null;

    const drop_reasons_top3 = isQuotes
      ? pickTopReasons(droppedQuotes, 3)
      : isInvoices
        ? pickTopReasons(droppedInvoices, 3)
        : [];

    by_type[type] = {
      files_seen,
      rows_total,
      rows_parsed: rows_total,
      rows_in_window,
      rows_outside_window,
      date_parse_success_count,
      date_parse_fail_count,
      drop_reasons_top3,
    };
  });

  // Compute layer coverage from DataPackV0
  const layer_coverage: LayerCoverage = {
    intent: (pack.quotes?.length ?? 0) > 0,
    billing: (pack.invoices?.length ?? 0) > 0,
    capacity: (pack.jobs?.length ?? 0) > 0,
    cash: false, // DataPackV0 doesn't have payments
    cost: false, // DataPackV0 doesn't have receipts
    crm: (pack.customers?.length ?? 0) > 0,
  };

  // Compute readiness
  const invoicesFileUploaded = (fileCategories.invoices ?? 0) > 0;
  const quotesFileUploaded = (fileCategories.quotes ?? 0) > 0;
  let readiness: "blocked" | "partial" | "ready" = "blocked";

  if (!layer_coverage.intent && !layer_coverage.billing && !layer_coverage.capacity) {
    readiness = "blocked";
  } else if (invoicesFileUploaded && !layer_coverage.billing) {
    readiness = "partial";
  } else if (quotesFileUploaded && !layer_coverage.intent) {
    readiness = "partial";
  } else if (layer_coverage.intent || layer_coverage.billing) {
    readiness = "ready";
  } else {
    readiness = "partial";
  }

  return {
    snapshot,
    input_recognition: {
      quotes_detected_count: snapshot.activity_signals.quotes.quotes_count,
      invoices_detected_count: snapshot.activity_signals.invoices.invoices_count,
      invoices_paid_detected_count: snapshot.activity_signals.invoices.invoices_paid_count,
      calendar_detected_count: pack.jobs?.length ?? 0,
      reasons_dropped: pickTopReasons(droppedOverall, 6),
      files_attempted: filesAttempted,
      by_type,
      layer_coverage,
      readiness,
    },
  };
}

/**
 * Build snapshot from CompanyPack (layered structure)
 * This is the preferred method for multi-file uploads
 */
export function buildSnapshotFromCompanyPack(
  companyPack: CompanyPack,
  options?: { report_date?: string; lookback_days?: number }
): { snapshot: SnapshotV2; input_recognition: InputRecognitionReport } {
  const lookback_days = options?.lookback_days ?? 365;
  const inferred_report_date = inferReportDateFromCompanyPack(companyPack);

  // Convert CompanyPack layers to snapshot input format
  const quotes = (companyPack.layers.intent_quotes ?? []).map((q) => ({
    created_at: q.created_at,
    approved_at: q.approved_at,
    status: q.status,
    total: q.total,
  }));

  const invoices = (companyPack.layers.billing_invoices ?? []).map((inv) => ({
    issued_at: inv.issued_at,
    paid_at: inv.paid_at,
    status: inv.status,
    total: inv.total,
  }));

  const snapshot = buildSnapshotV2({
    quotes,
    invoices,
    report_date: options?.report_date ?? inferred_report_date,
    lookback_days,
  });

  // Collect drop reasons per layer
  const droppedOverall = new Map<string, number>();
  const droppedQuotes = new Map<string, number>();
  const droppedInvoices = new Map<string, number>();
  const sliceStart = snapshot.window.slice_start;
  const sliceEnd = snapshot.window.slice_end;

  let quotesDateOk = 0;
  let quotesDateFail = 0;
  for (const q of companyPack.layers.intent_quotes ?? []) {
    const created = toISODate(q.created_at);
    if (!created) {
      quotesDateFail += 1;
      droppedQuotes.set(
        "Quote rows missing a usable created date.",
        (droppedQuotes.get("Quote rows missing a usable created date.") ?? 0) + 1
      );
      continue;
    }
    quotesDateOk += 1;
    if (created < sliceStart || created > sliceEnd) {
      droppedQuotes.set(
        "Quote rows outside the snapshot window.",
        (droppedQuotes.get("Quote rows outside the snapshot window.") ?? 0) + 1
      );
    }
  }

  let invoicesDateOk = 0;
  let invoicesDateFail = 0;
  for (const inv of companyPack.layers.billing_invoices ?? []) {
    const issued = toISODate(inv.issued_at);
    if (!issued) {
      invoicesDateFail += 1;
      droppedInvoices.set(
        "Invoice rows missing a usable issued/created date.",
        (droppedInvoices.get("Invoice rows missing a usable issued/created date.") ?? 0) + 1
      );
      continue;
    }
    invoicesDateOk += 1;
    if (issued < sliceStart || issued > sliceEnd) {
      droppedInvoices.set(
        "Invoice rows outside the snapshot window.",
        (droppedInvoices.get("Invoice rows outside the snapshot window.") ?? 0) + 1
      );
    }
  }

  for (const [k, v] of droppedQuotes.entries()) {
    droppedOverall.set(k, (droppedOverall.get(k) ?? 0) + v);
  }
  for (const [k, v] of droppedInvoices.entries()) {
    droppedOverall.set(k, (droppedOverall.get(k) ?? 0) + v);
  }

  // Build by_type from CompanyPack recognition_summary
  const by_type: InputRecognitionReport["by_type"] = {};
  const cpSummary = companyPack.recognition_summary.by_type;

  by_type.quotes = {
    files_seen: cpSummary.quotes.files_seen,
    rows_total: cpSummary.quotes.rows_total,
    rows_parsed: cpSummary.quotes.rows_parsed,
    rows_in_window: snapshot.activity_signals.quotes.quotes_count,
    rows_outside_window: Math.max(0, quotesDateOk - snapshot.activity_signals.quotes.quotes_count),
    date_parse_success_count: quotesDateOk,
    date_parse_fail_count: quotesDateFail,
    drop_reasons_top3: pickTopReasons(droppedQuotes, 3),
  };

  by_type.invoices = {
    files_seen: cpSummary.invoices.files_seen,
    rows_total: cpSummary.invoices.rows_total,
    rows_parsed: cpSummary.invoices.rows_parsed,
    rows_in_window: snapshot.activity_signals.invoices.invoices_count,
    rows_outside_window: Math.max(0, invoicesDateOk - snapshot.activity_signals.invoices.invoices_count),
    date_parse_success_count: invoicesDateOk,
    date_parse_fail_count: invoicesDateFail,
    drop_reasons_top3: pickTopReasons(droppedInvoices, 3),
  };

  by_type.calendar = {
    files_seen: cpSummary.calendar.files_seen,
    rows_total: cpSummary.calendar.rows_total,
    rows_parsed: cpSummary.calendar.rows_parsed,
    rows_in_window: null,
    rows_outside_window: null,
    date_parse_success_count: cpSummary.calendar.date_parse_success,
    date_parse_fail_count: cpSummary.calendar.date_parse_fail,
    drop_reasons_top3: [],
  };

  const filesAttempted = companyPack.files_attempted.map((f) => ({
    filename: f.filename,
    type_guess: f.detected_types[0]?.type ?? "unknown",
    status: f.status === "error" ? ("error" as const) : ("success" as const),
    error: f.error,
  }));

  const layer_coverage = getLayerCoverage(companyPack);

  return {
    snapshot,
    input_recognition: {
      quotes_detected_count: snapshot.activity_signals.quotes.quotes_count,
      invoices_detected_count: snapshot.activity_signals.invoices.invoices_count,
      invoices_paid_detected_count: snapshot.activity_signals.invoices.invoices_paid_count,
      calendar_detected_count: companyPack.layers.schedule_events?.length ?? 0,
      reasons_dropped: pickTopReasons(droppedOverall, 6),
      files_attempted: filesAttempted,
      by_type,
      layer_coverage,
      readiness: companyPack.recognition_summary.readiness,
    },
  };
}
