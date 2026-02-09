import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import type { DataPackV0 } from "@/src/lib/intelligence/data_pack_v0";

import { buildStageInput, createRuntimeState } from "../../pipeline/context_builder";
import { runPipelineV4 } from "../../pipeline/run_pipeline_v4";
import { runFtStage } from "../ft_stage_runner";
import { STAGE_NAMES, STAGE_TRAINING_SPECS } from "../stages";

function makePack(): DataPackV0 {
  return {
    version: "data_pack_v0",
    source_tool: "test",
    created_at: "2026-02-09T00:00:00.000Z",
    quotes: [
      {
        id: "q1",
        status: "approved",
        created_at: "2026-01-01T00:00:00.000Z",
        approved_at: "2026-01-05T00:00:00.000Z",
        total: 2600,
      },
      {
        id: "q2",
        status: "approved",
        created_at: "2026-01-10T00:00:00.000Z",
        approved_at: "2026-01-16T00:00:00.000Z",
        total: 2100,
      },
      {
        id: "q3",
        status: "approved",
        created_at: "2026-01-12T00:00:00.000Z",
        approved_at: "2026-01-19T00:00:00.000Z",
        total: 1800,
      },
    ],
    invoices: [
      {
        id: "i1",
        status: "paid",
        issued_at: "2026-01-15T00:00:00.000Z",
        paid_at: "2026-01-18T00:00:00.000Z",
        total: 2400,
      },
      {
        id: "i2",
        status: "paid",
        issued_at: "2026-01-18T00:00:00.000Z",
        paid_at: "2026-01-22T00:00:00.000Z",
        total: 1700,
      },
    ],
    jobs: [],
    customers: [],
  };
}

async function makeValidQuantExample(approved: boolean) {
  const pack = makePack();
  const runId = `ft-quant-${crypto.randomUUID()}`;
  const workspaceId = "ft-quant-workspace";

  const pipelineResult = await runPipelineV4({
    run_id: runId,
    workspace_id: workspaceId,
    business_name: "Harbor Service",
    industry: "plumbing",
    emyth_role: "mixed",
    snapshot_window_mode: "last_90_days",
    pack,
  });

  if (!pipelineResult.ok) {
    throw new Error(`Failed to create test fixture row: ${pipelineResult.error.reason}`);
  }

  const state = createRuntimeState({
    run_id: runId,
    workspace_id: workspaceId,
    business_name: "Harbor Service",
    industry: "plumbing",
    emyth_role: "mixed",
    snapshot_window_mode: "last_90_days",
    pack,
  });

  const input = buildStageInput("quant_signals", state);
  return {
    id: `run:${runId}/stage:quant_signals`,
    created_at: new Date().toISOString(),
    client_id: workspaceId,
    industry: "plumbing",
    input,
    output: pipelineResult.stage_artifacts.quant_signals,
    approved,
    grades: {
      schema: "pass",
      doctrine: "pass",
      drift: "pass",
    },
    model: {
      model_id: "deterministic:quant-v1",
      prompt_version: "v1",
    },
    notes: "",
  };
}

function writeJsonl(filePath: string, rows: unknown[]) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
}

describe("ft_stage_runner", () => {
  let validApprovedRow: Awaited<ReturnType<typeof makeValidQuantExample>>;
  let validUnapprovedRow: Awaited<ReturnType<typeof makeValidQuantExample>>;

  beforeAll(async () => {
    validApprovedRow = await makeValidQuantExample(true);
    validUnapprovedRow = await makeValidQuantExample(false);
  });

  it("keeps stage registry definitions complete", () => {
    expect(STAGE_NAMES).toEqual([
      "quant_signals",
      "emyth_owner_load",
      "competitive_lens",
      "blue_ocean",
      "synthesis_decision",
    ]);

    for (const stage of STAGE_NAMES) {
      const spec = STAGE_TRAINING_SPECS[stage];
      expect(spec.stage_name).toBe(stage);
      expect(spec.dataset_path.endsWith(".jsonl")).toBe(true);
      expect(spec.input_schema_id.length).toBeGreaterThan(0);
      expect(spec.output_schema_id.length).toBeGreaterThan(0);
      expect(spec.minimum_examples_to_train).toBeGreaterThan(0);
    }
  });

  it("filters to approved rows by default", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ft-stage-approved-"));
    const datasetPath = path.join(tempRoot, "dataset.jsonl");
    writeJsonl(datasetPath, [validApprovedRow, validUnapprovedRow]);

    const result = await runFtStage({
      stage: "quant_signals",
      dataset_path: datasetPath,
      suffix: "quant-approved-filter",
      dry_run: true,
      approved_only: true,
      min_rows: 1,
      output_root: path.join(tempRoot, "out"),
    });

    expect(result.accepted_rows).toBe(1);
    expect(fs.existsSync(result.training_file_path)).toBe(true);

    const lineCount = fs
      .readFileSync(result.training_file_path, "utf8")
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0).length;

    expect(lineCount).toBe(1);
  });

  it("rejects rows that fail schema validation", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ft-stage-schema-"));
    const datasetPath = path.join(tempRoot, "dataset.jsonl");

    const invalidRow = {
      ...validApprovedRow,
      output: {
        ...validApprovedRow.output,
        schema_version: "bad_schema_version",
      },
    };

    writeJsonl(datasetPath, [invalidRow]);

    await expect(
      runFtStage({
        stage: "quant_signals",
        dataset_path: datasetPath,
        suffix: "quant-schema-reject",
        dry_run: true,
        approved_only: true,
        min_rows: 1,
        output_root: path.join(tempRoot, "out"),
      })
    ).rejects.toThrow(/Not enough valid rows/);
  });
});
