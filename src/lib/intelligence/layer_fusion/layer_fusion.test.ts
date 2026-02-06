import { describe, expect, it } from "vitest";

import type { SnapshotV2 } from "@/lib/decision/v2/conclusion_schema_v2";
import { normalizeUploadBuffersToDataPack } from "@/src/lib/intelligence/pack_normalizer";
import { buildSnapshotFromPack } from "@/src/lib/intelligence/snapshot_from_pack";

import { buildLayerFusion } from "./layer_fusion";

function makeSnapshotV2(params: {
  slice_start: string;
  slice_end: string;
  lookback_days: number;
  quotes_count: number;
  quotes_approved_count: number;
  invoices_count: number;
  decision_lag_band: "very_low" | "low" | "medium" | "high" | "very_high";
  volatility_band: "very_low" | "low" | "medium" | "high" | "very_high";
}): SnapshotV2 {
  return {
    snapshot_version: "snapshot_v2",
    pii_scrubbed: true,
    window: {
      slice_start: params.slice_start,
      slice_end: params.slice_end,
      report_date: params.slice_end,
      lookback_days: params.lookback_days,
      sample_confidence: "high",
      window_type: "custom",
    },
    activity_signals: {
      quotes: {
        quotes_count: params.quotes_count,
        quotes_approved_count: params.quotes_approved_count,
        approval_rate_band: "medium",
        decision_lag_band: params.decision_lag_band,
        quote_total_bands: { small: 0, medium: 0, large: 0 },
      },
      invoices: {
        invoices_count: params.invoices_count,
        invoices_paid_count: 0,
        invoice_total_bands: { small: 0, medium: 0, large: 0 },
        payment_lag_band_distribution: { very_low: 0, low: 0, medium: 0, high: 0, very_high: 0 },
      },
    },
    volatility_band: params.volatility_band,
    season: { phase: "Active", strength: "moderate", predictability: "medium" },
    input_costs: [],
  } as SnapshotV2;
}

