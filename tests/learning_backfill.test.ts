import { describe, it, expect } from "vitest";
import { parseVectorDocLine, validateVectorDocForSupabase } from "../src/lib/learning/vector_index/backfill_utils";

describe("vector backfill parsing", () => {
  it("defaults embedding_model and derives embedding_dim", () => {
    const line = JSON.stringify({
      id: "vec-1",
      run_id: "run-1",
      source: "mock",
      industry_key: "hvac",
      created_at: new Date().toISOString(),
      embedding: Array.from({ length: 1536 }).map(() => 0),
      summary: "industry=hvac; top5_share=0.5;",
      metadata: {},
    });
    const parsed = parseVectorDocLine(line, "text-embedding-3-small");
    expect(parsed?.doc.embedding_model).toBe("text-embedding-3-small");
    expect(parsed?.doc.embedding_dim).toBe(1536);
  });

  it("rejects non-1536 embeddings", () => {
    const line = JSON.stringify({
      id: "vec-2",
      run_id: "run-2",
      source: "mock",
      industry_key: "hvac",
      created_at: new Date().toISOString(),
      embedding: Array.from({ length: 10 }).map(() => 0),
      summary: "industry=hvac; top5_share=0.5;",
      metadata: {},
    });
    const parsed = parseVectorDocLine(line, "text-embedding-3-small")!;
    const errors = validateVectorDocForSupabase(parsed.doc, parsed.removedMetadataKeys, 1536);
    expect(errors).toContain("embedding_dim_mismatch");
  });

  it("rejects summaries with PII patterns", () => {
    const line = JSON.stringify({
      id: "vec-3",
      run_id: "run-3",
      source: "mock",
      industry_key: "hvac",
      created_at: new Date().toISOString(),
      embedding: Array.from({ length: 1536 }).map(() => 0),
      summary: "contact me at test@example.com",
      metadata: {},
    });
    const parsed = parseVectorDocLine(line, "text-embedding-3-small")!;
    const errors = validateVectorDocForSupabase(parsed.doc, parsed.removedMetadataKeys, 1536);
    expect(errors).toContain("summary_contains_pii");
  });
});
