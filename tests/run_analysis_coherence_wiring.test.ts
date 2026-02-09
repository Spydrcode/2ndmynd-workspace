import { describe, it, expect, vi, beforeEach } from "vitest";

import type { DataPackV0 } from "../src/lib/intelligence/data_pack_v0";

const callToolMock = vi.fn();

vi.mock("@/mcp/tool_registry", () => ({
  callTool: callToolMock,
}));

vi.mock("@/lib/rag", () => ({
  ingestRagDoc: vi.fn(async () => undefined),
  getRagContext: vi.fn(async () => []),
}));

vi.mock("../src/lib/intelligence/web_profile", () => ({
  buildBusinessProfile: vi.fn(async () => ({
    name_guess: "Test Biz",
    summary: "Local services business.",
    services: ["Repairs"],
    location_mentions: [],
    industry_bucket: "home_services",
    domain: null,
    found_contact: false,
    website_present: false,
    opportunity_signals: {
      has_phone: false,
      has_email: false,
      has_booking_cta: false,
      has_financing: false,
      has_reviews: false,
      has_service_pages: false,
      has_maintenance_plan: false,
    },
  })),
}));

describe("runAnalysis coherence wiring", () => {
  beforeEach(() => {
    callToolMock.mockReset();
  });

  it("calls pipeline.run_v3 by default and returns presented coherence", async () => {
    callToolMock.mockImplementation(async (name: string) => {
      if (name === "pipeline.run_v3") {
        return {
          artifact: { version: "closure_v1" },
          coherence_snapshot: {
            version: "coherence_v1",
            run_id: "run-1",
            created_at: new Date().toISOString(),
            intent: {
              version: "intent_v2",
              value_proposition: { statement: "Clear communication", tags: ["clarity_communication"] },
              priorities_ranked: ["predictability"],
              non_negotiables: [],
              boundaries: {},
              definition_of_success: "Steady operations",
              anti_goals: [],
              confidence: "high",
              captured_at: new Date().toISOString(),
            },
            signals: {
              version: "signals_v1",
              signals: [],
              window: { start_date: "2026-01-01", end_date: "2026-01-31", records_used: 2 },
              missing_data: [],
            },
            value_prop_alignment: [],
            tensions: [],
            paths: [],
            end_state: { state: "awaiting_commitment", timestamp: new Date().toISOString() },
            confidence: { level: "high", reason: "Clear intent and usable data." },
          },
          presented_coherence_v1: {
            version: "presented_coherence_v1",
            run_id: "run-1",
            created_at: new Date().toISOString(),
            headline: "Alignment summary",
            subheadline: "No major tensions.",
            confidence: { level: "high", reason: "Clear intent and usable data." },
            alignment_summary: "Alignment summary",
            intent_summary: { value_proposition: "Clear communication", priorities: [], non_negotiables: [] },
            signal_overview: { total_records: 2, window: "2026-01-01 to 2026-01-31", highlights: [], missing_data: [] },
            alignment_section: { title: "Alignment", items: [] },
            tension_cards: [],
            path_cards: [],
            end_state: "awaiting_commitment",
          },
          coherence_drift: null,
          intent_overrides: null,
          summary: "ok",
        };
      }
      throw new Error(`Unexpected tool: ${name}`);
    });

    const { runAnalysisFromPack } = await import("../src/lib/intelligence/run_analysis");

    const pack: DataPackV0 = {
      version: "data_pack_v0",
      source_tool: "Jobber",
      created_at: "2026-02-01T00:00:00.000Z",
      quotes: [
        {
          id: "q-1",
          status: "approved",
          created_at: "2026-01-05T00:00:00.000Z",
          approved_at: "2026-01-08T00:00:00.000Z",
          total: 1250,
        },
      ],
      invoices: [
        {
          id: "i-1",
          status: "paid",
          issued_at: "2026-01-10T00:00:00.000Z",
          paid_at: "2026-01-20T00:00:00.000Z",
          total: 1250,
        },
      ],
      jobs: [],
      customers: [],
    };

    const result = await runAnalysisFromPack({
      run_id: "run-1",
      workspace_id: "workspace-1",
      website_url: null,
      pack,
      ctx: { learning_source: "mock" },
    });

    expect(callToolMock).toHaveBeenCalledWith(
      "pipeline.run_v3",
      expect.objectContaining({
        mode: "initial",
        run_id: "run-1",
        client_id: "workspace-1",
      })
    );
    expect(result.presented_coherence_v1?.version).toBe("presented_coherence_v1");
  });
});
