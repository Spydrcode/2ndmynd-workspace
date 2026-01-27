import fs from "fs";
import path from "path";
import { QuotesSnapshot } from "./schemas";

const AVG_LOW = 300;
const AVG_HIGH = 1000;

function parseArgs() {
  const argv = process.argv.slice(2);
  const inIndex = argv.indexOf("--in");
  const outIndex = argv.indexOf("--out");
  const mapIndex = argv.indexOf("--map");
  const input = inIndex >= 0 ? argv[inIndex + 1] : argv[0];
  const out = outIndex >= 0 ? argv[outIndex + 1] : "eval_out/quotes_snapshot.json";
  const map = mapIndex >= 0 ? argv[mapIndex + 1] : undefined;
  if (!input) {
    console.error("Usage: node build_quotes_snapshot.ts --in quotes.json --out eval_out/quotes_snapshot.json [--map fieldmap.json]");
    process.exit(1);
  }
  return { input, out, map };
}

function toNumber(v: any) {
  if (v == null) return NaN;
  if (typeof v === "number") return v;
  const s = String(v).replace(/[^0-9.-]/g, "");
  return Number(s);
}

function median(arr: number[]) {
  const a = arr.filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return NaN;
  const m = Math.floor(a.length / 2);
  return a.length % 2 === 0 ? (a[m - 1] + a[m]) / 2 : a[m];
}

function coeffVar(arr: number[]) {
  const a = arr.filter(Number.isFinite);
  if (a.length === 0) return NaN;
  const mean = a.reduce((s, v) => s + v, 0) / a.length;
  const sd = Math.sqrt(a.reduce((s, v) => s + (v - mean) * (v - mean), 0) / a.length);
  return mean === 0 ? NaN : sd / mean;
}

function bucketAvg(v: number) {
  if (!Number.isFinite(v)) return "unknown";
  if (v < AVG_LOW) return "low";
  if (v <= AVG_HIGH) return "med";
  return "high";
}

function bucketCloseRate(pct: number) {
  if (!Number.isFinite(pct)) return "unknown";
  if (pct < 0.2) return "low";
  if (pct <= 0.6) return "med";
  return "high";
}

function bucketLatency(days: number) {
  if (!Number.isFinite(days)) return "unknown";
  if (days <= 2) return "fast";
  if (days <= 7) return "med";
  return "slow";
}

function loadJSON(input: string) {
  const raw = fs.readFileSync(path.resolve(input), "utf8");
  try { return JSON.parse(raw); } catch (e) { return raw.split(/\r?\n/).filter(Boolean).map(l=>JSON.parse(l)); }
}

async function main() {
  const { input, out, map } = parseArgs();
  const rows = loadJSON(input);
  const arr = Array.isArray(rows) ? rows : (rows.records ?? rows.data ?? []);
  const now = new Date();

  // attempt to infer amount & dates
  const amounts = arr.map((r: any) => toNumber(r.total ?? r.amount ?? r.estimate_total ?? r.estimate_amount));
  const medianAmt = median(amounts);
  const cv = coeffVar(amounts);

  // detect status and dates
  const statuses = arr.map((r:any)=>r.status ?? r.state ?? r.stage ?? null);
  const hasStatus = statuses.some(Boolean);
  const closedCount = arr.filter((r:any)=>{ const s = String(r.status ?? r.state ?? "").toLowerCase(); return s === "closed"||s==="won"||s==="accepted"; }).length;

  // dates
  const closedDates = arr.map((r:any)=> r.closed_at ?? r.closedAt ?? r.accepted_at ?? r.acceptedAt ?? null).filter(Boolean).map((d:any)=>new Date(d)).filter(d=>!isNaN(d.getTime()));
  const createdDates = arr.map((r:any)=> r.created_at ?? r.createdAt ?? r.sent_at ?? r.sentAt ?? null).filter(Boolean).map((d:any)=>new Date(d)).filter(d=>!isNaN(d.getTime()));

  const medianLeadToClose = (function(){
    const vals: number[] = [];
    for (const r of arr) {
      const c = r.created_at ?? r.createdAt ?? r.sent_at ?? r.sentAt ?? null;
      const cl = r.closed_at ?? r.closedAt ?? r.accepted_at ?? r.acceptedAt ?? null;
      if (c && cl) {
        const days = Math.round((new Date(cl).getTime() - new Date(c).getTime()) / (1000*60*60*24));
        if (!isNaN(days)) vals.push(days);
      }
    }
    return median(vals);
  })();

  const closed_recent = arr.filter((r:any)=>{
    const cl = r.closed_at ?? r.closedAt ?? r.accepted_at ?? r.acceptedAt ?? null;
    if (!cl) return false;
    const days = Math.round((now.getTime() - new Date(cl).getTime())/(1000*60*60*24));
    return days <= 90;
  });

  const windowCount = Math.min(closed_recent.length || arr.length, 100);

  const snapshot: QuotesSnapshot = {
    source: "jobber",
    type: "quotes",
    window: { days: 90, records: windowCount },
    signals: {
      avg_quote_bucket: bucketAvg(medianAmt),
      quote_size_variance_bucket: Number.isFinite(cv) ? (cv < 0.35 ? "stable" : "variable") : "unknown",
      close_rate_bucket: hasStatus ? bucketCloseRate(closedCount / arr.length) : "unknown",
      quote_to_close_latency_bucket: Number.isFinite(medianLeadToClose) ? bucketLatency(medianLeadToClose) : "unknown",
      discounting_pattern: "unknown",
    },
    evidence: [
      `Median quote: $${Math.round(medianAmt || 0)}`,
      hasStatus ? `Close rate: ${(closedCount/arr.length*100).toFixed(1)}%` : `Status not detected; close rate unknown`,
      Number.isFinite(medianLeadToClose) ? `Median quote->close ${medianLeadToClose} days` : `Quote->close latency unknown`,
    ].slice(0,10),
    constraints: { tone: "quiet_founder", avoid: ["dashboards","kpis","analytics","monitoring","bi"] }
  };

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(snapshot, null, 2));
  console.log(`Wrote ${out} (records=${arr.length}, window_records=${windowCount})`);
}

main().catch(e=>{ console.error(e instanceof Error?e.message:String(e)); process.exit(1); });
