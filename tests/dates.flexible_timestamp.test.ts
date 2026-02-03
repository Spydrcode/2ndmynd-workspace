import { describe, expect, it } from "vitest";

import { parseFlexibleTimestamp } from "../src/lib/intelligence/dates";

describe("parseFlexibleTimestamp", () => {
  it("parses space-separated timestamps (YYYY-MM-DD HH:mm:ss)", () => {
    const d = parseFlexibleTimestamp("2025-02-03 09:45:00");
    expect(d).toBeTruthy();
    expect(d?.toISOString().startsWith("2025-02-03T09:45:00")).toBe(true);
  });
});

