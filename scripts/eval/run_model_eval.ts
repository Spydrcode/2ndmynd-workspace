import fs from "fs";
import path from "path";
import OpenAI from "openai";

function parseArgs() {
  const argv = process.argv.slice(2);
  const snapshotIndex = argv.indexOf("--snapshot");
  const outdirIndex = argv.indexOf("--outdir");
  const snapshot = snapshotIndex >= 0 ? argv[snapshotIndex + 1] : argv[0];
  const outdir = outdirIndex >= 0 ? argv[outdirIndex + 1] : "eval_out";
  if (!snapshot) {
    console.error("Usage: node run_model_eval.ts --snapshot jobber_snapshot.json --outdir eval_out");
    process.exit(1);
  }
  return { snapshot, outdir };
}

const BASELINE = "gpt-4o-mini-2024-07-18";
const FINETUNED = "ft:gpt-4o-mini-2024-07-18:personal:2ndmynd-scenario-v1-rerun-1769353708277:D1wewTb5";

function systemInstruction() {
  return `You are a concise advisor for small service businesses. Follow these constraints:\n- Output VALID JSON only, matching the schema exactly.\n- Tone: quiet_founder.\n- Avoid words: dashboards, kpis, analytics, monitoring, bi.\n- Provide short, actionable next steps prioritized by effort.`;
}

function userPrompt(snapshot: any) {
  return `Input snapshot:\n${JSON.stringify(snapshot, null, 2)}\n\nProduce a JSON object with the schema: {"summary":"2-4 sentences","top_patterns":[{"pattern":"","why_it_matters":""}],"next_steps":[{"step":"","reason":"","effort":"low|med|high"}],"questions_to_confirm":["",""],"confidence":"low|med|high"}`;
}

async function callModel(client: any, model: string, snapshot: any) {
  const promptSys = systemInstruction();
  const promptUser = userPrompt(snapshot);

  const res = await client.responses.create({
    model,
    input: [
      { role: "system", content: promptSys },
      { role: "user", content: promptUser },
    ],
    max_output_tokens: 800,
  });

  // try to get text
  const out = res.output?.[0]?.content?.[0]?.text ?? (typeof res === "string" ? res : JSON.stringify(res));
  return String(out);
}

function safeParseJSON(s: string) {
  try {
    return JSON.parse(s);
  } catch (e) {
    return null;
  }
}

function makeDiff(baseline: any, tuned: any) {
  const lines: string[] = [];
  lines.push("## Diff summary");
  if (baseline.summary !== tuned.summary) lines.push(`- Summary changed.`);
  const baselinePatterns = (baseline.top_patterns ?? []).map((p: any) => p.pattern).join("; ");
  const tunedPatterns = (tuned.top_patterns ?? []).map((p: any) => p.pattern).join("; ");
  if (baselinePatterns !== tunedPatterns) lines.push(`- Top patterns changed: ${baselinePatterns} => ${tunedPatterns}`);
  const baselineSteps = (baseline.next_steps ?? []).map((s: any) => s.step).join("; ");
  const tunedSteps = (tuned.next_steps ?? []).map((s: any) => s.step).join("; ");
  if (baselineSteps !== tunedSteps) lines.push(`- Next steps changed.`);
  if (lines.length === 1) lines.push("- No substantive differences detected.");
  return lines.join("\n");
}

async function main() {
  const { snapshot, outdir } = parseArgs();
  const abs = path.resolve(snapshot);
  if (!fs.existsSync(abs)) {
    console.error("Snapshot not found:", abs);
    process.exit(1);
  }
  const snap = JSON.parse(fs.readFileSync(abs, "utf8"));

  if (!process.env.OPENAI_API_KEY) {
    console.error("Missing OPENAI_API_KEY");
    process.exit(1);
  }
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  fs.mkdirSync(outdir, { recursive: true });

  console.log("Calling baseline model...");
  let baselineRaw = await callModel(client, BASELINE, snap);
  let baselineJson = safeParseJSON(baselineRaw);
  if (!baselineJson) {
    console.warn("Baseline returned invalid JSON, retrying with JSON-only hint...");
    baselineRaw = await callModel(client, BASELINE, snap + "\nReturn ONLY the JSON object, nothing else.");
    baselineJson = safeParseJSON(baselineRaw);
    if (!baselineJson) {
      console.error("Baseline did not return valid JSON after retry. Saving raw output to baseline_raw.txt and continuing.");
      fs.writeFileSync(path.join(outdir, "baseline_raw.txt"), String(baselineRaw));
      baselineJson = { _parse_error: true, _raw: String(baselineRaw).slice(0, 2000) };
    }
  }
  fs.writeFileSync(path.join(outdir, "baseline.json"), JSON.stringify(baselineJson, null, 2));

  console.log("Calling fine-tuned model...");
  let tunedRaw = await callModel(client, FINETUNED, snap);
  let tunedJson = safeParseJSON(tunedRaw);
  if (!tunedJson) {
    console.warn("Finetuned returned invalid JSON, retrying with JSON-only hint...");
    tunedRaw = await callModel(client, FINETUNED, snap + "\nReturn ONLY the JSON object, nothing else.");
    tunedJson = safeParseJSON(tunedRaw);
    if (!tunedJson) {
      console.error("Finetuned did not return valid JSON after retry. Saving raw output to finetuned_raw.txt and continuing.");
      fs.writeFileSync(path.join(outdir, "finetuned_raw.txt"), String(tunedRaw));
      tunedJson = { _parse_error: true, _raw: String(tunedRaw).slice(0, 2000) };
    }
  }
  fs.writeFileSync(path.join(outdir, "finetuned.json"), JSON.stringify(tunedJson, null, 2));

  const diff = makeDiff(baselineJson, tunedJson);
  fs.writeFileSync(path.join(outdir, "diff.md"), diff + "\n");

  console.log(`Wrote eval outputs to ${outdir}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
