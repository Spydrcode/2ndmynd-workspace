import { describe, expect, it } from "vitest";
import { getArchetypeWatchList } from "./pressures";
import type { OperatingArchetype } from "./types";
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
    window_type: "last_12_months",
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

describe("getArchetypeWatchList", () => {
  it("should return empty items when no archetypes provided", () => {
    const result = getArchetypeWatchList([], baseSnapshot);
    expect(result.items).toHaveLength(0);
    expect(result.archetype_source).toBe("detected_archetypes");
  });

  it("should generate watch items for quote_to_job archetype", () => {
    const archetypes: OperatingArchetype[] = [
      {
        id: "quote_to_job",
        label: "Quote-to-Job Pattern",
        confidence: "high",
        evidence: ["High conversion"],
      },
    ];
    const result = getArchetypeWatchList(archetypes, baseSnapshot);
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items.every((item) => item.what_to_watch.length > 0)).toBe(true);
  });

  it("should generate watch items for ticket_driven archetype", () => {
    const archetypes: OperatingArchetype[] = [
      {
        id: "ticket_driven",
        label: "Ticket-Driven Operations",
        confidence: "high",
        evidence: [],
      },
    ];
    const result = getArchetypeWatchList(archetypes, baseSnapshot);
    expect(result.items.length).toBeGreaterThan(0);
  });

  it("should generate watch items for inventory_sensitive archetype", () => {
    const archetypes: OperatingArchetype[] = [
      {
        id: "inventory_sensitive",
        label: "Inventory-Sensitive Operations",
        confidence: "high",
        evidence: [],
      },
    ];
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
      ],
    };
    const result = getArchetypeWatchList(archetypes, snapshot);
    expect(result.items.length).toBeGreaterThan(0);
  });

  it("should generate watch items for project_heavy archetype", () => {
    const archetypes: OperatingArchetype[] = [
      {
        id: "project_heavy",
        label: "Project-Heavy Pattern",
        confidence: "high",
        evidence: [],
      },
    ];
    const result = getArchetypeWatchList(archetypes, baseSnapshot);
    expect(result.items.length).toBeGreaterThan(0);
  });

  it("should generate watch items for seasonal_spike_driven archetype", () => {
    const archetypes: OperatingArchetype[] = [
      {
        id: "seasonal_spike_driven",
        label: "Seasonal Spike Pattern",
        confidence: "high",
        evidence: [],
      },
    ];
    const snapshot: SnapshotV2 = {
      ...baseSnapshot,
      season: {
        phase: "Peak",
        strength: "strong",
        predictability: "high",
      },
    };
    const result = getArchetypeWatchList(archetypes, snapshot);
    expect(result.items.length).toBeGreaterThan(0);
  });

  it("should limit to max 4 items total", () => {
    const archetypes: OperatingArchetype[] = [
      { id: "quote_to_job", label: "Quote-to-Job Pattern", confidence: "high", evidence: [] },
      { id: "ticket_driven", label: "Ticket-Driven Operations", confidence: "high", evidence: [] },
      { id: "inventory_sensitive", label: "Inventory-Sensitive Operations", confidence: "high", evidence: [] },
      { id: "project_heavy", label: "Project-Heavy Pattern", confidence: "high", evidence: [] },
      { id: "seasonal_spike_driven", label: "Seasonal Spike Pattern", confidence: "high", evidence: [] },
    ];
    const result = getArchetypeWatchList(archetypes, baseSnapshot);
    expect(result.items.length).toBeLessThanOrEqual(4);
  });

  it("should include archetype_source metadata", () => {
    const archetypes: OperatingArchetype[] = [
      { id: "quote_to_job", label: "Quote-to-Job Pattern", confidence: "high", evidence: [] },
    ];
    const result = getArchetypeWatchList(archetypes, baseSnapshot);
    expect(result.archetype_source).toBe("detected_archetypes");
  });

  it("should ensure all items have required fields", () => {
    const archetypes: OperatingArchetype[] = [
      { id: "quote_to_job", label: "Quote-to-Job Pattern", confidence: "high", evidence: [] },
      { id: "ticket_driven", label: "Ticket-Driven Operations", confidence: "medium", evidence: [] },
    ];
    const result = getArchetypeWatchList(archetypes, baseSnapshot);
    expect(result.items.every((item) => typeof item.topic === "string" && item.topic.length > 0)).toBe(true);
    expect(result.items.every((item) => typeof item.why === "string" && item.why.length > 0)).toBe(true);
    expect(result.items.every((item) => typeof item.what_to_watch === "string" && item.what_to_watch.length > 0)).toBe(
      true
    );
  });

  it("should not duplicate topics across multiple archetypes", () => {
    const archetypes: OperatingArchetype[] = [
      { id: "quote_to_job", label: "Quote-to-Job Pattern", confidence: "high", evidence: [] },
      { id: "ticket_driven", label: "Ticket-Driven Operations", confidence: "high", evidence: [] },
    ];
    const result = getArchetypeWatchList(archetypes, baseSnapshot);
    const topics = result.items.map((item) => item.topic);
    const uniqueTopics = new Set(topics);
    expect(topics.length).toBe(uniqueTopics.size);
  });
});

