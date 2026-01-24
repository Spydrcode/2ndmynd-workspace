import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import minimist from "minimist";

import { scanObjectForForbidden } from "./lib/forbidden";
import { rewriteConclusion } from "./compliance_rewrite";
import { validateConclusion, validateGrounding } from "./lib/conclusion_schema";
import { bucketForMeta, BucketLabel } from "./eval/buckets";

type Args = {
  dataset: string;
  model?: string;
  repeats: number;
  maxExamples?: number;
  rewrite: boolean;
  strict: boolean;
  mode: "full" | "pattern_only";
};

const DEFAULTS: Args = {
  dataset: "scenario_eval_v1",
  repeats: 1,
  rewrite: true,
  strict: true,
  mode: "full",
};

const BASE_MODEL = "gpt-4o-mini-2024-07-18";

type BucketSummary = {
  total: number;
  selection_accuracy: number;
  full_joint_success: number;
  grounding_fail_rate: number;
  forbidden_rate: number;
  schema_fail_rate: number;
};

function parseBoolean(value: unknown, fallback: boolean) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value !== "false";
  return fallback;
}

function parseNumber(value: unknown) {
  if (value === undefined || value === null) return undefined;
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function parseArgs(argv: string[]): Args {
  const parsed = minimist(argv, {
    string: ["dataset", "model", "mode", "max_examples", "n"],
    default: {
      dataset: DEFAULTS.dataset,
      repeats: DEFAULTS.repeats,
      rewrite: DEFAULTS.rewrite,
      strict: DEFAULTS.strict,
      mode: DEFAULTS.mode,
    },
  });

  const maxExamples = parseNumber(parsed.max_examples) ?? parseNumber(parsed.n);
  const repeats = parseNumber(parsed.repeats) ?? DEFAULTS.repeats;
  const mode = parsed.mode === "pattern_only" || parsed.mode === "full" ? parsed.mode : DEFAULTS.mode;

  return {
    dataset: parsed.dataset ?? DEFAULTS.dataset,
    model: parsed.model,
    repeats,
    maxExamples,
    rewrite: parseBoolean(parsed.rewrite, DEFAULTS.rewrite),
    strict: parseBoolean(parsed.strict, DEFAULTS.strict),
    mode,
  };
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

async function getActiveModel(supabase: ReturnType<typeof createClient>) {
  const { data: modelRow, error } = await supabase
    .schema("ml")
    .from("model_registry")
    .select("model_id")
    .eq("name", "decision_model")
    .eq("status", "active")
    .maybeSingle();

  if (error) return null;
  return modelRow?.model_id ?? null;
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
    return null;
  }

  return latestRun.result_model as string;
}

async function resolveModel(supabase: ReturnType<typeof createClient>, explicitModel?: string) {
  if (explicitModel) return explicitModel;
  if (process.env.DECISION_MODEL_ID) return process.env.DECISION_MODEL_ID;
  const active = await getActiveModel(supabase);
  if (active) return active;
  const latest = await getLatestModel(supabase);
  if (latest) return latest;
  return BASE_MODEL;
}

function safeString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function hashOutput(payload: string) {
  return crypto.createHash("sha256").update(payload).digest("hex");
}

async function insertRun(params: {
  status: "running" | "succeeded" | "failed" | "cancelled" | "canceled";
  modelId: string;
  datasetName: string;
  evalMode: "full" | "pattern_only";
  metrics: Record<string, unknown>;
}) {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data, error } = await supabase
    .schema("ml")
    .from("runs")
    .insert({
      run_type: "eval_baseline",
      run_status: params.status,
      model_id: params.modelId,
      dataset_name: params.datasetName,
      eval_mode: params.evalMode,
      metrics: params.metrics,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error(`Failed to record run: ${error?.message ?? "unknown error"}`);
    return null;
  }

  return data.id as string;
}

async function updateRun(
  runId: string,
  updates: Partial<{
    run_status: "running" | "succeeded" | "failed" | "cancelled" | "canceled";
    metrics: Record<string, unknown>;
  }>
) {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { error } = await supabase
    .schema("ml")
    .from("runs")
    .update(updates)
    .eq("id", runId);

  if (error) {
    console.error(`Failed to update run: ${error.message}`);
  }
}

async function insertRunResults(runId: string, rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) return;

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const chunkSize = 200;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase
      .schema("ml")
      .from("run_results")
      .insert(chunk);

    if (error) {
      console.error(`Failed to insert run results: ${error.message}`);
      return;
    }
  }
}

