import { describe, it, expect } from "vitest";
import { packFromCSVBundle } from "../pack_from_csv_bundle";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

describe("packFromCSVBundle date parsing", () => {
  it("should parse timestamps to ISO strings", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mockgen-bundle-"));

    try {
      fs.writeFileSync(
        path.join(tempDir, "quotes_export.csv"),
        "id,status,created_at,total\nQ1,draft,2024-01-01 12:30:00,1000\n"
      );

      fs.writeFileSync(
        path.join(tempDir, "invoices_export.csv"),
        "invoice_id,status,issued_at,paid_at,total\nI1,paid,2024-01-05 09:15:00,2024-01-06,1500\n"
      );

      fs.writeFileSync(
        path.join(tempDir, "calendar_export.csv"),
        "event_id,status,scheduled_at\nE1,scheduled,2024-01-07 08:00:00\n"
      );

      const pack = packFromCSVBundle(tempDir);

      expect(pack.quotes?.[0].id).toBe("Q1");
      expect(pack.quotes?.[0].created_at).toBe("2024-01-01T12:30:00.000Z");

      expect(pack.invoices?.[0].id).toBe("I1");
      expect(pack.invoices?.[0].issued_at).toBe("2024-01-05T09:15:00.000Z");
      expect(pack.invoices?.[0].paid_at).toBe("2024-01-06T00:00:00.000Z");

      expect(pack.jobs?.[0].id).toBe("E1");
      expect(pack.jobs?.[0].scheduled_at).toBe("2024-01-07T08:00:00.000Z");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
