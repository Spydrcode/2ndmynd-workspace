import fs from "fs";
import path from "path";

function readJSON(file: string) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function tryParseMaybeString(s: any) {
  if (!s) return null;
  if (typeof s === "object") return s;
  try { return JSON.parse(String(s)); } catch {}
  return null;
}

function sanitizeJsonFromModel(text: string) {
  if (!text) return null;
  // strip triple backticks blocks first
  const fenceMatch = /```json\s*([\s\S]*?)```/.exec(text);
  let candidate = fenceMatch ? fenceMatch[1] : text;
  // find first { and last }
  const first = candidate.indexOf('{');
  const last = candidate.lastIndexOf('}');
  if (first >= 0 && last > first) {
    const sub = candidate.slice(first, last + 1);
    try { return JSON.parse(sub); } catch (e) { /* fallthrough */ }
  }
  // fallback: try parsing whole text
  try { return JSON.parse(candidate); } catch (e) { return null; }
}

function safeReadRaw(evalDir: string) {
  const rawPath = path.join(evalDir, "baseline_raw.txt");
  if (fs.existsSync(rawPath)) return fs.readFileSync(rawPath, "utf8");
  const baselineJsonPath = path.join(evalDir, "baseline.json");
  if (fs.existsSync(baselineJsonPath)) {
    const b = tryParseMaybeString(readJSON(baselineJsonPath));
    if (b && b._parse_error && b._raw) return String(b._raw);
  }
  return null;
}

function median(nums: number[]) {
  const a = nums.filter(Number.isFinite).sort((x,y)=>x-y);
  if (!a.length) return NaN; const m=Math.floor(a.length/2); return a.length%2===0?(a[m-1]+a[m])/2:a[m];
}

function toNumber(v:any){ if (v==null) return NaN; if (typeof v==='number') return v; const s=String(v).replace(/[^0-9.-]/g,''); const n=Number(s); return Number.isFinite(n)?n:NaN; }

async function main(){
  const root = process.cwd();
  const targets = [
    { name: 'quotes', evalDir: 'eval_out/quotes_eval', snapshot: 'eval_out/quotes_snapshot.json', raw: 'tmp/quotes.json' },
    { name: 'invoices', evalDir: 'eval_out/invoices_eval', snapshot: 'eval_out/invoices_snapshot.json', raw: 'tmp/invoices.json' },
    { name: 'combined', evalDir: 'eval_out/combined_eval', snapshot: 'eval_out/combined_snapshot.json', raw: null },
    { name: 'combined_aug', evalDir: 'eval_out/combined_eval_with_avg', snapshot: 'eval_out/combined_snapshot_aug.json', raw: null },
  ];

  const rows: string[] = [];
  rows.push(['snapshot','baseline_confidence','finetuned_confidence','baseline_summary_len','finetuned_summary_len','baseline_patterns','finetuned_patterns','baseline_next_steps','finetuned_next_steps','median_quote','median_invoice','avg_quote_vs_avg_invoice_pct'].join(','));

  for (const t of targets) {
    const evalDir = path.resolve(t.evalDir);
    const baselinePath = path.join(evalDir,'baseline.json');
    const finetunedPath = path.join(evalDir,'finetuned.json');
    let baselineObj:any = null;
    let finetunedObj:any = null;

    if (fs.existsSync(baselinePath)) {
      try { baselineObj = readJSON(baselinePath); }
      catch(e){ baselineObj = null; }
    }
    // sanitize baseline if parse error
    if (baselineObj && baselineObj._parse_error) {
      const raw = safeReadRaw(evalDir) || String(baselineObj._raw || '');
      const parsed = sanitizeJsonFromModel(raw);
      if (parsed) baselineObj = parsed;
    }

    if (fs.existsSync(finetunedPath)) {
      try { finetunedObj = readJSON(finetunedPath); } catch(e){ finetunedObj = null; }
    }

    const baseline_conf = baselineObj?.confidence ?? '';
    const finetuned_conf = finetunedObj?.confidence ?? '';
    const baseline_summary_len = (baselineObj?.summary||'').length;
    const finetuned_summary_len = (finetunedObj?.summary||'').length;
    const baseline_patterns = (baselineObj?.top_patterns||[]).length;
    const finetuned_patterns = (finetunedObj?.top_patterns||[]).length;
    const baseline_next = (baselineObj?.next_steps||[]).length;
    const finetuned_next = (finetunedObj?.next_steps||[]).length;

    // medians
    let median_quote = '';
    let median_invoice = '';
    if (t.raw && fs.existsSync(path.resolve(t.raw))) {
      const rawRows = readJSON(path.resolve(t.raw));
      const qvals = rawRows.map((r:any)=>toNumber(r['Total ($)'] ?? r['Total'] ?? r['total'] ?? r['total_amount'] ?? r['amount'] ?? r['subtotal'])).filter(Number.isFinite);
      median_quote = Number.isFinite(median(qvals)) ? String(Math.round(median(qvals))) : '';
      if (t.name === 'invoices') median_invoice = median_quote;
    }

    // if combined_aug snapshot contains pct
    let pct = '';
    try {
      const snap = readJSON(path.resolve(t.snapshot));
      if (snap?.signals?.avg_quote_vs_avg_invoice_pct != null) pct = String(snap.signals.avg_quote_vs_avg_invoice_pct);
    } catch {}

    rows.push([t.name, baseline_conf, finetuned_conf, String(baseline_summary_len), String(finetuned_summary_len), String(baseline_patterns), String(finetuned_patterns), String(baseline_next), String(finetuned_next), median_quote, median_invoice, pct].map(v=>`"${String(v).replace(/"/g,'""')}"`).join(','));
  }

  const out = path.resolve('eval_out','eval_metrics.csv');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, rows.join('\n'));
  console.log('Wrote', out);
}

main().catch(e=>{ console.error(e instanceof Error?e.message:String(e)); process.exit(1); });
