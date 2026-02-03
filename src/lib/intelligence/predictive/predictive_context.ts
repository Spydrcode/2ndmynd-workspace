import { INDUSTRY_LIBRARY, IndustryWatchItem } from "./industry_library";
import type { BusinessProfile } from "../web_profile";

export type PredictiveContext = {
  industry_tag: string;
  watch_list: IndustryWatchItem[];
  disclaimer: string;
};

/**
 * Build predictive context from business profile and snapshot aggregates.
 * This is NOT forecasting - it's a finite watch list of industry pressures.
 */
export function buildPredictiveContext(params: {
  business_profile?: BusinessProfile | null;
  snapshot_keywords?: string[];
}): PredictiveContext {
  const industry_tag = classifyIndustry(params);
  const profile = INDUSTRY_LIBRARY[industry_tag] ?? INDUSTRY_LIBRARY.general_local_service;

  return {
    industry_tag: profile.industry_tag,
    watch_list: profile.watch_items,
    disclaimer: "This is a watch list, not a forecast.",
  };
}

function classifyIndustry(params: {
  business_profile?: BusinessProfile | null;
  snapshot_keywords?: string[];
}): string {
  // Prefer explicit industry from business profile
  if (params.business_profile?.industry_bucket) {
    const bucket = params.business_profile.industry_bucket.toLowerCase();
    if (INDUSTRY_LIBRARY[bucket]) {
      return bucket;
    }
  }

  // Infer from snapshot keywords (job types, service mentions)
  const keywords = params.snapshot_keywords ?? [];
  const keywordText = keywords.join(" ").toLowerCase();

  if (
    keywordText.includes("hvac") ||
    keywordText.includes("air conditioning") ||
    keywordText.includes("heating") ||
    keywordText.includes("furnace") ||
    keywordText.includes("ac repair")
  ) {
    return "hvac";
  }

  if (
    keywordText.includes("bbq") ||
    keywordText.includes("barbecue") ||
    keywordText.includes("catering") ||
    keywordText.includes("brisket") ||
    keywordText.includes("restaurant")
  ) {
    return "bbq_restaurant";
  }

  if (
    keywordText.includes("landscaping") ||
    keywordText.includes("lawn") ||
    keywordText.includes("mowing") ||
    keywordText.includes("tree service") ||
    keywordText.includes("irrigation")
  ) {
    return "landscaping";
  }

  if (
    keywordText.includes("plumbing") ||
    keywordText.includes("plumber") ||
    keywordText.includes("water heater") ||
    keywordText.includes("drain") ||
    keywordText.includes("pipe")
  ) {
    return "plumbing";
  }

  if (
    keywordText.includes("electric") ||
    keywordText.includes("electrical") ||
    keywordText.includes("panel upgrade") ||
    keywordText.includes("generator") ||
    keywordText.includes("wiring")
  ) {
    return "electrician";
  }

  if (
    keywordText.includes("contractor") ||
    keywordText.includes("remodel") ||
    keywordText.includes("renovation") ||
    keywordText.includes("construction") ||
    keywordText.includes("general contractor")
  ) {
    return "contractor";
  }

  return "general_local_service";
}
