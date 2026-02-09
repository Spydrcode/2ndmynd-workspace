import { describe, it, expect, vi } from "vitest";

import { TEST_SNAPSHOT_V2 } from "./helpers/pipeline_v3_fixtures";

vi.mock("../src/lib/intelligence/store", () => ({
  getStore: () => ({
    getRun: vi.fn(async () => null),
  }),
}));

describe("pipeline.run_v3 intake schema validation", () => {
  it("returns safe intake validation error text", async () => {
    const { handler: runPipelineV3 } = await import("../mcp/tools/run_pipeline_v3");

    await expect(
      runPipelineV3({
        mode: "initial",
        client_id: "client-intake-validation",
        run_id: "intake-validation-run",
        snapshot: TEST_SNAPSHOT_V2,
        owner_intent_intake: {
          intake_version: "0.2",
          value_prop_tags: ["clarity_communication"],
        } as never,
      })
    ).rejects.toThrow("We couldn't validate the intake; please retry.");
  });
});
