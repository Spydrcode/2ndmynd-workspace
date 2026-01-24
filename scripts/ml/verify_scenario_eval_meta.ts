import { createClient } from "@supabase/supabase-js";

import "dotenv/config";

import { bucketForMeta, BucketLabel } from "./eval/buckets";

type DatasetRow = {
  example_ids: string[] | null;
};

type ExampleRow = {
  id: string;
  meta: Record<string, unknown> | null;
};

function ensureEnv() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variable.");
    process.exit(1);
  }
}

async function main() {
  ensureEnv();

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data: dataset, error: datasetError } = await supabase
    .schema("ml")
    .from("datasets")
    .select("example_ids")
    .eq("name", "scenario_eval_v1")
    .maybeSingle();

  if (datasetError) {
    console.error(`Failed to load scenario_eval_v1: ${datasetError.message}`);
    process.exit(1);
  }

  const exampleIds = (dataset as DatasetRow | null)?.example_ids ?? [];
  if (exampleIds.length === 0) {
    console.log("scenario_eval_v1 examples: 0");
    console.log("meta null: 0");
    console.log("bucket_unknown: 0");
    console.log("clean: 0");
    console.log("mixed: 0");
    console.log("counterexample: 0");
    console.log("fallback: 0");
    return;
  }

  const { data: examples, error: examplesError } = await supabase
    .schema("ml")
    .from("examples")
    .select("id, meta")
    .in("id", exampleIds);

  if (examplesError) {
    console.error(`Failed to load examples: ${examplesError.message}`);
    process.exit(1);
  }

  let metaNull = 0;
  let bucketUnknown = 0;
  const bucketCounts: Record<BucketLabel, number> = {
    clean: 0,
    mixed: 0,
    counterexample: 0,
    fallback: 0,
  };

  for (const example of examples as ExampleRow[]) {
    if (!example.meta) {
      metaNull += 1;
      bucketUnknown += 1;
      bucketCounts.clean += 1;
      continue;
    }

    const { bucket, unknown } = bucketForMeta(example.meta);
    if (unknown) bucketUnknown += 1;
    bucketCounts[bucket] += 1;
  }

  console.log(`scenario_eval_v1 examples: ${exampleIds.length}`);
  console.log(`meta null: ${metaNull}`);
  console.log(`bucket_unknown: ${bucketUnknown}`);
  console.log(`clean: ${bucketCounts.clean}`);
  console.log(`mixed: ${bucketCounts.mixed}`);
  console.log(`counterexample: ${bucketCounts.counterexample}`);
  console.log(`fallback: ${bucketCounts.fallback}`);
}

main().catch((error) => {
  console.error("Unexpected failure.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
