import fs from "node:fs";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

type Args = {
  runId?: string;
  smokeCycleId?: string;
  limit: number;
  out: string;
};

const DEFAULTS: Args = {
  runId: "9b1493cc-6444-44f4-87ac-560cd41b4652",
  limit: 50,
  out: "./ml_artifacts/forbidden_offenders_latest.json",
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
      case "--limit":
        if (value) args.limit = Number(value);
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

  if (!args.runId) {
    console.error("Missing --run_id.");
    process.exit(1);
  }
  if (!Number.isFinite(args.limit) || args.limit <= 0) {
    console.error("Invalid --limit value.");
    process.exit(1);
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  let smokeCycleId = args.smokeCycleId;
  if (!smokeCycleId) {
    const { data: latestCycle, error: cycleError } = await supabase
      .schema("ml")
      .from("run_results")
      .select("smoke_cycle_id")
      .eq("run_id", args.runId)
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

  const { data: results, error } = await supabase
    .schema("ml")
    .from("run_results")
    .select("example_id, scores")
    .eq("run_id", args.runId)
    .eq("smoke_cycle_id", smokeCycleId)
    .order("created_at", { ascending: false })
    .limit(args.limit);

  if (error) {
    console.error(`Fetch failed: ${error.message}`);
    process.exit(1);
  }

  const termCounts: Record<string, number> = {};
  const fieldCounts: Record<string, number> = {};
  const termFieldCounts: Record<string, number> = {};
  const exampleIdsByTerm: Record<string, string[]> = {};
  const failingExampleIds = new Set<string>();

  let fails = 0;
  for (const row of results ?? []) {
    const scores = row.scores as any;
    const terms: string[] = scores?.forbidden_terms ?? [];
    const fields: string[] = scores?.forbidden_fields ?? [];

    if (terms.length > 0) {
      fails += 1;
      failingExampleIds.add(row.example_id);
    }

    for (const term of terms) {
      increment(termCounts, term);
      if (!exampleIdsByTerm[term]) exampleIdsByTerm[term] = [];
      if (!exampleIdsByTerm[term].includes(row.example_id)) {
        exampleIdsByTerm[term].push(row.example_id);
      }
    }
    for (const field of fields) increment(fieldCounts, field);

    for (const term of terms) {
      for (const field of fields) {
        increment(termFieldCounts, `${term}::${field}`);
      }
    }
  }

  const output = {
    run_id: args.runId,
    smoke_cycle_id: smokeCycleId,
    total_rows: results?.length ?? 0,
    fails,
    term_counts: termCounts,
    field_counts: fieldCounts,
    term_field_counts: termFieldCounts,
    example_ids_by_term: exampleIdsByTerm,
  };

  const outPath = path.resolve(args.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));

  const uniqueTerms = Object.keys(termCounts).length;
  const topPairs = Object.entries(termFieldCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([pair, count]) => `${pair}:${count}`);

  console.log(`total rows: ${results?.length ?? 0}`);
  console.log(`fails: ${fails}`);
  console.log(`unique terms: ${uniqueTerms}`);
  console.log(`top term_field pairs: ${topPairs.join(", ")}`);
  console.log(
    `failed example_ids (max 20): ${Array.from(failingExampleIds).slice(0, 20).join(", ")}`
  );
}

main().catch((error) => {
  console.error("Unexpected failure.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
