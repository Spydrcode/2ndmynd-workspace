import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

import { scanObjectForForbidden } from "./lib/forbidden";
import { rewriteConclusion } from "./compliance_rewrite";
import { validateConclusion, validateGrounding } from "./lib/conclusion_schema";

require('dotenv').config();

type Args = {
  dataset: string;
  n: number;
  strict: boolean;
  rewrite: boolean;
  repeats: number;
  model?: string;
  runId?: string;
};

const DEFAULTS: Args = {
  dataset: "train_v1",
  n: 20,
  strict: true,
  rewrite: true,
  repeats: 3,
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
  const args = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith("--")) continue;

    switch (key) {
      case "--dataset":
        if (value) args.dataset = value;
        break;
      case "--n":
        if (value) args.n = Number(value);
        break;
      case "--model":
        if (value) args.model = value;
        break;
      case "--run_id":
        if (value) args.runId = value;
        break;
      case "--strict":
        args.strict = value ? value !== "false" : true;
        break;
      case "--repeats":
        if (value) args.repeats = Number(value);
        break;
      case "--rewrite":
        args.rewrite = value ? value !== "false" : true;
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
  if (!process.env.SUPABASE_URL) {
    console.error("Missing SUPABASE_URL environment variable.");
    process.exit(1);
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing SUPABASE_SERVICE_ROLE_KEY environment variable.");
    process.exit(1);
  }
}

