import { describe, it, expect } from "vitest";

import { handler as runPipelineV3 } from "../mcp/tools/run_pipeline_v3";
import { TEST_OWNER_INTENT_INTAKE, TEST_SNAPSHOT_V2 } from "./helpers/pipeline_v3_fixtures";

describe("pipeline.run_v3 presenter integration", () => {
  it("produces presented_coherence_v1 with alignment, tensions, and paths", async () => {
    const result = await runPipelineV3({
      mode: "initial",
      client_id: "presenter-client-1",
      run_id: "presenter-run-1",
      snapshot: TEST_SNAPSHOT_V2,
      owner_intent_intake: TEST_OWNER_INTENT_INTAKE,
    });

    expect(result.presented_coherence_v1?.version).toBe("presented_coherence_v1");
    expect(result.presented_coherence_v1?.data_coverage_card).toBeDefined();
    expect(result.presented_coherence_v1?.alignment_section).toBeDefined();
    expect(Array.isArray(result.presented_coherence_v1?.tension_cards)).toBe(true);
    expect(Array.isArray(result.presented_coherence_v1?.path_cards)).toBe(true);
  });
});
