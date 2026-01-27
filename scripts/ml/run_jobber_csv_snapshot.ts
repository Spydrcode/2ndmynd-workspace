/**
 * CSV -> snapshot_v1 -> call fine-tuned model -> validate schema + deterministic grounding
 *
 * Usage (PowerShell):
 *   $env:OPENAI_API_KEY="sk-..."
 *   $env:TEST_MODEL="ft:gpt-4.1-mini-2025-04-14:personal:2ndmynd-decision-v2-1769477737888:D2STs7nD"
 *   tsx scripts/ml/run_jobber_csv_snapshot.ts --invoices "/mnt/data/Invoices.csv" --quotes "/mnt/data/Quotes.csv"
 *
 * Or (Windows paths):
 *   tsx scripts/ml/run_jobber_csv_snapshot.ts --invoices "C:\path\Invoices.csv" --quotes "C:\path\Quotes.csv"
 *
 * Outputs:
 *   - prints conclusion JSON
 *   - writes JSONL log: ml_artifacts/jobber_csv_run.jsonl
 */

import fs from "node:fs";
import path from "node:path";

import OpenAI from "openai";
import { parse as parseCsvSync } from "csv-parse/sync";
import {
  DEFAULT_DECISION_MODEL_ID_V1,
  PRIMARY_SYSTEM_PROMPT_V1,
  REWRITE_SYSTEM_PROMPT_V1,
} from "./lib/decision_layer_v1";

type SnapshotV1 = {
  window: {
    slice_start: string; // YYYY-MM-DD
    slice_end: string; // YYYY-MM-DD
    report_date: string; // YYYY-MM-DD
    slice_index: number;
    lookback_days: number;
    sample_confidence: "low" | "medium" | "high";
  };
  signals: {
    quotes: {
      quotes_count: number;
      quotes_approved_count: number;
      approval_rate_band: "very_low" | "low" | "medium" | "high" | "very_high";
      decision_lag_band: "very_low" | "low" | "medium" | "high" | "very_high";
      quote_total_bands: { small: number; medium: number; large: number };
    };
    invoices: {
      invoices_count: number;
      invoices_paid_count: number;
      invoice_total_bands: { small: number; medium: number; large: number };
      payment_lag_band_distribution: {
        very_low: number;
        low: number;
        medium: number;
        high: number;
        very_high: number;
      };
    };
    volatility_band: "very_low" | "low" | "medium" | "high" | "very_high";
  };
  pii_scrubbed: boolean;
  snapshot_version: "snapshot_v1";
};

type ConclusionV1 = {
  conclusion_version: "conclusion_v1";
  pattern_id: string;
  one_sentence_pattern: string;
  decision: string;
  why_this_now: string;
  boundary: string;
  confidence: "low" | "medium" | "high";
  evidence_signals: string[]; // 3..6, enforced by schema + validator
};

// -----------------------
// Minimal CSV parser (handles quotes/commas)
// -----------------------
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

