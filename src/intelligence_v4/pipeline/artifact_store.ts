import fs from "node:fs";
import path from "node:path";

import { getStore } from "@/src/lib/intelligence/store";

import { STAGE_ORDER, isStageName, type StageArtifactMap, type StageName } from "./contracts";
import type { GuardResult } from "./guards";
import type { StageInputByStage } from "./input_contracts";
import type { StageModelConfig } from "./model_registry";

export type ValidationResult = { ok: boolean; errors: string[] };

export type StageArtifactKind = "stage_input_summary_v1" | "stage_output_v1";

export type PersistedStageArtifact = {
  artifact_kind: StageArtifactKind;
  schema_version: string;
  created_at: string;
  payload_json: unknown;
  guard_results: GuardResult;
  validation_results: ValidationResult;
};

export type PersistedModelConfigSnapshot = {
  model_id: string;
  prompt_version: string;
  schema_version: string;
  temperature: number;
  max_tokens: number;
  rollout: StageModelConfig["rollout"];
  fallback: StageModelConfig["fallback"];
};

export type PersistedStageRecord = {
  stage_name: StageName;
  created_at: string;
  updated_at: string;
  model_config: PersistedModelConfigSnapshot;
  input_artifact?: PersistedStageArtifact;
  output_artifact?: PersistedStageArtifact;
  approved?: boolean;
  notes?: string;
  grades?: {
    schema?: "pass" | "fail";
    doctrine?: "pass" | "fail";
    drift?: "pass" | "fail";
    decision?: "pass" | "fail";
  };
};

export type PersistedV4Run = {
  run_id: string;
  workspace_id: string;
  pipeline_version: string;
  status: "running" | "failed" | "succeeded";
  started_at: string;
  finished_at?: string;
  stage_records: PersistedStageRecord[];
  final_artifact?: StageArtifactMap["synthesis_decision"];
  error?: {
    stage_failed: string;
    reason: string;
    validation_errors: string[];
    guard_failures: string[];
    next_action: string;
  };
};

function fallbackPath(runId: string): string {
  return path.resolve(process.cwd(), "tmp", "intelligence_v4", `${runId}.json`);
}

function artifactRunPath(runId: string): string {
  return path.resolve(process.cwd(), ".artifacts", "v4", runId);
}

function artifactStagePath(runId: string, stageName: StageName): string {
  return path.resolve(artifactRunPath(runId), stageName);
}

function shouldUseFallbackStorage(): boolean {
  return process.env.INTELLIGENCE_V4_FORCE_FILE_STORE === "true" || process.env.NODE_ENV === "test";
}

function readJsonFile<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

function writeJsonFile(filePath: string, payload: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
}

function readFallbackRun(runId: string): PersistedV4Run | null {
  const file = fallbackPath(runId);
  return readJsonFile<PersistedV4Run>(file);
}

function writeFallbackRun(run: PersistedV4Run) {
  writeJsonFile(fallbackPath(run.run_id), run);
}

function modelConfigSnapshot(model: StageModelConfig): PersistedModelConfigSnapshot {
  return {
    model_id: model.model_id,
    prompt_version: model.prompt_version,
    schema_version: model.schema_version,
    temperature: model.temperature,
    max_tokens: model.max_tokens,
    rollout: model.rollout,
    fallback: model.fallback,
  };
}

