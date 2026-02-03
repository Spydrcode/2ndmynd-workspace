import { describe, it, expect } from "vitest";
import { dedupeExamples } from "../ml/curation/dedupe";
import type { TrainExample } from "../ml/logging/log_types";

const baseExample: TrainExample = {
  id: "ex-1",
  split: "growth",
  instruction: "Generate next steps.",
  expected_output_json: { next_steps: ["Call client"] },
  tags: ["doctrine"],
  created_at: new Date().toISOString(),
  reviewer: "test",
  quality: { score: 5, notes: "ok" },
};

describe("dedupeExamples", () => {
  it("removes duplicates based on instruction+output", () => {
    const dup: TrainExample = { ...baseExample, id: "ex-2" };
    const results = dedupeExamples([baseExample, dup]);
    expect(results).toHaveLength(1);
  });
});