// -----------------------
// Column heuristics (Jobber exports vary)
// -----------------------
function norm(s: string) {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function findHeader(headers: string[], includesAny: string[]): string | null {
  const hnorm = headers.map((h) => ({ h, n: norm(h) }));
  for (const inc of includesAny) {
    const needle = norm(inc);
    const hit = hnorm.find((x) => x.n.includes(needle));
    if (hit) return hit.h;
  }
  return null;
}

function parseMoney(v: string): number | null {
  const s = (v ?? "").toString().replace(/[$,]/g, "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseDate(v: string): Date | null {
  const s = (v ?? "").toString().trim();
  if (!s || s === "-" || s.toLowerCase() === "n/a") return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

function toISODate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function clampBand(
  x: number,
  thresholds: [number, number, number, number]
): "very_low" | "low" | "medium" | "high" | "very_high" {
  // thresholds are 4 cut points between 5 bands
  if (x <= thresholds[0]) return "very_low";
  if (x <= thresholds[1]) return "low";
  if (x <= thresholds[2]) return "medium";
  if (x <= thresholds[3]) return "high";
  return "very_high";
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const a = sorted[base] ?? sorted[sorted.length - 1];
  const b = sorted[base + 1] ?? a;
  return a + rest * (b - a);
}

// -----------------------
// Evidence grounding validator (locked)
// -----------------------
type GroundingResult = { ok: true } | { ok: false; errors: string[] };

function getByPath(obj: any, p: string): unknown {
  const parts = p.split(".");
  let cur: any = obj;
  for (const part of parts) {
    if (cur == null || typeof cur !== "object" || !(part in cur)) return undefined;
    cur = cur[part];
  }
  return cur;
}

function literalToString(v: unknown): string {
  if (v === null) return "null";
  if (typeof v === "string") return v;
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  return JSON.stringify(v);
}

function validateEvidenceSignalsAgainstSnapshot(snapshot: any, evidenceSignals: unknown): GroundingResult {
  const errors: string[] = [];

  if (!Array.isArray(evidenceSignals)) return { ok: false, errors: ["evidence_signals is not an array"] };
  if (evidenceSignals.length < 3 || evidenceSignals.length > 6) {
    errors.push(`evidence_signals length must be 3..6, got ${evidenceSignals.length}`);
  }

  for (let i = 0; i < evidenceSignals.length; i++) {
    const item = evidenceSignals[i];
    if (typeof item !== "string") {
      errors.push(`evidence_signals[${i}] is not a string`);
      continue;
    }

    const eqIdx = item.indexOf("=");
    if (eqIdx <= 0 || eqIdx !== item.lastIndexOf("=")) {
      errors.push(`evidence_signals[${i}] must contain exactly one '=': "${item}"`);
      continue;
    }

    const p = item.slice(0, eqIdx).trim();
    const expected = item.slice(eqIdx + 1).trim();

    if (!p.startsWith("signals.")) {
      errors.push(`evidence_signals[${i}] path must start with 'signals.': "${p}"`);
      continue;
    }

    const actual = getByPath(snapshot, p);
    if (actual === undefined) {
      errors.push(`evidence_signals[${i}] path not found in snapshot: "${p}"`);
      continue;
    }
    if (actual !== null && typeof actual === "object") {
      errors.push(`evidence_signals[${i}] path resolves to non-literal (object/array): "${p}"`);
      continue;
    }

    const actualStr = literalToString(actual);
    if (expected !== actualStr) {
      errors.push(`evidence_signals[${i}] value mismatch at "${p}": expected "${expected}", actual "${actualStr}"`);
    }
  }

  return errors.length ? { ok: false, errors } : { ok: true };
}

// -----------------------
// conclusion_v1 schema (strict)
// -----------------------
const CONCLUSION_V1_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "conclusion_version",
    "pattern_id",
    "one_sentence_pattern",
    "decision",
    "why_this_now",
    "boundary",
    "confidence",
    "evidence_signals",
  ],
  properties: {
    conclusion_version: { type: "string", const: "conclusion_v1" },
    pattern_id: { type: "string", minLength: 1 },
    one_sentence_pattern: { type: "string", minLength: 1 },
    decision: { type: "string", minLength: 1 },
    why_this_now: { type: "string", minLength: 1 },
    boundary: { type: "string", minLength: 1 },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    evidence_signals: {
      type: "array",
      minItems: 3,
      maxItems: 6,
      items: { type: "string", minLength: 1 },
    },
  },
} as const;

// -----------------------
// Model calls
// -----------------------
function buildPrimarySystemPrompt() {
  return PRIMARY_SYSTEM_PROMPT_V1;
}

function insufficientEvidenceFallback(snapshot: SnapshotV1): ConclusionV1 {
  return {
    conclusion_version: "conclusion_v1",
    pattern_id: "insufficient_evidence_snapshot_v1",
    one_sentence_pattern: "Not enough grounded leaf signals were available to generate a reliable conclusion.",
    decision: "request_more_data_or_fix_mapping",
    why_this_now:
      "The system could not produce 3–6 grounded evidence_signals that match leaf fields in the snapshot. This usually indicates missing/incorrect CSV mapping or sparse data.",
    boundary: "If counts remain zero or mappings are missing, fix CSV column mapping and rerun.",
    confidence: "low",
    evidence_signals: [
      `signals.quotes.quotes_count=${snapshot.signals.quotes.quotes_count}`,
      `signals.invoices.invoices_count=${snapshot.signals.invoices.invoices_count}`,
      `signals.volatility_band=${snapshot.signals.volatility_band}`,
    ],
  };
}

async function callModel(
  client: OpenAI,
  model: string,
  snapshot: SnapshotV1
): Promise<ConclusionV1> {
  const resp = await client.responses.create({
    model,
    temperature: 0,
    top_p: 0.1,
    presence_penalty: 0,
    frequency_penalty: 0,
    text: {
      format: {
        type: "json_schema",
        name: "conclusion_v1",
        strict: true,
        schema: CONCLUSION_V1_SCHEMA as any,
      },
    },
    input: [
      { role: "system", content: buildPrimarySystemPrompt() },
      { role: "user", content: JSON.stringify(snapshot) },
    ],
  });

  const raw = (resp as any).output_text as string;
  if (!raw) throw new Error("No output_text returned.");
  const out = JSON.parse(raw);
  return out as ConclusionV1;
}

async function callRewrite(
  client: OpenAI,
  model: string,
  snapshot: SnapshotV1,
  badOutput: any
): Promise<ConclusionV1> {
  const resp = await client.responses.create({
    model,
    temperature: 0,
    top_p: 0.1,
    presence_penalty: 0,
    frequency_penalty: 0,
    text: {
      format: {
        type: "json_schema",
        name: "conclusion_v1",
        strict: true,
        schema: CONCLUSION_V1_SCHEMA as any,
      },
    },
    input: [
      { role: "system", content: REWRITE_SYSTEM_PROMPT_V1 },
      { role: "user", content: JSON.stringify({ snapshot, bad_output: badOutput }) },
    ],
  });

  const raw = (resp as any).output_text as string;
  if (!raw) throw new Error("No output_text returned from rewrite.");
  const out = JSON.parse(raw);
  return out as ConclusionV1;
}

// -----------------------
// Snapshot builder from CSVs
// -----------------------
function buildSnapshotFromJobberCsv(
  invoices: { headers: string[]; rows: Record<string, string>[] },
  quotes: { headers: string[]; rows: Record<string, string>[] },
  lookbackDays = 90
): SnapshotV1 {
  // Column guesses
  const invTotalH =
    findHeader(invoices.headers, ["total", "amount", "subtotal", "invoice total"]) ?? "";
  const invStatusH = findHeader(invoices.headers, ["status", "invoice status"]) ?? "";
  const invIssuedH = findHeader(invoices.headers, ["issued", "date", "created"]) ?? "";
  const invPaidH = findHeader(invoices.headers, ["paid", "payment date"]) ?? "";

  const quoteTotalH = findHeader(quotes.headers, ["total", "amount", "quote total"]) ?? "";
  const quoteStatusH = findHeader(quotes.headers, ["status", "quote status"]) ?? "";
  const quoteCreatedH =
    findHeader(quotes.headers, ["drafted date", "created date", "sent date"]) ?? "";
  const quoteApprovedH =
    findHeader(quotes.headers, ["approved date", "converted date"]) ?? "";

  console.log("Invoice columns picked:", { invIssuedH, invPaidH, invTotalH, invStatusH });
  console.log("Quote columns picked:", { quoteCreatedH, quoteApprovedH, quoteTotalH, quoteStatusH });

  if (process.env.DEBUG_JOBBER === "true") {
    console.log("Sample invoice row:", {
      issued: invoices.rows[0]?.[invIssuedH],
      paid: invoices.rows[0]?.[invPaidH],
      total: invoices.rows[0]?.[invTotalH],
      status: invoices.rows[0]?.[invStatusH],
    });
    console.log("Sample quote row:", {
      created: quotes.rows[0]?.[quoteCreatedH],
      approved: quotes.rows[0]?.[quoteApprovedH],
      total: quotes.rows[0]?.[quoteTotalH],
      status: quotes.rows[0]?.[quoteStatusH],
    });
  }

  const allDates: Date[] = [];
  const suspiciousDates: { field: string; value: string; parsed: string }[] = [];

  const trackDate = (label: string, raw: string, parsed: Date | null) => {
    if (!parsed) return;
    if (parsed.getFullYear() > 2100) {
      suspiciousDates.push({ field: label, value: raw, parsed: toISODate(parsed) });
    }
  };

  type Inv = { total: number; issued: Date | null; paid: Date | null; status: string };
  type Qt = { total: number; created: Date | null; approved: Date | null; status: string };

  const invs: Inv[] = invoices.rows.map((r) => {
    const issuedRaw = invIssuedH ? r[invIssuedH] : "";
    const paidRaw = invPaidH ? r[invPaidH] : "";
    const issued = invIssuedH ? parseDate(issuedRaw) : null;
    const paid = invPaidH ? parseDate(paidRaw) : null;
    trackDate("invoice.issued", issuedRaw, issued);
    trackDate("invoice.paid", paidRaw, paid);
    if (issued) allDates.push(issued);
    if (paid) allDates.push(paid);
    return {
      total: invTotalH ? parseMoney(r[invTotalH]) ?? 0 : 0,
      issued,
      paid,
      status: invStatusH ? (r[invStatusH] ?? "") : "",
    };
  });

  const qts: Qt[] = quotes.rows.map((r) => {
    const createdRaw = quoteCreatedH ? r[quoteCreatedH] : "";
    const approvedRaw = quoteApprovedH ? r[quoteApprovedH] : "";
    const created = quoteCreatedH ? parseDate(createdRaw) : null;
    const approved = quoteApprovedH ? parseDate(approvedRaw) : null;
    trackDate("quote.created", createdRaw, created);
    trackDate("quote.approved", approvedRaw, approved);
    if (created) allDates.push(created);
    if (approved) allDates.push(approved);
    return {
      total: quoteTotalH ? parseMoney(r[quoteTotalH]) ?? 0 : 0,
      created,
      approved,
      status: quoteStatusH ? (r[quoteStatusH] ?? "") : "",
    };
  });

  const reportDate = new Date();
  const sliceEnd = allDates.length ? new Date(Math.max(...allDates.map((d) => d.getTime()))) : reportDate;
  const sliceStart = new Date(sliceEnd.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

  if (process.env.DEBUG_JOBBER === "true" && suspiciousDates.length > 0) {
    console.log("Suspicious dates detected:", suspiciousDates.slice(0, 10));
  }

  // Filter within window by issued/created date (best-effort)
  const invWin = invs.filter((x) => (x.issued ? x.issued >= sliceStart && x.issued <= sliceEnd : false));
  const qtWin = qts.filter((x) => (x.created ? x.created >= sliceStart && x.created <= sliceEnd : false));

  const invoices_count = invWin.length;
  const invoices_paid_count = invWin.filter((x) => {
    const s = norm(x.status);
    if (s.includes("paid")) return true;
    // fallback: paid date exists
    return !!x.paid;
  }).length;

  const quotes_count = qtWin.length;
  const quotes_approved_count = qtWin.filter((x) => {
    const s = norm(x.status);
    if (s.includes("approved") || s.includes("converted") || s.includes("won")) return true;
    return !!x.approved;
  }).length;

  const approvalRate = quotes_count > 0 ? quotes_approved_count / quotes_count : 0;
  const approval_rate_band = clampBand(approvalRate, [0.05, 0.2, 0.5, 0.8]);

  // Quote decision lag: created -> approved (days)
  const lags = qtWin
    .map((q) => (q.created && q.approved ? (q.approved.getTime() - q.created.getTime()) / (24 * 60 * 60 * 1000) : null))
    .filter((x): x is number => x !== null && Number.isFinite(x));
  const lagMedian = lags.length ? [...lags].sort((a, b) => a - b)[Math.floor(lags.length / 2)] : 0;
  // bands: same-day, <=2d, <=7d, <=21d, >21d
  const decision_lag_band = clampBand(lagMedian, [0.5, 2, 7, 21]);

  const invTotals = invWin.map((x) => x.total).filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  const qtTotals = qtWin.map((x) => x.total).filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);

  const invQ1 = quantile(invTotals, 0.33);
  const invQ2 = quantile(invTotals, 0.66);
  const invoice_total_bands = {
    small: invWin.filter((x) => x.total > 0 && x.total <= invQ1).length,
    medium: invWin.filter((x) => x.total > invQ1 && x.total <= invQ2).length,
    large: invWin.filter((x) => x.total > invQ2).length,
  };

  const qtQ1 = quantile(qtTotals, 0.33);
  const qtQ2 = quantile(qtTotals, 0.66);
  const quote_total_bands = {
    small: qtWin.filter((x) => x.total > 0 && x.total <= qtQ1).length,
    medium: qtWin.filter((x) => x.total > qtQ1 && x.total <= qtQ2).length,
    large: qtWin.filter((x) => x.total > qtQ2).length,
  };

  // Payment lag distribution: issued -> paid
  const payLags = invWin
    .map((inv) => (inv.issued && inv.paid ? (inv.paid.getTime() - inv.issued.getTime()) / (24 * 60 * 60 * 1000) : null))
    .filter((x): x is number => x !== null && Number.isFinite(x) && x >= 0);

  const lagDist = { very_low: 0, low: 0, medium: 0, high: 0, very_high: 0 };
  for (const d of payLags) {
    // <=1d, <=3d, <=7d, <=21d, >21d
    const b = clampBand(d, [1, 3, 7, 21]);
    lagDist[b] += 1;
  }

  // Volatility: daily invoice totals std/mean within window (best-effort)
  const dayMap = new Map<string, number>();
  for (const inv of invWin) {
    if (!inv.issued) continue;
    const day = toISODate(inv.issued);
    dayMap.set(day, (dayMap.get(day) ?? 0) + (inv.total || 0));
  }
  const daily = [...dayMap.values()].filter((n) => Number.isFinite(n));
  const mean = daily.length ? daily.reduce((a, b) => a + b, 0) / daily.length : 0;
  const variance =
    daily.length > 1
      ? daily.reduce((acc, x) => acc + Math.pow(x - mean, 2), 0) / (daily.length - 1)
      : 0;
  const std = Math.sqrt(variance);
  const cv = mean > 0 ? std / mean : 0; // coefficient of variation
  const volatility_band = clampBand(cv, [0.05, 0.15, 0.35, 0.75]);

  // Sample confidence: based on count volume
  const totalSignals = invoices_count + quotes_count;
  const sample_confidence: "low" | "medium" | "high" =
    totalSignals >= 60 ? "high" : totalSignals >= 25 ? "medium" : "low";

  return {
    window: {
      slice_start: toISODate(sliceStart),
      slice_end: toISODate(sliceEnd),
      report_date: toISODate(reportDate),
      slice_index: 0,
      lookback_days: lookbackDays,
      sample_confidence,
    },
    signals: {
      quotes: {
        quotes_count,
        quotes_approved_count,
        approval_rate_band,
        decision_lag_band,
        quote_total_bands,
      },
      invoices: {
        invoices_count,
        invoices_paid_count,
        invoice_total_bands,
        payment_lag_band_distribution: lagDist,
      },
      volatility_band,
    },
    pii_scrubbed: true,
    snapshot_version: "snapshot_v1",
  };
}

// -----------------------
// Main
// -----------------------
function argValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

async function main() {
  const invoicesPath = argValue("--invoices") ?? process.env.INVOICES_CSV ?? "/mnt/data/Invoices.csv";
  const quotesPath = argValue("--quotes") ?? process.env.QUOTES_CSV ?? "/mnt/data/Quotes.csv";
  const model =
    argValue("--model") ??
    process.env.TEST_MODEL ??
    DEFAULT_DECISION_MODEL_ID_V1;

  if (!process.env.OPENAI_API_KEY) {
    console.error("Missing OPENAI_API_KEY env var.");
    process.exit(1);
  }

  const outDir = process.env.FT_OUT_DIR ?? "ml_artifacts";
  fs.mkdirSync(outDir, { recursive: true });
  const logPath = path.join(outDir, "jobber_csv_run.jsonl");

  const invText = fs.readFileSync(invoicesPath, "utf8");
  const qtText = fs.readFileSync(quotesPath, "utf8");

  const inv = parseCsv(invText);
  const qt = parseCsv(qtText);

  if (process.argv.includes("--print-headers")) {
    console.log("Invoices headers:", inv.headers);
    console.log("Quotes headers:", qt.headers);
    process.exit(0);
  }

  const snapshot = buildSnapshotFromJobberCsv(inv, qt, Number(process.env.LOOKBACK_DAYS ?? 90));

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // 1) Primary call
  let output: any = null;
  let rewritten = false;
  let grounding: GroundingResult = { ok: false, errors: ["not_checked"] };
  let primaryEvidence: unknown = null;
  let rewriteEvidence: unknown = null;
  let groundingErrors: string[] = [];
  let fallbackTriggered = false;

  try {
    output = await callModel(client, model, snapshot);
    primaryEvidence = output?.evidence_signals ?? null;
    grounding = validateEvidenceSignalsAgainstSnapshot(snapshot, output?.evidence_signals);
    if (!grounding.ok) groundingErrors.push(...grounding.errors);
  } catch (e: any) {
    console.error("Primary call failed:", e?.message ?? e);
    output = null;
  }

  // 2) One-shot rewrite if needed
  if (!output || grounding.ok === false) {
    try {
      const bad = output ?? { error: "primary_failed" };
      const repaired = await callRewrite(client, model, snapshot, bad);
      rewriteEvidence = repaired?.evidence_signals ?? null;
      const repairedGrounding = validateEvidenceSignalsAgainstSnapshot(snapshot, repaired?.evidence_signals);
      if (!repairedGrounding.ok) {
        groundingErrors.push(...repairedGrounding.errors);
        output = insufficientEvidenceFallback(snapshot);
        rewritten = true;
        fallbackTriggered = true;
      } else {
        output = repaired;
        rewritten = true;
      }
    } catch (e: any) {
      console.error("Rewrite failed:", e?.message ?? e);
    }
  }

  const finalEvidence = output?.evidence_signals ?? null;
  const finalGrounding = validateEvidenceSignalsAgainstSnapshot(snapshot, finalEvidence);

  // Print + log
  const record = {
    ts: new Date().toISOString(),
    model,
    invoicesPath,
    quotesPath,
    snapshot,
    primary_evidence_signals: primaryEvidence,
    rewrite_evidence_signals: rewriteEvidence,
    grounding_errors: groundingErrors,
    fallback_triggered: fallbackTriggered,
    final_evidence_signals: finalEvidence,
    final_grounding: finalGrounding,
    output,
    rewritten,
    grounding: finalGrounding,
  };

  fs.appendFileSync(logPath, JSON.stringify(record) + "\n");

  console.log("\n--- SNAPSHOT (summary) ---");
  console.log(
    JSON.stringify(
      {
        window: snapshot.window,
        quotes: snapshot.signals.quotes,
        invoices: snapshot.signals.invoices,
        volatility_band: snapshot.signals.volatility_band,
      },
      null,
      2
    )
  );

  console.log("\n--- MODEL OUTPUT ---");
  console.log(JSON.stringify(output, null, 2));

  console.log("\n--- GROUNDING ---");
  console.log(JSON.stringify(finalGrounding, null, 2));

  console.log(`\nWrote log: ${logPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
