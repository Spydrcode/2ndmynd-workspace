/**
 * Canonical Industry Grouping
 *
 * This is the authoritative mapping from IndustryKey -> IndustryGroup.
 * It guarantees 100% coverage of known owner-led industries.
 */

import { OWNER_LED_INDUSTRIES } from "../../../rag_seed/industry_index";

export type IndustryGroup =
  | "home_services_trade"
  | "project_trades"
  | "route_service"
  | "food_mobile"
  | "sales_led"
  | "specialty_local";

export type IndustryKey = (typeof OWNER_LED_INDUSTRIES)[keyof typeof OWNER_LED_INDUSTRIES][number];

const GROUPS: Record<IndustryGroup, readonly IndustryKey[]> = {
  home_services_trade: [
    "hvac",
    "plumbing",
    "electrical",
    "handyman",
    "garage_doors",
  ],
  project_trades: [
    "general_contractor",
    "roofer",
    "painter",
    "flooring",
    "concrete",
    "fencing",
    "moving_company",
  ],
  route_service: [
    "landscaping",
    "irrigation",
    "pool_service",
    "maintenance",
    "pest_control",
    "cleaning_residential",
    "cleaning_commercial",
    "janitorial",
    "pressure_washing",
    "window_cleaning",
    "chimney_sweep",
    "junk_removal",
  ],
  food_mobile: [
    "restaurant_owner",
    "taco_stand",
    "food_truck",
    "bbq_vendor",
    "caterer",
    "pop_up_food",
    "street_vendor",
  ],
  sales_led: [
    "solar_sales",
    "home_sales",
    "real_estate_team",
    "propane_sales",
    "electric_golf_cart_sales",
    "rv_sales",
    "equipment_sales",
    "construction_materials_sales",
  ],
  specialty_local: [
    "auto_repair",
    "auto_detailing",
    "body_shop",
    "marine_service",
    "small_engine_repair",
    "appliance_repair",
    "sign_company",
    "print_shop",
    "locksmith",
    "security_install",
    "bookkeeping",
    "personal_training",
    "photography",
  ],
};

export const INDUSTRY_GROUP_MAP: Record<IndustryKey, IndustryGroup> = Object.entries(GROUPS)
  .reduce((acc, [group, keys]) => {
    for (const key of keys) {
      acc[key] = group as IndustryGroup;
    }
    return acc;
  }, {} as Record<IndustryKey, IndustryGroup>);

const INDUSTRY_ALIASES: Record<string, IndustryKey> = {
  electrician: "electrical",
  gc: "general_contractor",
  cleaning: "cleaning_residential",
  lawn: "landscaping",
  lawn_care: "landscaping",
  bbq: "bbq_vendor",
  rv: "rv_sales",
  catering: "caterer",
};

const INDUSTRY_LABELS: Partial<Record<IndustryKey, string>> = {
  hvac: "HVAC",
  bbq_vendor: "BBQ vendor",
  rv_sales: "RV sales",
  auto_repair: "Auto repair",
  auto_detailing: "Auto detailing",
  electrical: "Electrical",
  home_sales: "Home sales",
  real_estate_team: "Real estate team",
  cleaning_residential: "Residential cleaning",
  cleaning_commercial: "Commercial cleaning",
  pressure_washing: "Pressure washing",
  window_cleaning: "Window cleaning",
  food_truck: "Food truck",
  taco_stand: "Taco stand",
  pop_up_food: "Pop-up food",
  street_vendor: "Street vendor",
  electric_golf_cart_sales: "Electric golf cart sales",
};

function formatIndustryLabel(key: string): string {
  return key
    .split("_")
    .map((part) => {
      if (part.length <= 3) return part.toUpperCase();
      return part.slice(0, 1).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

export function resolveIndustryKey(industry_key?: string | null): IndustryKey | null {
  if (!industry_key) return null;
  const normalized = industry_key.toLowerCase();
  const canonical = INDUSTRY_ALIASES[normalized] ?? (normalized as IndustryKey);
  return INDUSTRY_GROUP_MAP[canonical] ? canonical : null;
}

export function getIndustryGroup(industry_key?: IndustryKey | string | null): IndustryGroup {
  const canonical = resolveIndustryKey(industry_key ?? null);
  if (!canonical) return "specialty_local";
  return INDUSTRY_GROUP_MAP[canonical] ?? "specialty_local";
}

export function getIndustryLabel(industry_key?: IndustryKey | string | null): string {
  if (!industry_key) return "Local business";
  const canonical = resolveIndustryKey(industry_key ?? null);
  if (!canonical) return formatIndustryLabel(industry_key);
  return INDUSTRY_LABELS[canonical] ?? formatIndustryLabel(canonical);
}

export function getIndustryGroupFromCohort(cohort_label?: string): IndustryGroup {
  if (!cohort_label) return "specialty_local";
  const normalized = cohort_label.toLowerCase().replace(/\s+/g, "_");

  if (normalized.includes("home") || normalized.includes("hvac") || normalized.includes("plumb")) {
    return "home_services_trade";
  }
  if (normalized.includes("paint") || normalized.includes("roof") || normalized.includes("contract")) {
    return "project_trades";
  }
  if (normalized.includes("route") || normalized.includes("lawn") || normalized.includes("pest") || normalized.includes("clean")) {
    return "route_service";
  }
  if (normalized.includes("food") || normalized.includes("truck") || normalized.includes("cater")) {
    return "food_mobile";
  }
  if (
    normalized.includes("sales") ||
    normalized.includes("solar") ||
    normalized.includes("real_estate") ||
    normalized.includes("professional") ||
    normalized.includes("consulting") ||
    normalized.includes("agency")
  ) {
    return "sales_led";
  }

  return "specialty_local";
}
