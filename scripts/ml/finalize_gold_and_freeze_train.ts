import fs from "node:fs";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

type TargetOutput = {
  conclusion_version: "conclusion_v1";
  pattern_id: string | null;
  one_sentence_pattern: string;
  decision: string;
  boundary: string;
  why_this_now: string;
};

async function main() {
  const args = { input: "./ml_review/drafts.json", name: "train_v1", schemaVersion: "snapshot_v1" };
  const inputPath = path.resolve(args.input);
  if (!fs.existsSync(inputPath)) {
    console.error(`Missing file: ${inputPath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(inputPath, "utf8");
  const entries = JSON.parse(raw);
  if (!Array.isArray(entries)) {
    console.error("Invalid JSON format: expected an array.");
    process.exit(1);
  }

  // Validate entries
  function validateEntry(entry) {
    const errors = [];
    if (!entry.target_output?.decision) errors.push("decision is required");
    if (!entry.target_output?.boundary) errors.push("boundary is required");
    if (!entry.target_output?.why_this_now) errors.push("why_this_now is required");
    return errors;
  }
  const invalid = entries.map((entry) => ({ id: entry.id, errors: validateEntry(entry) })).filter((result) => result.errors.length > 0);
  if (invalid.length > 0) {
    console.error(invalid.map((item) => `${item.id}: ${item.errors.join(", ")}`).join("\n"));
    process.exit(1);
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  let updated = 0;
  for (const entry of entries) {
    const { error } = await supabase
      .schema("ml")
      .from("examples")
      .update({
        quality: "approved",
        target_output: entry.target_output,
        purpose: "train",
        schema_version: args.schemaVersion,
      })
      .eq("id", entry.id);
    if (error) {
      console.error(`Update failed for ${entry.id}: ${error.message}`);
      process.exit(1);
    }
    updated += 1;
  }

  // Freeze dataset
  const ids = entries.map(e => e.id);
  const { error: datasetError } = await supabase
    .schema("ml")
    .from("datasets")
    .upsert(
      {
        name: args.name,
        purpose: "train",
        schema_version: args.schemaVersion,
        example_ids: ids,
        frozen_at: new Date().toISOString(),
      },
      { onConflict: "name" }
    );
  if (datasetError) {
    console.error(`Freeze failed: ${datasetError.message}`);
    process.exit(1);
  }

  // Confirm freeze
  const { data: dataset, error: datasetReadError } = await supabase
    .schema("ml")
    .from("datasets")
    .select("example_ids")
    .eq("name", args.name)
    .single();
  if (datasetReadError) {
    console.error(`Failed to read back dataset: ${datasetReadError.message}`);
    process.exit(1);
  }
  if (!dataset || !dataset.example_ids || dataset.example_ids.length !== ids.length) {
    console.error(`Mismatch: expected ${ids.length} example_ids, got ${dataset?.example_ids?.length ?? 0}`);
    process.exit(1);
  }
  console.log(`validated ${entries.length} entries`);
  console.log(`updated ${updated} examples to approved`);
  console.log(`train_v1 frozen with ${ids.length} example_ids`);
}

main().catch((error) => {
  console.error("Unexpected failure.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

main().catch((error) => {
  console.error("Unexpected failure.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
