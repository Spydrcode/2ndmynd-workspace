import fs from "node:fs";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

type Args = {
  limit: number;
  out: string;
};

const DEFAULTS: Args = {
  limit: 20,
  out: "./ml_review/drafts.json",
};

function parseArgs(argv: string[]): Args {
  const args = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith("--")) continue;
    if (value === undefined) continue;

    switch (key) {
      case "--limit":
        args.limit = Number(value);
        break;
      case "--out":
        args.out = value;
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

function ensureValidArgs(args: Args) {
  if (!Number.isFinite(args.limit) || args.limit <= 0) {
    console.error("Invalid limit.");
    process.exit(1);
  }
  if (!args.out) {
    console.error("Invalid output path.");
    process.exit(1);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  ensureEnv();
  ensureValidArgs(args);

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
    .select("id, input_snapshot")
    .eq("quality", "draft")
    .eq("purpose", "train")
    .order("created_at", { ascending: false })
    .limit(args.limit);

  if (error) {
    console.error(`Export failed: ${error.message}`);
    process.exit(1);
  }

  const payload = (data ?? []).map((row) => ({
    id: row.id,
    input_snapshot: row.input_snapshot,
    target_output_template: {
      conclusion_version: "conclusion_v1",
      pattern_id: null,
      one_sentence_pattern: "",
      decision: "",
      boundary: "",
      why_this_now: "",
      confidence: "low",
      forbidden_language_check: { passed: true, notes: "" },
    },
  }));

  const outPath = path.resolve(args.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));

  console.log(`exported ${payload.length} drafts`);
}

main().catch((error) => {
  console.error("Unexpected failure.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
