import { createClient } from "@supabase/supabase-js";
require('dotenv').config();

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith("--")) continue;
    args[key.replace(/^--/, "")] = value ?? "";
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const model = args.model ?? args.m;
  const status = args.status ?? "succeeded";
  const dataset = args.dataset ?? "train_v1";

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env");
    process.exit(1);
  }

  if (!model) {
    console.error("--model is required");
    process.exit(1);
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const payload = {
    run_type: "finetune",
    run_status: status,
    base_model: null,
    result_model: model,
    dataset_name: dataset,
    metrics: {},
  };

  const { data, error } = await supabase.schema("ml").from("runs").insert(payload).select("id").maybeSingle();
  if (error) {
    console.error("Failed to insert run:", error.message);
    process.exit(1);
  }

  console.log(`inserted run id: ${data?.id}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
