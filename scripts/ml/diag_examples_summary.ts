
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

function countBy(arr, key) {
  const counts = {};
  for (const item of arr) {
    const val = item[key] ?? "null";
    counts[val] = (counts[val] || 0) + 1;
  }
  return counts;
}

function countTriple(arr) {
  const counts = {};
  for (const item of arr) {
    const k = `${item.quality ?? "null"}|${item.purpose ?? "null"}|${item.schema_version ?? "null"}`;
    counts[k] = (counts[k] || 0) + 1;
  }
  return counts;
}

async function main() {
  // Parse args for --in
  const args = process.argv.slice(2);
  let draftsPath = "./ml_review/drafts.json";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--in" && args[i + 1]) draftsPath = args[i + 1];
  }
  const inputPath = path.resolve(draftsPath);
  if (!fs.existsSync(inputPath)) {
    console.error(`Missing file: ${inputPath}`);
    process.exit(1);
  }
  const drafts = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const draftIds = drafts.map((d) => d.id);

  // Fetch up to 5000 examples
  const { data: allExamples, error } = await supabase
    .schema("ml")
    .from("examples")
    .select("id, quality, purpose, schema_version")
    .limit(5000);
  if (error) {
    console.error("Failed to fetch examples:", error.message);
    process.exit(1);
  }

  // All summaries
  console.log("quality:", countBy(allExamples, "quality"));
  console.log("purpose:", countBy(allExamples, "purpose"));
  console.log("schema_version:", countBy(allExamples, "schema_version"));
  console.log("triple:", countTriple(allExamples));

  // Drafts subset
  const draftSubset = allExamples.filter((ex) => draftIds.includes(ex.id));
  console.log("drafts subset - quality:", countBy(draftSubset, "quality"));
  console.log("drafts subset - purpose:", countBy(draftSubset, "purpose"));
  console.log("drafts subset - schema_version:", countBy(draftSubset, "schema_version"));
  console.log("drafts subset - triple:", countTriple(draftSubset));

  // Drafts found/missing
  const foundIds = new Set(draftSubset.map((ex) => ex.id));
  const missingIds = draftIds.filter((id) => !foundIds.has(id));
  console.log(`draftIds total: ${draftIds.length}, found: ${draftSubset.length}, missing: ${missingIds.length}`);
  if (draftSubset.length === 0) {
    console.error("No draftIds found in examples.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Diagnostics failed:", err);
  process.exit(1);
});
