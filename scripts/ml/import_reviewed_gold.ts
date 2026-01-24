import fs from "node:fs";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

type ReviewEntry = {
  id: string;
  input_snapshot?: unknown;
  target_output_template: {
    conclusion_version: "conclusion_v1";
    pattern_id: string | null;
    one_sentence_pattern: string;
    decision: string;
    boundary: string;
    why_this_now: string;
    confidence: "low" | "medium" | "high";
    forbidden_language_check?: { passed: boolean; notes: string };
  };
};

type Args = {
  input: string;
};

const DEFAULTS: Args = {
  input: "./ml_review/drafts.json",
};

const FORBIDDEN = [
  "dashboard",
  "kpi",
  "analytics",
  "monitor",
  "bi",
  "performance tracking",
];

function parseArgs(argv: string[]): Args {
  const args = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith("--")) continue;
    if (value === undefined) continue;

    switch (key) {
      case "--in":
        args.input = value;
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

function validateEntry(entry: ReviewEntry): string[] {
  const errors: string[] = [];
  const decision = entry.target_output_template?.decision?.trim() ?? "";
  const boundary = entry.target_output_template?.boundary?.trim() ?? "";

  if (!decision) errors.push("decision is required");
  if (!boundary) errors.push("boundary is required");

  const haystack = `${decision} ${boundary} ${
    entry.target_output_template?.one_sentence_pattern ?? ""
  } ${entry.target_output_template?.why_this_now ?? ""}`.toLowerCase();

  for (const term of FORBIDDEN) {
    if (haystack.includes(term)) {
      errors.push(`forbidden term: ${term}`);
    }
  }

  return errors;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  ensureEnv();

  if (!args.input) {
    console.error("Missing input path.");
    process.exit(1);
  }

  const inputPath = path.resolve(args.input);
  if (!fs.existsSync(inputPath)) {
    console.error(`Missing file: ${inputPath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(inputPath, "utf8");
  const entries = JSON.parse(raw) as ReviewEntry[];

  if (!Array.isArray(entries)) {
    console.error("Invalid JSON format: expected an array.");
    process.exit(1);
  }

  const invalid = entries
    .map((entry, index) => ({
      id: entry.id,
      index,
      errors: validateEntry(entry),
    }))
    .filter((result) => result.errors.length > 0);

  if (invalid.length > 0) {
    console.error(`Validation failed for ${invalid.length} entries.`);
    process.exit(1);
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );

  let updated = 0;

  for (const entry of entries) {
    const { error } = await supabase
      .schema("ml")
      .from("examples")
      .update({
        target_output: entry.target_output_template,
        quality: "approved",
      })
      .eq("id", entry.id);

    if (error) {
      console.error(`Update failed: ${error.message}`);
      process.exit(1);
    }

    updated += 1;
  }

  console.log(`updated ${updated} examples`);
}

main().catch((error) => {
  console.error("Unexpected failure.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
