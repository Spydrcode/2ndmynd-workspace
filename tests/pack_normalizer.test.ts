import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { parseFile } from "../src/lib/intelligence/file_parsers";
import { normalizeExportsToDataPack } from "../src/lib/intelligence/pack_normalizer";
import { validateDataPackV0 } from "../src/lib/intelligence/data_pack_v0";

describe("normalizeExportsToDataPack", () => {
  it("maps quotes and invoices from exports", async () => {
    const quotePath = path.resolve("fixtures", "quotes_export.csv");
    const invoicePath = path.resolve("fixtures", "invoices_export.csv");

    const quoteBuffer = fs.readFileSync(quotePath);
    const invoiceBuffer = fs.readFileSync(invoicePath);

    const parsed = await Promise.all([
      parseFile("quotes_export.csv", quoteBuffer),
      parseFile("invoices_export.csv", invoiceBuffer),
    ]);

    const { pack, stats } = normalizeExportsToDataPack(parsed, "Jobber");
    const validation = validateDataPackV0(pack);

    expect(validation.ok).toBe(true);
    expect(stats.quotes).toBeGreaterThan(0);
    expect(stats.invoices).toBeGreaterThan(0);
    expect(pack.quotes?.[0]?.id).toBe("Q-1001");
    expect(pack.invoices?.[0]?.id).toBe("INV-2001");
  });
});
