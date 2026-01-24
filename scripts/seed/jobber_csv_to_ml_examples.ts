import fs from "node:fs";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";
import { parse } from "csv-parse/sync";

type SanitizedRow = {
  status: string;
  sent_date: Date | null;
  approved_date: Date | null;
  issued_date: Date | null;
  paid_date: Date | null;
  total: number | null;
  days_to_paid: number | null;
};

type Band = "very_low" | "low" | "medium" | "high" | "very_high";

type Args = {
  quotes: string;
  invoices: string;
  reportDate: string;
  lookbackDays: number;
  slices: number;
};

const DEFAULTS: Args = {
  quotes: "./seed/jobber/Quotes.csv",
  invoices: "./seed/jobber/Invoices.csv",
  reportDate: "2026-01-22",
  lookbackDays: 90,
  slices: 10,
};

function parseArgs(argv: string[]): Args {
  const args = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith("--")) continue;
    if (value === undefined) continue;

    switch (key) {
      case "--quotes":
        args.quotes = value;
        break;
      case "--invoices":
        args.invoices = value;
        break;
      case "--reportDate":
        args.reportDate = value;
        break;
      case "--lookbackDays":
        args.lookbackDays = Number(value);
        break;
      case "--slices":
        args.slices = Number(value);
        break;
      default:
        break;
    }
  }
  return args;
}

function ensureFile(filePath: string) {
  if (!fs.existsSync(filePath)) {
    console.error(`Missing file: ${filePath}`);
    process.exit(1);
  }
}

