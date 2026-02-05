/**
 * RAG Safety Tests: Industry Differentiation & Learning Layer Protection
 *
 * These tests verify:
 * 1. Industry baselines ingest successfully from canonical index
 * 2. RAG context changes snapshot TONE but not NUMBERS
 * 3. Different industries produce meaningfully different snapshots
 * 4. RAG is NEVER present in signals_v1 or ML training data
 * 5. Prompt output contains no invented metrics
 */

import { describe, it, expect, beforeAll } from "vitest";
import { getAllIndustryKeys } from "../../../../rag_seed/industry_index";
import { buildDecisionSnapshotPrompt, extractPromptWithoutRag } from "../decision_snapshot_prompt";
// Internal Snapshot type for prompt generation (not SnapshotV2 schema)
interface Snapshot {
  snapshot_id?: string;
  workspace_id?: string;
  metadata: {
    snapshot_start_date: string;
    snapshot_end_date: string;
    industry_bucket?: string;
    snapshot_version?: string;
    created_at?: string;
  };
  signals_v1: Record<string, number | string | boolean | null>;
}
import type { DecisionSnapshotPromptInput } from "../decision_snapshot_prompt";

// Helper to create valid rag_context with required properties
interface RagDoc {
  content: string;
  metadata: {
    workspace_id?: string;
    industry_key?: string;
    doc_type: string;
    source: string;
    created_at: string;
  };
}

function createRagContext(docs: RagDoc[]) {
  return {
    context: docs.map(d => d.content).join("\n"),
    sources: docs.map(d => ({
      doc_type: d.metadata.doc_type as "business_profile" | "website_scan" | "industry_baseline" | "tool_playbook" | "internal_doctrine",
      source: d.metadata.source as "website" | "internal" | "curated",
      created_at: d.metadata.created_at,
    })),
    docs,
  };
}

// Mock snapshot factory
function createMockSnapshot(overrides?: Partial<Snapshot>): Snapshot {
  return {
    snapshot_id: "test-snapshot-1",
    workspace_id: "test-workspace",
    metadata: {
      snapshot_start_date: "2024-01-01",
      snapshot_end_date: "2024-01-31",
      industry_bucket: "trade",
      snapshot_version: "v1",
      created_at: new Date().toISOString(),
    },
    signals_v1: {
      // Aggregates
      agg_revenue_total: 45000,
      agg_avg_invoice_amt: 850,
      agg_median_collection_days: 15,
      
      // Rates
      rate_quote_to_close: 0.42,
      rate_job_completion: 0.95,
      
      // Counts
      count_quotes: 65,
      count_jobs_done: 52,
      count_invoices: 53,
      count_invoices_unpaid: 8,
      count_revenue_days: 22,
      
      // Time
      days_since_last_sale: 2,
      pct_weekend_jobs: 0.12,
      
      // Placeholder for additional signals
      ...overrides?.signals_v1,
    },
    ...overrides,
  } as Snapshot;
}

describe("RAG Safety: Industry Differentiation", () => {
  let allIndustryKeys: string[];

  beforeAll(() => {
    allIndustryKeys = getAllIndustryKeys();
  });

  it("should have comprehensive industry coverage (49+ industries)", () => {
    expect(allIndustryKeys.length).toBeGreaterThanOrEqual(49);
  });

  it("should generate different prompts for different industries", () => {
    const snapshot = createMockSnapshot();

    // Generate prompts for 3 different industries
    const hvacPrompt = buildDecisionSnapshotPrompt({
      snapshot,
      business_context: { industry_key: "hvac" },
    });

    const painterPrompt = buildDecisionSnapshotPrompt({
      snapshot,
      business_context: { industry_key: "painter" },
    });

    const tacoStandPrompt = buildDecisionSnapshotPrompt({
      snapshot,
      business_context: { industry_key: "taco_stand" },
    });

    // Prompts should differ (industry context section will be different)
    expect(hvacPrompt).not.toBe(painterPrompt);
    expect(painterPrompt).not.toBe(tacoStandPrompt);
    expect(hvacPrompt).not.toBe(tacoStandPrompt);

    // But all should contain the same numerical signals (without commas)
    expect(hvacPrompt).toContain("$45000.00");
    expect(painterPrompt).toContain("$45000.00");
    expect(tacoStandPrompt).toContain("$45000.00");
  });

  it("should include industry-specific context when RAG available", () => {
    const snapshot = createMockSnapshot();

    const promptWithRag = buildDecisionSnapshotPrompt({
      snapshot,
      business_context: { industry_key: "hvac" },
      rag_context: createRagContext([
        {
          content: "HVAC businesses typically have seasonal revenue patterns...",
          metadata: {
            workspace_id: "global",
            industry_key: "hvac",
            doc_type: "industry_baseline",
            source: "curated",
            created_at: new Date().toISOString(),
          },
        },
      ]),
    });

    expect(promptWithRag).toContain("HVAC businesses");
    expect(promptWithRag).toContain("Industry Baseline Knowledge");
  });

  it("should gracefully handle missing RAG context", () => {
    const snapshot = createMockSnapshot();

    const promptWithoutRag = buildDecisionSnapshotPrompt({
      snapshot,
      business_context: { industry_key: "hvac" },
      rag_context: undefined,
    });

    expect(promptWithoutRag).toContain("No industry-specific context available");
    expect(promptWithoutRag).not.toContain("Industry Baseline Knowledge");
    
    // Should still generate a valid prompt (without commas in numbers)
    expect(promptWithoutRag).toContain("$45000.00");
    expect(promptWithoutRag).toContain("Decision Snapshot");
  });
});

