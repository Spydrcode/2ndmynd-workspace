import { describe, expect, it } from "vitest";

import { presentArtifact } from "../lib/decision/v2/present";

describe("presentArtifact", () => {
  it("does not leak raw signal keys by default", () => {
    const snapshot = {
      snapshot_version: "snapshot_v2",
      pii_scrubbed: true,
      window: {
        slice_start: "2026-01-01",
        slice_end: "2026-02-01",
        report_date: "2026-02-01",
        lookback_days: 90,
        sample_confidence: "high",
      },
      activity_signals: {
        quotes: {
          quotes_count: 71,
          quotes_approved_count: 41,
          approval_rate_band: "medium",
          decision_lag_band: "high",
          quote_total_bands: { small: 30, medium: 30, large: 11 },
        },
        invoices: {
          invoices_count: 44,
          invoices_paid_count: 28,
          invoice_total_bands: { small: 18, medium: 20, large: 6 },
          payment_lag_band_distribution: { very_low: 10, low: 8, medium: 6, high: 3, very_high: 1 },
        },
      },
      volatility_band: "very_high",
      season: { phase: "Active", strength: "moderate", predictability: "medium" },
      input_costs: [],
    };

    const presented = presentArtifact({
      run_id: "run-123",
      created_at: "2026-02-01T00:00:00.000Z",
      mode: "mock",
      artifact: {
        conclusion: {
          conclusion_version: "conclusion_v2",
          pattern_id: "pattern-x",
          one_sentence_pattern: "Follow-up timing is slipping on mid-sized work.",
          decision: "Pick one owner for quote follow-up and run a 48-hour cadence on $750+ quotes.",
          why_this_now: "Recent signals point to longer decision timing and high volatility, which can create planning pressure.",
          boundary: "Keep follow-up inside a 48-hour window for $750+ quotes.",
          confidence: "high",
          season_context: "Active",
          evidence_signals: [
            "signals.activity_signals.invoices.invoices_paid_count=28",
            "signals.activity_signals.invoices.invoices_count=44",
            "signals.activity_signals.quotes.decision_lag_band=high",
            "signals.volatility_band=very_high",
          ],
          optional_next_steps: [],
        },
        snapshot,
        input_health: { date_range: "2026-01-01 - 2026-02-01", records_count: 100, coverage_warnings: [] },
        data_warnings: [],
      },
    });

    expect(presented.evidence_chips.length).toBeGreaterThan(0);
    expect(JSON.stringify(presented.evidence_chips)).not.toContain("signals.");
    expect(presented.technical_signals.length).toBeGreaterThan(0);
    expect(presented.technical_signals[0]?.key).toContain("signals.");
  });
});

