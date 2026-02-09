import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { runGlobalDoctrineGuards } from "../pipeline/guards";
import { validateStageInput } from "../pipeline/input_schemas";
import { validateStageArtifact, type StageName } from "../pipeline/contracts";
import { createFineTuneJob } from "./openai_client";
import { getStageSystemPrompt } from "./prompt_canonical";
import { scanForRawLeaks } from "./raw_leak_scan";
import { getStageTrainingSpec } from "./stages";

export type StageDatasetRow = {
  id?: string;
  created_at?: string;
  client_id?: string;
  industry?: string;
  input: unknown;
  output: unknown;
  grades?: {
    schema?: "pass" | "fail";
    doctrine?: "pass" | "fail";
    drift?: "pass" | "fail";
    decision?: "pass" | "fail";
  };
  model?: { model_id?: string; prompt_version?: string };
  approved?: boolean;
  notes?: string;
};

export type FtStageOptions = {
  stage: StageName;
  dataset_path?: string;
  base_model?: string;
  suffix: string;
  dry_run?: boolean;
  n_epochs?: number;
  learning_rate_multiplier?: number;
  seed?: number;
  approved_only?: boolean;
  min_rows?: number;
  notes?: string;
  output_root?: string;
};

export type FtStageResult = {
  stage: StageName;
  dataset_path: string;
  run_dir: string;
  manifest_path: string;
  training_file_path: string;
  total_rows: number;
  accepted_rows: number;
  rejected_rows: number;
  dry_run: boolean;
  job_id?: string;
};

type ValidatedRow = {
  row: StageDatasetRow;
  input_json: string;
  output_json: string;
};

type ValidationOutcome = {
  accepted: ValidatedRow[];
  total_rows: number;
  rejected_rows: number;
  rejection_reasons: Record<string, number>;
};

