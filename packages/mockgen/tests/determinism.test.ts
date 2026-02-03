/**
 * Test determinism: same seed produces identical output
 */

import { describe, it, expect } from "vitest";
import { generateDataset } from "../src/generate/generator";
import { exportQuotesCSV } from "../src/generate/exporters/quotes";
import { exportInvoicesCSV } from "../src/generate/exporters/invoices";
import { exportCalendarCSV } from "../src/generate/exporters/calendar";
import * as crypto from "crypto";

describe("Determinism", () => {
  it("should generate identical datasets for same seed", async () => {
    const seed = 12345;
    const startDate = new Date("2024-01-01");
    const endDate = new Date("2024-03-31");
    
    // Generate twice with same seed
    const dataset1 = await generateDataset({
      industry: "hvac",
      seed,
      days: 90,
      startDate,
      endDate,
    });
    
    const dataset2 = await generateDataset({
      industry: "hvac",
      seed,
      days: 90,
      startDate,
      endDate,
    });
    
    // Compare counts
    expect(dataset1.customers.length).toBe(dataset2.customers.length);
    expect(dataset1.quotes.length).toBe(dataset2.quotes.length);
    expect(dataset1.jobs.length).toBe(dataset2.jobs.length);
    expect(dataset1.invoices.length).toBe(dataset2.invoices.length);
    
    // Compare CSV hashes
    const csv1 = exportQuotesCSV(dataset1);
    const csv2 = exportQuotesCSV(dataset2);
    
    const hash1 = crypto.createHash("sha256").update(csv1).digest("hex");
    const hash2 = crypto.createHash("sha256").update(csv2).digest("hex");
    
    expect(hash1).toBe(hash2);
  });
  
  it("should generate different datasets for different seeds", async () => {
    const startDate = new Date("2024-01-01");
    const endDate = new Date("2024-03-31");
    
    const dataset1 = await generateDataset({
      industry: "plumbing",
      seed: 111,
      days: 90,
      startDate,
      endDate,
    });
    
    const dataset2 = await generateDataset({
      industry: "plumbing",
      seed: 222,
      days: 90,
      startDate,
      endDate,
    });
    
    // Counts may be similar but not identical
    const csv1 = exportQuotesCSV(dataset1);
    const csv2 = exportQuotesCSV(dataset2);
    
    const hash1 = crypto.createHash("sha256").update(csv1).digest("hex");
    const hash2 = crypto.createHash("sha256").update(csv2).digest("hex");
    
    expect(hash1).not.toBe(hash2);
  });
});
