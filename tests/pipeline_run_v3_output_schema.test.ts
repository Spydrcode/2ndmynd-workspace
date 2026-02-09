import { describe, it, expect } from "vitest";

import { callTool } from "../mcp/tool_registry";
import { TEST_OWNER_INTENT_INTAKE, TEST_SNAPSHOT_V2 } from "./helpers/pipeline_v3_fixtures";

describe("pipeline.run_v3 output schema", () => {
  it("returns coherence snapshot, presented artifact, and drift fields", async () => {
    const result = await callTool("pipeline.run_v3", {
      mode: "initial",
      client_id: "test-client-output-schema",
      run_id: "schema-run-1",
      snapshot: TEST_SNAPSHOT_V2,
      owner_intent_intake: TEST_OWNER_INTENT_INTAKE,
    });

    const out = result as Record<string, unknown>;
    expect(out).toHaveProperty("artifact");
    expect(out).toHaveProperty("summary");
    expect(out).toHaveProperty("coherence_snapshot");
    expect(out).toHaveProperty("presented_coherence_v1");
    expect(out).toHaveProperty("coherence_drift");
    expect(out).toHaveProperty("intent_overrides");
    expect(out.coherence_snapshot).toBeTruthy();
    expect(out.presented_coherence_v1).toBeTruthy();
    expect(out.coherence_drift).toBeNull();
  });
});
