import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ingestDocs } from "../ml/rag/ingest";
import { getRagContext } from "../ml/rag";
import { clearStore } from "../ml/rag/store";

const dbPath = path.join(process.cwd(), "ml", "rag", "rag_test.db");

function resetDb() {
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }
}

describe("rag retrieval scoping", () => {
  beforeEach(() => {
    process.env.ML_RAG_DB_PATH = dbPath;
    process.env.ML_RAG_EMBED_MODE = "mock";
    resetDb();
  });

  afterEach(() => {
    clearStore();
    resetDb();
    delete process.env.ML_RAG_DB_PATH;
    delete process.env.ML_RAG_EMBED_MODE;
  });

  it("returns only documents from the requested workspace", async () => {
    await ingestDocs([
      {
        id: "w1-doc",
        workspace_id: "w1",
        business_id: "b1",
        content: "HVAC scheduling constraints summary.",
        source: "tool_summary",
      },
      {
        id: "w2-doc",
        workspace_id: "w2",
        business_id: "b2",
        content: "SECRET W2 content should never appear.",
        source: "tool_summary",
      },
    ]);

    const context = await getRagContext({
      workspace_id: "w1",
      business_id: "b1",
      query: "scheduling constraints",
    });

    expect(context.context_ids).toEqual(expect.arrayContaining(["w1-doc"]));
    expect(context.context_ids).not.toEqual(expect.arrayContaining(["w2-doc"]));
    expect(context.context).toContain("HVAC scheduling");
    expect(context.context).not.toContain("SECRET W2");
  });
});
