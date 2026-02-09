import { describe, it, expect } from "vitest";

import { buildResultsArtifact, type Run } from "../src/lib/intelligence/run_adapter";

describe("results artifact coherence fields", () => {
  it("surfaces presented_coherence_v1, coherence_snapshot, drift, and overrides", () => {
    const run: Run = {
      run_id: "run-artifact-1",
      created_at: new Date().toISOString(),
      results_json: {
        presented_coherence_v1: { version: "presented_coherence_v1", headline: "h" } as never,
        coherence_snapshot: { version: "coherence_v1", run_id: "run-artifact-1" } as never,
        coherence_drift: { version: "drift_v1", summary: "stable" } as never,
        intent_overrides: {
          run_id: "run-artifact-1",
          overrides: [{ tag: "clarity_communication", confirmed: true, recorded_at: new Date().toISOString() }],
          updated_at: new Date().toISOString(),
        },
      },
    };

    const artifact = buildResultsArtifact(run);
    expect(artifact.presented_coherence_v1).toBeTruthy();
    expect(artifact.coherence_snapshot).toBeTruthy();
    expect(artifact.coherence_drift).toBeTruthy();
    expect(artifact.intent_overrides).toBeTruthy();
  });
});
