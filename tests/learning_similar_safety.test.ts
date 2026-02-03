import { describe, it, expect } from "vitest";
import { sanitizeSimilarResults } from "../src/lib/learning/vector_index/similar_sanitize";

describe("learning similar response safety", () => {
  it("strips disallowed fields", () => {
    const input = [
      {
        id: "vec-1",
        run_id: "run-1",
        industry_key: "hvac",
        created_at: "2026-02-03T00:00:00.000Z",
        score: 0.91,
        pressure_keys: ["fragility"],
        boundary_class: "confirm_mappings",
        embedding_model: "text-embedding-3-small",
        embedding_dim: 1536,
        metadata: { secret: "nope" },
        summary: "should not leak",
      },
    ] as any;

    const result = sanitizeSimilarResults(input);
    expect(result[0]).not.toHaveProperty("metadata");
    expect(result[0]).not.toHaveProperty("summary");
    expect(Object.keys(result[0]).sort()).toEqual(
      [
        "boundary_class",
        "created_at",
        "embedding_dim",
        "embedding_model",
        "id",
        "industry_key",
        "pressure_keys",
        "run_id",
        "score",
      ].sort()
    );
  });
});
