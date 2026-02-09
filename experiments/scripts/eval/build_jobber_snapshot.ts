import fs from "fs";
import path from "path";

type EstimateRow = Record<string, any>;

const MIN_CLOSED = 25;
const TARGET_MIN = 40;
const TARGET_MAX = 60;
const CAP_DAYS = 90;
const CAP_ROWS = 100;

function parseArgs() {
  const argv = process.argv.slice(2);
  const outIndex = argv.indexOf("--out");
  const inputIndex = argv.indexOf("--input");
  const input = inputIndex >= 0 ? argv[inputIndex + 1] : argv[0];
  const out = outIndex >= 0 ? argv[outIndex + 1] : "jobber_snapshot.json";
  if (!input) {
    console.error("Usage: node build_jobber_snapshot.ts --input path/to/estimates.(json|csv) [--out jobber_snapshot.json]");
    process.exit(1);
  }
  return { input, out };
}

function parseCSV(content: string) {
  const lines = content.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];
  const header = parseCSVLine(lines[0]);
  const rows: EstimateRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const obj: EstimateRow = {};
    for (let j = 0; j < header.length; j++) {
      obj[header[j]] = values[j] ?? "";
    }
    rows.push(obj);
  }
  return rows;
}

function parseCSVLine(line: string) {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function toNumber(v: any) {
  if (v === null || v === undefined) return NaN;
  if (typeof v === "number") return v;
  const s = String(v).replace(/[^0-9.-]/g, "");
  return Number(s);
}

function daysBetween(a?: string | number | Date, b?: Date) {
  if (!a) return Infinity;
  const da = new Date(a as any);
  if (isNaN(da.getTime())) return Infinity;
  const db = b ?? new Date();
  return Math.round((db.getTime() - da.getTime()) / (1000 * 60 * 60 * 24));
}

function median(nums: number[]) {
  const arr = nums.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (arr.length === 0) return NaN;
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 === 0 ? (arr[mid - 1] + arr[mid]) / 2 : arr[mid];
}

function bucketAvgTicket(v: number) {
  if (!Number.isFinite(v)) return "unknown";
  if (v < 300) return "low";
  if (v <= 1000) return "med";
  return "high";
}

function bucketLatency(days: number) {
  if (!Number.isFinite(days)) return "unknown";
  if (days <= 2) return "fast";
  if (days <= 7) return "med";
  return "slow";
}

function bucketCloseRate(pct: number) {
  if (!Number.isFinite(pct)) return "unknown";
  if (pct < 0.2) return "low";
  if (pct <= 0.6) return "med";
  return "high";
}

function buildEvidence(agg: any) {
  const out: string[] = [];
  out.push(`Median ticket: $${Math.round(agg.median_ticket)}`);
  out.push(`Close rate: ${(agg.close_rate * 100).toFixed(1)}% over ${agg.closed_count} closed estimates`);
  if (Number.isFinite(agg.avg_discount_pct)) {
    out.push(`${(agg.discount_pct * 100).toFixed(1)}% of estimates had discounts; avg depth ${(agg.avg_discount_pct * 100).toFixed(1)}%`);
  }
  if (Number.isFinite(agg.lead_to_estimate_days)) {
    out.push(`Median lead->estimate ${agg.lead_to_estimate_days} days`);
  }
  if (Number.isFinite(agg.estimate_to_close_days)) {
    out.push(`Median estimate->close ${agg.estimate_to_close_days} days`);
  }
  return out.slice(0, 10);
}

async function main() {
  const { input, out } = parseArgs();
  const abs = path.resolve(input);
  if (!fs.existsSync(abs)) {
    console.error("Input not found:", abs);
    process.exit(1);
  }

  const raw = fs.readFileSync(abs, "utf8");
  let rows: EstimateRow[] = [];
  if (input.toLowerCase().endsWith(".json") || input.toLowerCase().endsWith(".jsonl")) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) rows = parsed as EstimateRow[];
      else if (typeof parsed === "object" && parsed !== null && Array.isArray((parsed as any).estimates)) rows = (parsed as any).estimates;
      else {
        console.error("Unrecognized JSON shape. Expecting an array of estimate objects or { estimates: [] }");
        process.exit(1);
      }
    } catch (e) {
      // try JSONL
      rows = raw.split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
    }
  } else if (input.toLowerCase().endsWith(".csv")) {
    rows = parseCSV(raw);
  } else {
    console.error("Unsupported input type. Provide .json, .jsonl, or .csv");
    process.exit(1);
  }

  // Filter closed estimates if status present
  const hasStatus = rows.some((r) => r.status !== undefined);
  let closedRows = hasStatus ? rows.filter((r) => String((r.status ?? "")).toLowerCase() === "closed") : rows;
  if (!hasStatus) console.warn("No status field found; using all rows (PII caution)");

  // parse created/closed times
  const now = new Date();
  closedRows = closedRows
    .map((r) => ({
      ...r,
      created_at_parsed: r.created_at ? new Date(r.created_at) : null,
      closed_at_parsed: r.closed_at ? new Date(r.closed_at) : null,
      estimate_total_num: toNumber(r.estimate_total ?? r.total ?? r.amount ?? r.estimate_total_amount),
    }))
    .filter((r) => r.estimate_total_num >= 0 || r.estimate_total_num === 0 || r.estimate_total_num !== r.estimate_total_num ? true : true);

  // apply windowing: last CAP_DAYS days or CAP_ROWS most recent closed estimates
  const withinDays = closedRows.filter((r) => {
    const days = r.closed_at_parsed ? daysBetween(r.closed_at_parsed, now) : Infinity;
    return days <= CAP_DAYS;
  });
  let windowRows = withinDays.slice().sort((a, b) => (b.closed_at_parsed?.getTime() ?? 0) - (a.closed_at_parsed?.getTime() ?? 0));
  if (windowRows.length > CAP_ROWS) windowRows = windowRows.slice(0, CAP_ROWS);

  const closed_count = windowRows.length;
  if (closed_count < MIN_CLOSED) console.warn(`Only ${closed_count} closed estimates in window (min ${MIN_CLOSED})`);

  const ticket_vals = windowRows.map((r) => Number.isFinite(r.estimate_total_num) ? r.estimate_total_num : NaN).filter(Number.isFinite);
  const median_ticket = Math.round(median(ticket_vals) || 0);

  // close rate: closed / total in same window (approx)
  const total_in_period = rows.filter((r) => r.created_at ? daysBetween(r.created_at, now) <= CAP_DAYS : false).length || rows.length;
  const close_rate = total_in_period > 0 ? closed_count / total_in_period : 0;

  // discounts
  const discount_vals = windowRows.map((r) => toNumber(r.discount_pct ?? r.discount_percent ?? r.discount || 0)).filter(Number.isFinite);
  const discount_pct = windowRows.length ? windowRows.filter((r) => toNumber(r.discount_pct ?? r.discount_percent ?? r.discount || 0) > 0).length / windowRows.length : 0;
  const avg_discount_pct = discount_vals.length ? median(discount_vals) / 100 : NaN;

  // lead_to_estimate and estimate_to_close
  const lead_days = windowRows.map((r) => {
    if (r.lead_created_at && r.created_at_parsed) return daysBetween(r.lead_created_at, r.created_at_parsed);
    if (r.lead_created && r.created_at_parsed) return daysBetween(r.lead_created, r.created_at_parsed);
    return NaN;
  }).filter(Number.isFinite);
  const estimate_to_close_days = windowRows.map((r) => r.closed_at_parsed && r.created_at_parsed ? daysBetween(r.created_at_parsed, r.closed_at_parsed) : NaN).filter(Number.isFinite);

  const agg = {
    closed_count,
    total_in_period,
    median_ticket,
    close_rate,
    discount_pct,
    avg_discount_pct: Number.isFinite(avg_discount_pct) ? avg_discount_pct : NaN,
    lead_to_estimate_days: Number.isFinite(median(lead_days)) ? Math.round(median(lead_days)) : NaN,
    estimate_to_close_days: Number.isFinite(median(estimate_to_close_days)) ? Math.round(median(estimate_to_close_days)) : NaN,
  };

  const snapshot: any = {
    business_context: {
      industry: null,
      team_size: null,
      region: null,
    },
    window: { days: Math.min(CAP_DAYS, CAP_DAYS), closed_estimates: closed_count },
    signals: {
      close_rate_bucket: bucketCloseRate(agg.close_rate),
      avg_ticket_bucket: bucketAvgTicket(agg.median_ticket),
      lead_to_estimate_speed_bucket: Number.isFinite(agg.lead_to_estimate_days) ? bucketLatency(agg.lead_to_estimate_days) : "unknown",
      estimate_to_close_latency_bucket: Number.isFinite(agg.estimate_to_close_days) ? bucketLatency(agg.estimate_to_close_days) : "unknown",
      schedule_load_bucket: "unknown",
      after_hours_work_bucket: "unknown",
      discounting_pattern: (!Number.isFinite(agg.avg_discount_pct) ? "unknown" : (agg.discount_pct === 0 ? "none" : (agg.discount_pct < 0.1 ? "rare" : (agg.avg_discount_pct < 0.05 ? "frequent_small_discounts" : "deep_discounts")))),
      cancellation_pattern: "unknown",
      follow_up_gap_bucket: "unknown",
      weekday_vs_weekend_skew: "unknown",
    },
    evidence: buildEvidence(agg),
    constraints: {
      tone: "quiet_founder",
      avoid: ["dashboards", "kpis", "analytics", "monitoring", "bi"],
    },
  };

  fs.writeFileSync(path.resolve(out), JSON.stringify(snapshot, null, 2));
  console.log(`Wrote snapshot to ${out} — closed_estimates=${closed_count}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
