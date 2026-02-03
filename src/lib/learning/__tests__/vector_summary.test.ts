import { describe, it, expect } from "vitest";
import { buildVectorSummary } from "../vector_index/build_vector_doc";
import { createEmptySignalsV1Record } from "../signals_v1";
import type { TrainingExampleV1 } from "../types";

describe("Vector summary", () => {
  it("uses only safe tokens", () => {
    const features = createEmptySignalsV1Record();
    features.industry_key = "hvac";
    features.source = "mock";
    features.window_rule = "last_90_days";
    features.decision_lag_days_p50 = 3.5;
    features.top5_invoice_share = 0.62;
    const example: TrainingExampleV1 = {
      id: "ex1",
      created_at: new Date().toISOString(),
      run_id: "run1",
      source: "mock",
      industry_key: "hvac",
      feature_schema: "signals_v1",
      pipeline_version: "v2",
      features,
      targets: {
        pressure_keys: ["fragility", "follow_up"],
        boundary_class: "confirm_mappings",
      },
    };
    const summary = buildVectorSummary(example);
    expect(summary).not.toMatch(/@/);
    expect(summary).toMatch(/^[a-z0-9=;.,_\-\s]+$/i);
  });
});