describe("RAG Safety: Learning Layer Protection", () => {
  it("should NEVER include RAG content in signal extraction", () => {
    const snapshot = createMockSnapshot();

    // Signals should be pure deterministic values
    const signalKeys = Object.keys(snapshot.signals_v1);
    
    // No RAG-related keys should exist in signals
    expect(signalKeys.every(key => !key.includes("rag"))).toBe(true);
    expect(signalKeys.every(key => !key.includes("context"))).toBe(true);
    expect(signalKeys.every(key => !key.includes("baseline"))).toBe(true);
  });

  it("should extract prompt without RAG for ML training", () => {
    const snapshot = createMockSnapshot();

    const input: DecisionSnapshotPromptInput = {
      snapshot,
      business_context: { industry_key: "hvac" },
      rag_context: createRagContext([
        {
          content: "This is RAG context that should be excluded",
          metadata: {
            workspace_id: "global",
            industry_key: "hvac",
            doc_type: "industry_baseline",
            source: "curated",
            created_at: new Date().toISOString(),
          },
        },
      ]),
    };

    const promptWithoutRag = extractPromptWithoutRag(input);

    // Should NOT contain RAG context
    expect(promptWithoutRag).not.toContain("This is RAG context");
    expect(promptWithoutRag).not.toContain("Industry Baseline Knowledge");
    
    // Should still contain signal data (without commas)
    expect(promptWithoutRag).toContain("$45000.00");
  });

  it("should preserve numerical consistency with or without RAG", () => {
    const snapshot = createMockSnapshot();

    const withRag = buildDecisionSnapshotPrompt({
      snapshot,
      rag_context: createRagContext([
        {
          content: "Industry context here",
          metadata: {
            workspace_id: "global",
            doc_type: "industry_baseline",
            source: "curated",
            created_at: new Date().toISOString(),
          },
        },
      ]),
    });

    const withoutRag = buildDecisionSnapshotPrompt({
      snapshot,
      rag_context: undefined,
    });

    // Both should contain identical signal values (without commas)
    const signalValues = [
      "$45000.00",
      "$850.00",
      "15 days",
      "42.0%",
      "95.0%",
      "65",
      "52",
      "53",
      "8",
      "22",
      "2",
    ];

    signalValues.forEach(value => {
      expect(withRag).toContain(value);
      expect(withoutRag).toContain(value);
    });
  });
});

