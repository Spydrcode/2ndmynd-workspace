/**
 * Unit tests for snapshot window and exclusion counting
 */

import { describe, it, expect } from "vitest";
import { buildSnapshotV2 } from "@/lib/decision/v2/snapshot/build_snapshot_v2";

describe("Snapshot Window and Exclusions", () => {
  const mockQuotes = [
    { created_at: "2025-11-01", total: 1000, status: "pending" },
    { created_at: "2025-12-15", total: 1500, status: "approved", approved_at: "2025-12-20" },
    { created_at: "2026-01-10", total: 2000, status: "approved", approved_at: "2026-01-15" },
    { created_at: "2026-01-25", total: 2500, status: "pending" },
    { created_at: "2026-02-01", total: 1800, status: "pending" },
  ];

  const mockInvoices = [
    { issued_at: "2025-10-15", total: 1200, status: "paid", paid_at: "2025-11-01" },
    { issued_at: "2025-12-20", total: 1500, status: "paid", paid_at: "2026-01-05" },
    { issued_at: "2026-01-15", total: 2000, status: "paid", paid_at: "2026-02-01" },
    { issued_at: "2026-01-28", total: 2200, status: "pending" },
    { issued_at: "2026-02-02", total: 1900, status: "pending" },
  ];

  it("should compute exclusions for 90-day window", () => {
    const snapshot = buildSnapshotV2({
      quotes: mockQuotes,
      invoices: mockInvoices,
      report_date: "2026-02-03",
      lookback_days: 90,
    });

    expect(snapshot.exclusions).toBeDefined();
    // Quotes before Nov 5, 2025 should be excluded
    expect(snapshot.exclusions?.quotes_outside_window_count).toBe(1); // Nov 1 quote
    // Invoices before Nov 5, 2025 should be excluded
    expect(snapshot.exclusions?.invoices_outside_window_count).toBe(1); // Oct 15 invoice
  });

  it("should set window_type correctly", () => {
    const snapshot90 = buildSnapshotV2({
      quotes: mockQuotes,
      invoices: mockInvoices,
      report_date: "2026-02-03",
      lookback_days: 90,
    });
    expect(snapshot90.window.window_type).toBe("last_90_days");

    const snapshot365 = buildSnapshotV2({
      quotes: mockQuotes,
      invoices: mockInvoices,
      report_date: "2026-02-03",
      lookback_days: 365,
    });
    expect(snapshot365.window.window_type).toBe("last_12_months");

    const snapshotCustom = buildSnapshotV2({
      quotes: mockQuotes,
      invoices: mockInvoices,
      report_date: "2026-02-03",
      lookback_days: 60,
    });
    expect(snapshotCustom.window.window_type).toBe("custom");
    expect(snapshotCustom.window.window_reason).toContain("60-day");
  });

  it("should count items within window correctly", () => {
    const snapshot = buildSnapshotV2({
      quotes: mockQuotes,
      invoices: mockInvoices,
      report_date: "2026-02-03",
      lookback_days: 90,
    });

    // Should count quotes from Nov 5 onwards (4 quotes)
    expect(snapshot.activity_signals.quotes.quotes_count).toBe(4);
    // Should count invoices from Nov 5 onwards (4 invoices)
    expect(snapshot.activity_signals.invoices.invoices_count).toBe(4);
  });

  it("should handle empty inputs", () => {
    const snapshot = buildSnapshotV2({
      quotes: [],
      invoices: [],
      report_date: "2026-02-03",
      lookback_days: 90,
    });

    expect(snapshot.exclusions?.quotes_outside_window_count).toBe(0);
    expect(snapshot.exclusions?.invoices_outside_window_count).toBe(0);
    expect(snapshot.activity_signals.quotes.quotes_count).toBe(0);
    expect(snapshot.activity_signals.invoices.invoices_count).toBe(0);
  });

  it("should compute window dates correctly", () => {
    const snapshot = buildSnapshotV2({
      quotes: mockQuotes,
      invoices: mockInvoices,
      report_date: "2026-02-03",
      lookback_days: 90,
    });

    expect(snapshot.window.slice_end).toBe("2026-02-03");
    expect(snapshot.window.report_date).toBe("2026-02-03");
    expect(snapshot.window.lookback_days).toBe(90);
    
    // Window start should be 90 days before Feb 3, 2026
    const expectedStart = new Date("2026-02-03");
    expectedStart.setDate(expectedStart.getDate() - 90);
    expect(snapshot.window.slice_start).toBe(expectedStart.toISOString().slice(0, 10));
  });

  it("should set sample confidence based on signal count", () => {
    const snapshotHigh = buildSnapshotV2({
      quotes: Array(30).fill({ created_at: "2026-01-15", total: 1000, status: "pending" }),
      invoices: Array(25).fill({ issued_at: "2026-01-15", total: 1000, status: "pending" }),
      report_date: "2026-02-03",
      lookback_days: 90,
    });
    expect(snapshotHigh.window.sample_confidence).toBe("high");

    const snapshotMedium = buildSnapshotV2({
      quotes: Array(15).fill({ created_at: "2026-01-15", total: 1000, status: "pending" }),
      invoices: Array(10).fill({ issued_at: "2026-01-15", total: 1000, status: "pending" }),
      report_date: "2026-02-03",
      lookback_days: 90,
    });
    expect(snapshotMedium.window.sample_confidence).toBe("medium");

    const snapshotLow = buildSnapshotV2({
      quotes: Array(5).fill({ created_at: "2026-01-15", total: 1000, status: "pending" }),
      invoices: Array(5).fill({ issued_at: "2026-01-15", total: 1000, status: "pending" }),
      report_date: "2026-02-03",
      lookback_days: 90,
    });
    expect(snapshotLow.window.sample_confidence).toBe("low");
  });
});
