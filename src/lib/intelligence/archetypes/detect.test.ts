import { describe, expect, it } from "vitest";
import { detectOperatingArchetypes } from "./detect";
import type { SnapshotV2 } from "@/lib/decision/v2/conclusion_schema_v2";

const baseSnapshot: SnapshotV2 = {
  snapshot_version: "snapshot_v2",
  pii_scrubbed: false,
  window: {
    slice_start: "2024-01-01",
    slice_end: "2024-12-31",
    report_date: "2024-12-31",
    lookback_days: 365,
    sample_confidence: "high",
  },
  activity_signals: {
    quotes: {
      quotes_count: 100,
      quotes_approved_count: 50,
      approval_rate_band: "medium",
      decision_lag_band: "low",
      quote_total_bands: { small: 30, medium: 50, large: 20 },
    },
    invoices: {
      invoices_count: 50,
      invoices_paid_count: 45,
      invoice_total_bands: { small: 15, medium: 25, large: 10 },
      payment_lag_band_distribution: {
        very_low: 10,
        low: 20,
        medium: 10,
        high: 5,
        very_high: 0,
      },
    },
  },
  volatility_band: "low",
  season: {
    phase: "Active",
    strength: "weak",
    predictability: "medium",
  },
  input_costs: [],
};

describe("detectOperatingArchetypes", () => {
  describe("quote_to_job archetype", () => {
    it("should detect when quotes with approval tracking exist", () => {
      const snapshot: SnapshotV2 = {
        ...baseSnapshot,
        activity_signals: {
          ...baseSnapshot.activity_signals,
          quotes: {
            quotes_count: 25,
            quotes_approved_count: 15,
            approval_rate_band: "medium",
            decision_lag_band: "medium",
            quote_total_bands: { small: 10, medium: 10, large: 5 },
          },
        },
      };
      const result = detectOperatingArchetypes(snapshot);
      const archetype = result.archetypes.find((a) => a.id === "quote_to_job");
      expect(archetype).toBeDefined();
      expect(archetype?.confidence).toMatch(/medium|high/);
    });

    it("should NOT detect with insufficient quotes", () => {
      const snapshot: SnapshotV2 = {
        ...baseSnapshot,
        activity_signals: {
          ...baseSnapshot.activity_signals,
          quotes: {
            quotes_count: 3,
            quotes_approved_count: 1,
            approval_rate_band: "low",
            decision_lag_band: "low",
            quote_total_bands: { small: 2, medium: 1, large: 0 },
          },
        },
      };
      const result = detectOperatingArchetypes(snapshot);
      const archetype = result.archetypes.find((a) => a.id === "quote_to_job");
      expect(archetype).toBeUndefined();
    });
  });

  describe("ticket_driven archetype", () => {
    it("should detect HIGH confidence with high volume and small tickets", () => {
      const snapshot: SnapshotV2 = {
        ...baseSnapshot,
        activity_signals: {
          ...baseSnapshot.activity_signals,
          invoices: {
            invoices_count: 80,
            invoices_paid_count: 75,
            invoice_total_bands: { small: 50, medium: 25, large: 5 },
            payment_lag_band_distribution: {
              very_low: 30,
              low: 30,
              medium: 15,
              high: 5,
              very_high: 0,
            },
          },
        },
      };
      const result = detectOperatingArchetypes(snapshot);
      const archetype = result.archetypes.find((a) => a.id === "ticket_driven");
      expect(archetype).toBeDefined();
      expect(archetype?.confidence).toBe("high");
    });

    it("should NOT detect with low invoice count", () => {
      const snapshot: SnapshotV2 = {
        ...baseSnapshot,
        activity_signals: {
          ...baseSnapshot.activity_signals,
          invoices: {
            invoices_count: 10,
            invoices_paid_count: 9,
            invoice_total_bands: { small: 6, medium: 3, large: 1 },
            payment_lag_band_distribution: {
              very_low: 5,
              low: 4,
              medium: 1,
              high: 0,
              very_high: 0,
            },
          },
        },
      };
      const result = detectOperatingArchetypes(snapshot);
      const archetype = result.archetypes.find((a) => a.id === "ticket_driven");
      expect(archetype).toBeUndefined();
    });
  });

  describe("inventory_sensitive archetype", () => {
    it("should detect when volatile input costs tracked", () => {
      const snapshot: SnapshotV2 = {
        ...baseSnapshot,
        input_costs: [
          {
            name: "Material A",
            unit: "unit",
            current: 100,
            change_30d_pct: 15,
            change_90d_pct: 25,
            volatility_band: "high",
          },
          {
            name: "Material B",
            unit: "unit",
            current: 50,
            change_30d_pct: 8,
            change_90d_pct: 12,
            volatility_band: "medium",
          },
        ],
      };
      const result = detectOperatingArchetypes(snapshot);
      const archetype = result.archetypes.find((a) => a.id === "inventory_sensitive");
      expect(archetype).toBeDefined();
      expect(archetype?.evidence.length).toBeGreaterThan(0);
    });

    it("should NOT detect without input cost data", () => {
      const result = detectOperatingArchetypes(baseSnapshot);
      const archetype = result.archetypes.find((a) => a.id === "inventory_sensitive");
      expect(archetype).toBeUndefined();
    });
  });

  describe("project_heavy archetype", () => {
    it("should detect with large ticket concentration", () => {
      const snapshot: SnapshotV2 = {
        ...baseSnapshot,
        activity_signals: {
          ...baseSnapshot.activity_signals,
          invoices: {
            invoices_count: 10,
            invoices_paid_count: 9,
            invoice_total_bands: { small: 1, medium: 3, large: 6 },
            payment_lag_band_distribution: {
              very_low: 2,
              low: 3,
              medium: 3,
              high: 2,
              very_high: 0,
            },
          },
          quotes: {
            ...baseSnapshot.activity_signals.quotes,
            decision_lag_band: "high",
          },
        },
      };
      const result = detectOperatingArchetypes(snapshot);
      const archetype = result.archetypes.find((a) => a.id === "project_heavy");
      expect(archetype).toBeDefined();
      expect(archetype?.confidence).toMatch(/medium|high/);
    });

    it("should NOT detect with no invoices", () => {
      const snapshot: SnapshotV2 = {
        ...baseSnapshot,
        activity_signals: {
          ...baseSnapshot.activity_signals,
          invoices: {
            invoices_count: 0,
            invoices_paid_count: 0,
            invoice_total_bands: { small: 0, medium: 0, large: 0 },
            payment_lag_band_distribution: {
              very_low: 0,
              low: 0,
              medium: 0,
              high: 0,
              very_high: 0,
            },
          },
        },
      };
      const result = detectOperatingArchetypes(snapshot);
      const archetype = result.archetypes.find((a) => a.id === "project_heavy");
      expect(archetype).toBeUndefined();
    });
  });

  describe("seasonal_spike_driven archetype", () => {
    it("should detect HIGH confidence with high volatility and strong season", () => {
      const snapshot: SnapshotV2 = {
        ...baseSnapshot,
        volatility_band: "high",
        season: {
          phase: "Peak",
          strength: "strong",
          predictability: "high",
        },
      };
      const result = detectOperatingArchetypes(snapshot);
      const archetype = result.archetypes.find((a) => a.id === "seasonal_spike_driven");
      expect(archetype).toBeDefined();
      expect(archetype?.confidence).toBe("high");
    });

    it("should NOT detect with low volatility", () => {
      const result = detectOperatingArchetypes(baseSnapshot);
      const archetype = result.archetypes.find((a) => a.id === "seasonal_spike_driven");
      expect(archetype).toBeUndefined();
    });
  });

  describe("general behavior", () => {
    it("should return empty array when no invoices or quotes", () => {
      const emptySnapshot: SnapshotV2 = {
        ...baseSnapshot,
        activity_signals: {
          quotes: {
            quotes_count: 0,
            quotes_approved_count: 0,
            approval_rate_band: "very_low",
            decision_lag_band: "low",
            quote_total_bands: { small: 0, medium: 0, large: 0 },
          },
          invoices: {
            invoices_count: 0,
            invoices_paid_count: 0,
            invoice_total_bands: { small: 0, medium: 0, large: 0 },
            payment_lag_band_distribution: {
              very_low: 0,
              low: 0,
              medium: 0,
              high: 0,
              very_high: 0,
            },
          },
        },
      };
      const result = detectOperatingArchetypes(emptySnapshot);
      const archetype = result.archetypes.find((a) => a.id === "seasonal_spike_driven");
      expect(archetype).toBeUndefined();
    });
  });

  describe("general behavior", () => {
    it("should return empty array when no invoices or quotes", () => {
      const emptySnapshot: SnapshotV2 = {
        ...baseSnapshot,
        activity_signals: {
          quotes: {
            quotes_count: 0,
            quotes_approved_count: 0,
            approval_rate_band: "very_low",
            decision_lag_band: "low",
            quote_total_bands: { small: 0, medium: 0, large: 0 },
          },
          invoices: {
            invoices_count: 0,
            invoices_paid_count: 0,
            invoice_total_bands: { small: 0, medium: 0, large: 0 },
            payment_lag_band_distribution: {
              very_low: 0,
              low: 0,
              medium: 0,
              high: 0,
              very_high: 0,
            },
          },
        },
      };
      const result = detectOperatingArchetypes(emptySnapshot);
      expect(result.archetypes).toHaveLength(0);
      expect(result.notes).toBeDefined();
    });

    it("should select primary archetype from detected", () => {
      const snapshot: SnapshotV2 = {
        ...baseSnapshot,
        activity_signals: {
          ...baseSnapshot.activity_signals,
          invoices: {
            invoices_count: 80,
            invoices_paid_count: 75,
            invoice_total_bands: { small: 55, medium: 20, large: 5 },
            payment_lag_band_distribution: {
              very_low: 35,
              low: 30,
              medium: 10,
              high: 5,
              very_high: 0,
            },
          },
        },
        volatility_band: "high",
        season: {
          phase: "Peak",
          strength: "strong",
          predictability: "high",
        },
      };
      const result = detectOperatingArchetypes(snapshot);
      expect(result.archetypes.length).toBeGreaterThan(0);
      expect(result.primary).toBeDefined();
    });
  });
});

