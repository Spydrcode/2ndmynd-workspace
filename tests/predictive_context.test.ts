import { describe, it, expect } from "vitest";
import { buildPredictiveContext } from "../src/lib/intelligence/predictive/predictive_context";
import type { BusinessProfile } from "../src/lib/intelligence/web_profile";

describe("predictive_context", () => {
  it("classifies HVAC from business profile", () => {
    const profile: BusinessProfile = {
      name_guess: "Cool Air Services",
      summary: "HVAC repair and maintenance",
      services: ["Air Conditioning", "Heating"],
      location_mentions: ["Dallas", "TX"],
      industry_bucket: "trade",
      domain: "coolairservices.com",
      found_contact: true,
      website_present: true,
      opportunity_signals: {
        has_phone: true,
        has_email: true,
        has_booking_cta: false,
        has_financing: false,
        has_reviews: false,
        has_service_pages: true,
        has_maintenance_plan: false,
      },
    };

    const context = buildPredictiveContext({ business_profile: profile });

    expect(context.industry_tag).toBe("hvac");
    expect(context.watch_list.length).toBeGreaterThan(0);
    expect(context.watch_list.some((item) => item.topic.toLowerCase().includes("refrigerant"))).toBe(
      true
    );
    expect(context.disclaimer).toBe("This is a watch list, not a forecast.");
  });

  it("infers plumbing from snapshot keywords", () => {
    const context = buildPredictiveContext({
      snapshot_keywords: ["plumbing repair", "water heater installation", "drain cleaning"],
    });

    expect(context.industry_tag).toBe("plumbing");
    expect(context.watch_list.length).toBeGreaterThan(0);
    expect(context.watch_list.some((item) => item.topic.toLowerCase().includes("water heater"))).toBe(
      true
    );
  });

  it("infers electrician from snapshot keywords", () => {
    const context = buildPredictiveContext({
      snapshot_keywords: ["panel upgrade", "electrical wiring", "generator installation"],
    });

    expect(context.industry_tag).toBe("electrician");
    expect(context.watch_list.length).toBeGreaterThan(0);
    expect(context.watch_list.some((item) => item.topic.toLowerCase().includes("panel"))).toBe(true);
  });

  it("infers landscaping from snapshot keywords", () => {
    const context = buildPredictiveContext({
      snapshot_keywords: ["lawn mowing", "tree service", "landscaping maintenance"],
    });

    expect(context.industry_tag).toBe("landscaping");
    expect(context.watch_list.length).toBeGreaterThan(0);
  });

  it("infers contractor from snapshot keywords", () => {
    const context = buildPredictiveContext({
      snapshot_keywords: ["remodel", "renovation", "general contractor"],
    });

    expect(context.industry_tag).toBe("contractor");
    expect(context.watch_list.length).toBeGreaterThan(0);
    expect(context.watch_list.some((item) => item.topic.toLowerCase().includes("material"))).toBe(
      true
    );
  });

  it("infers BBQ restaurant from snapshot keywords", () => {
    const context = buildPredictiveContext({
      snapshot_keywords: ["bbq catering", "brisket", "barbecue restaurant"],
    });

    expect(context.industry_tag).toBe("bbq_restaurant");
    expect(context.watch_list.length).toBeGreaterThan(0);
    expect(context.watch_list.some((item) => item.topic.toLowerCase().includes("meat"))).toBe(true);
  });

  it("falls back to general_local_service when no match", () => {
    const context = buildPredictiveContext({
      snapshot_keywords: ["unknown service", "mystery business"],
    });

    expect(context.industry_tag).toBe("general_local_service");
    expect(context.watch_list.length).toBeGreaterThan(0);
    expect(context.watch_list.some((item) => item.topic.toLowerCase().includes("seasonal"))).toBe(
      true
    );
  });

  it("prefers explicit industry from business profile over inference", () => {
    const profile: BusinessProfile = {
      name_guess: "Cool Air Services",
      summary: "HVAC service business",
      services: [],
      location_mentions: [],
      industry_bucket: "trade",
      domain: "coolairservices.com",
      found_contact: true,
      website_present: true,
      opportunity_signals: {
        has_phone: true,
        has_email: true,
        has_booking_cta: false,
        has_financing: false,
        has_reviews: false,
        has_service_pages: true,
        has_maintenance_plan: false,
      },
    };

    const context = buildPredictiveContext({
      business_profile: profile,
      snapshot_keywords: ["plumbing", "drain cleaning"], // contradictory keywords
    });

    expect(context.industry_tag).toBe("hvac"); // Should use profile-derived context, not keywords
  });

  it("returns finite watch list with time horizons", () => {
    const context = buildPredictiveContext({
      snapshot_keywords: ["hvac"],
    });

    expect(context.watch_list.length).toBeGreaterThan(0);
    expect(context.watch_list.length).toBeLessThanOrEqual(5); // Should be finite

    context.watch_list.forEach((item) => {
      expect(item.topic).toBeDefined();
      expect(item.why_it_matters).toBeDefined();
      expect(item.time_horizon).toBeDefined();
      expect(item.what_to_watch).toBeDefined();
    });
  });

  it("watch items have appropriate time horizons", () => {
    const context = buildPredictiveContext({
      snapshot_keywords: ["hvac"],
    });

    const hasValidHorizon = context.watch_list.every((item) =>
      /\d+-\d+ days/.test(item.time_horizon)
    );

    expect(hasValidHorizon).toBe(true);
  });
});
