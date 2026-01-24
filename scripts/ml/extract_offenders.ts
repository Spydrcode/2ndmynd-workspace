import fs from "node:fs";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

import { scanObjectForForbidden } from "./lib/forbidden";

type Args = {
  runId?: string;
  smokeCycleId?: string;
  out: string;
};

const DEFAULTS: Args = {
  out: "./ml_artifacts/offenders_latest.json",
};

function parseArgs(argv: string[]): Args {
  const args: Args = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith("--")) continue;

    switch (key) {
      case "--run_id":
        if (value) args.runId = value;
        break;
      case "--smoke_cycle_id":
        if (value) args.smokeCycleId = value;
        break;
      case "--out":
        if (value) args.out = value;
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

function increment(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  ensureEnv();

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  let runId = args.runId;
  if (!runId) {
    const { data: latestRun, error: runError } = await supabase
      .schema("ml")
      .from("runs")
      .select("id")
      .eq("run_type", "finetune")
      .eq("run_status", "succeeded")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (runError || !latestRun) {
      console.error("No succeeded finetune run found.");
      process.exit(1);
    }

    runId = latestRun.id;
  }

  let smokeCycleId = args.smokeCycleId;
  if (!smokeCycleId) {
    const { data: latestCycle, error: cycleError } = await supabase
      .schema("ml")
      .from("run_results")
      .select("smoke_cycle_id")
      .eq("run_id", runId)
      .not("smoke_cycle_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cycleError || !latestCycle?.smoke_cycle_id) {
      console.error("No smoke_cycle_id found for run.");
      process.exit(1);
    }

    smokeCycleId = latestCycle.smoke_cycle_id as string;
  }

  const { data: results, error: resultsError } = await supabase
    .schema("ml")
    .from("run_results")
    .select("output")
    .eq("run_id", runId)
    .eq("smoke_cycle_id", smokeCycleId);

  if (resultsError) {
    console.error(resultsError.message);
    process.exit(1);
  }

  const termCounts: Record<string, number> = {};
  const fieldCounts: Record<string, number> = {};
  const termFieldCounts: Record<string, number> = {};

  for (const row of results ?? []) {
    const scan = scanObjectForForbidden(row.output);
    for (const term of scan.terms) increment(termCounts, term);
    for (const field of scan.fields) increment(fieldCounts, field);

    for (const term of scan.terms) {
      for (const field of scan.fields) {
        increment(termFieldCounts, `${term}::${field}`);
      }
    }
  }

  const output = {
    run_id: runId,
    smoke_cycle_id: smokeCycleId,
    term_counts: termCounts,
    field_counts: fieldCounts,
    term_field_counts: termFieldCounts,
  };

  const outPath = path.resolve(args.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));

  const topTerms = Object.entries(termCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([term, count]) => `${term}:${count}`);

  const topFields = Object.entries(fieldCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([field, count]) => `${field}:${count}`);

  console.log(`top terms: ${topTerms.join(", ")}`);
  console.log(`top fields: ${topFields.join(", ")}`);
}

main().catch((error) => {
  console.error("Unexpected failure.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
