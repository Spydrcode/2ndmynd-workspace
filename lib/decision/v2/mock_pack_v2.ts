import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

import { parse as parseCsvSync } from "csv-parse/sync";
import {
  buildSnapshotV2,
  BuildSnapshotV2Input,
  RawInvoice,
  RawQuote,
} from "./snapshot/build_snapshot_v2";
import { inferDecisionV2 } from "./decision_infer_v2";
import { hashInput } from "./run_context";
import { ConclusionV2, SnapshotV2, VolatilityBand } from "./conclusion_schema_v2";

type PurchaseRow = {
  date?: string;
  unit_cost?: string;
  total_cost?: string;
  category?: string;
  unit?: string;
  item?: string;
};

export type MockPackSummaryItem = {
  company: string;
  conclusion: ConclusionV2 | null;
  snapshot?: SnapshotV2;
  meta: {
    run_id: string;
    model_id: string;
    rewrite_used: boolean;
    fallback_used: boolean;
    decision_patch_applied: boolean;
    decision_patch_reason: "verb" | "timebox" | "both" | null;
  };
};

export type MockPackRunResult = {
  summary: MockPackSummaryItem[];
  log_path: string;
  debug_log_path?: string;
};

export type RunMockPackV2Options = {
  zip_path: string;
  out_dir?: string;
  log_path?: string;
  debug?: boolean;
  limit?: number;
  skip_infer?: boolean;
  patch_queue_path?: string;
  on_company?: (entry: {
    company: string;
    conclusion: MockPackSummaryItem["conclusion"];
    meta: MockPackSummaryItem["meta"];
    debug_counts?: Record<string, number>;
  }) => void;
};

function ensureDir(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[\s_-]+/g, "").trim();
}

function lookup(row: Record<string, string>, keys: string[]) {
  const entries = Object.keys(row).map((k) => ({ key: k, norm: normalizeKey(k) }));
  for (const key of keys) {
    const target = normalizeKey(key);
    const hit = entries.find((entry) => entry.norm === target || entry.norm.includes(target));
    if (hit) return row[hit.key];
  }
  return undefined;
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
  return Number.isNaN(date.getTime()) ? null : date;
}

function readCsv(filePath: string) {
  const raw = fs.readFileSync(filePath, "utf8");
  return parseCsvSync(raw, { columns: true, skip_empty_lines: true }) as Record<string, string>[];
}

function quotesFromCsv(filePath: string): RawQuote[] {
  const rows = readCsv(filePath);
  const byId = new Map<string, RawQuote>();
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const idRaw = lookup(row, ["quote_id"]);
    const numberRaw = lookup(row, ["quote_number"]);
    const fallbackId = `row_${i + 1}`;
    const id = (idRaw && idRaw.trim()) || (numberRaw && numberRaw.trim()) || fallbackId;
    if (byId.has(id)) continue;
    const created = parseDate(lookup(row, ["created_at", "created", "quote_date"]));
    const approved = parseDate(lookup(row, ["approved_at", "approved", "converted"]));
    const status = lookup(row, ["status"]) ?? "";
    const total = parseMoney(lookup(row, ["total", "amount", "subtotal"]));
    byId.set(id, {
      created_at: created ? created.toISOString() : undefined,
      approved_at: approved ? approved.toISOString() : undefined,
      status: status ?? undefined,
      total: total ?? undefined,
    });
  }
  return Array.from(byId.values());
}

function invoicesFromCsv(filePath: string): RawInvoice[] {
  const rows = readCsv(filePath);
  const byId = new Map<string, RawInvoice>();
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const idRaw = lookup(row, ["invoice_id"]);
    const numberRaw = lookup(row, ["invoice_number"]);
    const fallbackId = `row_${i + 1}`;
    const id = (idRaw && idRaw.trim()) || (numberRaw && numberRaw.trim()) || fallbackId;
    if (byId.has(id)) continue;
    const issued = parseDate(lookup(row, ["issued_at", "issued", "invoice_date", "date"]));
    const paid = parseDate(lookup(row, ["paid_at", "paid", "payment_date"]));
    const status = lookup(row, ["status"]) ?? "";
    const total = parseMoney(lookup(row, ["total", "amount", "subtotal"]));
    byId.set(id, {
      issued_at: issued ? issued.toISOString() : undefined,
      paid_at: paid ? paid.toISOString() : undefined,
      status: status ?? undefined,
      total: total ?? undefined,
    });
  }
  return Array.from(byId.values());
}

