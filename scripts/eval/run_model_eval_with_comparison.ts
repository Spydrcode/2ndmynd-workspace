import fs from "fs";
import path from "path";
import { execSync } from "child_process";

function parseArgs() {
  const argv = process.argv.slice(2);
  const combinedIndex = argv.indexOf("--combined");
  const quotesIndex = argv.indexOf("--quotes");
  const invoicesIndex = argv.indexOf("--invoices");
  const compareIndex = argv.indexOf("--compare");
  const outdirIndex = argv.indexOf("--outdir");
  const combined = combinedIndex >= 0 ? argv[combinedIndex + 1] : argv[0];
  const quotes = quotesIndex >= 0 ? argv[quotesIndex + 1] : "tmp/quotes.json";
  const invoices = invoicesIndex >= 0 ? argv[invoicesIndex + 1] : "tmp/invoices.json";
  const compare = compareIndex >= 0 ? argv[compareIndex + 1] : "avg";
  const outdir = outdirIndex >= 0 ? argv[outdirIndex + 1] : "eval_out";
  if (!combined) {
    console.error("Usage: tsx run_model_eval_with_comparison.ts --combined eval_out/combined_snapshot.json [--quotes tmp/quotes.json] [--invoices tmp/invoices.json] --compare avg|latency --outdir eval_out");
    process.exit(1);
  }
  return { combined, quotes, invoices, compare, outdir };
}

function median(nums: number[]) {
  const a = nums.filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return NaN;
  const m = Math.floor(a.length / 2);
  return a.length % 2 === 0 ? (a[m - 1] + a[m]) / 2 : a[m];
}

function toNumber(v: any) {
  if (v == null) return NaN;
  if (typeof v === "number") return v;
  const s = String(v).replace(/[^0-9.-]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function loadJSON(file: string) {
  return JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
}

async function main() {
  const { combined, quotes, invoices, compare, outdir } = parseArgs();
  const combinedPath = path.resolve(combined);
  if (!fs.existsSync(combinedPath)) { console.error('Combined snapshot not found:', combinedPath); process.exit(1); }
  const combinedSnap = loadJSON(combinedPath);

  if (compare === "avg") {
    const qpath = path.resolve(quotes);
    const ipath = path.resolve(invoices);
    if (!fs.existsSync(qpath) || !fs.existsSync(ipath)) {
      console.error("Quotes or invoices raw JSON not found. Provide --quotes and --invoices or run csv_to_json first (tmp/quotes.json, tmp/invoices.json).");
      process.exit(1);
    }
    const qrows = loadJSON(qpath) as any[];
    const irows = loadJSON(ipath) as any[];
    function extractAmount(row: any) {
      for (const k of ["total","Total","amount","Amount","estimate_total","estimate total","estimate_total_amount","invoice_total","invoice total","balance_due","Balance Due","estimate_amount"]) {
        if (row[k] !== undefined) {
          const n = toNumber(row[k]); if (Number.isFinite(n)) return n;
        }
      }
      for (const v of Object.values(row)) {
        const n = toNumber(v);
        if (Number.isFinite(n)) return n;
      }
      return NaN;
    }

    const qvals = qrows.map(r=>extractAmount(r)).filter(Number.isFinite);
    const ivals = irows.map(r=>extractAmount(r)).filter(Number.isFinite);
    const qmed = median(qvals);
    const imed = median(ivals);
    const pct = (!Number.isFinite(qmed) || !Number.isFinite(imed)) ? NaN : (qmed - imed) / Math.max(Math.abs(qmed), Math.abs(imed));
    combinedSnap.signals = combinedSnap.signals || {};
    combinedSnap.signals.avg_quote_vs_avg_invoice_pct = Number.isFinite(pct) ? Number((pct*100).toFixed(1)) : null;
    combinedSnap.signals.avg_quote_vs_avg_invoice_bucket = Number.isFinite(pct) ? (pct > 0.10 ? "quote_higher" : (pct < -0.10 ? "invoice_higher" : "similar")) : "unknown";
    combinedSnap.evidence = combinedSnap.evidence || [];
    combinedSnap.evidence.push(`Median quote $${Math.round(qmed||0)} vs median invoice $${Math.round(imed||0)} (pct ${Number.isFinite(pct)?(pct*100).toFixed(1)+"%":"unknown"})`);
  } else if (compare === "latency") {
    // simple fallback: mark unknown if not available
    combinedSnap.signals = combinedSnap.signals || {};
    combinedSnap.signals.quote_to_invoice_latency_skew = "unknown";
    combinedSnap.evidence = combinedSnap.evidence || [];
    combinedSnap.evidence.push("Latency skew comparison not implemented; provide raw data for robust computation.");
  } else {
    console.error("Unknown compare mode", compare); process.exit(1);
  }

  fs.mkdirSync(path.dirname(path.resolve(outdir, 'x')), { recursive: true });
  const outFile = path.resolve(path.dirname(combinedPath), "combined_snapshot_aug.json");
  fs.writeFileSync(outFile, JSON.stringify(combinedSnap, null, 2));
  console.log("Wrote augmented snapshot:", outFile);

  // call existing runner
  const cmd = `npx tsx scripts/eval/run_model_eval.ts --snapshot ${outFile} --outdir ${path.resolve(outdir, 'combined_eval_with_avg')}`;
  console.log("Running eval:", cmd);
  execSync(cmd, { stdio: "inherit", cwd: process.cwd(), env: process.env });
}

main().catch(e=>{ console.error(e instanceof Error?e.message:String(e)); process.exit(1); });
