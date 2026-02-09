import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { runEvals } from "../../evals/run_evals";
import type { StageName } from "../../pipeline/contracts";
import { validateStageArtifact } from "../../pipeline/contracts";
import { validateStageInput } from "../../pipeline/input_schemas";
import { parseBooleanArg, readCliArg } from "../cli_args";
import { writeModelCard } from "../model_card";
import { getStageTrainingSpec, isTrainingStage } from "../stages";

type StageConfig = {
  model_id: string;
  temperature?: number;
  max_tokens?: number;
  schema_version?: string;
  prompt_version?: string;
  rollout?: { strategy: "pinned" | "canary"; canary_percent: number };
  fallback?: { enabled: boolean; model_id?: string };
  pinned_at?: string;
  pinned_by?: string;
  promotion_report_path?: string;
  promotion_history?: Array<{
    timestamp: string;
    old_model: string;
    new_model: string;
    report_path: string;
    model_card_path: string;
    eval_report_path: string | null;
    dataset_hash: string;
  }>;
};

type ModelConfig = {
  version: string;
  stages: Record<StageName, StageConfig>;
  industry_overrides?: Record<string, unknown>;
};

type DatasetRow = {
  approved?: boolean;
  input?: unknown;
  output?: unknown;
};

type CliArgs = {
  stage: StageName;
  model: string;
  dataset_path: string;
  dry_run: boolean;
  notes?: string;
  force: boolean;
  approved_only: boolean;
  base_model?: string;
  current_path: string;
};

export type PromotionResult = {
  stage: StageName;
  old_model_id: string;
  new_model_id: string;
  dry_run: boolean;
  passed: boolean;
  report_path: string;
  eval_report_paths: string[];
  model_card_path: string;
  config_updated: boolean;
};