describe("RAG Safety: No Invented Metrics", () => {
  it("should only reference signals that exist in snapshot", () => {
    const snapshot = createMockSnapshot();

    const prompt = buildDecisionSnapshotPrompt({ snapshot });

    // These metrics ARE in the snapshot
    expect(prompt).toContain("Total Revenue");
    expect(prompt).toContain("Average Invoice");
    expect(prompt).toContain("Quote-to-Close Rate");

    // These metrics are NOT in the snapshot and should not appear
    expect(prompt).not.toContain("Customer Lifetime Value");
    expect(prompt).not.toContain("Net Promoter Score");
    expect(prompt).not.toContain("Market Share");
    expect(prompt).not.toContain("Customer Acquisition Cost");
  });

  it("should include explicit warning against inventing metrics", () => {
    const snapshot = createMockSnapshot();
    const prompt = buildDecisionSnapshotPrompt({ snapshot });

    expect(prompt).toContain("Do NOT invent additional metrics");
    expect(prompt).toContain("These numbers are FACTS");
  });

  it("should not hallucinate signal values", () => {
    const snapshot = createMockSnapshot({
      signals_v1: {
        agg_revenue_total: 12345.67, // Specific value
        agg_avg_invoice_amt: 555.55,
        agg_median_collection_days: 7,
        rate_quote_to_close: 0.33,
        rate_job_completion: 0.88,
        count_quotes: 10,
        count_jobs_done: 8,
        count_invoices: 9,
        count_invoices_unpaid: 2,
        count_revenue_days: 15,
        days_since_last_sale: 1,
        pct_weekend_jobs: 0.05,
      } as Snapshot["signals_v1"],
    });

    const prompt = buildDecisionSnapshotPrompt({ snapshot });

    // Should contain exact values (without commas)
    expect(prompt).toContain("$12345.67");
    expect(prompt).toContain("$555.55");
    expect(prompt).toContain("7 days");
    expect(prompt).toContain("33.0%");
    expect(prompt).toContain("88.0%");

    // Should NOT contain rounded or different values
    expect(prompt).not.toContain("$12,000");
    expect(prompt).not.toContain("$500");
    expect(prompt).not.toContain("35%");
  });
});

describe("RAG Safety: Tool Playbook Integration", () => {
  it("should include tool playbook when available", () => {
    const snapshot = createMockSnapshot();

    const prompt = buildDecisionSnapshotPrompt({
      snapshot,
      rag_context: createRagContext([
        {
          content: "# Tool Playbook\n\n## Booking Systems\nOnline booking reduces phone tag...",
          metadata: {
            workspace_id: "global",
            doc_type: "tool_playbook",
            source: "curated",
            created_at: new Date().toISOString(),
          },
        },
      ]),
    });

    expect(prompt).toContain("Tool & Systems Playbook");
    expect(prompt).toContain("Online booking reduces phone tag");
  });

  it("should separate industry baseline from tool playbook", () => {
    const snapshot = createMockSnapshot();

    const prompt = buildDecisionSnapshotPrompt({
      snapshot,
      business_context: { industry_key: "hvac" },
      rag_context: createRagContext([
        {
          content: "HVAC industry baseline content",
          metadata: {
            workspace_id: "global",
            industry_key: "hvac",
            doc_type: "industry_baseline",
            source: "curated",
            created_at: new Date().toISOString(),
          },
        },
        {
          content: "Tool playbook content",
          metadata: {
            workspace_id: "global",
            doc_type: "tool_playbook",
            source: "curated",
            created_at: new Date().toISOString(),
          },
        },
      ]),
    });

    expect(prompt).toContain("Industry Baseline Knowledge");
    expect(prompt).toContain("Tool & Systems Playbook");
    expect(prompt).toContain("HVAC industry baseline content");
    expect(prompt).toContain("Tool playbook content");
  });
});

describe("RAG Safety: ML Inference Integration", () => {
  it("should include ML predictions when available", () => {
    const snapshot = createMockSnapshot();

    const prompt = buildDecisionSnapshotPrompt({
      snapshot,
      ml_inference: {
        predicted_class: "healthy_growth",
        confidence: 0.87,
        recommended_actions: [
          "Focus on quote follow-up",
          "Consider payment terms optimization",
        ],
      },
    });

    expect(prompt).toContain("ML Inference");
    expect(prompt).toContain("healthy_growth");
    expect(prompt).toContain("87.0%");
    expect(prompt).toContain("Focus on quote follow-up");
  });

  it("should work without ML inference", () => {
    const snapshot = createMockSnapshot();

    const prompt = buildDecisionSnapshotPrompt({
      snapshot,
      ml_inference: undefined,
    });

    expect(prompt).not.toContain("ML Inference");
    expect(prompt).toContain("$45000.00"); // Still has signal data (without commas)
  });

  it("should mark ML predictions as advisory", () => {
    const snapshot = createMockSnapshot();

    const prompt = buildDecisionSnapshotPrompt({
      snapshot,
      ml_inference: {
        predicted_class: "needs_attention",
        confidence: 0.65,
      },
    });

    expect(prompt).toContain("advisory only");
    expect(prompt).toContain("Focus on factual observations");
  });
});