export type EvalSummary = {
  dataset: string;
  model: string;
  total: number;
  selection_accuracy: number;
  full_joint_success: number;
  selection_ok_full_ok: number;
  selection_ok_full_fail: number;
  selection_ok_full_fail_reasons: {
    schema: number;
    forbidden: number;
    grounding: number;
  };
  selection_fail: number;
  grounding_fail_count_raw: number;
  grounding_fail_count_rewritten: number;
  forbidden_fail_count_raw: number;
  forbidden_fail_count_rewritten: number;
  schema_fail_count: number;
  rewrite_rate: number;
  bucket_metrics: Record<BucketLabel, BucketSummary>;
  bucket_unknown: number;
  confusion: Record<string, Record<string, number>>;
  per_pattern_metrics: Record<string, { precision: number; recall: number; f1: number }>;
};

type EvalResult = {
  example_id: string;
  expected_pattern_id: string;
  predicted_pattern_id: string;
  bucket: BucketLabel;
  bucket_unknown: boolean;
  selection_correct: boolean;
  full_valid: boolean;
  fail_reasons: string[];
  rewrite_applied: boolean;
  output_hash: string;
};

export async function runEval(args: Args) {
  ensureEnv();

  if (!Number.isFinite(args.repeats) || args.repeats <= 0) {
    console.error("Invalid --repeats value.");
    process.exit(1);
  }

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data: dataset, error: datasetError } = await supabase
    .schema("ml")
    .from("datasets")
    .select("name, example_ids")
    .eq("name", args.dataset)
    .single();

  if (datasetError || !dataset) {
    console.error(`Dataset not found: ${args.dataset}`);
    process.exit(1);
  }

  let exampleIds = dataset.example_ids ?? [];
  if (args.maxExamples) {
    exampleIds = exampleIds.slice(0, Math.min(args.maxExamples, exampleIds.length));
  }
  if (exampleIds.length === 0) {
    console.error("No examples in dataset.");
    process.exit(1);
  }

  const { data: examples, error: examplesError } = await supabase
    .schema("ml")
    .from("examples")
    .select("id, input_snapshot, target_output, meta")
    .in("id", exampleIds);

  if (examplesError) {
    console.error(`Fetch failed: ${examplesError.message}`);
    process.exit(1);
  }

  const model = await resolveModel(supabase, args.model);
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const results: EvalResult[] = [];
  const runResults: Array<Record<string, unknown>> = [];
  const confusion: Record<string, Record<string, number>> = {};

  let groundingFailRaw = 0;
  let groundingFailRewritten = 0;
  let forbiddenFailRaw = 0;
  let forbiddenFailRewritten = 0;
  let schemaFail = 0;
  let rewriteRequiredCount = 0;
  let bucketUnknown = 0;

  const precisionRecall: Record<string, { tp: number; fp: number; fn: number }> = {};
  const bucketCounts: Record<BucketLabel, {
    total: number;
    selectionCorrect: number;
    fullValid: number;
    groundingFail: number;
    forbiddenFail: number;
    schemaFail: number;
  }> = {
    clean: { total: 0, selectionCorrect: 0, fullValid: 0, groundingFail: 0, forbiddenFail: 0, schemaFail: 0 },
    mixed: { total: 0, selectionCorrect: 0, fullValid: 0, groundingFail: 0, forbiddenFail: 0, schemaFail: 0 },
    counterexample: { total: 0, selectionCorrect: 0, fullValid: 0, groundingFail: 0, forbiddenFail: 0, schemaFail: 0 },
    fallback: { total: 0, selectionCorrect: 0, fullValid: 0, groundingFail: 0, forbiddenFail: 0, schemaFail: 0 },
  };

  const runId = await insertRun({
    status: "running",
    modelId: model,
    datasetName: args.dataset,
    evalMode: args.mode,
    metrics: {},
  });

  for (const example of examples ?? []) {
    const expectedPattern = safeString(example.target_output?.pattern_id ?? "");
    const { bucket, unknown } = bucketForMeta(example.meta as Record<string, unknown> | null | undefined);
    if (unknown) bucketUnknown += 1;

    const attempts: Array<{
      predictedPattern: string;
      patternCorrect: boolean;
      schemaOk: boolean;
      groundingOk: boolean;
      forbiddenOk: boolean;
      fullOk: boolean;
      rawFullOk: boolean;
      rewriteApplied: boolean;
      outputHash: string;
    }> = [];

    for (let attempt = 0; attempt < args.repeats; attempt += 1) {
      const completion = await client.chat.completions.create({
        model,
        messages: [
          {
            role: "system",
            content:
              "You are an internal 2ndmynd decision model. Your job is to reduce owner decision burden by identifying one pattern, one decision, and one boundary. Avoid dashboards, KPIs, monitoring, or performance language.",
          },
          { role: "user", content: JSON.stringify(example.input_snapshot) },
        ],
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

      const patternOnly = args.mode === "pattern_only";
      const rawSchema = patternOnly
        ? { ok: parseOk, errors: parseOk ? [] : ["json_parse failed"] }
        : parseOk
          ? validateConclusion(parsed)
          : { ok: false, errors: ["json_parse failed"] };
      const rawForbidden = patternOnly ? { terms: [] as string[] } : scanObjectForForbidden(parsed);
      const rawGrounding = patternOnly
        ? { ok: true, errors: [], missing: [] as string[] }
        : parseOk
          ? validateGrounding(parsed, example.input_snapshot)
          : { ok: false, errors: [], missing: [] as string[] };

      let rewritten = parsed;
      let rewriteApplied = false;
      if (parseOk && args.rewrite && rawForbidden.terms.length > 0) {
        const rewrite = rewriteConclusion(parsed);
        rewritten = rewrite.rewritten;
        rewriteApplied = true;
      }

      const rewrittenSchema = patternOnly
        ? { ok: parseOk, errors: parseOk ? [] : ["json_parse failed"] }
        : parseOk
          ? validateConclusion(rewritten)
          : { ok: false, errors: ["json_parse failed"] };
      const rewrittenForbidden = patternOnly ? { terms: [] as string[] } : scanObjectForForbidden(rewritten);
      const rewrittenGrounding = patternOnly
        ? { ok: true, errors: [], missing: [] as string[] }
        : parseOk
          ? validateGrounding(rewritten, example.input_snapshot)
          : { ok: false, errors: [], missing: [] as string[] };

      const rawPredicted = safeString(parsed?.pattern_id ?? "");
      const predictedPattern = safeString(rewritten?.pattern_id ?? "");

      const rawPatternCorrect = expectedPattern === rawPredicted;
      const rawFullOk =
        rawPatternCorrect && rawSchema.ok && rawGrounding.ok && rawForbidden.terms.length === 0;

      const patternCorrect = expectedPattern === predictedPattern;
      const schemaOk = rewrittenSchema.ok;
      const groundingOk = rewrittenGrounding.ok;
      const forbiddenOk = rewrittenForbidden.terms.length === 0;
      const fullOk = patternCorrect && schemaOk && groundingOk && forbiddenOk;

      if (!rawGrounding.ok) groundingFailRaw += 1;
      if (!rewrittenGrounding.ok) groundingFailRewritten += 1;
      if (rawForbidden.terms.length > 0) forbiddenFailRaw += 1;
      if (rewrittenForbidden.terms.length > 0) forbiddenFailRewritten += 1;
      if (!schemaOk) schemaFail += 1;

      const outputPayload = parseOk ? JSON.stringify(rewritten ?? {}) : content;
      const outputHash = hashOutput(outputPayload);

      attempts.push({
        predictedPattern,
        patternCorrect,
        schemaOk,
        groundingOk,
        forbiddenOk,
        fullOk,
        rawFullOk,
        rewriteApplied,
        outputHash,
      });
    }

    const predictedSet = new Set(attempts.map((item) => item.predictedPattern).filter((id) => id));
    const predictedPattern = predictedSet.size === 1 ? Array.from(predictedSet)[0] : "inconsistent";
    const selectionCorrect = predictedPattern === expectedPattern && predictedSet.size === 1;

    const schemaOkAll = attempts.every((item) => item.schemaOk);
    const groundingOkAll = attempts.every((item) => item.groundingOk);
    const forbiddenOkAll = attempts.every((item) => item.forbiddenOk);
    const fullValid = selectionCorrect && schemaOkAll && groundingOkAll && forbiddenOkAll;

    const failReasons: string[] = [];
    if (selectionCorrect && !fullValid) {
      if (!schemaOkAll) failReasons.push("schema");
      if (schemaOkAll && !groundingOkAll) failReasons.push("grounding");
      if (schemaOkAll && groundingOkAll && !forbiddenOkAll) failReasons.push("forbidden");
    }

    const rewriteRequired = fullValid && attempts.some((item) => item.rewriteApplied && !item.rawFullOk && item.fullOk);
    if (rewriteRequired) rewriteRequiredCount += 1;

    if (!confusion[expectedPattern]) confusion[expectedPattern] = {};
    confusion[expectedPattern][predictedPattern] = (confusion[expectedPattern][predictedPattern] ?? 0) + 1;

    if (!precisionRecall[expectedPattern]) {
      precisionRecall[expectedPattern] = { tp: 0, fp: 0, fn: 0 };
    }
    if (!precisionRecall[predictedPattern]) {
      precisionRecall[predictedPattern] = { tp: 0, fp: 0, fn: 0 };
    }

    if (selectionCorrect) {
      precisionRecall[expectedPattern].tp += 1;
    } else {
      precisionRecall[expectedPattern].fn += 1;
      precisionRecall[predictedPattern].fp += 1;
    }

    bucketCounts[bucket].total += 1;
    if (selectionCorrect) bucketCounts[bucket].selectionCorrect += 1;
    if (fullValid) bucketCounts[bucket].fullValid += 1;
    if (!groundingOkAll && args.mode === "full") bucketCounts[bucket].groundingFail += 1;
    if (!forbiddenOkAll && args.mode === "full") bucketCounts[bucket].forbiddenFail += 1;
    if (!schemaOkAll && args.mode === "full") bucketCounts[bucket].schemaFail += 1;

    const outputHash = hashOutput(attempts.map((item) => item.outputHash).join("|"));
    results.push({
      example_id: example.id,
      expected_pattern_id: expectedPattern,
      predicted_pattern_id: predictedPattern,
      bucket,
      bucket_unknown: unknown,
      selection_correct: selectionCorrect,
      full_valid: fullValid,
      fail_reasons: failReasons,
      rewrite_applied: attempts.some((item) => item.rewriteApplied),
      output_hash: outputHash,
    });

    if (runId) {
      runResults.push({
        run_id: runId,
        example_id: example.id,
        model: model,
        output: { output_hash: outputHash },
        scores: {
          expected_pattern_id: expectedPattern,
          predicted_pattern_id: predictedPattern,
          bucket,
          bucket_unknown: unknown,
          selection_correct: selectionCorrect,
          full_valid: fullValid,
          fail_reasons: failReasons,
          output_hash: outputHash,
        },
        pass: fullValid,
      });
    }
  }

  if (runId) {
    await insertRunResults(runId, runResults);
  }

  const total = results.length;
  const selectionCorrectTotal = results.filter((row) => row.selection_correct).length;
  const fullOkTotal = results.filter((row) => row.full_valid).length;
  const selectionOkFullOk = results.filter((row) => row.selection_correct && row.full_valid).length;
  const selectionOkFullFail = results.filter((row) => row.selection_correct && !row.full_valid).length;
  const selectionFail = results.filter((row) => !row.selection_correct).length;
  const selectionOkFailReasons = {
    schema: results.filter((row) => row.selection_correct && row.fail_reasons.includes("schema")).length,
    grounding: results.filter((row) => row.selection_correct && row.fail_reasons.includes("grounding")).length,
    forbidden: results.filter((row) => row.selection_correct && row.fail_reasons.includes("forbidden")).length,
  };

  const bucketMetrics: Record<BucketLabel, BucketSummary> = {
    clean: { total: 0, selection_accuracy: 0, full_joint_success: 0, grounding_fail_rate: 0, forbidden_rate: 0, schema_fail_rate: 0 },
    mixed: { total: 0, selection_accuracy: 0, full_joint_success: 0, grounding_fail_rate: 0, forbidden_rate: 0, schema_fail_rate: 0 },
    counterexample: { total: 0, selection_accuracy: 0, full_joint_success: 0, grounding_fail_rate: 0, forbidden_rate: 0, schema_fail_rate: 0 },
    fallback: { total: 0, selection_accuracy: 0, full_joint_success: 0, grounding_fail_rate: 0, forbidden_rate: 0, schema_fail_rate: 0 },
  };

  for (const bucket of Object.keys(bucketCounts) as BucketLabel[]) {
    const row = bucketCounts[bucket];
    bucketMetrics[bucket] = {
      total: row.total,
      selection_accuracy: row.total ? row.selectionCorrect / row.total : 0,
      full_joint_success: row.total ? row.fullValid / row.total : 0,
      grounding_fail_rate: row.total ? row.groundingFail / row.total : 0,
      forbidden_rate: row.total ? row.forbiddenFail / row.total : 0,
      schema_fail_rate: row.total ? row.schemaFail / row.total : 0,
    };
  }

  const summary: EvalSummary = {
    dataset: args.dataset,
    model,
    total,
    selection_accuracy: total ? selectionCorrectTotal / total : 0,
    full_joint_success: total ? fullOkTotal / total : 0,
    selection_ok_full_ok: selectionOkFullOk,
    selection_ok_full_fail: selectionOkFullFail,
    selection_ok_full_fail_reasons: selectionOkFailReasons,
    selection_fail: selectionFail,
    grounding_fail_count_raw: groundingFailRaw,
    grounding_fail_count_rewritten: groundingFailRewritten,
    forbidden_fail_count_raw: forbiddenFailRaw,
    forbidden_fail_count_rewritten: forbiddenFailRewritten,
    schema_fail_count: schemaFail,
    rewrite_rate: total ? rewriteRequiredCount / total : 0,
    bucket_metrics: bucketMetrics,
    bucket_unknown: bucketUnknown,
    confusion,
    per_pattern_metrics: Object.fromEntries(
      Object.entries(precisionRecall).map(([patternId, stats]) => {
        const precision = stats.tp + stats.fp > 0 ? stats.tp / (stats.tp + stats.fp) : 0;
        const recall = stats.tp + stats.fn > 0 ? stats.tp / (stats.tp + stats.fn) : 0;
        const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
        return [patternId, { precision, recall, f1 }];
      })
    ),
  };

  if (runId) {
    await updateRun(runId, { run_status: "succeeded", metrics: summary as unknown as Record<string, unknown> });
  }

  return { summary, results, runId };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { summary, results } = await runEval(args);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outJson = path.resolve(`./ml_artifacts/eval_${args.dataset}_${timestamp}.json`);
  const outMd = path.resolve(`./ml_artifacts/eval_${args.dataset}_${timestamp}.md`);

  fs.mkdirSync(path.dirname(outJson), { recursive: true });
  fs.writeFileSync(outJson, JSON.stringify({ summary, results }, null, 2));

  const confusionPairs = Object.entries(summary.confusion)
    .flatMap(([expected, row]) =>
      Object.entries(row)
        .filter(([pred]) => pred !== expected)
        .map(([pred, count]) => ({ expected, pred, count }))
    )
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((pair) => `${pair.expected} -> ${pair.pred}: ${pair.count}`);

  const perPatternLines = Object.entries(summary.per_pattern_metrics)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([patternId, metrics]) => {
      const precision = (metrics.precision * 100).toFixed(1);
      const recall = (metrics.recall * 100).toFixed(1);
      const f1 = (metrics.f1 * 100).toFixed(1);
      return `- ${patternId}: precision ${precision}%, recall ${recall}%, f1 ${f1}%`;
    });

  const bucketLines = (Object.keys(summary.bucket_metrics) as BucketLabel[]).map((bucket) => {
    const metrics = summary.bucket_metrics[bucket];
    const selection = (metrics.selection_accuracy * 100).toFixed(1);
    const joint = (metrics.full_joint_success * 100).toFixed(1);
    const grounding = (metrics.grounding_fail_rate * 100).toFixed(1);
    const forbidden = (metrics.forbidden_rate * 100).toFixed(1);
    const schema = (metrics.schema_fail_rate * 100).toFixed(1);
    return `- ${bucket}: total ${metrics.total}, selection ${selection}%, joint ${joint}%, grounding fail ${grounding}%, forbidden fail ${forbidden}%, schema fail ${schema}%`;
  });

  const mdLines = [
    `Eval report for ${args.dataset}`,
    "",
    `Model: ${summary.model}`,
    `Mode: ${args.mode}`,
    ...(args.mode === "pattern_only" ? ["Full checks skipped in pattern_only mode."] : []),
    `Total: ${summary.total}`,
    `Selection accuracy: ${(summary.selection_accuracy * 100).toFixed(1)}%`,
    `Full joint success: ${(summary.full_joint_success * 100).toFixed(1)}%`,
    `Rewrite rate: ${(summary.rewrite_rate * 100).toFixed(1)}%`,
    `Selection ok + full ok: ${summary.selection_ok_full_ok}`,
    `Selection ok + full fail: ${summary.selection_ok_full_fail}`,
    `Selection fail: ${summary.selection_fail}`,
    `Selection ok fail reasons: schema ${summary.selection_ok_full_fail_reasons.schema}, grounding ${summary.selection_ok_full_fail_reasons.grounding}, forbidden ${summary.selection_ok_full_fail_reasons.forbidden}`,
    `Grounding fails (raw): ${summary.grounding_fail_count_raw}`,
    `Grounding fails (rewritten): ${summary.grounding_fail_count_rewritten}`,
    `Forbidden fails (raw): ${summary.forbidden_fail_count_raw}`,
    `Forbidden fails (rewritten): ${summary.forbidden_fail_count_rewritten}`,
    `Schema fails: ${summary.schema_fail_count}`,
    `Bucket unknown: ${summary.bucket_unknown}`,
    "",
    "Bucket metrics:",
    ...bucketLines,
    "",
    "Top confusion pairs:",
    ...(confusionPairs.length > 0 ? confusionPairs.map((line) => `- ${line}`) : ["- none"]),
    "",
    "Per-pattern precision/recall:",
    ...perPatternLines,
  ];
  fs.writeFileSync(outMd, `${mdLines.join("\n")}\n`);

  console.log(`wrote ${outJson}`);
  console.log(`wrote ${outMd}`);
}

main().catch((error) => {
  console.error("Unexpected failure.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
