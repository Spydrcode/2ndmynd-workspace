import { describe, expect, it } from "vitest";

import { normalizeUploadBuffersToDataPack } from "../src/lib/intelligence/pack_normalizer";
import { buildSnapshotFromPack } from "../src/lib/intelligence/snapshot_from_pack";

describe("multi-file merge (quotes + invoices + calendar)", () => {
  it("does not short-circuit and records files_attempted by type", async () => {
    const quotesCsv = [
      "Quote ID,Created At,Total,Status,Approved At",
      "Q-1,2025-02-03 09:45:00,350.00,Sent,",
      "Q-2,2025-03-10 10:15:00,1250.00,Approved,2025-03-12 12:00:00",
      "",
    ].join("\n");

    const invoicesCsv = [
      "Invoice #,Created date,Issued date,Marked paid date,Total ($),Balance ($),Status,Quote ID",
      "INV-1,2025-02-08 11:15:00,2025-02-08 11:15:00,2025-02-15 14:00:00,1250.00,0.00,Paid,Q-2",
      "INV-2,2025-04-01 08:00:00,2025-04-01 08:00:00,,250.00,250.00,Unpaid,Q-1",
      "",
    ].join("\n");

    const calendarCsv = [
      "Event ID,Start Date,Start Time,End Date,End Time,Status",
      "EV-1,02/10/2025,09:00 AM,02/10/2025,11:00 AM,Scheduled",
      "EV-2,03/15/2025,01:30 PM,03/15/2025,02:30 PM,Scheduled",
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

    expect(stats.files).toBe(3);
    expect(stats.file_categories?.quotes ?? 0).toBeGreaterThan(0);
    expect(stats.file_categories?.invoices ?? 0).toBeGreaterThan(0);
    expect(stats.file_categories?.calendar ?? 0).toBeGreaterThan(0);
    expect((stats.files_attempted ?? []).length).toBe(3);

    expect(pack.quotes?.length ?? 0).toBeGreaterThan(0);
    expect(pack.invoices?.length ?? 0).toBeGreaterThan(0);
    expect(pack.jobs?.length ?? 0).toBeGreaterThan(0);

    const { snapshot, input_recognition } = buildSnapshotFromPack(pack, {
      pack_stats: stats,
      report_date: "2026-02-01T00:00:00.000Z",
      lookback_days: 400,
    });

    expect(snapshot.activity_signals.quotes.quotes_count).toBeGreaterThan(0);
    expect(snapshot.activity_signals.invoices.invoices_count).toBeGreaterThan(0);

    expect(input_recognition.files_attempted.length).toBe(3);
    expect(input_recognition.by_type.quotes.files_seen).toBeGreaterThan(0);
    expect(input_recognition.by_type.invoices.files_seen).toBeGreaterThan(0);
    expect(input_recognition.by_type.calendar.files_seen).toBeGreaterThan(0);
    expect(input_recognition.by_type.quotes.date_parse_fail_count).toBe(0);
  });
});
