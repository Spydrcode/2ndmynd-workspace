import { createClient } from "@supabase/supabase-js";

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

async function main() {
  ensureEnv();

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data: datasets, error: datasetsError } = await supabase
    .schema("ml")
    .from("datasets")
    .select("name,purpose,schema_version,frozen_at,example_ids");

  if (datasetsError) {
    console.error(datasetsError.message);
    process.exit(1);
  }

  const { data: examples, error: examplesError } = await supabase
    .schema("ml")
    .from("examples")
    .select("quality,purpose")
    .limit(200);

  if (examplesError) {
    console.error(examplesError.message);
    process.exit(1);
  }

  const { data: runs, error: runsError } = await supabase
    .schema("ml")
    .from("runs")
    .select("id,run_type,run_status,result_model,dataset_name,created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  if (runsError) {
    console.error(runsError.message);
    process.exit(1);
  }

  const datasetNames = (datasets ?? []).map((row) => row.name);

  const summary = {
    approved: 0,
    draft: 0,
    other: 0,
  };

  for (const row of examples ?? []) {
    if (row.quality === "approved") summary.approved += 1;
    else if (row.quality === "draft") summary.draft += 1;
    else summary.other += 1;
  }

  const latestRun = runs?.[0];
  const latestLine = latestRun
    ? `${latestRun.id} ${latestRun.run_type} ${latestRun.run_status} ${latestRun.result_model ?? ""}`.trim()
    : "none";

  console.log(`datasets: [${datasetNames.join(", ")}]`);
  console.log(
    `examples: approved=${summary.approved}, draft=${summary.draft}, other=${summary.other}`
  );
  console.log(`latest run: ${latestLine}`);
}

main().catch((error) => {
  console.error("Unexpected failure.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
