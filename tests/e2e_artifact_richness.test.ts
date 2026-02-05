import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { parseFile } from "../src/lib/intelligence/file_parsers";
import { normalizeExportsToDataPack } from "../src/lib/intelligence/pack_normalizer";
import { runAnalysisFromPack } from "../src/lib/intelligence/run_analysis";
import { ingestRagDoc, getRagContext } from "../src/lib/rag";
import { extractSignalsV1, SIGNALS_V1_KEYS } from "../src/lib/learning/signals_v1";

const RAG_MARKER = "RAG_TEST_MARKER_7b3d";

function readLastJsonlEntry(filePath: string) {
  if (!fs.existsSync(filePath)) return null;
  const lines = fs
    .readFileSync(filePath, "utf-8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;
  return JSON.parse(lines[lines.length - 1]);
}

describe("E2E artifact richness", () => {
  const originalEnv = { ...process.env };
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "artifact-richness-"));
    const ragDbPath = path.join(tempDir, "rag.db");
    const learningRoot = path.join(tempDir, "learning");

    process.env.INTELLIGENCE_MODE = "mock";
    process.env.ML_RAG_EMBED_MODE = "mock";
    process.env.ML_RAG_DB_PATH = ragDbPath;
    process.env.LEARNING_CAPTURE = "true";
    process.env.LEARNING_STORE_ROOT = learningRoot;
    process.env.LEARNING_VECTOR_BACKEND = "none";

    const html = "<html><title>Acme HVAC</title><body>HVAC installation and repair. Call 555-123-4567.</body></html>";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(html, { status: 200 }))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("builds a rich artifact and keeps RAG out of learning", async () => {
    const workspaceId = "test-workspace-artifact";
    const runId = "test-run-artifact";

    await ingestRagDoc({
      text: `Tool playbook context: ${RAG_MARKER}`,
      metadata: {
        workspace_id: workspaceId,
        industry_key: "trade",
        doc_type: "tool_playbook",
        source: "internal",
        created_at: new Date().toISOString(),
        run_id: runId,
      },
    });

    const ragContext = await getRagContext({
      query: "Need context for HVAC",
      filters: { workspace_id: workspaceId, doc_type: ["tool_playbook"] },
      limit: 3,
    });

    expect(ragContext.context).toContain(RAG_MARKER);

    const quotePath = path.resolve("fixtures", "quotes_export.csv");
    const invoicePath = path.resolve("fixtures", "invoices_export.csv");

    const parsed = await Promise.all([
      parseFile("quotes_export.csv", fs.readFileSync(quotePath)),
      parseFile("invoices_export.csv", fs.readFileSync(invoicePath)),
    ]);

    const { pack, stats } = normalizeExportsToDataPack(parsed, "Jobber");

    const result = await runAnalysisFromPack({
      run_id: runId,
      pack,
      pack_stats: stats,
      workspace_id: workspaceId,
      website_url: "https://example.com",
      ctx: { learning_source: "mock" },
    });

    expect(result.decision_artifact).toBeTruthy();
    const artifact = result.decision_artifact!;

    expect(artifact.takeaway).toBeTruthy();
    expect(artifact.next_7_days.length).toBeGreaterThanOrEqual(2);
    expect(artifact.next_7_days.length).toBeLessThanOrEqual(3);
    expect(artifact.boundary).toBeTruthy();
    expect(artifact.pressure_map.length).toBeLessThanOrEqual(3);

    if (artifact.benchmarks?.metrics) {
      expect(artifact.benchmarks.metrics.length).toBeGreaterThan(0);
    }

    if (artifact.evidence_summary) {
      expect(artifact.evidence_summary.quotes_count).toBeGreaterThan(0);
      expect(artifact.evidence_summary.invoices_count).toBeGreaterThan(0);
    }

    if (artifact.visuals_summary?.weekly_volume_series) {
      expect(artifact.visuals_summary.weekly_volume_series.length).toBeGreaterThan(0);
    }

    expect(artifact.website_opportunities?.length ?? 0).toBeGreaterThan(0);

    const { features } = extractSignalsV1(result);
    const featureKeys = Object.keys(features);
    expect(featureKeys.some((key) => key.toLowerCase().startsWith("rag"))).toBe(false);

    const examplesPath = path.join(process.env.LEARNING_STORE_ROOT!, "examples.jsonl");
    const lastExample = readLastJsonlEntry(examplesPath);
    expect(lastExample).toBeTruthy();

    const featureJson = JSON.stringify(lastExample.features ?? {});
    expect(featureJson).not.toContain(RAG_MARKER);
    expect(featureKeys.every((key) => SIGNALS_V1_KEYS.includes(key))).toBe(true);
  });
});
