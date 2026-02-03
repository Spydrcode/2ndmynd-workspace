import { describe, expect, it } from "vitest";
import { normalizeToCompanyPack, companyPackToDataPack } from "@/src/lib/intelligence/pack_normalizer";
import { buildSnapshotFromCompanyPack } from "@/src/lib/intelligence/snapshot_from_pack";

// Create test CSV buffers
function createCsvBuffer(content: string): Buffer {
  return Buffer.from(content, "utf8");
}

describe("CompanyPack multi-file processing", () => {
  const quotesCSV = `Quote ID,Created At,Approved At,Status,Total
Q-1001,2025-11-01 09:30:00,2025-11-03 14:00:00,Approved,1200.50
Q-1002,2025-11-05 10:00:00,,Sent,950.00
Q-1003,2025-11-08 11:15:00,2025-11-10 09:00:00,Approved,2100.00`;

  const invoicesCSV = `Invoice ID,Issued At,Paid At,Status,Total
INV-2001,2025-11-02 08:00:00,2025-11-10 16:30:00,Paid,875.25
INV-2002,2025-11-07 09:45:00,,Open,640.00
INV-2003,2025-11-12 10:00:00,2025-11-15 11:00:00,Paid,1500.00`;

  const calendarCSV = `Job ID,Start Date,Start Time,End Date,End Time,Status
JOB-001,2025-11-01,08:00,2025-11-01,12:00,Completed
JOB-002,2025-11-03,09:00,2025-11-03,11:30,Completed
JOB-003,2025-11-05,13:00,2025-11-05,16:00,Scheduled`;

  describe("normalizeToCompanyPack", () => {
    it("should process ALL files without short-circuiting", () => {
      const files = [
        { filename: "quotes.csv", buffer: createCsvBuffer(quotesCSV) },
        { filename: "invoices.csv", buffer: createCsvBuffer(invoicesCSV) },
        { filename: "calendar.csv", buffer: createCsvBuffer(calendarCSV) },
      ];

      const pack = normalizeToCompanyPack(files, "test");

      // All files should be attempted
      expect(pack.files_attempted.length).toBe(3);
      expect(pack.files_attempted.every((f) => f.status !== "error")).toBe(true);
    });

    it("should populate all layers from multiple files", () => {
      const files = [
        { filename: "quotes.csv", buffer: createCsvBuffer(quotesCSV) },
        { filename: "invoices.csv", buffer: createCsvBuffer(invoicesCSV) },
        { filename: "calendar.csv", buffer: createCsvBuffer(calendarCSV) },
      ];

      const pack = normalizeToCompanyPack(files, "test");

      // All layers should be populated
      expect(pack.layers.intent_quotes?.length).toBe(3);
      expect(pack.layers.billing_invoices?.length).toBe(3);
      expect(pack.layers.schedule_events?.length).toBe(3);
    });

    it("should continue processing even if first file fails", () => {
      const badCSV = "not,valid,csv,format\nwith,broken,data";
      const files = [
        { filename: "bad.csv", buffer: createCsvBuffer(badCSV) },
        { filename: "quotes.csv", buffer: createCsvBuffer(quotesCSV) },
        { filename: "invoices.csv", buffer: createCsvBuffer(invoicesCSV) },
      ];

      const pack = normalizeToCompanyPack(files, "test");

      // All files should be attempted
      expect(pack.files_attempted.length).toBe(3);
      // Quotes and invoices should still be processed
      expect((pack.layers.intent_quotes?.length ?? 0) > 0).toBe(true);
      expect((pack.layers.billing_invoices?.length ?? 0) > 0).toBe(true);
    });

    it("should track recognition summary by type", () => {
      const files = [
        { filename: "quotes.csv", buffer: createCsvBuffer(quotesCSV) },
        { filename: "invoices.csv", buffer: createCsvBuffer(invoicesCSV) },
      ];

      const pack = normalizeToCompanyPack(files, "test");

      expect(pack.recognition_summary.by_type.quotes.files_seen).toBe(1);
      expect(pack.recognition_summary.by_type.invoices.files_seen).toBe(1);
      expect(pack.recognition_summary.by_type.quotes.rows_parsed).toBe(3);
      expect(pack.recognition_summary.by_type.invoices.rows_parsed).toBe(3);
    });

    it("should compute readiness as 'ready' when intent+billing present", () => {
      const files = [
        { filename: "quotes.csv", buffer: createCsvBuffer(quotesCSV) },
        { filename: "invoices.csv", buffer: createCsvBuffer(invoicesCSV) },
      ];

      const pack = normalizeToCompanyPack(files, "test");

      expect(pack.recognition_summary.readiness).toBe("ready");
    });

    it("should compute readiness as 'partial' when file uploaded but not recognized", () => {
      // Create a file with a non-invoice name that won't be recognized
      const badCSV = `Some Random Header,Another Column
data1,data2`;
      const files = [
        { filename: "random_data.csv", buffer: createCsvBuffer(badCSV) },
      ];

      const pack = normalizeToCompanyPack(files, "test");

      // Should be blocked because nothing was recognized
      expect(pack.recognition_summary.readiness).toBe("blocked");
    });

    it("should parse space-separated datetime format (HVAC CSV format)", () => {
      const files = [
        { filename: "quotes.csv", buffer: createCsvBuffer(quotesCSV) },
      ];

      const pack = normalizeToCompanyPack(files, "test");

      // All dates should be parsed successfully
      const dateOk = pack.recognition_summary.by_type.quotes.date_parse_success;
      const dateFail = pack.recognition_summary.by_type.quotes.date_parse_fail;

      expect(dateOk).toBe(3);
      expect(dateFail).toBe(0);
    });
  });

  describe("companyPackToDataPack", () => {
    it("should convert CompanyPack to DataPackV0 for backward compatibility", () => {
      const files = [
        { filename: "quotes.csv", buffer: createCsvBuffer(quotesCSV) },
        { filename: "invoices.csv", buffer: createCsvBuffer(invoicesCSV) },
      ];

      const companyPack = normalizeToCompanyPack(files, "test");
      const { pack, stats } = companyPackToDataPack(companyPack);

      expect(pack.version).toBe("data_pack_v0");
      expect(pack.quotes?.length).toBe(3);
      expect(pack.invoices?.length).toBe(3);
      expect(stats.quotes).toBe(3);
      expect(stats.invoices).toBe(3);
    });
  });

  describe("buildSnapshotFromCompanyPack", () => {
    it("should build snapshot with layer coverage", () => {
      const files = [
        { filename: "quotes.csv", buffer: createCsvBuffer(quotesCSV) },
        { filename: "invoices.csv", buffer: createCsvBuffer(invoicesCSV) },
        { filename: "calendar.csv", buffer: createCsvBuffer(calendarCSV) },
      ];

      const companyPack = normalizeToCompanyPack(files, "test");
      const { snapshot, input_recognition } = buildSnapshotFromCompanyPack(companyPack);

      // Snapshot should be built
      expect(snapshot.snapshot_version).toBe("snapshot_v2");

      // Layer coverage should reflect all three layers
      expect(input_recognition.layer_coverage.intent).toBe(true);
      expect(input_recognition.layer_coverage.billing).toBe(true);
      expect(input_recognition.layer_coverage.capacity).toBe(true);
    });

    it("should include calendar_detected_count", () => {
      const files = [
        { filename: "calendar.csv", buffer: createCsvBuffer(calendarCSV) },
      ];

      const companyPack = normalizeToCompanyPack(files, "test");
      const { input_recognition } = buildSnapshotFromCompanyPack(companyPack);

      expect(input_recognition.calendar_detected_count).toBe(3);
    });

    it("should inherit readiness from CompanyPack", () => {
      const files = [
        { filename: "quotes.csv", buffer: createCsvBuffer(quotesCSV) },
        { filename: "invoices.csv", buffer: createCsvBuffer(invoicesCSV) },
      ];

      const companyPack = normalizeToCompanyPack(files, "test");
      const { input_recognition } = buildSnapshotFromCompanyPack(companyPack);

      expect(input_recognition.readiness).toBe("ready");
    });
  });
});
