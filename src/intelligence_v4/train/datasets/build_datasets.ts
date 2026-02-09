import fs from "node:fs";
import path from "node:path";

import { gradeDecisionArtifact } from "../../evals/graders/decision_grader";
import type { DecisionArtifactV1, StageName } from "../../pipeline/contracts";
import type { PersistedStageRecord, PersistedV4Run } from "../../pipeline/artifact_store";
import { listPersistedV4Runs } from "../../pipeline/artifact_store";
import { parseBooleanArg, readCliArg } from "../cli_args";

type CliArgs = {
  workspace_id?: string;
  days: number;
  limit: number;
  out_dir: string;
  review_dir: string;
  approved_only: boolean;
  stages?: Set<StageName>;
};

export type BuildDatasetsOptions = {
  workspace_id?: string;
  days?: number;
  limit?: number;
  out_dir?: string;
  review_dir?: string;
  approved_only?: boolean;
  stages?: StageName[];
};

export type BuildDatasetsResult = {
  workspace_id: string | null;
  approved_only: boolean;
  window_days: number;
  rows: Record<StageName, number>;
  out_dir: string;
};

type GradeLabel = "pass" | "fail";

type ReviewItem = {
  id: string;
  created_at?: string;
  output?: unknown;
  edited_output?: unknown;
  grades?: {
    schema?: GradeLabel;
    doctrine?: GradeLabel;
    drift?: GradeLabel;
    decision?: GradeLabel;
  };
  approved?: boolean;
  notes?: string;
};

type DatasetRow = {
  id: string;
  created_at: string;
  client_id: string;
  industry: string;
  input: unknown;
  output: unknown;
  grades: {
    schema: GradeLabel;
    doctrine: GradeLabel;
    drift: GradeLabel;
    decision?: GradeLabel;
  };
  model: {
    model_id: string;
    prompt_version: string;
  };
  approved: boolean;
  notes: string;
};

const STAGE_SET = new Set<StageName>([
  "quant_signals",
  "emyth_owner_load",
  "competitive_lens",
  "blue_ocean",
  "synthesis_decision",
]);

const STAGE_TO_FILE: Record<StageName, string> = {
  quant_signals: "stage_quant.jsonl",
  emyth_owner_load: "stage_emyth.jsonl",
  competitive_lens: "stage_competitive.jsonl",
  blue_ocean: "stage_blueocean.jsonl",
  synthesis_decision: "stage_synthesis.jsonl",
};

