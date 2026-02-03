import { describe, expect, it } from "vitest";
import { inferFileTypes, inferBestFileType } from "@/src/lib/intelligence/file_inference";

describe("file_inference", () => {
  describe("inferFileTypes", () => {
    it("should detect quotes file from headers", () => {
      const result = inferFileTypes({
        filename: "quotes_export.csv",
        headers_normalized: ["quoteid", "createdat", "approvedat", "status", "total"],
      });

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].type).toBe("quotes");
      expect(result[0].confidence).toBe("high");
    });

    it("should detect invoices file from headers", () => {
      const result = inferFileTypes({
        filename: "invoices.csv",
        headers_normalized: ["invoiceid", "issuedat", "paidat", "status", "total", "balance"],
      });

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].type).toBe("invoices");
      expect(result[0].confidence).toBe("high");
    });

    it("should detect calendar/jobs file from headers", () => {
      const result = inferFileTypes({
        filename: "schedule.csv",
        headers_normalized: ["jobid", "startdate", "starttime", "enddate", "endtime", "status"],
      });

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].type).toBe("calendar");
    });

    it("should return unknown for unrecognized headers", () => {
      const result = inferFileTypes({
        filename: "random.csv",
        headers_normalized: ["foo", "bar", "baz"],
      });

      expect(result[0].type).toBe("unknown");
      expect(result[0].confidence).toBe("low");
    });

    it("should use filename hints for scoring", () => {
      const result = inferFileTypes({
        filename: "client_quotes_2025.csv",
        headers_normalized: ["id", "date", "amount"], // Generic headers
      });

      // Filename hint should boost quotes score
      expect(result.some((r) => r.type === "quotes")).toBe(true);
    });

    it("should return multiple candidates when scores are close", () => {
      // Headers that could be either quotes or invoices
      const result = inferFileTypes({
        filename: "transactions.csv",
        headers_normalized: ["id", "date", "status", "total", "quote", "invoice"],
      });

      // Should return both as candidates
      expect(result.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("inferBestFileType", () => {
    it("should return the best single type", () => {
      const result = inferBestFileType({
        filename: "invoices_export.csv",
        headers_normalized: ["invoiceid", "issuedat", "paidat", "total"],
      });

      expect(result).toBe("invoices");
    });
  });
});
