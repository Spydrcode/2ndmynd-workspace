import fs from "fs";
import path from "path";
import { InvoicesSnapshot } from "./schemas";

const AVG_LOW = 300;
const AVG_HIGH = 1000;

function parseArgs() {
  const argv = process.argv.slice(2);
  const inIndex = argv.indexOf("--in");
  const outIndex = argv.indexOf("--out");
  const mapIndex = argv.indexOf("--map");
  const input = inIndex >= 0 ? argv[inIndex + 1] : argv[0];
  const out = outIndex >= 0 ? argv[outIndex + 1] : "eval_out/invoices_snapshot.json";
  const map = mapIndex >= 0 ? argv[mapIndex + 1] : undefined;
  if (!input) {
    console.error("Usage: node build_invoices_snapshot.ts --in invoices.json --out eval_out/invoices_snapshot.json [--map fieldmap.json]");
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

function bucketAvg(v: number) {
  if (!Number.isFinite(v)) return "unknown";
  if (v < AVG_LOW) return "low";
  if (v <= AVG_HIGH) return "med";
  return "high";
}

function bucketAging(days: number) {
  if (!Number.isFinite(days)) return "unknown";
  if (days <= 7) return "low";
  if (days <= 21) return "med";
  return "high";
}

function loadJSON(input: string) {
  const raw = fs.readFileSync(path.resolve(input), "utf8");
  try { return JSON.parse(raw); } catch (e) { return raw.split(/\r?\n/).filter(Boolean).map(l=>JSON.parse(l)); }
}

async function main() {
  const { input, out } = parseArgs();
  const rows = loadJSON(input);
  const arr = Array.isArray(rows) ? rows : (rows.records ?? rows.data ?? []);
  const now = new Date();

  const amounts = arr.map((r:any)=>toNumber(r.total ?? r.amount ?? r.invoice_total ?? r.balance_due));
  const medianAmt = median(amounts);

  const paidCount = arr.filter((r:any)=>{ const s = String(r.status ?? "").toLowerCase(); return s === "paid"||s==="completed"; }).length;
  const paidRatio = arr.length ? (paidCount / arr.length) : NaN;

  const agingDays = arr.map((r:any)=>{
    const due = r.due_at ?? r.dueDate ?? r.due;
    const paid = r.paid_at ?? r.paidAt ?? r.paid;
    if (due && paid) {
      return Math.round((new Date(paid).getTime() - new Date(due).getTime())/(1000*60*60*24));
    }
    if (due && !paid) {
      return Math.round((now.getTime() - new Date(due).getTime())/(1000*60*60*24));
    }
    return NaN;
  }).filter(Number.isFinite);

  const medianAging = median(agingDays);

  const snapshot: InvoicesSnapshot = {
    source: "jobber",
    type: "invoices",
    window: { days: 90, records: Math.min(arr.length, 100) },
    signals: {
      avg_invoice_bucket: bucketAvg(medianAmt),
      invoice_aging_bucket: Number.isFinite(medianAging) ? bucketAging(medianAging) : "unknown",
      paid_ratio_bucket: Number.isFinite(paidRatio) ? (paidRatio < 0.2 ? "low" : paidRatio <= 0.6 ? "med" : "high") : "unknown",
      time_to_invoice_bucket: "unknown",
    },
    evidence: [
      `Median invoice: $${Math.round(medianAmt || 0)}`,
      Number.isFinite(paidRatio) ? `Paid ratio: ${(paidRatio*100).toFixed(1)}%` : `Paid ratio: unknown`,
      Number.isFinite(medianAging) ? `Median invoice aging: ${medianAging} days` : `Invoice aging unknown`,
    ].slice(0,10),
    constraints: { tone: "quiet_founder", avoid: ["dashboards","kpis","analytics","monitoring","bi"] }
  };

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(snapshot, null, 2));
  console.log(`Wrote ${out} (records=${arr.length})`);
}

main().catch(e=>{ console.error(e instanceof Error?e.message:String(e)); process.exit(1); });
