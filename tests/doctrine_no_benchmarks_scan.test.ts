import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

import { handler as runPipelineV3 } from "../mcp/tools/run_pipeline_v3";
import { TEST_OWNER_INTENT_INTAKE, TEST_SNAPSHOT_V2 } from "./helpers/pipeline_v3_fixtures";

function collectStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap((item) => collectStrings(item));
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap((item) => collectStrings(item));
  }
  return [];
}

describe("doctrine benchmark scan", () => {
  it("has no peer/benchmark phrases in run-analysis context and fallback UI", () => {
    const files = [
      "src/lib/intelligence/run_analysis.ts",
      "src/app/app/results/[run_id]/DecisionArtifactView.tsx",
      "src/app/app/results/[run_id]/page_new.tsx",
    ];
    const forbidden = [/Benchmark Cohort/i, /peer benchmark/i, /You vs peers/i, /industry average/i];

    for (const relativePath of files) {
      const source = fs.readFileSync(path.resolve(relativePath), "utf8");
      for (const pattern of forbidden) {
        expect(source).not.toMatch(pattern);
      }
    }
  });

  it("produces presented coherence text with no benchmark phrasing", async () => {
    const result = await runPipelineV3({
      mode: "initial",
      client_id: "doctrine-client-1",
      run_id: "doctrine-run-1",
      snapshot: TEST_SNAPSHOT_V2,
      owner_intent_intake: TEST_OWNER_INTENT_INTAKE,
    });

    const text = collectStrings(result.presented_coherence_v1).join(" ");
    expect(text).not.toMatch(/\bbenchmark\b/i);
    expect(text).not.toMatch(/\bpeer\b/i);
    expect(text).not.toMatch(/\bindustry average\b/i);
    expect(text).not.toMatch(/\byou vs peers\b/i);
  });
});
