/**
 * Industry Index - Canonical list of owner-led industries
 * 
 * Each industry_key must have:
 * - One baseline doc in rag_seed/industries/<industry_key>.md
 * - Optional tool playbook entries
 * 
 * This is the source of truth for RAG seeding.
 */

export const OWNER_LED_INDUSTRIES = {
  trades: [
    "hvac",
    "plumbing",
    "electrical",
    "general_contractor",
    "handyman",
    "roofer",
    "painter",
    "landscaping",
    "irrigation",
    "pool_service",
    "maintenance",
    "flooring",
    "concrete",
    "fencing",
    "garage_doors",
    "pest_control",
  ],
  service_businesses: [
    "cleaning_residential",
    "cleaning_commercial",
    "janitorial",
    "pressure_washing",
    "window_cleaning",
    "chimney_sweep",
    "moving_company",
    "junk_removal",
    "locksmith",
    "security_install",
    "bookkeeping",
    "personal_training",
    "photography",
  ],
  food_and_mobile: [
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
  ],
} as const;

/**
 * Get all industry keys as a flat array
 */
export function getAllIndustryKeys(): string[] {
  return Object.values(OWNER_LED_INDUSTRIES).flat();
}

/**
 * Get category for an industry key
 */
export function getIndustryCategory(industryKey: string): string | null {
  for (const [category, industries] of Object.entries(OWNER_LED_INDUSTRIES)) {
    if ((industries as readonly string[]).includes(industryKey)) {
      return category;
    }
  }
  return null;
}

/**
 * Map legacy industry_bucket to industry_key
 */
export function mapBucketToIndustryKey(bucket: string): string {
  const b = bucket.toLowerCase();
  if (b.includes("hvac")) return "hvac";
  if (b.includes("plumb")) return "plumbing";
  if (b.includes("electric")) return "electrical";
  if (b.includes("landscap")) return "landscaping";
  if (b.includes("clean")) return "cleaning_residential";
  if (b.includes("pest")) return "pest_control";
  if (b.includes("paint")) return "painter";
  if (b.includes("roof")) return "roofer";
  if (b.includes("pool")) return "pool_service";
  if (b.includes("auto")) return "auto_repair";
  if (b.includes("contractor")) return "general_contractor";
  
  // Default to first in trades if not found
  return "general_contractor";
}
