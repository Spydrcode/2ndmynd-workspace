import path from "node:path";

import { runMockPackV2 } from "../../lib/decision/v2/mock_pack_v2";

type Args = {
  zip: string;
  outDir: string;
  log: string;
  limit?: number;
  debug?: boolean;
};

const DEFAULTS: Args = {
  zip: "/mnt/data/mock_company_datasets_3mo.zip",
  outDir: "ml_artifacts/mock_companies_3mo",
  log: "ml_artifacts/mock_companies_3mo/run_results.jsonl",
};

function parseArgs(argv: string[]): Args {
  const args: Args = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith("--")) continue;
    switch (key) {
      case "--zip":
        if (value) args.zip = value;
        break;
      case "--out_dir":
        if (value) args.outDir = value;
        break;
      case "--log":
        if (value) args.log = value;
        break;
      case "--limit":
        if (value) args.limit = Number(value);
        break;
      case "--debug":
        args.debug = value === "1" || value === "true" || value === "yes";
        break;
      default:
        break;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await runMockPackV2({
    zip_path: args.zip,
    out_dir: args.outDir,
    log_path: args.log,
    debug: args.debug,
    limit: args.limit,
    on_company: (entry) => {
      if (args.debug && entry.debug_counts) {
        console.log("Debug counts:", entry.debug_counts);
      }

      console.log("\nCompany:", entry.company);
      console.log("Pattern:", entry.conclusion.one_sentence_pattern);
      console.log("Decision:", entry.conclusion.decision);
      console.log("Boundary:", entry.conclusion.boundary);
      console.log("Evidence:", entry.conclusion.evidence_signals);
      console.log("Meta:", {
        model_id: entry.meta.model_id,
        rewrite_used: entry.meta.rewrite_used,
        fallback_used: entry.meta.fallback_used,
        decision_patch_applied: entry.meta.decision_patch_applied,
        decision_patch_reason: entry.meta.decision_patch_reason,
        run_id: entry.meta.run_id,
      });
    },
  });

  console.log(`\nWrote run log to ${path.resolve(result.log_path)}`);
  if (args.debug && result.debug_log_path) {
    console.log(`Wrote debug log to ${path.resolve(result.debug_log_path)}`);
  }
}

main().catch((error) => {
  console.error("Mock company run failed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
