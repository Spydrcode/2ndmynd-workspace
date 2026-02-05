/**
 * Address PII Guard Tests
 * 
 * Ensures address patterns are detected and rejected in:
 * - HF export features
 * - Vector document summaries
 */

import { describe, it, expect } from "vitest";
import { guardAgainstPII } from "../signals_v1";
import type { SignalsV1Record } from "../types";

describe("Address PII Guard", () => {
  const baseFeatures: SignalsV1Record = {
    industry_key: "hvac",
    source: "mock",
    window_rule: "last_90_days",
    window_days: 90,
    coverage_ratio: 0.95,
    mapping_confidence_level: 2,
    missingness_score: 0.1,
  };

  it("should reject street address with number + suffix", () => {
    const badFeatures: SignalsV1Record = {
      ...baseFeatures,
      industry_key: "123 Main St",
    };
    
    expect(() => guardAgainstPII(badFeatures)).toThrow(/Address detected/);
  });

  it("should reject PO Box pattern", () => {
    const badFeatures: SignalsV1Record = {
      ...baseFeatures,
      source: "P.O. Box 456",
    };
    
    expect(() => guardAgainstPII(badFeatures)).toThrow(/Address detected/);
  });

  it("should reject ZIP + street suffix combination", () => {
    const badFeatures: SignalsV1Record = {
      ...baseFeatures,
      window_rule: "12345 somewhere on Oak Avenue",
    };
    
    expect(() => guardAgainstPII(badFeatures)).toThrow(/Address detected/);
  });

  it("should NOT false-positive on business terms", () => {
    const safeFeatures: SignalsV1Record = {
      ...baseFeatures,
      industry_key: "hvac", // "st" substring but not address
      source: "real", // "dr" substring but not address
      window_rule: "last_90_days", // No address patterns
    };
    
    expect(() => guardAgainstPII(safeFeatures)).not.toThrow();
  });

  it("should NOT false-positive on allowed enum values", () => {
    const safeFeatures: SignalsV1Record = {
      ...baseFeatures,
      industry_key: "landscaping",
      source: "mock",
      window_rule: "cap_100_closed",
    };
    
    expect(() => guardAgainstPII(safeFeatures)).not.toThrow();
  });

  it("should reject variations of street suffixes", () => {
    const streetSuffixes = [
      "123 Oak Street",
      "456 Elm Avenue", 
      "789 Pine Road",
      "101 Maple Boulevard",
      "202 Cedar Drive",
      "303 Birch Lane",
      "404 Spruce Court",
      "505 Willow Way",
      "606 Ash Place",
    ];

    for (const address of streetSuffixes) {
      const badFeatures: SignalsV1Record = {
        ...baseFeatures,
        industry_key: address,
      };
      
      expect(() => guardAgainstPII(badFeatures)).toThrow(/Address detected/);
    }
  });
});
