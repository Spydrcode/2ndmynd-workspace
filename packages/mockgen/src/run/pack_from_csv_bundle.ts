/**
 * Convert CSV bundle directory to DataPackV0
 * Minimal adapter to wire mock pipeline into real analysis path
 */

import * as fs from "fs";
import * as path from "path";
import { parse } from "csv-parse/sync";
import type { DataPackV0, DataPackStatus } from "../../../../src/lib/intelligence/data_pack_v0";

function parseCSVFile(filePath: string): Array<Record<string, string>> {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, "utf-8");
  try {
    return parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    }) as Array<Record<string, string>>;
  } catch (error) {
    console.warn(`[pack_from_csv] Failed to parse ${path.basename(filePath)}:`, error);
    return [];
  }
}

function normalizeStatus(raw?: string): DataPackStatus {
  if (!raw) return "other";
  const lower = raw.toLowerCase().trim();
  const statusMap: Record<string, DataPackStatus> = {
    draft: "draft",
    sent: "sent",
    approved: "approved",
    rejected: "rejected",
    open: "open",
    paid: "paid",
    void: "void",
    overdue: "overdue",
    scheduled: "scheduled",
    in_progress: "in_progress",
    completed: "completed",
    canceled: "canceled",
  };
  return statusMap[lower] ?? "other";
}

function parseNumber(value?: string): number | undefined {
  if (!value) return undefined;
  const num = parseFloat(value);
  return Number.isFinite(num) ? num : undefined;
}

/**
 * Build DataPackV0 from extracted CSV bundle directory
 * Maps quotes_export.csv, invoices_export.csv, calendar_export.csv to DataPackV0 structure
 */
export function packFromCSVBundle(bundleDir: string): DataPackV0 {
  const quotesPath = path.join(bundleDir, "quotes_export.csv");
  const invoicesPath = path.join(bundleDir, "invoices_export.csv");
  const calendarPath = path.join(bundleDir, "calendar_export.csv");
  const customersPath = path.join(bundleDir, "customers_export.csv");

  const quotesRows = parseCSVFile(quotesPath);
  const invoicesRows = parseCSVFile(invoicesPath);
  const calendarRows = parseCSVFile(calendarPath);
  const customersRows = parseCSVFile(customersPath);

  // Map quotes
  const quotes = quotesRows.map((row) => ({
    id: row.id || row.quote_id,
    status: normalizeStatus(row.status),
    created_at: row.created_at || row.date,
    approved_at: row.approved_at,
    total: parseNumber(row.total || row.amount),
  }));

  // Map invoices
  const invoices = invoicesRows.map((row) => ({
    id: row.id || row.invoice_id,
    status: normalizeStatus(row.status),
    issued_at: row.issued_at || row.date || row.created_at,
    paid_at: row.paid_at,
    total: parseNumber(row.total || row.amount),
    related_quote_id: row.related_quote_id || row.quote_id,
  }));

  // Map calendar events to jobs (calendar represents scheduled work)
  const jobs = calendarRows.map((row) => ({
    id: row.id || row.event_id,
    status: normalizeStatus(row.status),
    scheduled_at: row.scheduled_at || row.start_time || row.date,
    completed_at: row.completed_at || row.end_time,
    total: parseNumber(row.total || row.amount),
    related_quote_id: row.related_quote_id || row.quote_id,
  }));

  // Map customers if present
  const customers = customersRows.map((row) => ({
    id: row.id || row.customer_id,
    name: row.name || row.customer_name,
    status: normalizeStatus(row.status),
    created_at: row.created_at || row.date,
    city: row.city,
    state: row.state,
  }));

  const pack: DataPackV0 = {
    version: "data_pack_v0",
    source_tool: "mockgen",
    created_at: new Date().toISOString(),
    quotes: quotes.length > 0 ? quotes : undefined,
    invoices: invoices.length > 0 ? invoices : undefined,
    jobs: jobs.length > 0 ? jobs : undefined,
    customers: customers.length > 0 ? customers : undefined,
  };

  return pack;
}
