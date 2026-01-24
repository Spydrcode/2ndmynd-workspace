import { createClient } from "@supabase/supabase-js";

require("dotenv").config();

type ColumnInfo = { column_name: string };

type MetaPayload = {
  bucket_unknown: boolean;
  backfilled_at: string;
  backfill_version: number;
};

const BATCH_SIZE = 200;

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

function chunk<T>(items: T[], size: number) {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

async function getExampleColumns(supabase: ReturnType<typeof createClient>) {
  const { data, error } = await supabase
    .schema("information_schema")
    .from("columns")
    .select("column_name")
    .eq("table_schema", "ml")
    .eq("table_name", "examples");

  if (error) {
    console.error(`Failed to load columns: ${error.message}`);
    process.exit(1);
  }

  const columns = new Set((data ?? []).map((row: ColumnInfo) => row.column_name));
  return columns;
}

async function main() {
  ensureEnv();

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const columns = await getExampleColumns(supabase);

  let query = supabase
    .schema("ml")
    .from("examples")
    .select("id", { count: "exact" })
    .is("meta", null);

  if (columns.has("schema_version")) {
    query = query.eq("schema_version", "snapshot_v1");
  }
  if (columns.has("purpose")) {
    query = query.in("purpose", ["train", "eval"]);
  }
  if (columns.has("tags")) {
    query = query.contains("tags", ["scenario_pack"]);
  }

  const { data: idRows, count, error: listError } = await query;

  if (listError) {
    console.error(`Failed to query examples: ${listError.message}`);
    process.exit(1);
  }

  const ids = (idRows ?? []).map((row: { id: string }) => row.id);
  const total = count ?? ids.length;
  let updated = 0;
  const updatedIds: string[] = [];

  const now = new Date().toISOString();
  const payload: MetaPayload = {
    bucket_unknown: true,
    backfilled_at: now,
    backfill_version: 1,
  };

  for (const batch of chunk(ids, BATCH_SIZE)) {
    if (batch.length === 0) continue;
    const { error: updateError } = await supabase
      .schema("ml")
      .from("examples")
      .update({ meta: payload })
      .in("id", batch)
      .is("meta", null);

    if (updateError) {
      console.error(`Failed to update batch: ${updateError.message}`);
      process.exit(1);
    }

    updated += batch.length;
    for (const id of batch) {
      if (updatedIds.length < 5) updatedIds.push(id);
    }
  }

  console.log(`scanned: ${total}`);
  console.log(`updated: ${updated}`);
  console.log(`sample_ids: ${updatedIds.join(", ") || "none"}`);
}

main().catch((error) => {
  console.error("Unexpected failure.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