function quoteStatsFromCsv(filePath: string) {
  const rows = readCsv(filePath);
  const quoteIds = new Set<string>();
  const quoteNumbers = new Set<string>();
  for (const row of rows) {
    const id = lookup(row, ["quote_id"]);
    const number = lookup(row, ["quote_number"]);
    if (id && id.trim()) quoteIds.add(id.trim());
    if (number && number.trim()) quoteNumbers.add(number.trim());
  }
  return {
    rows: rows.length,
    unique_quote_id: quoteIds.size,
    unique_quote_number: quoteNumbers.size,
  };
}

function invoiceStatsFromCsv(filePath: string) {
  const rows = readCsv(filePath);
  const invoiceIds = new Set<string>();
  const invoiceNumbers = new Set<string>();
  for (const row of rows) {
    const id = lookup(row, ["invoice_id"]);
    const number = lookup(row, ["invoice_number"]);
    if (id && id.trim()) invoiceIds.add(id.trim());
    if (number && number.trim()) invoiceNumbers.add(number.trim());
  }
  return {
    rows: rows.length,
    unique_invoice_id: invoiceIds.size,
    unique_invoice_number: invoiceNumbers.size,
  };
}

function purchasesFromCsv(filePath: string): PurchaseRow[] {
  const rows = readCsv(filePath);
  return rows.map((row) => ({
    date: lookup(row, ["date", "purchased_at", "purchase_date"]),
    unit_cost: lookup(row, ["unit_cost", "unitcost"]),
    total_cost: lookup(row, ["total_cost", "total"]),
    category: lookup(row, ["category"]),
    unit: lookup(row, ["unit"]),
    item: lookup(row, ["item", "item_name"]),
  }));
}

