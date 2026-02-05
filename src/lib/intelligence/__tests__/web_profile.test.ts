import { describe, expect, it, vi } from "vitest";

import { buildBusinessProfile, buildWebsiteOpportunities } from "../web_profile";

describe("web profile", () => {
  it("detects booking CTA signals from HTML text", async () => {
    const html = "<html><body><h1>Schedule Now</h1></body></html>";
    const buffer = Buffer.from(html, "utf8");

    // Stub fetch to return the same HTML for any URL
    const fetchStub = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => buffer,
    })) as unknown as typeof fetch;

    const originalFetch = global.fetch;
    global.fetch = fetchStub;

    try {
      const profile = await buildBusinessProfile("https://example.com");
      expect(profile.opportunity_signals.has_booking_cta).toBe(true);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("returns 2-5 website opportunities", () => {
    const opportunities = buildWebsiteOpportunities(
      {
        name_guess: null,
        summary: "Test",
        services: [],
        location_mentions: [],
        industry_bucket: "service",
        domain: "example.com",
        found_contact: false,
        website_present: true,
        opportunity_signals: {
          has_phone: true,
          has_email: true,
          has_booking_cta: true,
          has_financing: true,
          has_reviews: true,
          has_service_pages: true,
          has_maintenance_plan: true,
        },
      },
      "service"
    );

    expect(opportunities.length).toBeGreaterThanOrEqual(2);
    expect(opportunities.length).toBeLessThanOrEqual(5);
  });
});
