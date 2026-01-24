import fs from "node:fs";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

require('dotenv').config();

type Args = {
  runId?: string;
  smokeCycleId?: string;
  byExample: boolean;
  latest: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { byExample: true, latest: false };
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
      case "--by-example":
        args.byExample = value ? value !== "false" : true;
        break;
      case "--latest":
        args.latest = true;
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  ensureEnv();

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  let runId = args.runId;
  let smokeCycleId = args.smokeCycleId;
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
    .select("pass, scores, example_id")
    .eq("run_id", runId)
    .eq("smoke_cycle_id", smokeCycleId);

  if (resultsError) {
    console.error(`Fetch failed: ${resultsError.message}`);
    process.exit(1);
  }

  const totalAttempts = results?.length ?? 0;
  const attemptPasses = results?.filter((row) => row.pass).length ?? 0;
  const attemptFails = totalAttempts - attemptPasses;
  let rawPasses = 0;
  let hasRawPass = false;

  const reasons = {
    json_parse: 0,
    required_keys: 0,
    missing_decision: 0,
    missing_boundary: 0,
    forbidden_terms: 0,
    schema_invalid: 0,
  };

  const termCounts: Record<string, number> = {};
  const fieldCounts: Record<string, number> = {};
  const exampleReasonFlags = new Map<string, typeof reasons>();
  const examplePass = new Map<string, boolean>();

  for (const row of results ?? []) {
    const scores = row.scores as any;
    const exampleId = row.example_id as string;
    if (typeof scores?.pass_raw === "boolean") {
      hasRawPass = true;
      if (scores.pass_raw) rawPasses += 1;
    }
    const forbiddenTerms =
      scores?.forbidden_terms_rewritten ?? scores?.forbidden_terms ?? [];
    const forbiddenFields =
      scores?.forbidden_fields_rewritten ?? scores?.forbidden_fields ?? [];
    if (!scores?.json_parse) reasons.json_parse += 1;
    if (scores?.required_keys === false) reasons.required_keys += 1;
    if (!scores?.has_decision) reasons.missing_decision += 1;
    if (!scores?.has_boundary) reasons.missing_boundary += 1;
    if (forbiddenTerms.length > 0) reasons.forbidden_terms += 1;
    if (scores?.schema_ok_rewritten === false || scores?.schema_ok === false) {
      reasons.schema_invalid += 1;
    }

    for (const term of forbiddenTerms) {
      termCounts[term] = (termCounts[term] ?? 0) + 1;
    }
    for (const field of forbiddenFields) {
      fieldCounts[field] = (fieldCounts[field] ?? 0) + 1;
    }

    if (args.byExample) {
      if (!exampleReasonFlags.has(exampleId)) {
        exampleReasonFlags.set(exampleId, {
          json_parse: 0,
          required_keys: 0,
          missing_decision: 0,
          missing_boundary: 0,
          forbidden_terms: 0,
          schema_invalid: 0,
        });
      }
      const flags = exampleReasonFlags.get(exampleId)!;
      if (!scores?.json_parse) flags.json_parse = 1;
      if (scores?.required_keys === false) flags.required_keys = 1;
      if (!scores?.has_decision) flags.missing_decision = 1;
      if (!scores?.has_boundary) flags.missing_boundary = 1;
      if (forbiddenTerms.length > 0) flags.forbidden_terms = 1;
      if (scores?.schema_ok_rewritten === false || scores?.schema_ok === false) {
        flags.schema_invalid = 1;
      }
      examplePass.set(exampleId, (examplePass.get(exampleId) ?? true) && row.pass);
    }
  }

  const examplesTotal = examplePass.size;
  const examplesPassed = Array.from(examplePass.values()).filter(Boolean).length;
  const examplesFailed = examplesTotal - examplesPassed;
  const exampleReasons = {
    json_parse: 0,
    required_keys: 0,
    missing_decision: 0,
    missing_boundary: 0,
    forbidden_terms: 0,
    schema_invalid: 0,
  };
  if (args.byExample) {
    for (const flags of exampleReasonFlags.values()) {
      if (flags.json_parse) exampleReasons.json_parse += 1;
      if (flags.required_keys) exampleReasons.required_keys += 1;
      if (flags.missing_decision) exampleReasons.missing_decision += 1;
      if (flags.missing_boundary) exampleReasons.missing_boundary += 1;
      if (flags.forbidden_terms) exampleReasons.forbidden_terms += 1;
      if (flags.schema_invalid) exampleReasons.schema_invalid += 1;
    }
  }

  const lines = [
    `Smoke report for run ${runId}`,
    `Smoke cycle: ${smokeCycleId}`,
    "",
    `Attempts total: ${totalAttempts}`,
    `Passes (rewritten): ${attemptPasses}`,
    ...(hasRawPass ? [`Passes (raw): ${rawPasses}`] : []),
    `Fails: ${attemptFails}`,
    "",
    ...(args.byExample
      ? [
          `Examples: passed ${examplesPassed}/${examplesTotal}, failed ${examplesFailed}`,
          `Attempts: passed ${attemptPasses}/${totalAttempts}, failed ${attemptFails}`,
          "",
        ]
      : []),
    "Top failure reasons:",
    `- json_parse false: ${args.byExample ? exampleReasons.json_parse : reasons.json_parse}`,
    `- required_keys false: ${args.byExample ? exampleReasons.required_keys : reasons.required_keys}`,
    `- missing decision: ${args.byExample ? exampleReasons.missing_decision : reasons.missing_decision}`,
    `- missing boundary: ${args.byExample ? exampleReasons.missing_boundary : reasons.missing_boundary}`,
    `- forbidden terms present: ${args.byExample ? exampleReasons.forbidden_terms : reasons.forbidden_terms}`,
    `- schema invalid: ${args.byExample ? exampleReasons.schema_invalid : reasons.schema_invalid}`,
    "",
    "Top forbidden terms:",
    ...Object.entries(termCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([term, count]) => `- ${term}: ${count}`),
    "",
    "Top forbidden fields:",
    ...Object.entries(fieldCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([field, count]) => `- ${field}: ${count}`),
  ];

  const outputPath = path.resolve(
    `./ml_artifacts/smoke_report_${smokeCycleId}.md`
  );
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${lines.join("\n")}\n`);

  if (args.byExample) {
    const exampleOutputPath = path.resolve(
      `./ml_artifacts/smoke_report_${smokeCycleId}_example.md`
    );
    fs.writeFileSync(exampleOutputPath, `${lines.join("\n")}\n`);
  }

  console.log(`smoke report for run ${runId}`);
  console.log(`smoke_cycle_id: ${smokeCycleId}`);
  console.log(
    `total: ${totalAttempts}, passes: ${attemptPasses}, fails: ${attemptFails}`
  );
  if (hasRawPass) {
    console.log(`raw passes: ${rawPasses}`);
  }
  console.log(
    `reasons: json_parse=${reasons.json_parse}, required_keys=${reasons.required_keys}, missing_decision=${reasons.missing_decision}, missing_boundary=${reasons.missing_boundary}, forbidden_terms=${reasons.forbidden_terms}`
  );
}

main().catch((error) => {
  console.error("Unexpected failure.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