function parseDate(value: string | undefined | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function parseNumber(value: string | undefined | null): number | null {
  if (!value) return null;
  const cleaned = value.replace(/[^0-9.-]/g, "");
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function normalizeStatus(value: string | undefined | null): string {
  if (!value) return "unknown";
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

function toNumber(value: string | undefined | null): number | null {
  if (!value) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function lowerKeyMap(row: Record<string, string>): Record<string, string> {
  const lowered: Record<string, string> = {};
  for (const [key, val] of Object.entries(row)) {
    lowered[key.trim().toLowerCase()] = val;
  }
  return lowered;
}

function getValue(row: Record<string, string>, keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value);
    }
  }
  return null;
}

function sanitizeRow(row: Record<string, string>): SanitizedRow {
  const lowered = lowerKeyMap(row);

  const status = normalizeStatus(
    getValue(lowered, [
      "status",
      "quote status",
      "invoice status",
      "state",
    ])
  );

  const sent_date = parseDate(
    getValue(lowered, ["sent date", "date sent", "sent_on", "sent"])
  );
  const approved_date = parseDate(
    getValue(lowered, [
      "approved date",
      "date approved",
      "approved_on",
      "approved",
    ])
  );
  const issued_date = parseDate(
    getValue(lowered, ["issued date", "date issued", "issued_on", "issued"])
  );
  const paid_date = parseDate(
    getValue(lowered, ["paid date", "date paid", "paid_on", "paid"])
  );

  const total = parseNumber(
    getValue(lowered, [
      "total",
      "total amount",
      "amount",
      "invoice total",
      "quote total",
    ])
  );

  const days_to_paid = toNumber(
    getValue(lowered, [
      "days to paid",
      "days_to_paid",
      "days to pay",
      "days to payment",
    ])
  );

  return {
    status,
    sent_date,
    approved_date,
    issued_date,
    paid_date,
    total,
    days_to_paid,
  };
}

function readCsvRows(filePath: string): SanitizedRow[] {
  const raw = fs.readFileSync(filePath, "utf8");
  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as Record<string, string>[];

  return rows.map((row) => sanitizeRow(row));
}

function dayDiff(a: Date, b: Date): number {
  const ms = a.getTime() - b.getTime();
  return ms / (1000 * 60 * 60 * 24);
}

function quantile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function bandFromRate(rate: number): Band {
  if (rate < 0.1) return "very_low";
  if (rate < 0.3) return "low";
  if (rate < 0.6) return "medium";
  if (rate < 0.85) return "high";
  return "very_high";
}

function bandFromLag(days: number): Band {
  if (days <= 1) return "very_low";
  if (days <= 3) return "low";
  if (days <= 7) return "medium";
  if (days <= 14) return "high";
  return "very_high";
}

function bandFromVolatility(change: number): Band {
  if (change <= 0.1) return "very_low";
  if (change <= 0.25) return "low";
  if (change <= 0.5) return "medium";
  if (change <= 0.8) return "high";
  return "very_high";
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function filterBySlice<T>(
  rows: T[],
  sliceStart: Date,
  sliceEnd: Date,
  getDate: (row: T) => Date | null
): T[] {
  return rows.filter((row) => {
    const date = getDate(row);
    if (!date) return false;
    return date >= sliceStart && date < sliceEnd;
  });
}

function distributionFromTotals(values: number[]) {
  if (values.length === 0) {
    return { small: 0, medium: 0, large: 0 };
  }

  const q1 = quantile(values, 0.33);
  const q2 = quantile(values, 0.66);
  const counts = { small: 0, medium: 0, large: 0 };

  for (const value of values) {
    if (value <= q1) counts.small += 1;
    else if (value <= q2) counts.medium += 1;
    else counts.large += 1;
  }

  return counts;
}

function distributionFromBands(bands: Band[]) {
  return bands.reduce(
    (acc, band) => {
      acc[band] += 1;
      return acc;
    },
    {
      very_low: 0,
      low: 0,
      medium: 0,
      high: 0,
      very_high: 0,
    }
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  ensureFile(args.quotes);
  ensureFile(args.invoices);

  if (!process.env.SUPABASE_URL) {
    console.error("Missing SUPABASE_URL environment variable.");
    process.exit(1);
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing SUPABASE_SERVICE_ROLE_KEY environment variable.");
    process.exit(1);
  }

  const reportDate = parseDate(args.reportDate);
  if (!reportDate) {
    console.error("Invalid reportDate. Use YYYY-MM-DD.");
    process.exit(1);
  }

  if (!Number.isFinite(args.lookbackDays) || args.lookbackDays <= 0) {
    console.error("Invalid lookbackDays.");
    process.exit(1);
  }

  if (!Number.isFinite(args.slices) || args.slices <= 0) {
    console.error("Invalid slices.");
    process.exit(1);
  }

  const quotes = readCsvRows(args.quotes);
  const invoices = readCsvRows(args.invoices);

  const lookbackStart = new Date(reportDate);
  lookbackStart.setDate(lookbackStart.getDate() - args.lookbackDays);

  const sliceMs =
    (reportDate.getTime() - lookbackStart.getTime()) / args.slices;

  const snapshots = [] as Array<{
    purpose: "train";
    schema_version: "snapshot_v1";
    input_snapshot: Record<string, unknown>;
    target_output: Record<string, unknown>;
    tags: string[];
    vertical: null;
    quality: "draft";
    created_by: null;
  }>;

  let previousCombinedCount = 0;

  for (let sliceIndex = 0; sliceIndex < args.slices; sliceIndex += 1) {
    const sliceStart = new Date(lookbackStart.getTime() + sliceMs * sliceIndex);
    const sliceEnd =
      sliceIndex === args.slices - 1
        ? new Date(reportDate)
        : new Date(lookbackStart.getTime() + sliceMs * (sliceIndex + 1));

    const sliceQuotes = filterBySlice(
      quotes,
      sliceStart,
      sliceEnd,
      (row) => row.sent_date ?? row.approved_date
    );
    const sliceInvoices = filterBySlice(
      invoices,
      sliceStart,
      sliceEnd,
      (row) => row.issued_date ?? row.paid_date
    );

    const quotesCount = sliceQuotes.length;
    const quotesApprovedCount = sliceQuotes.filter(
      (row) => row.approved_date !== null
    ).length;
    const approvalRate =
      quotesCount === 0 ? 0 : quotesApprovedCount / quotesCount;

    const decisionLags = sliceQuotes
      .filter((row) => row.approved_date && row.sent_date)
      .map((row) => dayDiff(row.approved_date!, row.sent_date!))
      .filter((value) => Number.isFinite(value) && value >= 0);
    const averageDecisionLag =
      decisionLags.length === 0
        ? 0
        : decisionLags.reduce((sum, value) => sum + value, 0) /
          decisionLags.length;

    const quoteTotals = sliceQuotes
      .map((row) => row.total)
      .filter((value): value is number => value !== null);
    const quoteTotalBands = distributionFromTotals(quoteTotals);

    const invoicesCount = sliceInvoices.length;
    const invoicesPaidCount = sliceInvoices.filter(
      (row) => row.paid_date !== null
    ).length;

    const invoiceTotals = sliceInvoices
      .map((row) => row.total)
      .filter((value): value is number => value !== null);
    const invoiceTotalBands = distributionFromTotals(invoiceTotals);

    const paymentLags = sliceInvoices
      .map((row) => {
        if (row.days_to_paid !== null) return row.days_to_paid;
        if (row.paid_date && row.issued_date) {
          return dayDiff(row.paid_date, row.issued_date);
        }
        return null;
      })
      .filter((value): value is number => value !== null && value >= 0);

    const paymentLagBands = distributionFromBands(
      paymentLags.map((lag) => bandFromLag(lag))
    );

    const combinedCount = quotesCount + invoicesCount;
    const volatilityChange =
      sliceIndex === 0
        ? 0
        : Math.abs(combinedCount - previousCombinedCount) /
          Math.max(previousCombinedCount, 1);
    const volatilityBand =
      sliceIndex === 0 ? "medium" : bandFromVolatility(volatilityChange);
    previousCombinedCount = combinedCount;

    const sampleConfidence =
      combinedCount >= 60 ? "high" : combinedCount >= 25 ? "medium" : "low";

    const input_snapshot = {
      snapshot_version: "snapshot_v1",
      window: {
        report_date: dateOnly(reportDate),
        lookback_days: args.lookbackDays,
        slice_index: sliceIndex,
        slice_start: dateOnly(sliceStart),
        slice_end: dateOnly(sliceEnd),
        sample_confidence: sampleConfidence,
      },
      signals: {
        quotes: {
          quotes_count: quotesCount,
          quotes_approved_count: quotesApprovedCount,
          approval_rate_band: bandFromRate(approvalRate),
          decision_lag_band: bandFromLag(averageDecisionLag),
          quote_total_bands: quoteTotalBands,
        },
        invoices: {
          invoices_count: invoicesCount,
          invoices_paid_count: invoicesPaidCount,
          payment_lag_band_distribution: paymentLagBands,
          invoice_total_bands: invoiceTotalBands,
        },
        volatility_band: volatilityBand,
      },
      pii_scrubbed: true,
    };

    const target_output = {
      conclusion_version: "conclusion_v1",
      pattern_id: null,
      decision: null,
      boundary: null,
      notes: null,
    };

    snapshots.push({
      purpose: "train",
      schema_version: "snapshot_v1",
      input_snapshot,
      target_output,
      tags: ["jobber", "seed", "csv", "snapshot_v1"],
      vertical: null,
      quality: "draft",
      created_by: null,
    });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );

  const { error } = await supabase.schema("ml").from("examples").insert(snapshots);
  if (error) {
    console.error(`Insert failed: ${error.message}`);
    process.exit(1);
  }

  console.log(`inserted ${snapshots.length} snapshots`);
}

main().catch((error) => {
  console.error("Unexpected failure.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
