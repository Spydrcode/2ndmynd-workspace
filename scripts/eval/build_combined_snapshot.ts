import fs from "fs";
import path from "path";
import { CombinedSnapshot } from "./schemas";

function parseArgs() {
  const argv = process.argv.slice(2);
  const qIndex = argv.indexOf("--quotes");
  const iIndex = argv.indexOf("--invoices");
  const outIndex = argv.indexOf("--out");
  const quotes = qIndex >= 0 ? argv[qIndex + 1] : argv[0];
  const invoices = iIndex >= 0 ? argv[iIndex + 1] : argv[1];
  const out = outIndex >= 0 ? argv[outIndex + 1] : "eval_out/combined_snapshot.json";
  if (!quotes || !invoices) {
    console.error("Usage: node build_combined_snapshot.ts --quotes quotes_snapshot.json --invoices invoices_snapshot.json --out eval_out/combined_snapshot.json");
    process.exit(1);
  }
  return { quotes, invoices, out };
}

function loadJSON(file: string) { return JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')); }

function pctDiff(a: number, b: number) {
  if (!isFinite(a) || !isFinite(b) || a === 0) return Infinity;
  return Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b));
}

async function main() {
  const { quotes, invoices, out } = parseArgs();
  const q = loadJSON(quotes);
  const inv = loadJSON(invoices);

  const qAvg = (function(){
    const s = String(q.signals?.avg_quote_bucket ?? "unknown");
    if (s === "low") return 300; if (s === "med") return 650; if (s === "high") return 1500; return NaN;
  })();
  const iAvg = (function(){
    const s = String(inv.signals?.avg_invoice_bucket ?? "unknown");
    if (s === "low") return 300; if (s === "med") return 650; if (s === "high") return 1500; return NaN;
  })();

  const avg_quote_vs_avg_invoice = !isFinite(qAvg) || !isFinite(iAvg) ? "unknown" : (qAvg > iAvg * 1.1 ? "quote_higher" : (iAvg > qAvg * 1.1 ? "invoice_higher" : "similar"));

  const qCount = q.window?.records ?? 0;
  const iCount = inv.window?.records ?? 0;
  const throughput_mismatch = !qCount || !iCount ? "unknown" : (qCount > iCount ? "selling_gt_billing" : (iCount > qCount ? "billing_gt_selling" : "balanced"));

  const pricing_drift_risk = (function(){
    if (!isFinite(qAvg) || !isFinite(iAvg)) return "unknown";
    const diff = Math.abs(qAvg - iAvg) / Math.max(qAvg, iAvg);
    if (diff < 0.05) return "low";
    if (diff < 0.15) return "med";
    return "high";
  })();

  const capacity_pressure_signal = (function(){
    if (throughput_mismatch === "selling_gt_billing") {
      const latency = q.signals?.quote_to_close_latency_bucket ?? "unknown";
      if (latency === "slow") return "high";
      if (latency === "med") return "med";
      return "low";
    }
    return "unknown";
  })();

  const evidence: string[] = [];
  evidence.push(`Avg quote vs invoice: ${avg_quote_vs_avg_invoice}`);
  evidence.push(`Quotes in window: ${q.window?.records ?? 0}, invoices: ${inv.window?.records ?? 0}`);
  evidence.push(`Pricing drift risk: ${pricing_drift_risk}`);

  const combined: CombinedSnapshot = {
    source: "jobber",
    type: "combined",
    window: { days: Math.max(q.window?.days ?? 90, inv.window?.days ?? 90), quotes: q.window?.records ?? 0, invoices: inv.window?.records ?? 0 },
    signals: {
      avg_quote_vs_avg_invoice: avg_quote_vs_avg_invoice as any,
      throughput_mismatch: throughput_mismatch as any,
      pricing_drift_risk: pricing_drift_risk as any,
      capacity_pressure_signal: capacity_pressure_signal as any,
    },
    evidence,
    constraints: { tone: "quiet_founder", avoid: ["dashboards","kpis","analytics","monitoring","bi"] }
  };

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(combined, null, 2));
  console.log(`Wrote ${out}`);
}

main().catch(e=>{ console.error(e instanceof Error?e.message:String(e)); process.exit(1); });
