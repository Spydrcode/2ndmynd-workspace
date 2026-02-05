import { describe, expect, it } from "vitest";
import { resolvePressureTranslation } from "../pressure_translation";
import { getIndustryGroup } from "../../industry/industry_groups";

describe("Industry-Aware Pressure Resolution", () => {
  describe("Named Industry Overrides", () => {
    it("uses HVAC-specific language for concentration_risk", () => {
      const resolved = resolvePressureTranslation({
        pressure_key: "concentration_risk",
        industry_key: "hvac",
        industry_group: "home_services_trade",
      });

      expect(resolved.owner_felt_line).toContain("One install slipping can move your whole month");
    });

    it("uses Painter-specific language for follow_up_drift", () => {
      const resolved = resolvePressureTranslation({
        pressure_key: "follow_up_drift",
        industry_key: "painter",
        industry_group: "project_trades",
      });

      expect(resolved.owner_felt_line).toContain("Quotes stall while customers decide colors and timing");
    });

    it("uses Taco Stand-specific language for concentration_risk", () => {
      const resolved = resolvePressureTranslation({
        pressure_key: "concentration_risk",
        industry_key: "taco_stand",
        industry_group: "food_mobile",
      });

      expect(resolved.owner_felt_line).toContain("A few slow days can erase a week's profit");
    });

    it("returns complete PressureTranslation structure", () => {
      const resolved = resolvePressureTranslation({
        pressure_key: "capacity_pressure",
        industry_key: "hvac",
        industry_group: "home_services_trade",
      });

      expect(resolved).toHaveProperty("owner_felt_line");
      expect(resolved).toHaveProperty("explanation");
      expect(resolved).toHaveProperty("recommended_move");
      expect(resolved).toHaveProperty("boundary");
      expect(typeof resolved.owner_felt_line).toBe("string");
      expect(typeof resolved.explanation).toBe("string");
      expect(typeof resolved.recommended_move).toBe("string");
      expect(typeof resolved.boundary).toBe("string");
    });
  });

  describe("Group-Level Translations", () => {
    it("falls back to group translation when no named override exists", () => {
      const resolved = resolvePressureTranslation({
        pressure_key: "concentration_risk",
        industry_key: "plumbing", // No override, uses home_services_trade group
        industry_group: "home_services_trade",
      });

      expect(resolved.owner_felt_line).toContain("A few big jobs are carrying the month");
    });

    it("uses project_trades language for roofer", () => {
      const resolved = resolvePressureTranslation({
        pressure_key: "capacity_pressure",
        industry_key: "roofer",
        industry_group: "project_trades",
      });

      expect(resolved.owner_felt_line).toContain("Prep time breaks the schedule");
    });

    it("uses route_service language for pest_control", () => {
      const resolved = resolvePressureTranslation({
        pressure_key: "follow_up_drift",
        industry_key: "pest_control",
        industry_group: "route_service",
      });

      expect(resolved.owner_felt_line).toContain("Leads come in but follow-up slips when routes get busy");
    });

    it("uses sales_led language for solar_sales", () => {
      const resolved = resolvePressureTranslation({
        pressure_key: "decision_lag",
        industry_key: "solar_sales",
        industry_group: "sales_led",
      });

      expect(resolved.owner_felt_line).toContain("Buyers take months to commit");
    });

    it("uses specialty_local language for auto_repair", () => {
      const resolved = resolvePressureTranslation({
        pressure_key: "cashflow_drag",
        industry_key: "auto_repair",
        industry_group: "specialty_local",
      });

      expect(resolved.owner_felt_line).toContain("Repairs finish but invoices sit unpaid");
    });
  });

  describe("Cohort Label Fallback", () => {
    it("derives industry group from cohort_label when industry_key missing", () => {
      const resolved = resolvePressureTranslation({
        pressure_key: "concentration_risk",
        cohort_label: "Home Services",
      });

      // Should use home_services_trade group
      expect(resolved.owner_felt_line).toContain("A few big jobs are carrying the month");
    });

    it("handles Professional Services cohort label", () => {
      const resolved = resolvePressureTranslation({
        pressure_key: "follow_up_drift",
        cohort_label: "Professional Services",
      });

      // Should map to sales_led group
      expect(resolved.owner_felt_line).toContain("Proposals sit without follow-up");
    });
  });

  describe("Coverage Guarantees", () => {
    it("provides translation for all canonical pressure keys", () => {
      const pressureKeys = [
        "concentration_risk",
        "follow_up_drift",
        "capacity_pressure",
        "decision_lag",
        "low_conversion",
        "rhythm_volatility",
        "cashflow_drag",
        "mapping_low_confidence",
      ] as const;

      for (const key of pressureKeys) {
        const resolved = resolvePressureTranslation({
          pressure_key: key,
          industry_key: "hvac",
          industry_group: "home_services_trade",
        });

        expect(resolved.owner_felt_line).toBeTruthy();
        expect(resolved.owner_felt_line).not.toBe("Something needs attention.");
      }
    });

    it("provides translation for all industry groups", () => {
      const groups = [
        "home_services_trade",
        "project_trades",
        "route_service",
        "food_mobile",
        "sales_led",
        "specialty_local",
      ] as const;

      for (const group of groups) {
        const resolved = resolvePressureTranslation({
          pressure_key: "concentration_risk",
          industry_group: group,
        });

        expect(resolved.owner_felt_line).toBeTruthy();
        expect(resolved.owner_felt_line).not.toBe("Something needs attention.");
      }
    });
  });

  describe("Industry Distinctions", () => {
    it("HVAC and Painter feel unmistakably different for same pressure", () => {
      const hvac = resolvePressureTranslation({
        pressure_key: "concentration_risk",
        industry_key: "hvac",
      });

      const painter = resolvePressureTranslation({
        pressure_key: "concentration_risk",
        industry_key: "painter",
      });

      // Should have different owner-felt language
      expect(hvac.owner_felt_line).not.toBe(painter.owner_felt_line);
      expect(hvac.owner_felt_line).toContain("install");
      expect(painter.owner_felt_line).toContain("paint job");
    });

    it("Taco Stand and HVAC feel unmistakably different", () => {
      const taco = resolvePressureTranslation({
        pressure_key: "capacity_pressure",
        industry_key: "taco_stand",
      });

      const hvac = resolvePressureTranslation({
        pressure_key: "capacity_pressure",
        industry_key: "hvac",
      });

      // Completely different contexts
      expect(taco.owner_felt_line).not.toBe(hvac.owner_felt_line);
      expect(taco.owner_felt_line).toContain("Prep and service compete");
      expect(hvac.owner_felt_line).toContain("calendar");
    });
  });

  describe("IndustryGroup Mapping", () => {
    it("maps all defined industries to a group", () => {
      const industries = [
        "hvac",
        "plumbing",
        "electrician",
        "painter",
        "roofer",
        "gc",
        "pest_control",
        "lawn",
        "taco_stand",
        "food_truck",
        "solar_sales",
        "propane_sales",
      ];

      for (const industry of industries) {
        const group = getIndustryGroup(industry);
        expect(group).toBeTruthy();
        expect(group).not.toBe("specialty_local"); // Should have specific mapping
      }
      
      // These DO map to specialty_local by design
      expect(getIndustryGroup("auto_repair")).toBe("specialty_local");
      expect(getIndustryGroup("locksmith")).toBe("specialty_local");
    });

    it("uses specialty_local as fallback for unknown industries", () => {
      const group = getIndustryGroup("unknown_industry_xyz");
      expect(group).toBe("specialty_local");
    });
  });

  describe("No Generic Language", () => {
    it("never returns 'Something needs attention' for known industries", () => {
      const pressureKeys = [
        "concentration_risk",
        "follow_up_drift",
        "capacity_pressure",
        "decision_lag",
        "low_conversion",
        "rhythm_volatility",
        "cashflow_drag",
      ] as const;

      const industries = ["hvac", "painter", "taco_stand", "pest_control", "solar_sales", "auto_repair"];

      for (const industry of industries) {
        for (const key of pressureKeys) {
          const resolved = resolvePressureTranslation({
            pressure_key: key,
            industry_key: industry,
          });

          expect(resolved.owner_felt_line).not.toContain("Something needs attention");
          expect(resolved.owner_felt_line).not.toContain("Patterns detected in the data");
          expect(resolved.explanation).not.toContain("Patterns detected in the data");
        }
      }
    });
  });
});