function clampBand(x: number, thresholds: [number, number, number, number]): VolatilityBand {
  if (x <= thresholds[0]) return "very_low";
  if (x <= thresholds[1]) return "low";
  if (x <= thresholds[2]) return "medium";
  if (x <= thresholds[3]) return "high";
  return "very_high";
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function computeVolatility(values: number[]) {
  if (!values.length) return 0;
  const mean = average(values);
  if (mean <= 0) return 0;
  const variance =
    values.length > 1
      ? values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (values.length - 1)
      : 0;
  return Math.sqrt(variance) / mean;
}

function buildInputCosts(purchases: PurchaseRow[], reportDate: Date) {
  if (!purchases.length) return undefined;
  const dayMs = 24 * 60 * 60 * 1000;
  const window30Start = new Date(reportDate.getTime() - 30 * dayMs);
  const window60Start = new Date(reportDate.getTime() - 60 * dayMs);
  const window90Start = new Date(reportDate.getTime() - 90 * dayMs);
  const window180Start = new Date(reportDate.getTime() - 180 * dayMs);

  const byCategory = new Map<string, { rows: { date: Date; unitCost: number; total: number; unit?: string }[] }>();

  for (const row of purchases) {
    const date = parseDate(row.date ?? "");
    const unitCost = parseMoney(row.unit_cost ?? "");
    const totalCost = parseMoney(row.total_cost ?? "");
    const category = (row.category ?? "misc").toString().trim() || "misc";
    if (!date || unitCost === null) continue;
    const entry = byCategory.get(category) ?? { rows: [] };
    entry.rows.push({
      date,
      unitCost,
      total: totalCost ?? unitCost,
      unit: row.unit ?? undefined,
    });
    byCategory.set(category, entry);
  }

  const ranked = Array.from(byCategory.entries())
    .map(([category, data]) => {
      const total = data.rows
        .filter((row) => row.date >= window90Start)
        .reduce((sum, row) => sum + row.total, 0);
      return { category, total, rows: data.rows };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 2);

  if (!ranked.length) return undefined;

  return ranked.map((entry) => {
    const rows = entry.rows;
    const last30 = rows.filter((r) => r.date >= window30Start).map((r) => r.unitCost);
    const prev30 = rows
      .filter((r) => r.date >= window60Start && r.date < window30Start)
      .map((r) => r.unitCost);
    const last90 = rows.filter((r) => r.date >= window90Start).map((r) => r.unitCost);
    const prev90 = rows
      .filter((r) => r.date >= window180Start && r.date < window90Start)
      .map((r) => r.unitCost);

    const avg30 = average(last30.length ? last30 : last90);
    const avgPrev30 = average(prev30);
    const avg90 = average(last90);
    const avgPrev90 = average(prev90);

    const change30 = avgPrev30 > 0 ? ((avg30 - avgPrev30) / avgPrev30) * 100 : 0;
    const change90 = avgPrev90 > 0 ? ((avg90 - avgPrev90) / avgPrev90) * 100 : 0;

    const volatility = computeVolatility(last90);
    const band = clampBand(volatility, [0.1, 0.25, 0.5, 0.9]);

    const unitCounts = new Map<string, number>();
    for (const row of rows) {
      if (!row.unit) continue;
      unitCounts.set(row.unit, (unitCounts.get(row.unit) ?? 0) + 1);
    }
    const unit = Array.from(unitCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unit";

    return {
      name: entry.category,
      unit,
      current: Number.isFinite(avg30) ? Number(avg30.toFixed(2)) : 0,
      change_30d_pct: Number.isFinite(change30) ? Number(change30.toFixed(2)) : 0,
      change_90d_pct: Number.isFinite(change90) ? Number(change90.toFixed(2)) : 0,
      volatility_band: band,
    };
  });
}

function findReportDate(quotes: RawQuote[], invoices: RawInvoice[], purchases: PurchaseRow[]) {
  const dates: Date[] = [];
  for (const q of quotes) {
    if (q.created_at) {
      const d = parseDate(q.created_at);
      if (d) dates.push(d);
    }
    if (q.approved_at) {
      const d = parseDate(q.approved_at);
      if (d) dates.push(d);
    }
  }
  for (const inv of invoices) {
    if (inv.issued_at) {
      const d = parseDate(inv.issued_at);
      if (d) dates.push(d);
    }
    if (inv.paid_at) {
      const d = parseDate(inv.paid_at);
      if (d) dates.push(d);
    }
  }
  for (const purchase of purchases) {
    const d = parseDate(purchase.date ?? "");
    if (d) dates.push(d);
  }
  if (!dates.length) return new Date();
  return new Date(Math.max(...dates.map((d) => d.getTime())));
}

function computeLookbackDays(quotes: RawQuote[], invoices: RawInvoice[], purchases: PurchaseRow[], reportDate: Date) {
  const dates: Date[] = [];
  for (const q of quotes) {
    if (q.created_at) {
      const d = parseDate(q.created_at);
      if (d) dates.push(d);
    }
  }
  for (const inv of invoices) {
    if (inv.issued_at) {
      const d = parseDate(inv.issued_at);
      if (d) dates.push(d);
    }
  }
  for (const purchase of purchases) {
    const d = parseDate(purchase.date ?? "");
    if (d) dates.push(d);
  }
  if (!dates.length) return 90;
  const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
  const diffMs = reportDate.getTime() - minDate.getTime();
  return Math.max(1, Math.round(diffMs / (24 * 60 * 60 * 1000)));
}

function extractZip(zipPath: string, outDir: string) {
  if (fs.existsSync(outDir) && fs.readdirSync(outDir).length > 0) {
    return;
  }
  if (!fs.existsSync(zipPath)) {
    throw new Error(`Missing zip: ${zipPath}`);
  }
  fs.mkdirSync(outDir, { recursive: true });

  if (process.platform === "win32") {
    const safeZip = zipPath.replace(/'/g, "''");
    const safeOut = outDir.replace(/'/g, "''");
    const cmd = `Expand-Archive -LiteralPath '${safeZip}' -DestinationPath '${safeOut}' -Force`;
    const res = spawnSync("powershell", ["-NoProfile", "-Command", cmd], { stdio: "inherit" });
    if (res.status !== 0) {
      throw new Error("Failed to expand zip with PowerShell.");
    }
  } else {
    const res = spawnSync("unzip", ["-o", zipPath, "-d", outDir], { stdio: "inherit" });
    if (res.status !== 0) {
      throw new Error("Failed to unzip dataset.");
    }
  }
}

function listCompanyDirs(outDir: string) {
  const entries = fs
    .readdirSync(outDir)
    .map((entry) => path.join(outDir, entry))
    .filter((entry) => fs.statSync(entry).isDirectory());

  const isCompanyDir = (dir: string) =>
    fs.existsSync(path.join(dir, "quotes.csv")) || fs.existsSync(path.join(dir, "invoices.csv"));

  const directCompanies = entries.filter(isCompanyDir);
  if (directCompanies.length > 0) {
    return directCompanies;
  }

  if (entries.length === 1) {
    const nested = fs
      .readdirSync(entries[0])
      .map((entry) => path.join(entries[0], entry))
      .filter((entry) => fs.statSync(entry).isDirectory());
    const nestedCompanies = nested.filter(isCompanyDir);
    if (nestedCompanies.length > 0) {
      return nestedCompanies;
    }
  }

  return entries;
}

function readCompanyName(quotesPath?: string, invoicesPath?: string) {
  const pathToCheck = quotesPath ?? invoicesPath;
  if (!pathToCheck || !fs.existsSync(pathToCheck)) return null;
  const rows = readCsv(pathToCheck);
  const first = rows[0];
  if (!first) return null;
  return first.company ?? null;
}

export async function runMockPackV2(options: RunMockPackV2Options): Promise<MockPackRunResult> {
  const zipPath = path.resolve(options.zip_path);
  const outDir = path.resolve(options.out_dir ?? "ml_artifacts/mock_companies_3mo");
  const logPath = path.resolve(options.log_path ?? "ml_artifacts/mock_companies_3mo/run_results.jsonl");
  const debugPath = path.resolve(outDir, "debug_run_results.jsonl");

  extractZip(zipPath, outDir);
  const companyDirs = listCompanyDirs(outDir);
  const limit = options.limit ? Math.min(options.limit, companyDirs.length) : companyDirs.length;

  const summary: MockPackSummaryItem[] = [];

  for (let i = 0; i < limit; i += 1) {
    const companyDir = companyDirs[i];
    const quotesPath = path.join(companyDir, "quotes.csv");
    const invoicesPath = path.join(companyDir, "invoices.csv");
    const purchasesPath = path.join(companyDir, "purchases.csv");

    if (!fs.existsSync(quotesPath) || !fs.existsSync(invoicesPath)) {
      continue;
    }

    const quoteStats = quoteStatsFromCsv(quotesPath);
    const invoiceStats = invoiceStatsFromCsv(invoicesPath);
    const quotes = quotesFromCsv(quotesPath);
    const invoices = invoicesFromCsv(invoicesPath);
    const purchases = fs.existsSync(purchasesPath) ? purchasesFromCsv(purchasesPath) : [];

    const reportDate = findReportDate(quotes, invoices, purchases);
    const lookbackDays = computeLookbackDays(quotes, invoices, purchases, reportDate);
    const inputCosts = buildInputCosts(purchases, reportDate);

    const snapshotInput: BuildSnapshotV2Input = {
      quotes,
      invoices,
      input_costs: inputCosts,
      report_date: reportDate.toISOString().slice(0, 10),
      lookback_days: lookbackDays,
    };

    const snapshot = buildSnapshotV2(snapshotInput);

    let result:
      | {
          conclusion: ConclusionV2;
          model_id: string;
          rewrite_used: boolean;
          fallback_used: boolean;
          decision_patch_applied: boolean;
          decision_patch_reason: "verb" | "timebox" | "both" | null;
          primary_raw?: string;
          rewrite_raw?: string;
          grounding_errors: string[];
          grounding_errors_raw?: string[];
        }
      | null = null;

    if (!options.skip_infer) {
      const infer = await inferDecisionV2(snapshot, {
        patch_queue_path: options.patch_queue_path ?? "ml_artifacts/patch_queue.jsonl",
      });
      result = {
        conclusion: infer.conclusion,
        model_id: infer.model_id,
        rewrite_used: infer.rewrite_used,
        fallback_used: infer.fallback_used,
        decision_patch_applied: infer.decision_patch_applied,
        decision_patch_reason: infer.decision_patch_reason,
        primary_raw: infer.primary_raw,
        rewrite_raw: infer.rewrite_raw,
        grounding_errors: infer.grounding_errors,
        grounding_errors_raw: infer.grounding_errors_raw,
      };
    }

    const companyName = readCompanyName(quotesPath, invoicesPath) ?? path.basename(companyDir);
    const runId = crypto.randomUUID();
    const now = new Date();

    const record = {
      run_id: runId,
      input_hash: hashInput({ company: companyName, snapshot }),
      company: companyName,
      source_dir: companyDir,
      snapshot,
      conclusion: result?.conclusion ?? null,
      meta: {
        run_id: runId,
        model_id: result?.model_id ?? "missing_openai_key",
        rewrite_used: result?.rewrite_used ?? false,
        fallback_used: result?.fallback_used ?? false,
        decision_patch_applied: result?.decision_patch_applied ?? false,
        decision_patch_reason: result?.decision_patch_reason ?? null,
      },
      created_at: now.toISOString(),
    };

    ensureDir(logPath);
    fs.appendFileSync(logPath, `${JSON.stringify(record)}\n`);

    const quoteCount = snapshot.activity_signals.quotes.quotes_count;
    const invoiceCount = snapshot.activity_signals.invoices.invoices_count;
    const quoteMax = Math.max(quoteStats.unique_quote_id, quoteStats.unique_quote_number);
    const invoiceMax = Math.max(invoiceStats.unique_invoice_id, invoiceStats.unique_invoice_number);

    if (quoteCount > quoteStats.rows || (quoteMax > 0 && quoteCount > quoteMax)) {
      throw new Error(
        `quotes_count exceeds rows or unique ids: count=${quoteCount} rows=${quoteStats.rows} max_unique=${quoteMax}`
      );
    }
    if (invoiceCount > invoiceStats.rows || (invoiceMax > 0 && invoiceCount > invoiceMax)) {
      throw new Error(
        `invoices_count exceeds rows or unique ids: count=${invoiceCount} rows=${invoiceStats.rows} max_unique=${invoiceMax}`
      );
    }

    if (options.debug) {
      const debugRecord = {
        run_id: runId,
        company: companyName,
        stats: {
          quotes_rows: quoteStats.rows,
          unique_quote_id: quoteStats.unique_quote_id,
          unique_quote_number: quoteStats.unique_quote_number,
          invoices_rows: invoiceStats.rows,
          unique_invoice_id: invoiceStats.unique_invoice_id,
          unique_invoice_number: invoiceStats.unique_invoice_number,
        },
        snapshot_window: snapshot.window,
        counts: {
          quotes_count: quoteCount,
          quotes_approved_count: snapshot.activity_signals.quotes.quotes_approved_count,
          invoices_count: invoiceCount,
          invoices_paid_count: snapshot.activity_signals.invoices.invoices_paid_count,
        },
        volatility_band: snapshot.volatility_band,
        season: snapshot.season,
        model_raw: result?.primary_raw ?? null,
        rewrite_raw: result?.rewrite_raw ?? null,
        grounding_errors: result?.grounding_errors ?? [],
        grounding_errors_raw: result?.grounding_errors_raw ?? null,
        meta: {
          rewrite_used: record.meta.rewrite_used,
          fallback_used: record.meta.fallback_used,
          decision_patch_applied: record.meta.decision_patch_applied,
          decision_patch_reason: record.meta.decision_patch_reason,
        },
      };
      ensureDir(debugPath);
      fs.appendFileSync(debugPath, `${JSON.stringify(debugRecord)}\n`);

      options.on_company?.({
        company: companyName,
        conclusion: result?.conclusion ?? null,
        meta: record.meta,
        debug_counts: {
          quotes_rows: quoteStats.rows,
          unique_quote_id: quoteStats.unique_quote_id,
          unique_quote_number: quoteStats.unique_quote_number,
          invoices_rows: invoiceStats.rows,
          unique_invoice_id: invoiceStats.unique_invoice_id,
          unique_invoice_number: invoiceStats.unique_invoice_number,
        },
      });
    } else {
      options.on_company?.({
        company: companyName,
        conclusion: result?.conclusion ?? null,
        meta: record.meta,
      });
    }

    summary.push({
      company: companyName,
      conclusion: result?.conclusion ?? null,
      snapshot: options.debug ? snapshot : undefined,
      meta: record.meta,
    });
  }

  return {
    summary,
    log_path: logPath,
    debug_log_path: options.debug ? debugPath : undefined,
  };
}
