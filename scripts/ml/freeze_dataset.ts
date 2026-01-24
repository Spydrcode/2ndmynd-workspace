import { createClient } from "@supabase/supabase-js";

type Args = {
  name: string;
  purpose: "train" | "eval";
  schemaVersion: string;
  quality: "approved" | "draft" | "reviewed" | "retired";
};

const DEFAULTS: Args = {
  name: "train_v1",
  purpose: "train",
  schemaVersion: "snapshot_v1",
  quality: "approved",
};

function parseArgs(argv: string[]): Args {
  const args = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith("--")) continue;
    if (value === undefined) continue;

    switch (key) {
      case "--name":
        args.name = value;
        break;
      case "--purpose":
        args.purpose = value as Args["purpose"];
        break;
      case "--schema_version":
        args.schemaVersion = value;
        break;
      case "--quality":
        args.quality = value as Args["quality"];
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

function ensureArgs(args: Args) {
  if (!args.name) {
    console.error("Missing dataset name.");
    process.exit(1);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  ensureEnv();
  ensureArgs(args);

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );

  const { data, error } = await supabase
    .schema("ml")
    .from("examples")
    .select("id")
    .eq("purpose", args.purpose)
    .eq("schema_version", args.schemaVersion)
    .eq("quality", args.quality);

  if (error) {
    console.error(`Fetch failed: ${error.message}`);
    process.exit(1);
  }

  const exampleIds = (data ?? []).map((row) => row.id);

  const payload = {
    name: args.name,
    purpose: args.purpose,
    schema_version: args.schemaVersion,
    description: `Frozen dataset for ${args.purpose} at ${args.schemaVersion}.`,
    example_ids: exampleIds,
    frozen_at: new Date().toISOString(),
  };

  const { error: upsertError } = await supabase
    .schema("ml")
    .from("datasets")
    .upsert(payload, { onConflict: "name" });

  if (upsertError) {
    console.error(`Freeze failed: ${upsertError.message}`);
    process.exit(1);
  }

  console.log(`frozen ${exampleIds.length} examples`);
}

main().catch((error) => {
  console.error("Unexpected failure.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
