import { describe, it, expect } from "vitest";
import { assertValid, validateTrainExample } from "../ml/schemas/validators";
import type { TrainExample } from "../ml/logging/log_types";

describe("schema validation", () => {
  it("accepts a valid TrainExample", () => {
    const example: TrainExample = {
      id: "ex-1",
      split: "gold",
      instruction: "Provide next steps.",
      expected_output_json: { next_steps: ["Review invoices"] },
      tags: ["schema"],
      created_at: new Date().toISOString(),
      reviewer: "reviewer",
      quality: { score: 4, notes: "solid" },
    };
    expect(() => assertValid(validateTrainExample, example, "TrainExample")).not.toThrow();
  });

  it("rejects an invalid TrainExample", () => {
    const badExample = {
      id: "ex-2",
      split: "growth",
      instruction: "Missing quality score",
      expected_output_json: {},
      tags: [],
      created_at: new Date().toISOString(),
      reviewer: "reviewer",
      quality: { score: 0, notes: "bad" },
    } as unknown as TrainExample;
    expect(() => assertValid(validateTrainExample, badExample, "TrainExample")).toThrow();
  });
});