function normalizeLegacyStageRecord(record: Record<string, unknown>): PersistedStageRecord | null {
  const stageName = record.stage_name;
  if (typeof stageName !== "string" || !isStageName(stageName)) return null;

  const created = typeof record.created_at === "string" ? record.created_at : new Date().toISOString();
  const schemaVersion = typeof record.schema_version === "string" ? record.schema_version : "unknown";
  const modelId = typeof record.model_id === "string" ? record.model_id : "deterministic:legacy";
  const promptVersion = typeof record.prompt_version === "string" ? record.prompt_version : "v1";

  const validation =
    record.validation_results && typeof record.validation_results === "object"
      ? (record.validation_results as ValidationResult)
      : { ok: true, errors: [] };
  const guard =
    record.guard_results && typeof record.guard_results === "object"
      ? (record.guard_results as GuardResult)
      : { passed: true, failures: [] };

  return {
    stage_name: stageName,
    created_at: created,
    updated_at: created,
    model_config: {
      model_id: modelId,
      prompt_version: promptVersion,
      schema_version: schemaVersion,
      temperature: 0,
      max_tokens: 0,
      rollout: { strategy: "pinned", canary_percent: 0 },
      fallback: { enabled: false },
    },
    input_artifact:
      record.input_summary !== undefined
        ? {
            artifact_kind: "stage_input_summary_v1",
            schema_version: "legacy_input_summary",
            created_at: created,
            payload_json: record.input_summary,
            guard_results: { passed: true, failures: [] },
            validation_results: { ok: true, errors: [] },
          }
        : undefined,
    output_artifact:
      record.payload_json !== undefined
        ? {
            artifact_kind: "stage_output_v1",
            schema_version: schemaVersion,
            created_at: created,
            payload_json: record.payload_json,
            guard_results: guard,
            validation_results: validation,
          }
        : undefined,
    approved: false,
    notes: "",
  };
}

function normalizeStageRecord(record: unknown): PersistedStageRecord | null {
  if (!record || typeof record !== "object") return null;
  const candidate = record as Record<string, unknown>;

  if (candidate.input_artifact || candidate.output_artifact) {
    const stageName = candidate.stage_name;
    if (typeof stageName !== "string" || !isStageName(stageName)) return null;
    const created = typeof candidate.created_at === "string" ? candidate.created_at : new Date().toISOString();
    const updated = typeof candidate.updated_at === "string" ? candidate.updated_at : created;
    const model = candidate.model_config as PersistedModelConfigSnapshot | undefined;
    if (!model) return null;
    return {
      stage_name: stageName,
      created_at: created,
      updated_at: updated,
      model_config: model,
      input_artifact: candidate.input_artifact as PersistedStageArtifact | undefined,
      output_artifact: candidate.output_artifact as PersistedStageArtifact | undefined,
      approved: typeof candidate.approved === "boolean" ? candidate.approved : false,
      notes: typeof candidate.notes === "string" ? candidate.notes : "",
      grades:
        candidate.grades && typeof candidate.grades === "object"
          ? (candidate.grades as PersistedStageRecord["grades"])
          : undefined,
    };
  }

  return normalizeLegacyStageRecord(candidate);
}

function toPersistedRun(value: unknown): PersistedV4Run | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<PersistedV4Run>;
  if (!candidate.run_id || !candidate.workspace_id) return null;
  if (!Array.isArray(candidate.stage_records)) return null;

  const normalizedRecords = candidate.stage_records
    .map((record) => normalizeStageRecord(record))
    .filter((record): record is PersistedStageRecord => Boolean(record))
    .sort((a, b) => STAGE_ORDER.indexOf(a.stage_name) - STAGE_ORDER.indexOf(b.stage_name));

  return {
    run_id: candidate.run_id,
    workspace_id: candidate.workspace_id,
    pipeline_version: candidate.pipeline_version ?? "intelligence_v4",
    status: candidate.status ?? "running",
    started_at: candidate.started_at ?? normalizedRecords[0]?.created_at ?? new Date().toISOString(),
    finished_at: candidate.finished_at,
    stage_records: normalizedRecords,
    final_artifact: candidate.final_artifact,
    error: candidate.error,
  };
}

function ensureRunShell(input: { run_id: string; workspace_id: string }): PersistedV4Run {
  return {
    run_id: input.run_id,
    workspace_id: input.workspace_id,
    pipeline_version: "intelligence_v4",
    status: "running",
    started_at: new Date().toISOString(),
    stage_records: [],
  };
}

function upsertStageRecord(params: {
  run: PersistedV4Run;
  stage_name: StageName;
  model_config: StageModelConfig;
  patch: (current: PersistedStageRecord) => PersistedStageRecord;
}): PersistedV4Run {
  const now = new Date().toISOString();
  const existing = params.run.stage_records.find((record) => record.stage_name === params.stage_name);
  const base: PersistedStageRecord =
    existing ??
    ({
      stage_name: params.stage_name,
      created_at: now,
      updated_at: now,
      model_config: modelConfigSnapshot(params.model_config),
      approved: false,
      notes: "",
    } satisfies PersistedStageRecord);

  const patched = params.patch({
    ...base,
    model_config: modelConfigSnapshot(params.model_config),
    updated_at: now,
  });

  const remaining = params.run.stage_records.filter((record) => record.stage_name !== params.stage_name);
  return {
    ...params.run,
    stage_records: [...remaining, patched].sort(
      (a, b) => STAGE_ORDER.indexOf(a.stage_name) - STAGE_ORDER.indexOf(b.stage_name)
    ),
  };
}

