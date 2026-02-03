/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from "vitest";
import { guardAgainstPII } from "../signals_v1";

describe("PII Guards", () => {
  it("rejects email-like strings", () => {
    const features = { industry_key: "hvac", source: "mock", window_rule: "last_90_days", note: "a@b.com" } as any;
    expect(() => guardAgainstPII(features)).toThrow();
  });

  it("rejects phone-like strings", () => {
    const features = { industry_key: "hvac", source: "mock", window_rule: "last_90_days", note: "555-123-4567" } as any;
    expect(() => guardAgainstPII(features)).toThrow();
  });

  it("accepts only allowed enum strings", () => {
    const features = { industry_key: "hvac", source: "mock", window_rule: "last_90_days" } as any;
    expect(() => guardAgainstPII(features)).not.toThrow();
  });

  it("rejects unexpected strings", () => {
    const features = { industry_key: "hvac", source: "mock", window_rule: "last_90_days", other: "free text" } as any;
    expect(() => guardAgainstPII(features)).toThrow();
  });
});
