import fs from "node:fs";
import path from "node:path";

import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

import { scanObjectForForbidden } from "./lib/forbidden";
import { rewriteConclusion } from "./compliance_rewrite";
import { validateConclusion, validateGrounding } from "./lib/conclusion_schema";

type Args = {
  model?: string;
  inputPath?: string;
  json?: string;
  rewrite: boolean;
  strict: boolean;
};

const REQUIRED_KEYS = [
  "conclusion_version",
  "pattern_id",
  "one_sentence_pattern",
  "decision",
  "boundary",
  "why_this_now",
  "confidence",
  "evidence_signals",
];

function parseArgs(argv: string[]): Args {
  const args: Args = { rewrite: true, strict: true };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith("--")) continue;

    switch (key) {
      case "--model":
        if (value) args.model = value;
        break;
      case "--in":
        if (value) args.inputPath = value;
        break;
      case "--json":
        if (value) args.json = value;
        break;
      case "--rewrite":
        args.rewrite = value ? value !== "false" : true;
        break;
      case "--strict":
        args.strict = value ? value !== "false" : true;
        break;
      default:
        break;
    }
  }
  return args;
}

function ensureEnv() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("Missing OPENAI_API_KEY environment variable.");
    process.exit(1);
  }
}

function validateOutput(parsed: any, strict: boolean) {
  const errors: string[] = [];
  if (strict) {
    const requiredOk = REQUIRED_KEYS.every((key) => key in (parsed ?? {}));
    if (!requiredOk) errors.push("missing required keys");
  }

  const decision = typeof parsed?.decision === "string" ? parsed.decision.trim() : "";
  const boundary = typeof parsed?.boundary === "string" ? parsed.boundary.trim() : "";
  if (!decision) errors.push("decision is required");
  if (!boundary) errors.push("boundary is required");

  if (strict) {
    const schema = validateConclusion(parsed);
    if (!schema.ok) {
      errors.push(...schema.errors);
    }
  }

  return errors;
}

async function getLatestModel(supabase: ReturnType<typeof createClient>) {
  const { data: latestRun, error: runError } = await supabase
    .schema("ml")
    .from("runs")
    .select("result_model")
    .eq("run_type", "finetune")
    .eq("run_status", "succeeded")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (runError || !latestRun?.result_model) {
    console.error("No succeeded finetune model found.");
    process.exit(1);
  }

  return latestRun.result_model as string;
}

async function getActiveModel(supabase: ReturnType<typeof createClient>) {
  const { data: modelRow, error } = await supabase
    .schema("ml")
    .from("model_registry")
    .select("model_id")
    .eq("name", "decision_model")
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    return null;
  }

  return modelRow?.model_id ?? null;
}

async function resolveModel(supabase: ReturnType<typeof createClient>) {
  const active = await getActiveModel(supabase);
  if (active) return active;
  return getLatestModel(supabase);
}

async function getSupabaseClient() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variable.");
    process.exit(1);
  }

  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  ensureEnv();

  if (!args.inputPath && !args.json) {
    console.error("Provide --in <path> or --json <stringified json>.");
    process.exit(1);
  }

  let inputJson = args.json ?? "";
  if (args.inputPath) {
    const inputPath = path.resolve(args.inputPath);
    if (!fs.existsSync(inputPath)) {
      console.error(`Missing file: ${inputPath}`);
      process.exit(1);
    }
    inputJson = fs.readFileSync(inputPath, "utf8");
  }
  let inputSnapshot: unknown = null;
  try {
    inputSnapshot = JSON.parse(inputJson);
  } catch {
    console.error("Input snapshot is not valid JSON.");
    process.exit(1);
  }

  const supabase = await getSupabaseClient();
  const model = args.model ?? (await resolveModel(supabase));
  const enforceStrict = args.model ? args.strict : true;
  const enforceRewrite = args.model ? args.rewrite : true;
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const system =
    "You are an internal 2ndmynd decision model. Your job is to reduce owner decision burden by identifying one pattern, one decision, and one boundary. Avoid dashboards, KPIs, monitoring, or performance language.";

  const attempt = async (extraSystem?: string) => {
    const messages = [
      { role: "system", content: system },
      ...(extraSystem ? [{ role: "system", content: extraSystem }] : []),
      { role: "user", content: inputJson },
    ];

    const completion = await client.chat.completions.create({
      model,
      messages,
    });

    const content = completion.choices?.[0]?.message?.content ?? "";
    try {
      const parsed = JSON.parse(content);
      return { parsed, raw: content };
    } catch {
      return { parsed: null, raw: content };
    }
  };

  const applyCompliance = (input: any) => {
    let parsedOutput = input;
    let errors = validateOutput(parsedOutput, enforceStrict);
    let forbidden = scanObjectForForbidden(parsedOutput);
    let grounding = { ok: true, errors: [], missing: [] as string[] };

    if (forbidden.terms.length > 0 && enforceRewrite) {
      const rewrite = rewriteConclusion(parsedOutput);
      if (rewrite.terms_after.length === 0) {
        parsedOutput = rewrite.rewritten;
        forbidden = scanObjectForForbidden(parsedOutput);
        errors = validateOutput(parsedOutput, enforceStrict);
      }
    }

    if (enforceStrict) {
      grounding = validateGrounding(parsedOutput, inputSnapshot);
    }

    return { parsedOutput, errors, forbidden, grounding };
  };

  let result = await attempt();
  if (!result.parsed) {
    result = await attempt("Return ONLY valid JSON matching the schema; no commentary.");
  }

  if (!result.parsed) {
    console.error("Model output is not valid JSON.");
    process.exit(1);
  }

  let parsed = result.parsed;
  const compliance = applyCompliance(parsed);
  let errors = compliance.errors;
  let forbidden = compliance.forbidden;
  let grounding = compliance.grounding;
  parsed = compliance.parsedOutput;

  if (errors.length > 0 || forbidden.terms.length > 0 || !grounding.ok) {
    result = await attempt(
      "Return ONLY valid JSON matching the schema. Hard rule: Do NOT use any of these terms anywhere in the JSON: dashboard, KPI, analytics, monitor/monitoring, BI, performance tracking, reporting. If you would have used them, rephrase without them. Pick 3-6 evidence_signals that exist in input_snapshot.signals keys; do not invent keys."
    );

    if (!result.parsed) {
      console.error("Model output is not valid JSON.");
      process.exit(1);
    }

    parsed = result.parsed;
    const retried = applyCompliance(parsed);
    parsed = retried.parsedOutput;
    errors = retried.errors;
    forbidden = retried.forbidden;
    grounding = retried.grounding;
  }

  if (forbidden.terms.length > 0) {
    console.error(
      `forbidden terms: ${forbidden.terms.join(", ")}; fields: ${forbidden.fields.join(", ")}`
    );
    process.exit(1);
  }

  if (errors.length > 0) {
    console.error(errors.join("; "));
    process.exit(1);
  }

  if (!grounding.ok) {
    console.error("Model did not ground evidence_signals.");
    process.exit(1);
  }

  console.log(JSON.stringify(parsed, null, 2));
}

main().catch((error) => {
  console.error("Unexpected failure.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