function writeStageArtifactsToFileStore(run: PersistedV4Run, stageName: StageName) {
  const stageRecord = run.stage_records.find((record) => record.stage_name === stageName);
  if (!stageRecord) return;

  const stageDir = artifactStagePath(run.run_id, stageName);
  fs.mkdirSync(stageDir, { recursive: true });

  if (stageRecord.input_artifact) {
    writeJsonFile(path.join(stageDir, "input.json"), stageRecord.input_artifact);
  }
  if (stageRecord.output_artifact) {
    writeJsonFile(path.join(stageDir, "output.json"), stageRecord.output_artifact);
  }

  writeJsonFile(path.join(stageDir, "meta.json"), {
    run_id: run.run_id,
    workspace_id: run.workspace_id,
    stage_name: stageName,
    created_at: stageRecord.created_at,
    updated_at: stageRecord.updated_at,
    approved: stageRecord.approved ?? false,
    notes: stageRecord.notes ?? "",
    model_config: stageRecord.model_config,
    grades: stageRecord.grades ?? null,
    pipeline_status: run.status,
  });
}

async function updateRunResultsJson(params: {
  run_id: string;
  workspace_id: string;
  updater: (current: PersistedV4Run | null) => PersistedV4Run;
}): Promise<{ run: PersistedV4Run; used_fallback: boolean }> {
  if (shouldUseFallbackStorage()) {
    const next = params.updater(readFallbackRun(params.run_id));
    writeFallbackRun(next);
    return { run: next, used_fallback: true };
  }

  const store = getStore();
  const run = await store.getRun(params.run_id);

  if (!run) {
    const next = params.updater(readFallbackRun(params.run_id));
    writeFallbackRun(next);
    return { run: next, used_fallback: true };
  }

  const currentResults =
    run.results_json && typeof run.results_json === "object" ? (run.results_json as Record<string, unknown>) : {};
  const currentV4 = toPersistedRun(currentResults.intelligence_v4);
  const next = params.updater(currentV4);

  await store.updateRun(params.run_id, {
    results_json: {
      ...currentResults,
      intelligence_v4: next,
    },
  });

  return { run: next, used_fallback: false };
}

export async function persistStageInput(params: {
  run_id: string;
  workspace_id: string;
  stage_name: StageName;
  payload: StageInputByStage[StageName];
  model_config: StageModelConfig;
  guard_results: GuardResult;
  validation_results: ValidationResult;
}) {
  const now = new Date().toISOString();
  const inputRecord: PersistedStageArtifact = {
    artifact_kind: "stage_input_summary_v1",
    schema_version: params.payload.schema_version,
    created_at: now,
    payload_json: params.payload,
    guard_results: params.guard_results,
    validation_results: params.validation_results,
  };

  const persisted = await updateRunResultsJson({
    run_id: params.run_id,
    workspace_id: params.workspace_id,
    updater: (current) => {
      const seed = current ?? ensureRunShell({ run_id: params.run_id, workspace_id: params.workspace_id });
      return upsertStageRecord({
        run: seed,
        stage_name: params.stage_name,
        model_config: params.model_config,
        patch: (record) => ({
          ...record,
          input_artifact: inputRecord,
        }),
      });
    },
  });

  if (persisted.used_fallback) {
    writeStageArtifactsToFileStore(persisted.run, params.stage_name);
  }
}