describe("buildLayerFusion", () => {
  it("computes linkage + timing and selects invoicing focus when scheduled→invoiced is slow", () => {
    const snapshot = makeSnapshotV2({
      slice_start: "2025-01-01",
      slice_end: "2025-12-31",
      lookback_days: 365,
      quotes_count: 12,
      quotes_approved_count: 12,
      invoices_count: 12,
      decision_lag_band: "low",
      volatility_band: "medium",
    });

    const quotes = Array.from({ length: 12 }).map((_, i) => {
      const id = `Q-${i + 1}`;
      const created = new Date(Date.UTC(2025, 0, 1 + i, 0, 0, 0));
      const approved = new Date(Date.UTC(2025, 0, 3 + i, 0, 0, 0));
      return {
        id,
        status: "approved",
        created_at: created.toISOString(),
        approved_at: approved.toISOString(),
        total: 1250,
      };
    });

    const jobsLinked = quotes.map((q, i) => {
      const approved = new Date(q.approved_at!);
      const scheduled = new Date(approved.getTime() + 3 * 24 * 60 * 60 * 1000);
      return {
        id: `EV-${i + 1}`,
        status: "scheduled",
        scheduled_at: scheduled.toISOString(),
        related_quote_id: q.id,
      };
    });

    const jobsUnlinked = Array.from({ length: 18 }).map((_, i) => ({
      id: `EV-U-${i + 1}`,
      status: "scheduled",
      scheduled_at: new Date(Date.UTC(2025, 1, 1 + i, 0, 0, 0)).toISOString(),
    }));

    const invoices = quotes.map((q, i) => {
      const scheduled = new Date(jobsLinked[i].scheduled_at!);
      const issued = new Date(scheduled.getTime() + 25 * 24 * 60 * 60 * 1000);
      const paid = new Date(issued.getTime() + 30 * 24 * 60 * 60 * 1000);
      return {
        id: `INV-${i + 1}`,
        status: "paid",
        issued_at: issued.toISOString(),
        paid_at: paid.toISOString(),
        total: 1250,
        related_quote_id: q.id,
      };
    });

    const pack = {
      version: "data_pack_v0",
      customers: [],
      quotes,
      invoices,
      jobs: [...jobsLinked, ...jobsUnlinked],
      expenses: [],
    };

    const fusion = buildLayerFusion({ companyPack: pack, snapshot_v2: snapshot, lookbackDays: 365, diagnose_mode: false });

    expect(fusion.linkage.linkage_weak).toBe(false);
    expect(fusion.linkage.quote_to_invoice_match_rate).toBeCloseTo(1, 5);
    expect(fusion.linkage.quote_to_job_match_rate).toBeCloseTo(1, 5);

    expect(fusion.timing.quote_created_to_approved_p50_days).toBeCloseTo(2, 3);
    expect(fusion.timing.approved_to_scheduled_p50_days).toBeCloseTo(3, 3);
    expect(fusion.timing.scheduled_to_invoiced_p50_days).toBeCloseTo(25, 3);
    expect(fusion.timing.invoiced_to_paid_p50_days).toBeCloseTo(30, 3);

    expect(fusion.pressure_patterns.length).toBeGreaterThan(0);
    expect(fusion.pressure_patterns[0]?.id).toBe("billing_gap");
    expect(fusion.recommended_focus).toBe("invoicing");
  });

  it("works end-to-end from upload buffers (quotes + invoices + calendar) and produces at least one pattern", async () => {
    const quotesCsv = [
      "Quote ID,Created At,Total,Status,Approved At",
      "Q-1,2025-02-03 09:45:00,350.00,Sent,",
      "Q-2,2025-03-10 10:15:00,1250.00,Approved,2025-03-12 12:00:00",
      "Q-3,2025-03-20 10:15:00,950.00,Approved,2025-03-21 12:00:00",
      "Q-4,2025-03-25 10:15:00,1500.00,Approved,2025-03-26 12:00:00",
      "Q-5,2025-04-01 10:15:00,1750.00,Approved,2025-04-02 12:00:00",
      "Q-6,2025-04-05 10:15:00,900.00,Approved,2025-04-06 12:00:00",
      "Q-7,2025-04-10 10:15:00,800.00,Approved,2025-04-11 12:00:00",
      "Q-8,2025-04-15 10:15:00,1100.00,Approved,2025-04-16 12:00:00",
      "Q-9,2025-04-20 10:15:00,1150.00,Approved,2025-04-21 12:00:00",
      "Q-10,2025-04-25 10:15:00,1200.00,Approved,2025-04-26 12:00:00",
      "",
    ].join("\n");

    const invoicesCsv = [
      "Invoice #,Created date,Issued date,Marked paid date,Total ($),Balance ($),Status,Quote ID",
      "INV-1,2025-02-08 11:15:00,2025-02-08 11:15:00,2025-02-15 14:00:00,1250.00,0.00,Paid,Q-2",
      "INV-2,2025-04-01 08:00:00,2025-04-01 08:00:00,,250.00,250.00,Unpaid,Q-1",
      "INV-3,2025-04-02 08:00:00,2025-04-02 08:00:00,2025-04-15 08:00:00,950.00,0.00,Paid,Q-3",
      "INV-4,2025-04-03 08:00:00,2025-04-03 08:00:00,2025-04-20 08:00:00,1500.00,0.00,Paid,Q-4",
      "INV-5,2025-04-04 08:00:00,2025-04-04 08:00:00,2025-04-25 08:00:00,1750.00,0.00,Paid,Q-5",
      "INV-6,2025-04-05 08:00:00,2025-04-05 08:00:00,2025-04-28 08:00:00,900.00,0.00,Paid,Q-6",
      "INV-7,2025-04-06 08:00:00,2025-04-06 08:00:00,2025-04-30 08:00:00,800.00,0.00,Paid,Q-7",
      "INV-8,2025-04-07 08:00:00,2025-04-07 08:00:00,2025-05-02 08:00:00,1100.00,0.00,Paid,Q-8",
      "INV-9,2025-04-08 08:00:00,2025-04-08 08:00:00,2025-05-05 08:00:00,1150.00,0.00,Paid,Q-9",
      "INV-10,2025-04-09 08:00:00,2025-04-09 08:00:00,2025-05-06 08:00:00,1200.00,0.00,Paid,Q-10",
      "",
    ].join("\n");

    const calendarCsv = [
      "Event ID,Start Date,Start Time,End Date,End Time,Status,Quote ID",
      "EV-1,03/15/2025,09:00 AM,03/15/2025,11:00 AM,Scheduled,Q-2",
      "EV-2,03/22/2025,01:30 PM,03/22/2025,02:30 PM,Scheduled,Q-3",
      "EV-3,03/27/2025,01:30 PM,03/27/2025,02:30 PM,Scheduled,Q-4",
      "EV-4,04/03/2025,01:30 PM,04/03/2025,02:30 PM,Scheduled,Q-5",
      "EV-5,04/07/2025,01:30 PM,04/07/2025,02:30 PM,Scheduled,Q-6",
      "EV-6,04/12/2025,01:30 PM,04/12/2025,02:30 PM,Scheduled,Q-7",
      "EV-7,04/17/2025,01:30 PM,04/17/2025,02:30 PM,Scheduled,Q-8",
      "EV-8,04/22/2025,01:30 PM,04/22/2025,02:30 PM,Scheduled,Q-9",
      "EV-9,04/27/2025,01:30 PM,04/27/2025,02:30 PM,Scheduled,Q-10",
      "EV-10,05/01/2025,01:30 PM,05/01/2025,02:30 PM,Scheduled,Q-1",
      "",
    ].join("\n");

    const { pack, stats } = await normalizeUploadBuffersToDataPack(
      [
        { filename: "quotes.csv", buffer: Buffer.from(quotesCsv, "utf8") },
        { filename: "invoices.csv", buffer: Buffer.from(invoicesCsv, "utf8") },
        { filename: "calendar.csv", buffer: Buffer.from(calendarCsv, "utf8") },
      ],
      "Jobber"
    );

    const { snapshot, input_recognition } = buildSnapshotFromPack(pack, {
      pack_stats: stats,
      report_date: "2026-02-01T00:00:00.000Z",
      lookback_days: 400,
    });

    expect(input_recognition.quotes_detected_count).toBeGreaterThan(0);
    expect(input_recognition.invoices_detected_count).toBeGreaterThan(0);
    expect(pack.jobs?.length ?? 0).toBeGreaterThan(0);

    const fusion = buildLayerFusion({
      companyPack: pack,
      snapshot_v2: snapshot,
      lookbackDays: snapshot.window.lookback_days,
      diagnose_mode: false,
    });

    expect(fusion.pressure_patterns.length).toBeGreaterThan(0);
    expect(fusion.recommended_focus).not.toBe("data_fix");
  });
});
