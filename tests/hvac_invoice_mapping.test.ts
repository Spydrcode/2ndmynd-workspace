import { describe, expect, it } from "vitest";

import { parseFile } from "../src/lib/intelligence/file_parsers";
import { normalizeExportsToDataPack } from "../src/lib/intelligence/pack_normalizer";
import { buildSnapshotFromPack } from "../src/lib/intelligence/snapshot_from_pack";

describe("HVAC invoice mapping", () => {
  it("recognizes invoices + paid invoices from common HVAC-style headers", async () => {
    const csv = [
      "Invoice #,Created date,Issued date,Marked paid date,Total ($),Balance ($),Status,Quote ID",
      "INV-9001,2026-01-05 09:12:00,2026-01-05 09:12:00,2026-01-10 16:01:00,1250.00,0.00,Paid,Q-1005",
      "INV-9002,2026-01-15 14:30:00,2026-01-15 14:30:00,,350.00,350.00,Sent,Q-1012",
      "",
    ].join("\n");

    const parsed = [await parseFile("hvac_invoices.csv", Buffer.from(csv, "utf8"))];
    const { pack } = normalizeExportsToDataPack(parsed, "Jobber");

    const { snapshot, input_recognition } = buildSnapshotFromPack(pack, {
      report_date: "2026-02-01T00:00:00.000Z",
      lookback_days: 120,
    });

    expect(snapshot.activity_signals.invoices.invoices_count).toBeGreaterThan(0);
    expect(snapshot.activity_signals.invoices.invoices_paid_count).toBeGreaterThan(0);
    expect(input_recognition.invoices_detected_count).toBeGreaterThan(0);
    expect(input_recognition.invoices_paid_detected_count).toBeGreaterThan(0);
  });
});
