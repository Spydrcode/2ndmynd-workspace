import path from "node:path";

import { readCliArg } from "../../src/intelligence_v4/train/cli_args";
import { writeModelCard } from "../../src/intelligence_v4/train/model_card";
import { getStageTrainingSpec, isTrainingStage } from "../../src/intelligence_v4/train/stages";

type CliArgs = {
  stage: string;
  model: string;
  base_model: string;
  dataset?: string;
  run_manifest?: string;
  notes?: string;
  promotion_status?: "candidate" | "pinned" | "deprecated";
  promotion_report?: string;
  eval_summary?: string;
  eval_passed?: boolean;
};

function parseBoolean(value: string | undefined): boolean | undefined {
  if (!value) return undefined;
  return value === "1" || value.toLowerCase() === "true";
}

function parseArgs(argv: string[]): CliArgs {
  return {
    stage: readCliArg(argv, "stage") ?? "",
    model: readCliArg(argv, "model") ?? "",
    base_model: readCliArg(argv, "base_model") ?? "",
    dataset: readCliArg(argv, "dataset"),
    run_manifest: readCliArg(argv, "run_manifest"),
    notes: readCliArg(argv, "notes"),
    promotion_status: readCliArg(argv, "promotion_status") as
      | "candidate"
      | "pinned"
      | "deprecated"
      | undefined,
    promotion_report: readCliArg(argv, "promotion_report"),
    eval_summary: readCliArg(argv, "eval_summary"),
    eval_passed: parseBoolean(readCliArg(argv, "eval_passed")),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!isTrainingStage(args.stage)) {
    throw new Error(
      "--stage must be one of quant_signals|emyth_owner_load|competitive_lens|blue_ocean|synthesis_decision"
    );
  }
  if (!args.model) {
    throw new Error("--model is required.");
  }
  if (!args.base_model) {
    throw new Error("--base_model is required.");
  }

  const spec = getStageTrainingSpec(args.stage);
  const result = writeModelCard({
    stage: args.stage,
    model_id: args.model,
    base_model: args.base_model,
    dataset_path: path.resolve(args.dataset ?? spec.dataset_path),
    run_manifest_path: args.run_manifest ? path.resolve(args.run_manifest) : undefined,
    notes: args.notes,
    promotion_status: args.promotion_status,
    promotion_report_path: args.promotion_report,
    eval_summary_path: args.eval_summary,
    eval_passed: args.eval_passed,
  });

  console.log(
    JSON.stringify(
      {
        stage: args.stage,
        model: args.model,
        file_path: result.file_path,
      },
      null,
      2
    )
  );
}

if (process.argv[1]?.includes("build_model_card.ts")) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
  }
}
