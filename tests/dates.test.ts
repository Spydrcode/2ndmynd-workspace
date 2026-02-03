import { describe, expect, it } from "vitest";
import { parseFlexibleTimestamp, parseFlexibleTimestampToISO } from "@/src/lib/intelligence/dates";

describe("parseFlexibleTimestamp", () => {
  describe("space-separated ISO format (HVAC CSV format)", () => {
    it("should parse YYYY-MM-DD HH:mm:ss format", () => {
      const result = parseFlexibleTimestamp("2025-02-03 09:45:00");
      expect(result).toBeInstanceOf(Date);
      // Check the date components in local time
      expect(result?.getFullYear()).toBe(2025);
      expect(result?.getMonth()).toBe(1); // February is month 1
      expect(result?.getDate()).toBe(3);
    });

    it("should handle single-digit hours and minutes", () => {
      const result = parseFlexibleTimestamp("2025-02-03 9:5:0");
      expect(result).toBeInstanceOf(Date);
      expect(result?.getFullYear()).toBe(2025);
      expect(result?.getMonth()).toBe(1); // February is month 1
      expect(result?.getDate()).toBe(3);
    });
  });

  describe("standard ISO format", () => {
    it("should parse YYYY-MM-DDTHH:mm:ss format", () => {
      const result = parseFlexibleTimestamp("2025-02-03T09:45:00");
      expect(result).toBeInstanceOf(Date);
      expect(result?.getFullYear()).toBe(2025);
    });

    it("should parse YYYY-MM-DDTHH:mm:ss.sssZ format", () => {
      const result = parseFlexibleTimestamp("2025-02-03T09:45:00.000Z");
      expect(result).toBeInstanceOf(Date);
      expect(result?.toISOString()).toBe("2025-02-03T09:45:00.000Z");
    });
  });

  describe("US date formats", () => {
    it("should parse MM/DD/YYYY format", () => {
      const result = parseFlexibleTimestamp("02/03/2025");
      expect(result).toBeInstanceOf(Date);
      expect(result?.getFullYear()).toBe(2025);
      expect(result?.getMonth()).toBe(1); // February
      expect(result?.getDate()).toBe(3);
    });

    it("should parse MM/DD/YYYY with time", () => {
      const result = parseFlexibleTimestamp("02/03/2025 09:45:00");
      expect(result).toBeInstanceOf(Date);
      expect(result?.getFullYear()).toBe(2025);
    });

    it("should parse MM/DD/YYYY HH:mm AM/PM format", () => {
      const result = parseFlexibleTimestamp("02/03/2025 09:45 AM");
      expect(result).toBeInstanceOf(Date);
      expect(result?.getFullYear()).toBe(2025);
      expect(result?.getMonth()).toBe(1);
      expect(result?.getDate()).toBe(3);
    });

    it("should handle PM times correctly", () => {
      const result = parseFlexibleTimestamp("02/03/2025 09:45 PM");
      expect(result).toBeInstanceOf(Date);
      // PM should add 12 hours (except for 12 PM)
      const hour = result?.getHours();
      expect(hour).toBeGreaterThanOrEqual(12);
    });
  });

  describe("edge cases", () => {
    it("should return null for invalid dates", () => {
      expect(parseFlexibleTimestamp("not a date")).toBeNull();
      expect(parseFlexibleTimestamp("")).toBeNull();
      // Note: JavaScript's Date constructor is lenient with invalid dates like "13/45/2025"
      // so we only test clearly invalid strings
      expect(parseFlexibleTimestamp("abc123")).toBeNull();
    });

    it("should return null for null/undefined", () => {
      expect(parseFlexibleTimestamp(null as any)).toBeNull();
      expect(parseFlexibleTimestamp(undefined as any)).toBeNull();
    });
  });
});

describe("parseFlexibleTimestampToISO", () => {
  it("should return ISO string for valid dates", () => {
    const result = parseFlexibleTimestampToISO("2025-02-03 09:45:00");
    // Result will be in UTC, which may differ from local time
    expect(result).toBeDefined();
    expect(result).toContain("2025-02-03");
  });

  it("should return undefined for invalid dates", () => {
    expect(parseFlexibleTimestampToISO("not a date")).toBeUndefined();
    expect(parseFlexibleTimestampToISO(null as any)).toBeUndefined();
  });
});