function toFileStamp(value = new Date()): string {
  return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function parseArgs(argv: string[]): CliArgs {
  const stageRaw = readCliArg(argv, "stage") ?? "";
  if (!isTrainingStage(stageRaw)) {
    throw new Error(
      "--stage must be one of quant_signals|emyth_owner_load|competitive_lens|blue_ocean|synthesis_decision"
    );
  }

  const model = readCliArg(argv, "model");
  if (!model || model.trim().length === 0) {
    throw new Error("--model is required.");
  }

  const spec = getStageTrainingSpec(stageRaw);
  const dataset_path = path.resolve(readCliArg(argv, "dataset") ?? spec.dataset_path);

  return {
    stage: stageRaw,
    model: model.trim(),
    dataset_path,
    dry_run: parseBooleanArg(readCliArg(argv, "dry_run"), false),
    notes: readCliArg(argv, "notes"),
    force: parseBooleanArg(readCliArg(argv, "force"), false),
    approved_only: parseBooleanArg(readCliArg(argv, "approved_only"), true),
    base_model: readCliArg(argv, "base_model") ?? undefined,
    current_path: path.resolve(
      readCliArg(argv, "current") ?? path.resolve(process.cwd(), "config", "intelligence_v4.models.json")
    ),
  };
}

function readConfig(filePath: string): ModelConfig {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Model config not found: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as ModelConfig;
}

function writeConfig(filePath: string, config: ModelConfig) {
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
}

function sha256(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function loadJsonlRows(filePath: string): DatasetRow[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const lines = fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const rows: DatasetRow[] = [];
  for (const line of lines) {
    try {
      rows.push(JSON.parse(line) as DatasetRow);
    } catch {
      // Skip malformed lines.
    }
  }
  return rows;
}

function countValidRows(params: {
  stage: StageName;
  rows: DatasetRow[];
  approved_only: boolean;
}): { eligible: number; total: number } {
  let eligible = 0;
  for (const row of params.rows) {
    if (params.approved_only && row.approved !== true) {
      continue;
    }

    if (row.input === undefined || row.output === undefined) {
      continue;
    }

    const inputValidation = validateStageInput(params.stage, row.input);
    if (!inputValidation.ok) {
      continue;
    }

    const outputValidation = validateStageArtifact(params.stage, row.output);
    if (!outputValidation.ok) {
      continue;
    }

    eligible += 1;
  }

  return {
    eligible,
    total: params.rows.length,
  };
}

async function runRegressionGate(stage: StageName) {
  const pipelineEval = await runEvals({ mode: "pipeline" });
  const stageEval = await runEvals({ mode: "stage", stage });

  const passed = pipelineEval.totals.failed === 0 && stageEval.totals.failed === 0;
  return {
    passed,
    pipeline: pipelineEval,
    stage: stageEval,
    report_paths: [pipelineEval.report_path, stageEval.report_path].filter(
      (value): value is string => typeof value === "string" && value.length > 0
    ),
  };
}

export async function runPromotionGate(args: CliArgs): Promise<PromotionResult> {
  const cfg = readConfig(args.current_path);
  const currentStageConfig = cfg.stages[args.stage];
  if (!currentStageConfig) {
    throw new Error(`Stage missing from model config: ${args.stage}`);
  }

  const oldModelId = currentStageConfig.model_id;
  const evalResult = await runRegressionGate(args.stage);

  if (!evalResult.passed) {
    throw new Error("Promotion blocked: regression gate failed.");
  }

  const rows = loadJsonlRows(args.dataset_path);
  const valid = countValidRows({
    stage: args.stage,
    rows,
    approved_only: args.approved_only,
  });

  const minRows = getStageTrainingSpec(args.stage).minimum_examples_to_train;
  if (!args.force && valid.eligible < minRows) {
    throw new Error(
      `Promotion blocked: dataset has ${valid.eligible} eligible rows for ${args.stage}; minimum is ${minRows}. Use --force=true to override.`
    );
  }

  const datasetRaw = fs.existsSync(args.dataset_path) ? fs.readFileSync(args.dataset_path, "utf8") : "";
  const reportDir = path.resolve(process.cwd(), "train", "promotion", "reports", args.stage);
  fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, `promotion_${toFileStamp()}.json`);

  const report = {
    generated_at: new Date().toISOString(),
    stage: args.stage,
    old_model_id: oldModelId,
    new_model_id: args.model,
    dry_run: args.dry_run,
    notes: args.notes ?? "",
    dataset: {
      path: args.dataset_path,
      total_rows: valid.total,
      eligible_rows: valid.eligible,
      approved_only: args.approved_only,
      min_rows_required: minRows,
      forced: args.force,
      sha256: sha256(datasetRaw),
    },
    evals: {
      passed: true,
      pipeline: {
        totals: evalResult.pipeline.totals,
        report_path: evalResult.pipeline.report_path ?? null,
      },
      stage: {
        totals: evalResult.stage.totals,
        report_path: evalResult.stage.report_path ?? null,
      },
    },
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  const actor =
    process.env.USER ?? process.env.USERNAME ?? process.env.GIT_AUTHOR_NAME ?? process.env.LOGNAME ?? "unknown";

  const card = writeModelCard({
    stage: args.stage,
    model_id: args.model,
    base_model: args.base_model ?? oldModelId,
    dataset_path: args.dataset_path,
    notes: args.notes,
    promotion_status: args.dry_run ? "candidate" : "pinned",
    promotion_report_path: reportPath,
    eval_summary_path: evalResult.pipeline.report_path,
    eval_passed: true,
  });

  let configUpdated = false;
  if (!args.dry_run) {
    const pinnedAt = new Date().toISOString();
    const historyEntry = {
      timestamp: pinnedAt,
      old_model: oldModelId,
      new_model: args.model,
      report_path: reportPath,
      model_card_path: card.file_path,
      eval_report_path: evalResult.pipeline.report_path ?? null,
      dataset_hash: report.dataset.sha256,
    };

    const currentHistory = cfg.stages[args.stage].promotion_history ?? [];
    const nextConfig: ModelConfig = {
      ...cfg,
      stages: {
        ...cfg.stages,
        [args.stage]: {
          ...cfg.stages[args.stage],
          model_id: args.model,
          pinned_at: pinnedAt,
          pinned_by: actor,
          promotion_report_path: reportPath,
          promotion_history: [...currentHistory, historyEntry],
        },
      },
    };
    writeConfig(args.current_path, nextConfig);
    configUpdated = true;
  }

  return {
    stage: args.stage,
    old_model_id: oldModelId,
    new_model_id: args.model,
    dry_run: args.dry_run,
    passed: true,
    report_path: reportPath,
    eval_report_paths: evalResult.report_paths,
    model_card_path: card.file_path,
    config_updated: configUpdated,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await runPromotionGate(args);
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1]?.includes("regression_gate.ts")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
  });
}
