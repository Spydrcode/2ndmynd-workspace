import { createClient } from "@supabase/supabase-js";

import "dotenv/config";

import { importScenarioPacks } from "./import_scenario_packs";

type Args = {
  packsDir: string;
};

const DEFAULTS: Args = {
  packsDir: "./ml_scenarios",
};

function parseArgs(argv: string[]): Args {
  const args = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith("--")) continue;

    if (key === "--packs_dir" && value) {
      args.packsDir = value;
    }
  }
  return args;
}

function ensureEnv() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variable.");
    process.exit(1);
  }
}

async function countScenarioEvalMeta(supabase: ReturnType<typeof createClient>) {
  const { data: dataset, error } = await supabase
    .schema("ml")
    .from("datasets")
    .select("example_ids")
    .eq("name", "scenario_eval_v1")
    .maybeSingle();

  if (error) {
    console.error(`Failed to load scenario_eval_v1: ${error.message}`);
    process.exit(1);
  }

  const exampleIds = (dataset?.example_ids ?? []) as string[];
  if (exampleIds.length === 0) {
    return { total: 0, metaNull: 0 };
  }

  const { count: metaNull, error: metaError } = await supabase
    .schema("ml")
    .from("examples")
    .select("id", { count: "exact", head: true })
    .in("id", exampleIds)
    .is("meta", null);

  if (metaError) {
    console.error(`Failed to count meta null: ${metaError.message}`);
    process.exit(1);
  }

  return { total: exampleIds.length, metaNull: metaNull ?? 0 };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  ensureEnv();

  const result = await importScenarioPacks({
    dataset: "scenario_eval_v1",
    purpose: "eval",
    packsDir: args.packsDir,
    mode: "upsert",
    rebuildDataset: true,
  });

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const metaCounts = await countScenarioEvalMeta(supabase);

  console.log(`eval packs found: ${result.selectedPacks}`);
  console.log(`eval examples upserted: ${result.inserted + result.updated}`);
  console.log(`scenario_eval_v1 examples: ${metaCounts.total}`);
  console.log(`scenario_eval_v1 meta null: ${metaCounts.metaNull}`);
}

main().catch((error) => {
  console.error("Unexpected failure.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
