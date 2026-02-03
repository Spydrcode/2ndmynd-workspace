import { describe, expect, it } from "vitest";

import { computeReadiness } from "../src/lib/intelligence/readiness";

describe("readiness gating", () => {
  it("is ready only when both quotes and invoices are recognized", () => {
    const r = computeReadiness({
      files_uploaded: 2,
      quotes_recognized: 10,
      invoices_recognized: 12,
      quotes_file_uploaded: true,
      invoices_file_uploaded: true,
    });
    expect(r.level).toBe("ready");
    expect(r.diagnose_mode).toBe(false);
    expect(r.suppress_inference).toBe(false);
  });

  it("is partial + suppresses inference when invoices were uploaded but none recognized", () => {
    const r = computeReadiness({
      files_uploaded: 2,
      quotes_recognized: 10,
      invoices_recognized: 0,
      quotes_file_uploaded: true,
      invoices_file_uploaded: true,
    });
    expect(r.level).toBe("partial");
    expect(r.diagnose_mode).toBe(true);
    expect(r.suppress_inference).toBe(true);
  });

  it("is partial but does not suppress inference when quotes are missing and invoices exist", () => {
    const r = computeReadiness({
      files_uploaded: 2,
      quotes_recognized: 0,
      invoices_recognized: 12,
      quotes_file_uploaded: true,
      invoices_file_uploaded: true,
    });
    expect(r.level).toBe("partial");
    expect(r.diagnose_mode).toBe(true);
    expect(r.suppress_inference).toBe(false);
  });
});

