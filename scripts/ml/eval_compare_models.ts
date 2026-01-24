import fs from "node:fs";
import path from "node:path";

import minimist from "minimist";
import { createClient } from "@supabase/supabase-js";

import { runEval, EvalSummary } from "./eval_runner";
import { BucketLabel } from "./eval/buckets";

type Args = {
  dataset: string;
  mode: "full" | "pattern_only";
  models: string[];
  includeActive: boolean;
  includeBase: boolean;
  out?: string;
};

const DEFAULTS: Args = {
  dataset: "scenario_eval_v1",
  mode: "full",
  models: [],
  includeActive: true,
  includeBase: true,
  out: undefined,
};

const BASE_MODEL = "gpt-4o-mini-2024-07-18";

function parseBoolean(value: unknown, fallback: boolean) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value !== "false";
  return fallback;
}

function parseArgs(argv: string[]): Args {
  const parsed = minimist(argv, {
    string: ["dataset", "mode", "models", "model", "out"],
    default: {
      dataset: DEFAULTS.dataset,
      mode: DEFAULTS.mode,
      include_active: DEFAULTS.includeActive,
      include_base: DEFAULTS.includeBase,
    },
  });

  const mode = parsed.mode === "pattern_only" || parsed.mode === "full" ? parsed.mode : DEFAULTS.mode;
  const explicitModels: string[] = [];
  if (parsed.model) {
    const list = Array.isArray(parsed.model) ? parsed.model : [parsed.model];
    for (const item of list) {
      if (typeof item === "string") explicitModels.push(item);
    }
  }
  if (parsed.models && typeof parsed.models === "string") {
    explicitModels.push(...parsed.models.split(",").map((item: string) => item.trim()).filter(Boolean));
  }

  return {
    dataset: parsed.dataset ?? DEFAULTS.dataset,
    mode,
    models: explicitModels,
    includeActive: parseBoolean(parsed.include_active, DEFAULTS.includeActive),
    includeBase: parseBoolean(parsed.include_base, DEFAULTS.includeBase),
    out: parsed.out ?? DEFAULTS.out,
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

async function getActiveModel() {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

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

function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function topConfusions(summary: EvalSummary, limit = 5) {
  return Object.entries(summary.confusion)
    .flatMap(([expected, row]) =>
      Object.entries(row)
        .filter(([pred]) => pred !== expected)
        .map(([pred, count]) => ({ expected, pred, count }))
    )
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  ensureEnv();

  const modelSet = new Set<string>();
  if (args.includeBase) modelSet.add(BASE_MODEL);
  if (args.includeActive) {
    const active = await getActiveModel();
    if (active) modelSet.add(active);
  }
  for (const model of args.models) {
    modelSet.add(model);
  }

  const models = Array.from(modelSet);
  if (models.length === 0) {
    console.error("No models resolved. Provide --models or enable --include_base/--include_active.");
    process.exit(1);
  }

  const summaries: EvalSummary[] = [];
  for (const model of models) {
    const { summary } = await runEval({
      dataset: args.dataset,
      mode: args.mode,
      model,
      repeats: 1,
      rewrite: true,
      strict: true,
    });
    summaries.push(summary);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = args.out ?? `./ml_artifacts/eval_compare_${timestamp}.md`;

  const tableLines = [
    "| model_id | selection_accuracy | full_joint_success | forbidden_rate | grounding_fail_rate | schema_fail_rate | rewrite_rate |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...summaries.map((summary) => {
      const forbiddenRate = summary.total ? summary.forbidden_fail_count_rewritten / summary.total : 0;
      const groundingRate = summary.total ? summary.grounding_fail_count_rewritten / summary.total : 0;
      const schemaRate = summary.total ? summary.schema_fail_count / summary.total : 0;
      return `| ${summary.model} | ${percent(summary.selection_accuracy)} | ${percent(summary.full_joint_success)} | ${percent(forbiddenRate)} | ${percent(groundingRate)} | ${percent(schemaRate)} | ${percent(summary.rewrite_rate)} |`;
    }),
  ];

  const buckets: BucketLabel[] = ["clean", "mixed", "counterexample", "fallback"];
  const bucketLines: string[] = [];
  for (const summary of summaries) {
    bucketLines.push(`### ${summary.model}`);
    bucketLines.push("| bucket | total | selection_accuracy | full_joint_success | grounding_fail_rate | forbidden_rate | schema_fail_rate |");
    bucketLines.push("| --- | --- | --- | --- | --- | --- | --- |");
    for (const bucket of buckets) {
      const metrics = summary.bucket_metrics[bucket];
      bucketLines.push(
        `| ${bucket} | ${metrics.total} | ${percent(metrics.selection_accuracy)} | ${percent(metrics.full_joint_success)} | ${percent(metrics.grounding_fail_rate)} | ${percent(metrics.forbidden_rate)} | ${percent(metrics.schema_fail_rate)} |`
      );
    }
    bucketLines.push("");
  }

  const confusionLines: string[] = [];
  for (const summary of summaries) {
    confusionLines.push(`### ${summary.model}`);
    const pairs = topConfusions(summary);
    if (pairs.length === 0) {
      confusionLines.push("- none");
    } else {
      for (const pair of pairs) {
        confusionLines.push(`- ${pair.expected} -> ${pair.pred}: ${pair.count}`);
      }
    }
    confusionLines.push("");
  }

  const best = summaries.reduce((current, next) =>
    next.full_joint_success > current.full_joint_success ? next : current
  );
  const baseline = summaries.find((summary) => summary.model === BASE_MODEL) ?? summaries[0];
  const regressionFlags: string[] = [];

  for (const summary of summaries) {
    if (summary.model === baseline.model) continue;
    for (const bucket of buckets) {
      const baselineScore = baseline.bucket_metrics[bucket].full_joint_success;
      const candidateScore = summary.bucket_metrics[bucket].full_joint_success;
      if (baselineScore - candidateScore > 0.05) {
        regressionFlags.push(`${summary.model} regressed >5% on ${bucket} vs baseline`);
      }
    }
  }

  const mdLines = [
    `# Eval compare report`,
    ``,
    `Dataset: ${args.dataset}`,
    `Mode: ${args.mode}`,
    `Timestamp: ${timestamp}`,
    ``,
    `## Overall metrics`,
    ...tableLines,
    ``,
    `## Bucket metrics`,
    ...bucketLines,
    `## Top confusions`,
    ...confusionLines,
    `## Conclusion`,
    `Best model by full_joint_success: ${best.model} (${percent(best.full_joint_success)})`,
    ...(regressionFlags.length > 0 ? regressionFlags.map((line) => `- ${line}`) : ["- No bucket regressions >5% vs baseline."]),
  ];

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${mdLines.join(\"\\n\")}\\n`);
  console.log(`wrote ${outPath}`);
}

main().catch((error) => {
  console.error("Unexpected failure.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
