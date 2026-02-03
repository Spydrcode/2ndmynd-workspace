import { describe, it, expect, beforeEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { appendExample, listExamples, updateLabels } from "../store_jsonl";
import { createEmptySignalsV1Record } from "../signals_v1";
import type { TrainingExampleV1 } from "../types";

describe("JSONL store", () => {
  let storeRoot: string;

  beforeEach(() => {
    storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "learning-store-"));
    process.env.LEARNING_STORE_ROOT = storeRoot;
  });

  function makeExample(id: string, source: "mock" | "real", industry_key: TrainingExampleV1["industry_key"]): TrainingExampleV1 {
    const features = createEmptySignalsV1Record();
    features.industry_key = industry_key;
    features.source = source;
    features.window_rule = "last_90_days";
    features.window_days = 90;
    features.coverage_ratio = 1;
    features.mapping_confidence_level = 2;
    features.missingness_score = 0;
    return {
      id,
      created_at: new Date().toISOString(),
      run_id: `run-${id}`,
      source,
      industry_key,
      feature_schema: "signals_v1",
      pipeline_version: "v2",
      features,
      targets: {
        pressure_keys: [],
        boundary_class: "unknown",
      },
    };
  }

  it("appends and filters examples", async () => {
    appendExample(makeExample("a1", "mock", "hvac"));
    appendExample(makeExample("a2", "real", "plumbing"));

    const mockOnly = await listExamples({ source: "mock" });
    expect(mockOnly).toHaveLength(1);
    expect(mockOnly[0].id).toBe("a1");

    const hvacOnly = await listExamples({ industry_key: "hvac" });
    expect(hvacOnly).toHaveLength(1);
    expect(hvacOnly[0].id).toBe("a1");
  });

  it("attaches labels from sidecar files", async () => {
    appendExample(makeExample("b1", "mock", "hvac"));
    updateLabels("b1", { reviewer_score: 3, reviewer_notes: "good" });
    const results = await listExamples({ has_labels: true });
    expect(results).toHaveLength(1);
    expect(results[0].labels?.reviewer_score).toBe(3);
  });
});