function readExplicitArg(argv: string[], key: string): string | undefined {
  const aliases = [...new Set([key, key.replace(/_/g, "-"), key.replace(/-/g, "_")])];

  for (const alias of aliases) {
    const inline = argv.find((arg) => arg.startsWith(`--${alias}=`));
    if (inline) return inline.split("=")[1];
    const index = argv.indexOf(`--${alias}`);
    if (index >= 0 && index + 1 < argv.length) return argv[index + 1];
  }

  const npmArgvRaw = process.env.npm_config_argv;
  if (!npmArgvRaw) return undefined;

  try {
    const parsed = JSON.parse(npmArgvRaw) as { original?: string[]; cooked?: string[] };
    const pools = [parsed.original ?? [], parsed.cooked ?? []];
    for (const pool of pools) {
      for (const alias of aliases) {
        const inline = pool.find((arg) => arg.startsWith(`--${alias}=`));
        if (inline) return inline.split("=")[1];
        const index = pool.indexOf(`--${alias}`);
        if (index >= 0 && index + 1 < pool.length) return pool[index + 1];
      }
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function parseArgs(argv: string[]): CliArgs {
  const workspace_id = readCliArg(argv, "workspace_id");
  const daysRaw = Number(readExplicitArg(argv, "days") ?? "7");
  const limitRaw = Number(readExplicitArg(argv, "limit") ?? "1000");
  const out_dir =
    readCliArg(argv, "out_dir") ??
    path.resolve(process.cwd(), "train", "datasets");
  const review_dir =
    readCliArg(argv, "review_dir") ??
    path.resolve(process.cwd(), "tmp", "intelligence_v4", "review");
  const approvedOnlyRaw =
    readCliArg(argv, "approved_only") ??
    readCliArg(argv, "approved-only") ??
    readCliArg(argv, "approved");
  const stagesRaw = readCliArg(argv, "stages");
  const stageRaw = readCliArg(argv, "stage");

  let stages: Set<StageName> | undefined;
  const combinedStages = [stagesRaw, stageRaw].filter((value): value is string => Boolean(value)).join(",");
  if (combinedStages) {
    const parsed = combinedStages
      .split(",")
      .map((value) => value.trim())
      .filter((value): value is StageName => STAGE_SET.has(value as StageName));
    if (parsed.length > 0) stages = new Set(parsed);
  }

  return {
    workspace_id: workspace_id && workspace_id.trim().length > 0 ? workspace_id.trim() : undefined,
    days: Number.isFinite(daysRaw) ? Math.max(1, daysRaw) : 7,
    limit: Number.isFinite(limitRaw) ? Math.max(1, limitRaw) : 1000,
    out_dir,
    review_dir,
    approved_only: parseBooleanArg(approvedOnlyRaw, true),
    stages,
  };
}

function toCliArgs(options: BuildDatasetsOptions): CliArgs {
  return {
    workspace_id: options.workspace_id?.trim() ? options.workspace_id.trim() : undefined,
    days: Number.isFinite(options.days ?? Number.NaN) ? Math.max(1, options.days ?? 7) : 7,
    limit: Number.isFinite(options.limit ?? Number.NaN) ? Math.max(1, options.limit ?? 1000) : 1000,
    out_dir: options.out_dir ?? path.resolve(process.cwd(), "train", "datasets"),
    review_dir: options.review_dir ?? path.resolve(process.cwd(), "tmp", "intelligence_v4", "review"),
    approved_only: options.approved_only ?? true,
    stages:
      options.stages && options.stages.length > 0
        ? new Set(options.stages.filter((stage): stage is StageName => STAGE_SET.has(stage)))
        : undefined,
  };
}

function withinWindow(iso: string, days: number): boolean {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return false;
  return then >= Date.now() - days * 24 * 60 * 60 * 1000;
}

function stageTimestamp(run: PersistedV4Run, stage: PersistedStageRecord): string {
  return (
    stage.output_artifact?.created_at ??
    stage.input_artifact?.created_at ??
    stage.updated_at ??
    run.finished_at ??
    run.started_at
  );
}

function hasStageArtifacts(stage: PersistedStageRecord): boolean {
  return Boolean(stage.input_artifact?.payload_json && stage.output_artifact?.payload_json);
}

function computeGrades(stage: PersistedStageRecord): DatasetRow["grades"] {
  const schema: GradeLabel =
    stage.output_artifact?.validation_results.ok && stage.input_artifact?.validation_results.ok
      ? "pass"
      : "fail";
  const doctrine: GradeLabel = stage.output_artifact?.guard_results.passed ? "pass" : "fail";
  const drift: GradeLabel = stage.output_artifact?.guard_results.failures.some((failure) => failure.code === "stage_drift")
    ? "fail"
    : doctrine;

  if (stage.stage_name === "synthesis_decision") {
    const decision = gradeDecisionArtifact(
      (stage.output_artifact?.payload_json ?? undefined) as DecisionArtifactV1 | undefined
    );
    return {
      schema,
      doctrine,
      drift,
      decision: decision.passed ? "pass" : "fail",
    };
  }

  return { schema, doctrine, drift };
}

function walkJsonFiles(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkJsonFiles(full, out);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".json")) {
      out.push(full);
    }
  }
  return out;
}

