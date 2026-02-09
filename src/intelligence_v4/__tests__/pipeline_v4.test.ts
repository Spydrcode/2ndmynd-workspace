import crypto from "node:crypto";

import { describe, expect, it } from "vitest";

import type { DataPackV0 } from "@/src/lib/intelligence/data_pack_v0";

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
        approved_at: "2026-01-08T00:00:00.000Z",
        total: 2400,
      },
      {
        id: "q2",
        status: "approved",
        created_at: "2026-01-10T00:00:00.000Z",
        approved_at: "2026-01-20T00:00:00.000Z",
        total: 1100,
      },
    ],
    invoices: [
      {
        id: "i1",
        status: "paid",
        issued_at: "2026-01-12T00:00:00.000Z",
        paid_at: "2026-01-25T00:00:00.000Z",
        total: 2400,
      },
    ],
    jobs: [],
    customers: [],
  };
}

describe("runPipelineV4", () => {
  it("returns a valid decision artifact on success", async () => {
    const result = await runPipelineV4({
      run_id: `test-v4-${crypto.randomUUID()}`,
      workspace_id: "test-workspace",
      business_name: "Northline Plumbing",
      industry: "plumbing",
      emyth_role: "mixed",
      snapshot_window_mode: "last_90_days",
      pack: makePack(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(Object.keys(result.presented_decision_v1.paths).sort()).toEqual(["A", "B", "C"]);
    expect(["A", "B", "C"]).toContain(result.presented_decision_v1.recommended_path);
    expect(result.presented_decision_v1.first_30_days.length).toBeGreaterThanOrEqual(5);
    expect(result.presented_decision_v1.first_30_days.length).toBeLessThanOrEqual(9);
  });

  it("stops on doctrine violation and returns structured failure", async () => {
    const result = await runPipelineV4({
      run_id: `test-v4-${crypto.randomUUID()}`,
      workspace_id: "test-workspace",
      business_name: "Dashboard Plumbing",
      industry: "plumbing",
      emyth_role: "mixed",
      snapshot_window_mode: "last_90_days",
      pack: makePack(),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.stage_failed.length).toBeGreaterThan(0);
    expect(result.error.reason.length).toBeGreaterThan(0);
    expect(result.error.next_action.length).toBeGreaterThan(0);
  });
});