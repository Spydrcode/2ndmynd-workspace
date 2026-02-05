/**
 * Tests for mock pipeline wiring and explicit learning provenance
 */

import { describe, it, expect } from "vitest";
import { packFromCSVBundle } from "../src/run/pack_from_csv_bundle";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

describe("pack_from_csv_bundle", () => {
  it("should parse CSV bundle and return DataPackV0", () => {
    // Create temp directory with test CSVs
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "test-csv-bundle-"));
    
    try {
      // Write minimal test CSVs
      fs.writeFileSync(
        path.join(tempDir, "quotes_export.csv"),
        "id,status,created_at,total\nQ1,draft,2024-01-01,1000\nQ2,approved,2024-01-02,2000\nQ3,sent,2024-01-03,1500\n"
      );
      
      fs.writeFileSync(
        path.join(tempDir, "invoices_export.csv"),
        "id,status,issued_at,paid_at,total\nI1,paid,2024-01-05,2024-01-10,1000\nI2,open,2024-01-06,,2000\n"
      );
      
      fs.writeFileSync(
        path.join(tempDir, "calendar_export.csv"),
        "id,status,scheduled_at\nE1,scheduled,2024-01-08\n"
      );
      
      // Parse bundle
      const pack = packFromCSVBundle(tempDir);
      
      // Verify structure
      expect(pack.version).toBe("data_pack_v0");
      expect(pack.source_tool).toBe("mockgen");
      expect(pack.quotes).toHaveLength(3);
      expect(pack.invoices).toHaveLength(2);
      expect(pack.jobs).toHaveLength(1);
      
      // Verify quote mapping
      expect(pack.quotes?.[0].id).toBe("Q1");
      expect(pack.quotes?.[0].status).toBe("draft");
      expect(pack.quotes?.[0].total).toBe(1000);
      
      // Verify invoice mapping
      expect(pack.invoices?.[0].id).toBe("I1");
      expect(pack.invoices?.[0].status).toBe("paid");
      expect(pack.invoices?.[0].paid_at).toBe("2024-01-10");
      
      // Verify calendar to jobs mapping
      expect(pack.jobs?.[0].id).toBe("E1");
      expect(pack.jobs?.[0].status).toBe("scheduled");
    } finally {
      // Cleanup
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
  
  it("should handle missing CSV files gracefully", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "test-empty-bundle-"));
    
    try {
      const pack = packFromCSVBundle(tempDir);
      
      expect(pack.version).toBe("data_pack_v0");
      expect(pack.quotes).toBeUndefined();
      expect(pack.invoices).toBeUndefined();
      expect(pack.jobs).toBeUndefined();
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
  
  it("should normalize status values", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "test-status-bundle-"));
    
    try {
      fs.writeFileSync(
        path.join(tempDir, "quotes_export.csv"),
        "id,status\nQ1,APPROVED\nQ2,unknown_status\n"
      );
      
      const pack = packFromCSVBundle(tempDir);
      
      expect(pack.quotes?.[0].status).toBe("approved");
      expect(pack.quotes?.[1].status).toBe("other");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
  
  it("should parse currency strings in amounts", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "test-currency-bundle-"));
    
    try {
      fs.writeFileSync(
        path.join(tempDir, "invoices_export.csv"),
        'id,status,issued_at,total\nI1,paid,2024-01-05,"$1,234.56"\nI2,open,2024-01-06,$2000.00\n'
      );
      
      const pack = packFromCSVBundle(tempDir);
      
      expect(pack.invoices?.[0].total).toBeCloseTo(1234.56, 2);
      expect(pack.invoices?.[1].total).toBe(2000);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
  
  it("should generate deterministic fallback IDs when id is missing", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "test-fallback-id-bundle-"));
    
    try {
      fs.writeFileSync(
        path.join(tempDir, "quotes_export.csv"),
        "status,created_at,total\ndraft,2024-01-01,1000\napproved,2024-01-02,2000\n"
      );
      
      const pack = packFromCSVBundle(tempDir);
      
      expect(pack.quotes?.[0].id).toMatch(/^mock_quote_0_/);
      expect(pack.quotes?.[1].id).toMatch(/^mock_quote_1_/);
      // IDs should be deterministic (contain date)
      expect(pack.quotes?.[0].id).toContain("2024-01-01");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