function timestampForPath(date = new Date()): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function readJsonl(filePath: string): StageDatasetRow[] {
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return lines.map((line, index) => {
    try {
      return JSON.parse(line) as StageDatasetRow;
    } catch (error) {
      throw new Error(`Invalid JSONL at line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort((a, b) => a.localeCompare(b));
  const entries = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);
  return `{${entries.join(",")}}`;
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function addReason(counter: Record<string, number>, reason: string) {
  counter[reason] = (counter[reason] ?? 0) + 1;
}

function validateRows(params: {
  rows: StageDatasetRow[];
  stage: StageName;
  approved_only: boolean;
}): ValidationOutcome {
  const spec = getStageTrainingSpec(params.stage);
  const accepted: ValidatedRow[] = [];
  const rejection_reasons: Record<string, number> = {};

  for (const row of params.rows) {
    if (params.approved_only && row.approved !== true) {
      addReason(rejection_reasons, "not_approved");
      continue;
    }

    if (!row || typeof row !== "object" || row.input === undefined || row.output === undefined) {
      addReason(rejection_reasons, "missing_input_or_output");
      continue;
    }

    const inputSchemaVersion = (row.input as { schema_version?: unknown })?.schema_version;
    const outputSchemaVersion = (row.output as { schema_version?: unknown })?.schema_version;
    if (inputSchemaVersion !== spec.input_schema_id) {
      addReason(rejection_reasons, "input_schema_version_mismatch");
      continue;
    }
    if (outputSchemaVersion !== spec.output_schema_id) {
      addReason(rejection_reasons, "output_schema_version_mismatch");
      continue;
    }

    const inputValidation = validateStageInput(params.stage, row.input);
    if (!inputValidation.ok) {
      addReason(rejection_reasons, "input_schema_invalid");
      continue;
    }

    const outputValidation = validateStageArtifact(params.stage, row.output);
    if (!outputValidation.ok) {
      addReason(rejection_reasons, "output_schema_invalid");
      continue;
    }

    const inputGuard = runGlobalDoctrineGuards(params.stage, row.input);
    const outputGuard = runGlobalDoctrineGuards(params.stage, row.output);
    if (!inputGuard.passed || !outputGuard.passed) {
      addReason(rejection_reasons, "doctrine_guard_failed");
      continue;
    }

    const inputLeak = scanForRawLeaks(row.input);
    const outputLeak = scanForRawLeaks(row.output);
    if (!inputLeak.ok || !outputLeak.ok) {
      addReason(rejection_reasons, "raw_leak_scan_failed");
      continue;
    }

    accepted.push({
      row,
      input_json: stableStringify(row.input),
      output_json: stableStringify(row.output),
    });
  }

  return {
    accepted,
    total_rows: params.rows.length,
    rejected_rows: params.rows.length - accepted.length,
    rejection_reasons,
  };
}

function buildOpenAiExamples(stage: StageName, rows: ValidatedRow[]): string[] {
  const system = getStageSystemPrompt(stage);
  return rows.map((entry) =>
    JSON.stringify({
      messages: [
        { role: "system", content: system },
        { role: "user", content: entry.input_json },
        { role: "assistant", content: entry.output_json },
      ],
    })
  );
}

export async function runFtStage(options: FtStageOptions): Promise<FtStageResult> {
  const spec = getStageTrainingSpec(options.stage);
  const datasetPath = path.resolve(options.dataset_path ?? spec.dataset_path);
  const dryRun = options.dry_run ?? true;
  const approvedOnly = options.approved_only ?? true;
  const minRows = options.min_rows ?? spec.minimum_examples_to_train;
  const outputRoot = path.resolve(options.output_root ?? path.resolve(process.cwd(), "train", "finetune_runs"));

  if (!fs.existsSync(datasetPath)) {
    throw new Error(`Dataset file not found: ${datasetPath}`);
  }

  if (!options.suffix || options.suffix.trim().length === 0) {
    throw new Error("--suffix is required.");
  }

  if (!dryRun && (!options.base_model || options.base_model.trim().length === 0)) {
    throw new Error("--base_model is required when --dry_run=false.");
  }

  const rows = readJsonl(datasetPath);
  const validated = validateRows({
    rows,
    stage: options.stage,
    approved_only: approvedOnly,
  });

  if (validated.accepted.length < minRows) {
    throw new Error(
      `Not enough valid rows for ${options.stage}. Need >= ${minRows}, found ${validated.accepted.length}.`
    );
  }

  const examples = buildOpenAiExamples(options.stage, validated.accepted);
  const timestamp = timestampForPath();
  const runDir = path.join(outputRoot, options.stage, timestamp);
  fs.mkdirSync(runDir, { recursive: true });

  const trainingFilePath = path.join(runDir, "train_openai.jsonl");
  fs.writeFileSync(trainingFilePath, `${examples.join("\n")}\n`);

  const datasetRaw = fs.readFileSync(datasetPath, "utf8");
  const manifest = {
    generated_at: new Date().toISOString(),
    stage: options.stage,
    dataset_path: datasetPath,
    output_dir: runDir,
    dry_run: dryRun,
    approved_only: approvedOnly,
    minimum_rows_required: minRows,
    total_rows: validated.total_rows,
    accepted_rows: validated.accepted.length,
    rejected_rows: validated.rejected_rows,
    rejection_reasons: validated.rejection_reasons,
    config: {
      base_model: options.base_model ?? spec.default_base_model,
      suffix: options.suffix,
      n_epochs: options.n_epochs ?? null,
      learning_rate_multiplier: options.learning_rate_multiplier ?? null,
      seed: options.seed ?? null,
      notes: options.notes ?? "",
    },
    hashes: {
      dataset_sha256: sha256(datasetRaw),
      training_sha256: sha256(examples.join("\n")),
    },
  };

  const manifestPath = path.join(runDir, "run_manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  let jobId: string | undefined;
  if (!dryRun) {
    const result = await createFineTuneJob({
      training_file_path: trainingFilePath,
      base_model: options.base_model ?? spec.default_base_model,
      suffix: options.suffix,
      n_epochs: options.n_epochs,
      learning_rate_multiplier: options.learning_rate_multiplier,
      seed: options.seed,
    });

    const jobPath = path.join(runDir, "job.json");
    fs.writeFileSync(
      jobPath,
      JSON.stringify(
        {
          created_at: new Date().toISOString(),
          stage: options.stage,
          dataset_path: datasetPath,
          training_file_path: trainingFilePath,
          openai: result,
        },
        null,
        2
      )
    );
    jobId = result.job_id;
  }

  return {
    stage: options.stage,
    dataset_path: datasetPath,
    run_dir: runDir,
    manifest_path: manifestPath,
    training_file_path: trainingFilePath,
    total_rows: validated.total_rows,
    accepted_rows: validated.accepted.length,
    rejected_rows: validated.rejected_rows,
    dry_run: dryRun,
    job_id: jobId,
  };
}