export async function persistStageOutput(params: {
  run_id: string;
  workspace_id: string;
  stage_name: StageName;
  payload: StageArtifactMap[StageName];
  model_config: StageModelConfig;
  guard_results: GuardResult;
  validation_results: ValidationResult;
}) {
  const now = new Date().toISOString();
  const outputRecord: PersistedStageArtifact = {
    artifact_kind: "stage_output_v1",
    schema_version: params.payload.schema_version,
    created_at: now,
    payload_json: params.payload,
    guard_results: params.guard_results,
    validation_results: params.validation_results,
  };

  const persisted = await updateRunResultsJson({
    run_id: params.run_id,
    workspace_id: params.workspace_id,
    updater: (current) => {
      const seed = current ?? ensureRunShell({ run_id: params.run_id, workspace_id: params.workspace_id });
      return upsertStageRecord({
        run: seed,
        stage_name: params.stage_name,
        model_config: params.model_config,
        patch: (record) => ({
          ...record,
          output_artifact: outputRecord,
        }),
      });
    },
  });

  if (persisted.used_fallback) {
    writeStageArtifactsToFileStore(persisted.run, params.stage_name);
  }
}

export async function persistPipelineFailure(params: {
  run_id: string;
  workspace_id: string;
  error: PersistedV4Run["error"];
}) {
  const persisted = await updateRunResultsJson({
    run_id: params.run_id,
    workspace_id: params.workspace_id,
    updater: (current) => {
      const seed = current ?? ensureRunShell({ run_id: params.run_id, workspace_id: params.workspace_id });
      return {
        ...seed,
        status: "failed",
        finished_at: new Date().toISOString(),
        error: params.error,
      };
    },
  });

  if (persisted.used_fallback) {
    const runDir = artifactRunPath(persisted.run.run_id);
    fs.mkdirSync(runDir, { recursive: true });
    writeJsonFile(path.join(runDir, "run_meta.json"), {
      run_id: persisted.run.run_id,
      workspace_id: persisted.run.workspace_id,
      status: persisted.run.status,
      started_at: persisted.run.started_at,
      finished_at: persisted.run.finished_at,
      error: persisted.run.error ?? null,
    });
  }
}

export async function persistPipelineSuccess(params: {
  run_id: string;
  workspace_id: string;
  final_artifact: StageArtifactMap["synthesis_decision"];
}) {
  const persisted = await updateRunResultsJson({
    run_id: params.run_id,
    workspace_id: params.workspace_id,
    updater: (current) => {
      const seed = current ?? ensureRunShell({ run_id: params.run_id, workspace_id: params.workspace_id });
      return {
        ...seed,
        status: "succeeded",
        finished_at: new Date().toISOString(),
        final_artifact: params.final_artifact,
      };
    },
  });

  if (persisted.used_fallback) {
    const runDir = artifactRunPath(persisted.run.run_id);
    fs.mkdirSync(runDir, { recursive: true });
    writeJsonFile(path.join(runDir, "run_meta.json"), {
      run_id: persisted.run.run_id,
      workspace_id: persisted.run.workspace_id,
      status: persisted.run.status,
      started_at: persisted.run.started_at,
      finished_at: persisted.run.finished_at,
      final_artifact_schema_version: params.final_artifact.schema_version,
      final_artifact_model_id: params.final_artifact.model_id,
    });
  }
}

