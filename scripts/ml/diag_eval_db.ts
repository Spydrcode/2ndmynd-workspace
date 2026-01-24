import { createClient } from "@supabase/supabase-js";

require("dotenv").config();

type ColumnInfo = { column_name: string };

type DatasetRow = {
  name: string;
  example_ids: string[] | null;
};

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

async function getColumns(supabase: ReturnType<typeof createClient>, tableName: string) {
  const { data, error } = await supabase
    .schema("information_schema")
    .from("columns")
    .select("column_name")
    .eq("table_schema", "ml")
    .eq("table_name", tableName);

  if (error) {
    console.error(`Failed to load columns for ${tableName}: ${error.message}`);
    process.exit(1);
  }

  return new Set((data ?? []).map((row: ColumnInfo) => row.column_name));
}

async function countExamples(
  supabase: ReturnType<typeof createClient>,
  exampleIds: string[],
  filter?: (query: any) => any
) {
  if (exampleIds.length === 0) return 0;

  let query = supabase.schema("ml").from("examples").select("id", { count: "exact", head: true }).in("id", exampleIds);
  if (filter) {
    query = filter(query);
  }

  const { count, error } = await query;
  if (error) {
    console.error(`Failed to count examples: ${error.message}`);
    process.exit(1);
  }

  return count ?? 0;
}

async function main() {
  ensureEnv();

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const runsColumns = await getColumns(supabase, "runs");
  const examplesColumns = await getColumns(supabase, "examples");

  const runsOk = ["run_type", "model_id", "dataset_name", "eval_mode", "notes"].every((col) => runsColumns.has(col));
  const examplesMetaOk = examplesColumns.has("meta");

  const { data: dataset, error: datasetError } = await supabase
    .schema("ml")
    .from("datasets")
    .select("name, example_ids")
    .eq("name", "scenario_eval_v1")
    .maybeSingle();

  if (datasetError) {
    console.error(`Failed to load scenario_eval_v1: ${datasetError.message}`);
    process.exit(1);
  }

  const exampleIds = (dataset as DatasetRow | null)?.example_ids ?? [];
  const totalExamples = exampleIds.length;

  let metaNullCount = 0;
  let bucketUnknownCount = 0;

  if (examplesMetaOk && exampleIds.length > 0) {
    metaNullCount = await countExamples(supabase, exampleIds, (query) => query.is("meta", null));
    bucketUnknownCount = await countExamples(supabase, exampleIds, (query) =>
      query.contains("meta", { bucket_unknown: true })
    );
  }

  console.log(`runs_columns_ok: ${runsOk}`);
  console.log(`examples_meta_ok: ${examplesMetaOk}`);
  console.log(`scenario_eval_v1_count: ${totalExamples}`);
  console.log(`scenario_eval_v1_meta_null: ${metaNullCount}`);
  console.log(`scenario_eval_v1_bucket_unknown: ${bucketUnknownCount}`);
}

main().catch((error) => {
  console.error("Unexpected failure.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
