import { describe, it, expect, vi } from "vitest";

import { TEST_OWNER_INTENT_INTAKE, TEST_SNAPSHOT_V2 } from "./helpers/pipeline_v3_fixtures";

const storeMock = {
  getRun: vi.fn(async () => ({
    run_id: "rerun-target-1",
    workspace_id: "workspace-1",
    results_json: {
      intent_overrides: {
        run_id: "rerun-target-1",
        updated_at: "2026-02-01T00:00:00.000Z",
        overrides: [
          {
            tag: "speed_responsiveness",
            confirmed: false,
            recorded_at: "2026-02-01T00:00:00.000Z",
          },
        ],
      },
    },
  })),
};

vi.mock("../src/lib/intelligence/store", () => ({
  getStore: () => storeMock,
}));

describe("overrides reapplied on rerun", () => {
  it("loads persisted overrides by run_id and applies them to value confidence", async () => {
    const { handler: runPipelineV3 } = await import("../mcp/tools/run_pipeline_v3");

    const result = await runPipelineV3({
      mode: "initial",
      client_id: "rerun-client-1",
      run_id: "rerun-target-1",
      snapshot: TEST_SNAPSHOT_V2,
      owner_intent_intake: {
        ...TEST_OWNER_INTENT_INTAKE,
        value_prop_tags: ["speed_responsiveness"],
      },
    });

    const speedConfidence = result.coherence_snapshot?.intent.value_confidence?.find(
      (item) => item.tag === "speed_responsiveness"
    );

    expect(result.intent_overrides).toBeTruthy();
    expect(speedConfidence?.score).toBe(0);
    expect(speedConfidence?.confidence).toBe("low");
  });
});
