import fs from "node:fs";
import path from "node:path";

import { gradeDecisionArtifact } from "../../evals/graders/decision_grader";
import type { DecisionArtifactV1 } from "../../pipeline/contracts";
import type { StageName } from "../../pipeline/contracts";
import type { PersistedStageRecord, PersistedV4Run } from "../../pipeline/artifact_store";
import { listPersistedV4Runs } from "../../pipeline/artifact_store";
import { readCliArg } from "../cli_args";

type CliArgs = {
  workspace_id?: string;
  days: number;
  limit: number;
  out_dir: string;
  out_file?: string;
  stages?: Set<StageName>;
};

export type CurateWeeklyOptions = {
  workspace_id?: string;
  days?: number;
  limit?: number;
  out_dir?: string;
  out_file?: string;
  stages?: StageName[];
};

type GradeLabel = "pass" | "fail";

type ReviewItem = {
  id: string;
  run_id: string;
  stage_name: StageName;
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
  approved: boolean;
  notes: string;
  edited_output?: unknown;
};

type ReviewPack = {
  generated_at: string;
  workspace_id: string | null;
  window_days: number;
  items: ReviewItem[];
};

export type CurateWeeklyResult = {
  workspace_id: string | null;
  runs_scanned: number;
  items_written: number;
  out_file: string;
};

const STAGE_SET = new Set<StageName>([
  "quant_signals",
  "emyth_owner_load",
  "competitive_lens",
  "blue_ocean",
  "synthesis_decision",
]);

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
  const limitRaw = Number(readExplicitArg(argv, "limit") ?? "500");
  const out_dir =
    readCliArg(argv, "out_dir") ??
    path.resolve(process.cwd(), "tmp", "intelligence_v4", "review");
  const out_file = readCliArg(argv, "out_file");
  const stagesRaw = readCliArg(argv, "stages");
  const stageRaw = readCliArg(argv, "stage");

  let stages: Set<StageName> | undefined;
  const combinedStages = [stagesRaw, stageRaw].filter((value): value is string => Boolean(value)).join(",");
  if (combinedStages) {
    const parsed = combinedStages
      .split(",")
      .map((value) => value.trim())
      .filter((value): value is StageName => STAGE_SET.has(value as StageName));
    if (parsed.length > 0) {
      stages = new Set(parsed);
    }
  }

  return {
    workspace_id: workspace_id && workspace_id.trim().length > 0 ? workspace_id.trim() : undefined,
    days: Number.isFinite(daysRaw) ? Math.max(1, daysRaw) : 7,
    limit: Number.isFinite(limitRaw) ? Math.max(1, limitRaw) : 500,
    out_dir,
    out_file: out_file && out_file.trim().length > 0 ? path.resolve(out_file) : undefined,
    stages,
  };
}

function toCliArgs(options: CurateWeeklyOptions): CliArgs {
  return {
    workspace_id: options.workspace_id?.trim() ? options.workspace_id.trim() : undefined,
    days: Number.isFinite(options.days ?? Number.NaN) ? Math.max(1, options.days ?? 7) : 7,
    limit: Number.isFinite(options.limit ?? Number.NaN) ? Math.max(1, options.limit ?? 500) : 500,
    out_dir: options.out_dir ?? path.resolve(process.cwd(), "tmp", "intelligence_v4", "review"),
    out_file: options.out_file ? path.resolve(options.out_file) : undefined,
    stages:
      options.stages && options.stages.length > 0
        ? new Set(options.stages.filter((stage): stage is StageName => STAGE_SET.has(stage)))
        : undefined,
  };
}

function toIsoDateFolder(value = new Date()): string {
  return value.toISOString().slice(0, 10);
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

function withinWindow(iso: string, days: number): boolean {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return false;
  const now = Date.now();
  const cutoff = now - days * 24 * 60 * 60 * 1000;
  return then >= cutoff;
}

function hasStageArtifacts(stage: PersistedStageRecord): boolean {
  return Boolean(stage.input_artifact?.payload_json && stage.output_artifact?.payload_json);
}

function computeGrades(stage: PersistedStageRecord): ReviewItem["grades"] {
  const schema: GradeLabel =
    stage.output_artifact?.validation_results.ok && stage.input_artifact?.validation_results.ok
      ? "pass"
      : "fail";
  const doctrine: GradeLabel = stage.output_artifact?.guard_results.passed ? "pass" : "fail";
  const drift: GradeLabel = stage.output_artifact?.guard_results.failures.some((failure) => failure.code === "stage_drift")
    ? "fail"
    : doctrine;

  if (stage.stage_name === "synthesis_decision" && stage.output_artifact?.payload_json) {
    const decision = gradeDecisionArtifact(
      stage.output_artifact.payload_json as DecisionArtifactV1 | undefined
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

function toReviewItem(run: PersistedV4Run, stage: PersistedStageRecord): ReviewItem | null {
  if (!hasStageArtifacts(stage)) return null;
  const input = stage.input_artifact?.payload_json as Record<string, unknown>;
  const output = stage.output_artifact?.payload_json;
  if (!input || typeof input !== "object" || output === undefined) return null;

  const client_id = typeof input.client_id === "string" ? input.client_id : run.workspace_id;
  const industry = typeof input.industry === "string" ? input.industry : "unknown";
  const created_at = stageTimestamp(run, stage);

  return {
    id: `run:${run.run_id}/stage:${stage.stage_name}`,
    run_id: run.run_id,
    stage_name: stage.stage_name,
    created_at,
    client_id,
    industry,
    input,
    output,
    grades: computeGrades(stage),
    approved: stage.approved ?? false,
    notes: stage.notes ?? "",
  };
}

function writeReviewPack(filePath: string, pack: ReviewPack) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(pack, null, 2));
}

export async function curateWeekly(options?: CurateWeeklyOptions): Promise<CurateWeeklyResult> {
  const args = options ? toCliArgs(options) : parseArgs(process.argv.slice(2));
  const runs = await listPersistedV4Runs({
    workspace_id: args.workspace_id,
    limit: args.limit,
  });

  const items: ReviewItem[] = [];
  for (const run of runs) {
    for (const stage of run.stage_records) {
      if (args.stages && !args.stages.has(stage.stage_name)) continue;
      const createdAt = stageTimestamp(run, stage);
      if (!withinWindow(createdAt, args.days)) continue;
      const item = toReviewItem(run, stage);
      if (item) items.push(item);
    }
  }

  items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const pack: ReviewPack = {
    generated_at: new Date().toISOString(),
    workspace_id: args.workspace_id ?? null,
    window_days: args.days,
    items,
  };

  const outFile = args.out_file ?? path.resolve(args.out_dir, toIsoDateFolder(), "review_pack.json");
  writeReviewPack(outFile, pack);

  return {
    workspace_id: args.workspace_id ?? null,
    runs_scanned: runs.length,
    items_written: items.length,
    out_file: outFile,
  };
}

async function main() {
  const result = await curateWeekly();
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1]?.includes("curate_weekly.ts")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
  });
}