function loadPersistedV4RunFromArtifactFiles(runId: string): PersistedV4Run | null {
  const runDir = artifactRunPath(runId);
  if (!fs.existsSync(runDir)) return null;

  const stageDirs = fs
    .readdirSync(runDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && isStageName(entry.name))
    .map((entry) => entry.name as StageName)
    .sort((a, b) => STAGE_ORDER.indexOf(a) - STAGE_ORDER.indexOf(b));

  if (stageDirs.length === 0) return null;

  const records: PersistedStageRecord[] = [];
  let workspaceId = "unknown";

  for (const stageName of stageDirs) {
    const meta = readJsonFile<Record<string, unknown>>(path.join(runDir, stageName, "meta.json")) ?? {};
    const input = readJsonFile<PersistedStageArtifact>(path.join(runDir, stageName, "input.json")) ?? undefined;
    const output = readJsonFile<PersistedStageArtifact>(path.join(runDir, stageName, "output.json")) ?? undefined;
    const model = meta.model_config as PersistedModelConfigSnapshot | undefined;

    if (typeof meta.workspace_id === "string" && meta.workspace_id.length > 0) {
      workspaceId = meta.workspace_id;
    }

    records.push({
      stage_name: stageName,
      created_at: (typeof meta.created_at === "string" ? meta.created_at : input?.created_at ?? output?.created_at) ?? new Date().toISOString(),
      updated_at: (typeof meta.updated_at === "string" ? meta.updated_at : output?.created_at ?? input?.created_at) ?? new Date().toISOString(),
      model_config:
        model ??
        ({
          model_id: "deterministic:unknown",
          prompt_version: "v1",
          schema_version: "unknown",
          temperature: 0,
          max_tokens: 0,
          rollout: { strategy: "pinned", canary_percent: 0 },
          fallback: { enabled: false },
        } satisfies PersistedModelConfigSnapshot),
      input_artifact: input,
      output_artifact: output,
      approved: typeof meta.approved === "boolean" ? meta.approved : false,
      notes: typeof meta.notes === "string" ? meta.notes : "",
      grades:
        meta.grades && typeof meta.grades === "object"
          ? (meta.grades as PersistedStageRecord["grades"])
          : undefined,
    });
  }

  const runMeta = readJsonFile<Record<string, unknown>>(path.join(runDir, "run_meta.json")) ?? {};
  const status =
    runMeta.status === "failed" || runMeta.status === "succeeded" || runMeta.status === "running"
      ? runMeta.status
      : records.some((record) => Boolean(record.output_artifact && record.stage_name === "synthesis_decision"))
        ? "succeeded"
        : "running";

  return {
    run_id: runId,
    workspace_id: workspaceId,
    pipeline_version: "intelligence_v4",
    status,
    started_at:
      (typeof runMeta.started_at === "string" ? runMeta.started_at : records[0]?.created_at) ??
      new Date().toISOString(),
    finished_at: typeof runMeta.finished_at === "string" ? runMeta.finished_at : undefined,
    stage_records: records,
    final_artifact: undefined,
    error: undefined,
  };
}

function listRunIdsFromArtifactFiles(): string[] {
  const base = path.resolve(process.cwd(), ".artifacts", "v4");
  if (!fs.existsSync(base)) return [];
  return fs
    .readdirSync(base, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

export function loadPersistedV4RunFromFallback(runId: string): PersistedV4Run | null {
  const direct = toPersistedRun(readFallbackRun(runId));
  if (direct) return direct;
  return loadPersistedV4RunFromArtifactFiles(runId);
}

export async function listPersistedV4Runs(params?: {
  workspace_id?: string;
  limit?: number;
}): Promise<PersistedV4Run[]> {
  const byRunId = new Map<string, PersistedV4Run>();
  const limit = Math.max(1, params?.limit ?? 500);

  if (params?.workspace_id && !shouldUseFallbackStorage()) {
    const store = getStore();
    const runs = await store.listRuns(params.workspace_id);
    for (const run of runs.slice(0, limit)) {
      const results =
        run.results_json && typeof run.results_json === "object" ? (run.results_json as Record<string, unknown>) : {};
      const parsed = toPersistedRun(results.intelligence_v4);
      if (parsed) {
        byRunId.set(parsed.run_id, parsed);
      }
    }
  }

  const tmpDir = path.resolve(process.cwd(), "tmp", "intelligence_v4");
  if (fs.existsSync(tmpDir)) {
    const files = fs
      .readdirSync(tmpDir)
      .filter((name) => name.endsWith(".json"))
      .slice(0, limit);
    for (const file of files) {
      const payload = readJsonFile<unknown>(path.join(tmpDir, file));
      const parsed = toPersistedRun(payload);
      if (parsed && (!params?.workspace_id || parsed.workspace_id === params.workspace_id)) {
        byRunId.set(parsed.run_id, parsed);
      }
    }
  }

  for (const runId of listRunIdsFromArtifactFiles().slice(0, limit)) {
    if (byRunId.has(runId)) continue;
    const parsed = loadPersistedV4RunFromArtifactFiles(runId);
    if (parsed && (!params?.workspace_id || parsed.workspace_id === params.workspace_id)) {
      byRunId.set(parsed.run_id, parsed);
    }
  }

  return [...byRunId.values()]
    .sort((a, b) => {
      const aTime = new Date(a.finished_at ?? a.started_at).getTime();
      const bTime = new Date(b.finished_at ?? b.started_at).getTime();
      return bTime - aTime;
    })
    .slice(0, limit);
}
