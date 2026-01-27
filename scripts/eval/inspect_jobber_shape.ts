import fs from "fs";
import path from "path";

function loadArray(file: string) {
  const raw = fs.readFileSync(path.resolve(file), "utf8");
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    // detect nested array
    const arr = Object.values(parsed).find((v) => Array.isArray(v));
    if (arr) return arr as any[];
    throw new Error("No array found in JSON file");
  } catch (e) {
    console.error("Failed to parse JSON:", e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}

function unionKeys(rows: any[], n = 5) {
  const set = new Set<string>();
  for (let i = 0; i < Math.min(rows.length, n); i++) {
    const r = rows[i];
    if (r && typeof r === "object") Object.keys(r).forEach((k) => set.add(k));
  }
  return Array.from(set).slice(0, 200);
}

function candidateFields(keys: string[]) {
  const totals = keys.filter((k) => /total|amount|subtotal|price|balance/i.test(k));
  const status = keys.filter((k) => /status|state|paid|isPaid|closed|won|open/i.test(k));
  const dates = keys.filter((k) => /created|updated|sent|due|paid|closed|date|at$/i.test(k));
  const discounts = keys.filter((k) => /discount/i.test(k));
  return { totals, status, dates, discounts };
}

function printReport(name: string, file: string) {
  const rows = loadArray(file);
  console.log(`--- ${name} ---`);
  console.log(`count: ${rows.length}`);
  const sampleKeys = unionKeys(rows, 5);
  console.log("sample_keys:", sampleKeys);
  const candidates = candidateFields(sampleKeys.concat(Object.keys(rows[0] || {})));
  console.log("candidate_totals:", candidates.totals);
  console.log("candidate_status:", candidates.status);
  console.log("candidate_dates:", candidates.dates);
  console.log("candidate_discounts:", candidates.discounts);
  return { sampleKeys, candidates };
}

function suggestMapping(quotesFile?: string, invoicesFile?: string) {
  const out: any = { quotes: {}, invoices: {} };
  if (quotesFile) {
    const r = printReport("quotes", quotesFile);
    out.quotes = {
      total: r.candidates.totals[0] ?? null,
      status: r.candidates.status[0] ?? null,
      created_at: r.candidates.dates.find((d: string) => /created|sent|date/i.test(d)) ?? null,
      closed_at: r.candidates.dates.find((d: string) => /closed|paid|due/i.test(d)) ?? null,
      discount_amount: r.candidates.discounts[0] ?? null,
      discount_percent: r.candidates.discounts.find((d: string) => /percent|pct/i.test(d)) ?? null,
    };
  }
  if (invoicesFile) {
    const r = printReport("invoices", invoicesFile);
    out.invoices = {
      total: r.candidates.totals[0] ?? null,
      status: r.candidates.status[0] ?? null,
      created_at: r.candidates.dates.find((d: string) => /created|sent|date/i.test(d)) ?? null,
      due_at: r.candidates.dates.find((d: string) => /due/i.test(d)) ?? null,
      paid_at: r.candidates.dates.find((d: string) => /paid/i.test(d)) ?? null,
      balance_due: r.candidates.totals.find((t: string) => /balance|due/i.test(t)) ?? null,
    };
  }
  console.log('\nSuggested mapping (copy and edit as needed):');
  console.log(JSON.stringify(out, null, 2));
}

function parseArgs() {
  const argv = process.argv.slice(2);
  const qIndex = argv.indexOf("--quotes");
  const iIndex = argv.indexOf("--invoices");
  const quotes = qIndex >= 0 ? argv[qIndex + 1] : undefined;
  const invoices = iIndex >= 0 ? argv[iIndex + 1] : undefined;
  if (!quotes && !invoices) {
    console.error("Usage: node inspect_jobber_shape.ts --quotes path/to/quotes.json --invoices path/to/invoices.json");
    process.exit(1);
  }
  return { quotes, invoices };
}

function main() {
  const { quotes, invoices } = parseArgs();
  suggestMapping(quotes, invoices);
}

main();
