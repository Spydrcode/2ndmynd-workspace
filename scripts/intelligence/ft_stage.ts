import path from "node:path";

import { parseBooleanArg, readCliArg } from "../../src/intelligence_v4/train/cli_args";
import { runFtStage } from "../../src/intelligence_v4/train/ft_stage_runner";
import { getStageTrainingSpec, isTrainingStage } from "../../src/intelligence_v4/train/stages";

type CliArgs = {
  stage: string;
  dataset?: string;
  base_model?: string;
  suffix?: string;
  dry_run: boolean;
  n_epochs?: number;
  learning_rate_multiplier?: number;
  seed?: number;
  approved_only: boolean;
  min_rows?: number;
  notes?: string;
};

function toNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function parseArgs(argv: string[]): CliArgs {
  return {
    stage: readCliArg(argv, "stage") ?? "",
    dataset: readCliArg(argv, "dataset"),
    base_model: readCliArg(argv, "base_model"),
    suffix: readCliArg(argv, "suffix"),
    dry_run: parseBooleanArg(readCliArg(argv, "dry_run"), true),
    n_epochs: toNumber(readCliArg(argv, "n_epochs")),
    learning_rate_multiplier: toNumber(readCliArg(argv, "learning_rate_multiplier")),
    seed: toNumber(readCliArg(argv, "seed")),
    approved_only: parseBooleanArg(readCliArg(argv, "approved_only"), true),
    min_rows: toNumber(readCliArg(argv, "min_rows")),
    notes: readCliArg(argv, "notes"),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!isTrainingStage(args.stage)) {
    throw new Error(
      "--stage must be one of quant_signals|emyth_owner_load|competitive_lens|blue_ocean|synthesis_decision"
    );
  }

  const spec = getStageTrainingSpec(args.stage);
  if (!args.suffix || args.suffix.trim().length === 0) {
    throw new Error("--suffix is required.");
  }

  const result = await runFtStage({
    stage: args.stage,
    dataset_path: args.dataset ?? path.resolve(process.cwd(), spec.dataset_path),
    base_model: args.base_model ?? spec.default_base_model,
    suffix: args.suffix,
    dry_run: args.dry_run,
    n_epochs: args.n_epochs,
    learning_rate_multiplier: args.learning_rate_multiplier,
    seed: args.seed,
    approved_only: args.approved_only,
    min_rows: args.min_rows ?? spec.minimum_examples_to_train,
    notes: args.notes,
  });

  console.log(
    JSON.stringify(
      {
        stage: result.stage,
        dry_run: result.dry_run,
        total_rows: result.total_rows,
        accepted_rows: result.accepted_rows,
        rejected_rows: result.rejected_rows,
        dataset_path: result.dataset_path,
        training_file_path: result.training_file_path,
        run_manifest: result.manifest_path,
        job_id: result.job_id ?? null,
      },
      null,
      2
    )
  );
}

if (process.argv[1]?.includes("ft_stage.ts")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
  });
}

