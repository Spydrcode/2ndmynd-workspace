/**
 * Industry Group Model - Scale Mechanism for 40+ Industries
 * 
 * Every industry maps to exactly ONE IndustryGroup.
 * Group-level translations provide default pressure language.
 * Named industries can override group defaults for quality.
 */

export type IndustryGroup =
  | "home_services_trade"
  | "project_trades"
  | "route_service"
  | "food_mobile"
  | "sales_led"
  | "specialty_local";

/**
 * Authoritative mapping: industry_key → IndustryGroup
 * Guarantees 100% coverage for all industries
 */
export const INDUSTRY_TO_GROUP: Record<string, IndustryGroup> = {
  // Home Services Trade - install + service hybrid
  hvac: "home_services_trade",
  plumbing: "home_services_trade",
  electrician: "home_services_trade",
  
  // Project Trades - scope-heavy, milestone billing
  painter: "project_trades",
  roofer: "project_trades",
  gc: "project_trades",
  general_contractor: "project_trades",
  flooring: "project_trades",
  concrete: "project_trades",
  drywall: "project_trades",
  cabinet_maker: "project_trades",
  tile: "project_trades",
  siding: "project_trades",
  
  // Route Service - recurring, predictable routes
  pest_control: "route_service",
  pool_service: "route_service",
  lawn: "route_service",
  lawn_care: "route_service",
  landscaping: "route_service",
  window_cleaning: "route_service",
  cleaning: "route_service",
  janitorial: "route_service",
  
  // Food Mobile - real-time demand, prep-heavy
  taco_stand: "food_mobile",
  food_truck: "food_mobile",
  bbq_vendor: "food_mobile",
  catering: "food_mobile",
  coffee_cart: "food_mobile",
  
  // Sales-Led - long cycles, proposal-heavy
  solar_sales: "sales_led",
  propane_sales: "sales_led",
  equipment_sales: "sales_led",
  wholesale: "sales_led",
  distributor: "sales_led",
  
  // Specialty Local - diagnostic + fix, unpredictable
  auto_repair: "specialty_local",
  appliance_repair: "specialty_local",
  locksmith: "specialty_local",
  glass_repair: "specialty_local",
  mobile_mechanic: "specialty_local",
  towing: "specialty_local",
  
  // Fallback mappings for common aliases
  home_services: "home_services_trade",
  professional_services: "sales_led",
  field_services: "route_service",
  construction: "project_trades",
  manufacturing: "specialty_local",
  retail: "specialty_local",
  other: "specialty_local",
};

/**
 * Get IndustryGroup for a given industry_key
 * Falls back to specialty_local if not found
 */
export function getIndustryGroup(industry_key?: string | null): IndustryGroup {
  if (!industry_key) return "specialty_local";
  return INDUSTRY_TO_GROUP[industry_key.toLowerCase()] ?? "specialty_local";
}

/**
 * Get IndustryGroup from cohort_label fallback
 * Used when industry_key is missing
 */
export function getIndustryGroupFromCohort(cohort_label?: string): IndustryGroup {
  if (!cohort_label) return "specialty_local";
  
  const normalized = cohort_label.toLowerCase().replace(/\s+/g, "_");
  
  // Try exact match first
  if (INDUSTRY_TO_GROUP[normalized]) {
    return INDUSTRY_TO_GROUP[normalized];
  }
  
  // Try partial matches
  if (normalized.includes("home") || normalized.includes("hvac") || normalized.includes("plumb")) {
    return "home_services_trade";
  }
  if (normalized.includes("paint") || normalized.includes("roof") || normalized.includes("floor")) {
    return "project_trades";
  }
  if (normalized.includes("route") || normalized.includes("lawn") || normalized.includes("pest")) {
    return "route_service";
  }
  if (normalized.includes("food") || normalized.includes("truck") || normalized.includes("cater")) {
    return "food_mobile";
  }
  if (normalized.includes("sales") || normalized.includes("solar")) {
    return "sales_led";
  }
  
  return "specialty_local";
}
