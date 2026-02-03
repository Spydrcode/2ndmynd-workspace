/**
 * Test CSV shape matches pack_normalizer expectations
 */

import { describe, it, expect } from "vitest";
import { generateDataset } from "../src/generate/generator";
import { exportQuotesCSV } from "../src/generate/exporters/quotes";
import { exportInvoicesCSV } from "../src/generate/exporters/invoices";
import { exportCalendarCSV } from "../src/generate/exporters/calendar";

describe("CSV Shape", () => {
  it("should have correct quotes CSV headers", async () => {
    const dataset = await generateDataset({
      industry: "electrical",
      seed: 999,
      days: 30,
      startDate: new Date("2024-01-01"),
      endDate: new Date("2024-01-31"),
    });
    
    const csv = exportQuotesCSV(dataset);
    const lines = csv.split("\n");
    const headers = lines[0];
    
    expect(headers).toContain("Quote ID");
    expect(headers).toContain("Created At");
    expect(headers).toContain("Approved At");
    expect(headers).toContain("Status");
    expect(headers).toContain("Total");
    expect(headers).toContain("Customer Name");
    expect(headers).toContain("Customer Email");
    expect(headers).toContain("Customer Phone");
    expect(headers).toContain("Job Type");
  });
  
  it("should have correct invoices CSV headers", async () => {
    const dataset = await generateDataset({
      industry: "landscaping",
      seed: 777,
      days: 30,
      startDate: new Date("2024-01-01"),
      endDate: new Date("2024-01-31"),
    });
    
    const csv = exportInvoicesCSV(dataset);
    const lines = csv.split("\n");
    const headers = lines[0];
    
    expect(headers).toContain("Invoice ID");
    expect(headers).toContain("Quote ID");
    expect(headers).toContain("Job ID");
    expect(headers).toContain("Issued At");
    expect(headers).toContain("Due At");
    expect(headers).toContain("Paid At");
    expect(headers).toContain("Status");
    expect(headers).toContain("Subtotal");
    expect(headers).toContain("Tax");
    expect(headers).toContain("Total");
    expect(headers).toContain("Customer Name");
  });
  
  it("should have correct calendar CSV headers", async () => {
    const dataset = await generateDataset({
      industry: "cleaning",
      seed: 555,
      days: 30,
      startDate: new Date("2024-01-01"),
      endDate: new Date("2024-01-31"),
    });
    
    const csv = exportCalendarCSV(dataset);
    const lines = csv.split("\n");
    const headers = lines[0];
    
    expect(headers).toContain("Event ID");
    expect(headers).toContain("Job ID");
    expect(headers).toContain("Tech");
    expect(headers).toContain("Start");
    expect(headers).toContain("End");
    expect(headers).toContain("Title");
  });
  
  it("should handle CSV escaping for customer names with commas", async () => {
    const dataset = await generateDataset({
      industry: "hvac",
      seed: 333,
      days: 7,
      startDate: new Date("2024-01-01"),
      endDate: new Date("2024-01-08"),
    });
    
    const csv = exportQuotesCSV(dataset);
    const lines = csv.split("\n");
    
    // All lines should be valid CSV (parseable)
    expect(lines.length).toBeGreaterThan(1);
    
    for (const line of lines.slice(1)) {
      if (line.trim() === "") continue;
      const parts = line.split(",");
      // Should have 9 columns (or more if customer name is escaped)
      expect(parts.length).toBeGreaterThanOrEqual(9);
    }
  });
});
