import { describe, it, expect } from "vitest";
import { sanitizeMetadata } from "../src/lib/learning/vector_index/metadata";

describe("vector metadata allowlist", () => {
  it("removes disallowed keys and invalid values", () => {
    const { clean, removedKeys } = sanitizeMetadata({
      source: "mock",
      industry_key: "hvac",
      pressure_keys: ["follow_up"],
      boundary_class: "stable",
      window_rule: "last_90_days",
      mapping_confidence_level: 2,
      run_id: "run-1",
      created_at: "2026-02-03T00:00:00.000Z",
      embedding_model: "text-embedding-3-small",
      embedding_dim: 1536,
      extra_secret: "nope",
      bad_value: { nested: true },
    });

    expect(removedKeys).toEqual(expect.arrayContaining(["extra_secret", "bad_value"]));
    expect(clean).not.toHaveProperty("extra_secret");
    expect(clean).not.toHaveProperty("bad_value");
    expect(clean).toHaveProperty("source");
    expect(clean).toHaveProperty("industry_key");
  });
});
