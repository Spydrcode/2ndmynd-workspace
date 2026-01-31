import { describe, expect, it } from "vitest";

import { bucketDecisionLag, bucketMoney } from "../src/lib/snapshot/buckets";

describe("snapshot buckets", () => {
  it("bucketMoney respects thresholds", () => {
    expect(bucketMoney(0)).toBe("micro");
    expect(bucketMoney(249.99)).toBe("micro");
    expect(bucketMoney(250)).toBe("small");
    expect(bucketMoney(749.99)).toBe("small");
    expect(bucketMoney(750)).toBe("medium");
    expect(bucketMoney(2499.99)).toBe("medium");
    expect(bucketMoney(2500)).toBe("large");
    expect(bucketMoney(7499.99)).toBe("large");
    expect(bucketMoney(7500)).toBe("jumbo");
  });

  it("bucketDecisionLag respects boundaries", () => {
    const created = new Date("2026-01-01T00:00:00.000Z");
    const iso = (d: Date) => d.toISOString();
    const addDays = (days: number) => new Date(created.getTime() + days * 86_400_000);

    expect(bucketDecisionLag(iso(created), iso(addDays(0)))).toBe("same_day");
    expect(bucketDecisionLag(iso(created), iso(addDays(1)))).toBe("1_3_days");
    expect(bucketDecisionLag(iso(created), iso(addDays(3)))).toBe("1_3_days");
    expect(bucketDecisionLag(iso(created), iso(addDays(4)))).toBe("4_7_days");
    expect(bucketDecisionLag(iso(created), iso(addDays(7)))).toBe("4_7_days");
    expect(bucketDecisionLag(iso(created), iso(addDays(8)))).toBe("8_14_days");
    expect(bucketDecisionLag(iso(created), iso(addDays(14)))).toBe("8_14_days");
    expect(bucketDecisionLag(iso(created), iso(addDays(15)))).toBe("15_30_days");
    expect(bucketDecisionLag(iso(created), iso(addDays(30)))).toBe("15_30_days");
    expect(bucketDecisionLag(iso(created), iso(addDays(31)))).toBe("over_30_days");
  });
});