function safeString(value: unknown) {
  return typeof value === "string" ? value : "";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  ensureEnv();

  if (!Number.isFinite(args.n) || args.n <= 0) {
    console.error("Invalid --n value.");
    process.exit(1);
  }
  if (!Number.isFinite(args.repeats) || args.repeats <= 0) {
    console.error("Invalid --repeats value.");
    process.exit(1);
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data: dataset, error: datasetError } = await supabase
    .schema("ml")
    .from("datasets")
    .select("name, example_ids")
    .eq("name", args.dataset)
    .single();

  if (datasetError || !dataset) {
    const { data: available, error: listError } = await supabase
      .schema("ml")
      .from("datasets")
      .select("name")
      .limit(50);

    if (listError) {
      console.error(`Dataset not found: ${args.dataset}`);
      console.error(`List error: ${listError.message}`);
      process.exit(1);
    }

    const names = (available ?? []).map((row) => row.name);
    console.error(
      `Dataset not found: ${args.dataset}. Available datasets: ${names.join(", ")}`
    );
    process.exit(1);
  }

  const datasetIds = dataset.example_ids ?? [];
  const targetCount = Math.min(args.n, datasetIds.length);
  const shuffled = [...datasetIds].sort(() => Math.random() - 0.5);
  const exampleIds = shuffled.slice(0, targetCount);
  if (exampleIds.length === 0) {
    console.error("No examples in dataset.");
    process.exit(1);
  }

  const { data: examples, error: examplesError } = await supabase
    .schema("ml")
    .from("examples")
    .select("id, input_snapshot")
    .in("id", exampleIds);

  if (examplesError) {
    console.error(`Fetch failed: ${examplesError.message}`);
    process.exit(1);
  }

  const exampleMap = new Map<string, (typeof examples)[number]>();
  for (const example of examples ?? []) {
    exampleMap.set(example.id, example);
  }

  let runId = args.runId;
  let model = args.model;

  if (!runId || !model) {
    const { data: latestRun, error: runError } = await supabase
      .schema("ml")
      .from("runs")
      .select("id, result_model")
      .eq("run_type", "finetune")
      .eq("run_status", "succeeded")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (runError || !latestRun) {
      console.error("No succeeded finetune run found.");
      process.exit(1);
    }

    runId = runId ?? latestRun.id;
    model = model ?? latestRun.result_model ?? undefined;
  }

  if (!model || !runId) {
    console.error("Missing model or run_id.");
    process.exit(1);
  }

  const smokeCycleId = randomUUID();
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  let passesRaw = 0;
  let passesRewritten = 0;
  let fails = 0;
  const failedIds: string[] = [];
  const rawExamplePass = new Map<string, boolean>();
  const rewrittenExamplePass = new Map<string, boolean>();

  for (const id of exampleIds) {
    const example = exampleMap.get(id);
    if (!example) continue;

    let rawAllPass = true;
    let rewrittenAllPass = true;

    for (let attempt = 0; attempt < args.repeats; attempt += 1) {
        const CONCLUSION_V1_JSON_SCHEMA = {
          type: "object",
          required: [
            "conclusion_version",
            "pattern_id",
            "one_sentence_pattern",
            "decision",
            "boundary",
            "why_this_now",
            "confidence",
            "evidence_signals",
          ],
          properties: {
            conclusion_version: { type: "string", const: "conclusion_v1" },
            pattern_id: { type: "string" },
            one_sentence_pattern: { type: "string" },
            decision: { type: "string" },
            boundary: { type: "string" },
            why_this_now: { type: "string" },
            confidence: { type: "string", enum: ["low", "medium", "high"] },
            evidence_signals: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 6 },
          },
          additionalProperties: false,
        } as const;

        const systemPrompt = `You must output a single JSON object that exactly matches the conclusion_v1 schema.\n- Output ONLY JSON. No markdown, no prose, no code fences.\n- Do not add wrapper keys like "raw_text".\n- If unsure, still fill the required fields with best-effort values. Never omit required keys.`;

        const completion = await client.chat.completions.create({
          model,
          temperature: 0,
          top_p: 0.1,
          presence_penalty: 0,
          frequency_penalty: 0,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: JSON.stringify(example.input_snapshot) },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "conclusion_v1",
              strict: true,
              schema: CONCLUSION_V1_JSON_SCHEMA,
            },
          },
        });

      const content = completion.choices?.[0]?.message?.content ?? "";
      let parsed: any = null;
      let parseOk = false;

      try {
        parsed = JSON.parse(content);
        parseOk = true;
      } catch {
        parsed = { raw_text: content };
      }

      const rawDecision = safeString(parsed?.decision).trim();
      const rawBoundary = safeString(parsed?.boundary).trim();
      const rawRequiredKeys = parseOk
        ? REQUIRED_KEYS.every((key) => key in (parsed ?? {}))
        : false;
      const rawSchema = parseOk ? validateConclusion(parsed) : { ok: false, errors: ["json_parse failed"] };

      const rawForbidden = scanObjectForForbidden(parsed);

      let rewrittenOutput: any = null;
      let rewriteApplied = false;
      let rewrittenForbidden = rawForbidden;
      let rewrittenDecision = rawDecision;
      let rewrittenBoundary = rawBoundary;
      let rewrittenRequiredKeys = rawRequiredKeys;
      let rewrittenSchema = rawSchema;
      let groundingRaw = { ok: true, errors: [] as string[], missing: [] as string[] };
      let groundingRewritten = groundingRaw;

      if (parseOk && rawForbidden.terms.length > 0 && args.rewrite) {
        const rewrite = rewriteConclusion(parsed);
        rewriteApplied = true;
        rewrittenOutput = rewrite.rewritten;
        rewrittenForbidden = scanObjectForForbidden(rewrittenOutput);
        rewrittenDecision = safeString((rewrittenOutput as any)?.decision).trim();
        rewrittenBoundary = safeString((rewrittenOutput as any)?.boundary).trim();
        rewrittenRequiredKeys = REQUIRED_KEYS.every((key) => key in (rewrittenOutput ?? {}));
        rewrittenSchema = validateConclusion(rewrittenOutput);
      }

      if (parseOk) {
        groundingRaw = validateGrounding(parsed, example.input_snapshot);
        const targetForGrounding = rewriteApplied ? rewrittenOutput : parsed;
        groundingRewritten = validateGrounding(targetForGrounding, example.input_snapshot);
      }

      const passRaw = args.strict
        ? parseOk &&
          rawRequiredKeys &&
          rawSchema.ok &&
          groundingRaw.ok &&
          Boolean(rawDecision) &&
          Boolean(rawBoundary) &&
          rawForbidden.terms.length === 0
        : Boolean(rawDecision) && Boolean(rawBoundary) && rawForbidden.terms.length === 0;

      const passRewritten = args.strict
        ? parseOk &&
          rewrittenRequiredKeys &&
          rewrittenSchema.ok &&
          groundingRewritten.ok &&
          Boolean(rewrittenDecision) &&
          Boolean(rewrittenBoundary) &&
          rewrittenForbidden.terms.length === 0
        : Boolean(rewrittenDecision) &&
          Boolean(rewrittenBoundary) &&
          rewrittenForbidden.terms.length === 0;

      const scores = {
        json_parse: parseOk,
        required_keys: rawRequiredKeys,
        has_decision: Boolean(rawDecision),
        has_boundary: Boolean(rawBoundary),
        forbidden_terms: rawForbidden.terms,
        forbidden_fields: rawForbidden.fields,
        forbidden_terms_raw: rawForbidden.terms,
        forbidden_fields_raw: rawForbidden.fields,
        forbidden_terms_rewritten: rewrittenForbidden.terms,
        forbidden_fields_rewritten: rewrittenForbidden.fields,
        rewrite_applied: rewriteApplied,
        schema_ok: rawSchema.ok,
        schema_errors: rawSchema.errors,
        schema_ok_rewritten: rewrittenSchema.ok,
        schema_errors_rewritten: rewrittenSchema.errors,
        grounding_ok_raw: groundingRaw.ok,
        grounding_ok_rewritten: groundingRewritten.ok,
        missing_evidence_keys_raw: groundingRaw.missing,
        missing_evidence_keys_rewritten: groundingRewritten.missing,
        pass_raw: passRaw,
        attempt_index: attempt,
        notes: args.strict ? "strict" : "loose",
      };

      const { error: insertError } = await supabase
        .schema("ml")
        .from("run_results")
        .insert({
          run_id: runId,
          example_id: id,
          model,
          output: {
            raw: parsed,
            rewritten: rewriteApplied ? rewrittenOutput : null,
          },
          scores,
          pass: passRewritten,
          smoke_cycle_id: smokeCycleId,
          attempt_index: attempt,
        });

      if (insertError) {
        console.error(`Failed to insert result for ${id}: ${insertError.message}`);
        process.exit(1);
      }

      if (!passRaw) rawAllPass = false;
      if (!passRewritten) rewrittenAllPass = false;
    }

    rawExamplePass.set(id, rawAllPass);
    rewrittenExamplePass.set(id, rewrittenAllPass);
    if (rawAllPass) passesRaw += 1;
    if (rewrittenAllPass) passesRewritten += 1;
    else {
      fails += 1;
      failedIds.push(id);
    }
  }

  console.log(`smoke_cycle_id: ${smokeCycleId}`);
  console.log(
    `tested examples: ${exampleIds.length}, repeats: ${args.repeats}, total attempts: ${
      exampleIds.length * args.repeats
    }`
  );
  console.log(`raw pass rate: ${passesRaw} / ${exampleIds.length}`);
  console.log(`rewritten pass rate: ${passesRewritten} / ${exampleIds.length}`);
  console.log(`fails: ${fails}`);
  console.log(`examples failing any repeat: [${failedIds.join(", ")}]`);
}

main().catch((error) => {
  console.error("Unexpected failure.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
