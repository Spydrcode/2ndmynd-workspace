import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

import { describe, expect, it } from "vitest";

import type { DataPackV0 } from "@/src/lib/intelligence/data_pack_v0";

import { buildStageInput, createRuntimeState } from "../../pipeline/context_builder";
import { runPipelineV4 } from "../../pipeline/run_pipeline_v4";
import { writeModelCard } from "../model_card";
import { runPromotionGate } from "../promotion/regression_gate";

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

async function makeValidQuantDatasetRow() {
  const pack = makePack();
  const runId = `promotion-quant-${crypto.randomUUID()}`;
  const workspaceId = "promotion-workspace";

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
    throw new Error(`Failed to create promotion fixture row: ${pipelineResult.error.reason}`);
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
    approved: true,
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

describe("promotion flow", () => {
  it("writes dry-run promotion report and does not modify model config", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "promotion-flow-"));
    const configPath = path.join(tempRoot, "models.json");
    const datasetPath = path.join(tempRoot, "stage_quant.jsonl");

    fs.copyFileSync(
      path.resolve(process.cwd(), "config", "intelligence_v4.models.json"),
      configPath
    );

    const row = await makeValidQuantDatasetRow();
    writeJsonl(datasetPath, [row]);

    const before = fs.readFileSync(configPath, "utf8");
    const result = await runPromotionGate({
      stage: "quant_signals",
      model: "deterministic:quant-v2-test",
      dataset_path: datasetPath,
      dry_run: true,
      force: true,
      approved_only: true,
      current_path: configPath,
      base_model: "gpt-4o-mini-2024-07-18",
      notes: "dry run test",
    });

    const after = fs.readFileSync(configPath, "utf8");

    expect(result.passed).toBe(true);
    expect(result.config_updated).toBe(false);
    expect(fs.existsSync(result.report_path)).toBe(true);
    expect(fs.existsSync(result.model_card_path)).toBe(true);
    expect(before).toBe(after);
  }, 30000);

  it("writes model card with required sections", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "model-card-"));
    const datasetPath = path.join(tempRoot, "dataset.jsonl");
    writeJsonl(datasetPath, [
      {
        created_at: "2026-02-09T00:00:00.000Z",
        industry: "plumbing",
        approved: true,
      },
    ]);

    const result = writeModelCard({
      stage: "synthesis_decision",
      model_id: "test-model-1",
      base_model: "gpt-4o-mini-2024-07-18",
      dataset_path: datasetPath,
      promotion_status: "candidate",
      notes: "test card",
    });

    const content = fs.readFileSync(result.file_path, "utf8");
    expect(content).toContain("## Purpose");
    expect(content).toContain("## Dataset Stats");
    expect(content).toContain("## Doctrine + Guardrails");
    expect(content).toContain("## Evals");
    expect(content).toContain("## Promotion Status");
  });
});