function loadReviewIndex(reviewDir: string): Map<string, ReviewItem> {
  const index = new Map<string, ReviewItem>();
  const files = walkJsonFiles(reviewDir).sort((a, b) => fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs);

  for (const file of files) {
    try {
      const payload = JSON.parse(fs.readFileSync(file, "utf8")) as { items?: unknown[] };
      if (!Array.isArray(payload.items)) continue;
      for (const item of payload.items) {
        if (!item || typeof item !== "object") continue;
        const typed = item as ReviewItem;
        if (typeof typed.id !== "string" || typed.id.length === 0) continue;
        index.set(typed.id, typed);
      }
    } catch {
      // Skip malformed review pack files.
    }
  }

  return index;
}

function toDatasetRow(
  run: PersistedV4Run,
  stage: PersistedStageRecord,
  reviewIndex: Map<string, ReviewItem>
): DatasetRow | null {
  if (!hasStageArtifacts(stage)) return null;
  const input = stage.input_artifact?.payload_json as Record<string, unknown>;
  const output = stage.output_artifact?.payload_json;
  if (!input || typeof input !== "object" || output === undefined) return null;

  const id = `run:${run.run_id}/stage:${stage.stage_name}`;
  const review = reviewIndex.get(id);
  const mergedOutput = review?.edited_output ?? review?.output ?? output;
  const grades = review?.grades
    ? {
        schema: review.grades.schema ?? "fail",
        doctrine: review.grades.doctrine ?? "fail",
        drift: review.grades.drift ?? "fail",
        decision: review.grades.decision,
      }
    : computeGrades(stage);
  const approved = typeof review?.approved === "boolean" ? review.approved : (stage.approved ?? false);

  return {
    id,
    created_at: review?.created_at ?? stageTimestamp(run, stage),
    client_id: typeof input.client_id === "string" ? input.client_id : run.workspace_id,
    industry: typeof input.industry === "string" ? input.industry : "unknown",
    input,
    output: mergedOutput,
    grades,
    model: {
      model_id: stage.model_config.model_id,
      prompt_version: stage.model_config.prompt_version,
    },
    approved,
    notes: typeof review?.notes === "string" ? review.notes : (stage.notes ?? ""),
  };
}

function writeJsonl(filePath: string, rows: DatasetRow[]) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (rows.length === 0) {
    fs.writeFileSync(filePath, "");
    return;
  }
  const content = rows.map((row) => JSON.stringify(row)).join("\n");
  fs.writeFileSync(filePath, `${content}\n`);
}

export async function buildDatasets(options?: BuildDatasetsOptions): Promise<BuildDatasetsResult> {
  const args = options ? toCliArgs(options) : parseArgs(process.argv.slice(2));
  const reviewIndex = loadReviewIndex(args.review_dir);
  const runs = await listPersistedV4Runs({
    workspace_id: args.workspace_id,
    limit: args.limit,
  });

  const rowsByStage = new Map<StageName, DatasetRow[]>();
  for (const stageName of STAGE_SET.values()) {
    rowsByStage.set(stageName, []);
  }

  for (const run of runs) {
    for (const stage of run.stage_records) {
      if (args.stages && !args.stages.has(stage.stage_name)) continue;
      const createdAt = stageTimestamp(run, stage);
      if (!withinWindow(createdAt, args.days)) continue;
      const row = toDatasetRow(run, stage, reviewIndex);
      if (!row) continue;
      if (args.approved_only && !row.approved) continue;
      rowsByStage.get(stage.stage_name)?.push(row);
    }
  }

  for (const [stage, rows] of rowsByStage.entries()) {
    rows.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    writeJsonl(path.join(args.out_dir, STAGE_TO_FILE[stage]), rows);
  }

  return {
    workspace_id: args.workspace_id ?? null,
    approved_only: args.approved_only,
    window_days: args.days,
    rows: Object.fromEntries([...rowsByStage.entries()].map(([stage, rows]) => [stage, rows.length])) as Record<
      StageName,
      number
    >,
    out_dir: path.resolve(args.out_dir),
  };
}

async function main() {
  const result = await buildDatasets();
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1]?.includes("build_datasets.ts")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
  });
}
