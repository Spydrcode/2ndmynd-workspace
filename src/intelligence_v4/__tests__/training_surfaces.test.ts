import crypto from "node:crypto";

import { describe, expect, it } from "vitest";

import type { DataPackV0 } from "@/src/lib/intelligence/data_pack_v0";

import { loadPersistedV4RunFromFallback } from "../pipeline/artifact_store";
import { buildStageInput, createRuntimeState } from "../pipeline/context_builder";
import { validateStageInput } from "../pipeline/input_schemas";
import { runPipelineV4 } from "../pipeline/run_pipeline_v4";

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
        approved_at: "2026-01-04T00:00:00.000Z",
        total: 2400,
      },
      {
        id: "q2",
        status: "approved",
        created_at: "2026-01-10T00:00:00.000Z",
        approved_at: "2026-01-16T00:00:00.000Z",
        total: 1800,
      },
    ],
    invoices: [
      {
        id: "i1",
        status: "paid",
        issued_at: "2026-01-13T00:00:00.000Z",
        paid_at: "2026-01-20T00:00:00.000Z",
        total: 2100,
      },
    ],
    jobs: [],
    customers: [],
  };
}

describe("v4 training surfaces", () => {
  it("builds and validates strict quant stage input", () => {
    const state = createRuntimeState({
      run_id: `input-test-${crypto.randomUUID()}`,
      workspace_id: "workspace-training",
      industry: "plumbing",
      emyth_role: "mixed",
      snapshot_window_mode: "last_90_days",
      pack: makePack(),
    });

    const quantInput = buildStageInput("quant_signals", state);
    const valid = validateStageInput("quant_signals", quantInput);
    expect(valid.ok).toBe(true);

    const mutated = {
      ...quantInput,
      context: {
        ...quantInput.context,
        unexpected_field: "not-allowed",
      },
    };
    const invalid = validateStageInput("quant_signals", mutated);
    expect(invalid.ok).toBe(false);
  });

  it("persists input and output artifacts for all stages", async () => {
    const run_id = `capture-test-${crypto.randomUUID()}`;
    const result = await runPipelineV4({
      run_id,
      workspace_id: "workspace-training",
      business_name: "Northline Services",
      industry: "plumbing",
      emyth_role: "mixed",
      snapshot_window_mode: "last_90_days",
      pack: makePack(),
    });

    expect(result.ok).toBe(true);
    const persisted = loadPersistedV4RunFromFallback(run_id);
    expect(persisted).not.toBeNull();
    if (!persisted) return;

    expect(persisted.stage_records).toHaveLength(5);
    for (const stageRecord of persisted.stage_records) {
      expect(stageRecord.input_artifact?.artifact_kind).toBe("stage_input_summary_v1");
      expect(stageRecord.output_artifact?.artifact_kind).toBe("stage_output_v1");
      expect(stageRecord.model_config.model_id.length).toBeGreaterThan(0);
      expect(stageRecord.model_config.prompt_version.length).toBeGreaterThan(0);
    }
  });
});

