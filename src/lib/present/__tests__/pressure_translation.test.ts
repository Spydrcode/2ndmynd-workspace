import { describe, expect, it } from "vitest";

import { resolvePressureTranslation } from "../resolve_pressure_translation";
import { getIndustryGroup, INDUSTRY_GROUP_MAP } from "../../intelligence/industry_groups";
import { getAllIndustryKeys } from "../../../../rag_seed/industry_index";

describe("Pressure translation resolver", () => {
  it("uses HVAC-specific phrasing for concentration_risk", () => {
    const resolved = resolvePressureTranslation({
      pressure_key: "concentration_risk",
      industry_key: "hvac",
    });

    expect(resolved.owner_felt_line).toContain("One install slipping can move your whole month");
  });

  it("uses Painter-specific phrasing for follow_up_drift", () => {
    const resolved = resolvePressureTranslation({
      pressure_key: "follow_up_drift",
      industry_key: "painter",
    });

    expect(resolved.owner_felt_line).toContain("colors and timing");
  });

  it("uses Taco Stand-specific phrasing for capacity_pressure", () => {
    const resolved = resolvePressureTranslation({
      pressure_key: "capacity_pressure",
      industry_key: "taco_stand",
    });

    expect(resolved.owner_felt_line).toContain("Prep and service compete");
  });

  it("separates industries across groups for the same pressure", () => {
    const hvac = resolvePressureTranslation({
      pressure_key: "capacity_pressure",
      industry_key: "hvac",
    });
    const taco = resolvePressureTranslation({
      pressure_key: "capacity_pressure",
      industry_key: "taco_stand",
    });

    expect(hvac.owner_felt_line).not.toBe(taco.owner_felt_line);
  });

  it("covers every known industry key", () => {
    const industries = getAllIndustryKeys();
    for (const key of industries) {
      expect(INDUSTRY_GROUP_MAP[key as keyof typeof INDUSTRY_GROUP_MAP]).toBeTruthy();
      expect(getIndustryGroup(key)).toBeTruthy();
    }
  });
});
