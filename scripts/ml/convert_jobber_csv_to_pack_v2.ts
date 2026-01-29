import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { parse as parseCsvSync } from "csv-parse/sync";
import { RawInvoice, RawQuote } from "./lib/snapshot/build_snapshot_v2";

type Args = {
  quotes?: string;
  invoices?: string;
  out: string;
  companyId?: string;
  source?: string;
  tags?: string[];
  reportDate?: string;
  lookbackDays?: number;
};

const DEFAULTS: Args = {
  out: "ml_artifacts/jobber_pack_v2.jsonl",
  source: "jobber_csv",
};

function parseArgs(argv: string[]): Args {
  const args: Args = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith("--")) continue;
    switch (key) {
      case "--quotes":
        if (value) args.quotes = value;
        break;
      case "--invoices":
        if (value) args.invoices = value;
        break;
      case "--out":
        if (value) args.out = value;
        break;
      case "--company_id":
        if (value) args.companyId = value;
        break;
      case "--source":
        if (value) args.source = value;
        break;
      case "--tags":
        if (value) args.tags = value.split(",").map((item) => item.trim()).filter(Boolean);
        break;
      case "--report_date":
        if (value) args.reportDate = value;
        break;
      case "--lookback_days":
        if (value) args.lookbackDays = Number(value);
        break;
      default:
        break;
    }
  }
  return args;
}

function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  let headers: string[] = [];
  const rows = parseCsvSync(text, {
    columns: (cols: string[]) => {
      headers = cols.map((h) => h.replace(/^\uFEFF/, "").trim());
      return headers;
    },
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
    trim: true,
    bom: true,
  }) as Record<string, string>[];
  return { headers, rows };
}

function norm(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function findHeader(headers: string[], includesAny: string[]) {
  const normalized = headers.map((h) => ({ raw: h, norm: norm(h) }));
  for (const needle of includesAny) {
    const target = norm(needle);
    const hit = normalized.find((item) => item.norm.includes(target));
    if (hit) return hit.raw;
  }
  return null;
}

function parseMoney(value: string | undefined) {
  const cleaned = (value ?? "").toString().replace(/[$,]/g, "").trim();
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function parseDate(value: string | undefined) {
  const cleaned = (value ?? "").toString().trim();
  if (!cleaned || cleaned === "-") return null;
  const date = new Date(cleaned);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function loadCsv(filePath: string) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Missing CSV: ${resolved}`);
  }
  const raw = fs.readFileSync(resolved, "utf8");
  return parseCsv(raw);
}

function mapQuotes(headers: string[], rows: Record<string, string>[]): RawQuote[] {
  const createdKey = findHeader(headers, ["created", "created at", "quote date", "date created"]);
  const approvedKey = findHeader(headers, ["approved", "converted", "won", "approved at"]);
  const statusKey = findHeader(headers, ["status"]);
  const totalKey = findHeader(headers, ["total", "subtotal", "amount"]);

  return rows.map((row) => {
    const created = createdKey ? parseDate(row[createdKey]) : null;
    const approved = approvedKey ? parseDate(row[approvedKey]) : null;
    const status = statusKey ? row[statusKey] : "";
    const total = totalKey ? parseMoney(row[totalKey]) : null;
    return {
      created_at: created ?? undefined,
      approved_at: approved ?? undefined,
      status: status ?? undefined,
      total: total ?? undefined,
    };
  });
}

function mapInvoices(headers: string[], rows: Record<string, string>[]): RawInvoice[] {
  const issuedKey = findHeader(headers, ["issued", "sent", "created", "invoice date", "date"]);
  const paidKey = findHeader(headers, ["paid", "payment", "paid at"]);
  const statusKey = findHeader(headers, ["status"]);
  const totalKey = findHeader(headers, ["total", "subtotal", "amount"]);

  return rows.map((row) => {
    const issued = issuedKey ? parseDate(row[issuedKey]) : null;
    const paid = paidKey ? parseDate(row[paidKey]) : null;
    const status = statusKey ? row[statusKey] : "";
    const total = totalKey ? parseMoney(row[totalKey]) : null;
    return {
      issued_at: issued ?? undefined,
      paid_at: paid ?? undefined,
      status: status ?? undefined,
      total: total ?? undefined,
    };
  });
}

function ensureDir(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function makeId() {
  return crypto.randomUUID();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.quotes && !args.invoices) {
    console.error("Provide --quotes and/or --invoices.");
    process.exit(1);
  }

  const quotes: RawQuote[] = [];
  const invoices: RawInvoice[] = [];

  if (args.quotes) {
    const { headers, rows } = loadCsv(args.quotes);
    quotes.push(...mapQuotes(headers, rows));
  }
  if (args.invoices) {
    const { headers, rows } = loadCsv(args.invoices);
    invoices.push(...mapInvoices(headers, rows));
  }

  const record = {
    id: makeId(),
    source: args.source ?? "jobber_csv",
    company_id: args.companyId,
    tags: args.tags ?? ["jobber"],
    quotes,
    invoices,
    report_date: args.reportDate,
    lookback_days: args.lookbackDays,
  };

  const outPath = path.resolve(args.out);
  ensureDir(outPath);
  fs.writeFileSync(outPath, `${JSON.stringify(record)}\n`);
  console.log(`Wrote pack row to ${outPath}`);
}

main().catch((error) => {
  console.error("Jobber pack conversion failed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
