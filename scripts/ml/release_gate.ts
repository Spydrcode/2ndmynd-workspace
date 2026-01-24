import fs from "node:fs";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

import { runEval } from "./eval_runner";

type Args = {
  model?: string;
  evalDataset: string;
  minAccuracy: number;
  minGrounding: number;
  minJoint: number;
  activate: boolean;
};

const DEFAULTS: Args = {
  evalDataset: "scenario_eval_v1",
  minAccuracy: 0.75,
  minGrounding: 0.95,
  minJoint: 0.7,
  activate: true,
};

function parseArgs(argv: string[]): Args {
  const args = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith("--")) continue;
    if (value === undefined) continue;

    switch (key) {
      case "--model":
        args.model = value;
        break;
      case "--eval_dataset":
        args.evalDataset = value;
        break;
      case "--min_accuracy":
        args.minAccuracy = Number(value);
        break;
      case "--min_grounding":
        args.minGrounding = Number(value);
        break;
      case "--min_joint":
        args.minJoint = Number(value);
        break;
      case "--activate":
        args.activate = value ? value !== "false" : true;
        break;
      default:
        break;
    }
  }
  return args;
}

function ensureEnv() {
  if (!process.env.SUPABASE_URL) {
    console.error("Missing SUPABASE_URL environment variable.");
    process.exit(1);
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing SUPABASE_SERVICE_ROLE_KEY environment variable.");
    process.exit(1);
  }
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

async function activateModel(modelId: string) {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { error } = await supabase
    .schema("ml")
    .from("model_registry")
    .upsert(
      {
        name: "decision_model",
        model_id: modelId,
        status: "active",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "name" }
    );

  if (error) {
    console.error(`Failed to activate model: ${error.message}`);
    return false;
  }

  console.log(`active model set: decision_model -> ${modelId}`);
  return true;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  ensureEnv();

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const model = args.model ?? (await getLatestModel(supabase));
  const { summary } = await runEval({
    dataset: args.evalDataset,
    model,
    rewrite: true,
    strict: true,
  });

  const passAccuracy = summary.accuracy_pattern_id >= args.minAccuracy;
  const passGrounding = summary.grounding_rate >= args.minGrounding;
  const passJoint = summary.joint_success >= args.minJoint;
  const gatePass = passAccuracy && passGrounding && passJoint;

  const confusionPairs = Object.entries(summary.confusion)
    .flatMap(([expected, row]) =>
      Object.entries(row)
        .filter(([pred]) => pred !== expected)
        .map(([pred, count]) => ({ expected, pred, count }))
    )
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((pair) => `${pair.expected} -> ${pair.pred}: ${pair.count}`);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = path.resolve(`./ml_artifacts/release_gate_${timestamp}.md`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const lines = [
    "Release gate report",
    "",
    `Model: ${model}`,
    `Dataset: ${args.evalDataset}`,
    `Accuracy (pattern_id): ${(summary.accuracy_pattern_id * 100).toFixed(1)}%`,
    `Grounding rate: ${(summary.grounding_rate * 100).toFixed(1)}%`,
    `Joint success: ${(summary.joint_success * 100).toFixed(1)}%`,
    `Grounding fails (raw): ${summary.grounding_fail_count_raw}`,
    `Grounding fails (rewritten): ${summary.grounding_fail_count_rewritten}`,
    `Forbidden fails (raw): ${summary.forbidden_fail_count_raw}`,
    `Forbidden fails (rewritten): ${summary.forbidden_fail_count_rewritten}`,
    `Schema fails: ${summary.schema_fail_count}`,
    "",
    `Gate thresholds: accuracy>=${args.minAccuracy}, grounding>=${args.minGrounding}, joint>=${args.minJoint}`,
    `Gate result: ${gatePass ? "PASS" : "FAIL"}`,
    "",
    "Top confusion pairs:",
    ...(confusionPairs.length > 0 ? confusionPairs.map((line) => `- ${line}`) : ["- none"]),
  ];

  fs.writeFileSync(outPath, `${lines.join("\n")}\n`);
  console.log(`wrote ${outPath}`);
  console.log(`GATE: ${gatePass ? "PASS" : "FAIL"}`);

  if (gatePass && args.activate) {
    await activateModel(model);
  }
}

main().catch((error) => {
  console.error("Unexpected failure.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
