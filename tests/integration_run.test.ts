import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { parseFile } from "../src/lib/intelligence/file_parsers";
import { normalizeExportsToDataPack } from "../src/lib/intelligence/pack_normalizer";
import { runAnalysisFromPack } from "../src/lib/intelligence/run_analysis";

describe("runAnalysisFromPack", () => {
  it("returns a run_id and conclusion in mock mode", async () => {
    process.env.INTELLIGENCE_MODE = "mock";
    const quotePath = path.resolve("fixtures", "quotes_export.csv");
    const invoicePath = path.resolve("fixtures", "invoices_export.csv");

    const parsed = await Promise.all([
      parseFile("quotes_export.csv", fs.readFileSync(quotePath)),
      parseFile("invoices_export.csv", fs.readFileSync(invoicePath)),
    ]);

    const { pack } = normalizeExportsToDataPack(parsed, "Jobber");
    const result = await runAnalysisFromPack({
      run_id: "test-run-id",
      pack,
      workspace_id: "test-workspace",
      website_url: null,
      ctx: { learning_source: "mock" },
    });

    expect(result.run_id).toBe("test-run-id");
    expect(Boolean(result.conclusion) || Boolean(result.presented_coherence_v1)).toBe(true);
    expect(result.validation.ok).toBe(true);
  });
});
