import { createClient } from "@supabase/supabase-js";

require('dotenv').config();

type Args = {
  name: string;
  model?: string;
  status: string;
  notes?: string;
};

const DEFAULTS: Args = {
  name: "decision_model",
  status: "active",
};

function parseArgs(argv: string[]): Args {
  const args: Args = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith("--")) continue;

    switch (key) {
      case "--name":
        if (value) args.name = value;
        break;
      case "--model":
        if (value) args.model = value;
        break;
      case "--status":
        if (value) args.status = value;
        break;
      case "--notes":
        if (value) args.notes = value;
        break;
      default:
        break;
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  ensureEnv();

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  let modelId = args.model;
  if (!modelId) {
    modelId = await getLatestModel(supabase);
  }

  const { error } = await supabase
    .schema("ml")
    .from("model_registry")
    .upsert(
      {
        name: args.name,
        model_id: modelId,
        status: args.status,
        notes: args.notes ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "name" }
    );

  if (error) {
    console.error(`Failed to set active model: ${error.message}`);
    process.exit(1);
  }

  console.log(`active model set: ${args.name} -> ${modelId}`);
}

main().catch((error) => {
  console.error("Unexpected failure.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
