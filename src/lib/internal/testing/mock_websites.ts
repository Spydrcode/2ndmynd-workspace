/**
 * Mock Websites for Testing
 * 
 * Provides curated website URLs for each industry to prevent
 * "No website provided" artifacts in mock runs.
 */

import type { IndustryKey } from "../../../../packages/mockgen/src/types";

export const CURATED_WEBSITES: Record<IndustryKey, string[]> = {
  hvac: ["https://www.carrier.com", "https://www.lennox.com", "https://www.coolcomfort.com"],
  plumbing: ["https://www.rotorooter.com", "https://www.mrrooter.com", "https://www.fastfixplumbing.com"],
  electrical: ["https://www.mrelectric.com", "https://www.acelectric.com", "https://www.brightsparkelectric.com"],
  landscaping: ["https://www.brightview.com", "https://www.trugreen.com", "https://www.gardenscapedesign.com"],
  cleaning: ["https://www.merrymaids.com", "https://www.thecleaningauthority.com", "https://www.sparkleshineclean.com"],
};

// Extended mock websites for additional industries
export const MOCK_WEBSITES_BY_INDUSTRY: Record<string, string[]> = {
  ...CURATED_WEBSITES,
  
  // Project Trades
  painter: [
    "https://www.colorperfectpainting.com",
    "https://www.precisionpaintpros.com",
    "https://www.freshcoatpainters.com",
  ],
  roofer: [
    "https://www.summitroofing.com",
    "https://www.reliableroofrepair.com",
    "https://www.topnotchroofing.com",
  ],
  general_contractor: [
    "https://www.masterbuildcontractors.com",
    "https://www.qualityconstructionpro.com",
    "https://www.buildrighthomes.com",
  ],
  
  // Route Service
  pest_control: [
    "https://www.bugfreezone.com",
    "https://www.pestpatrolservices.com",
    "https://www.crittercarecontrol.com",
  ],
  pool_service: [
    "https://www.crystalclearpools.com",
    "https://www.poolperfectservice.com",
    "https://www.aquacarepros.com",
  ],
  lawn_care: [
    "https://www.greenlawnpros.com",
    "https://www.perfectyardcare.com",
    "https://www.lawnmasterservices.com",
  ],
  
  // Food & Mobile
  taco_stand: [
    "https://www.streetfoodtacos.com",
    "https://www.tacocartcentral.com",
    "https://www.mobiletacokitchen.com",
  ],
  food_truck: [
    "https://www.rollingfeastfoodtruck.com",
    "https://www.streeteatsmobile.com",
    "https://www.gourmetonwheels.com",
  ],
  catering: [
    "https://www.perfectplatecatering.com",
    "https://www.eventfeastcatering.com",
    "https://www.culinarycraftcatering.com",
  ],
  
  // Sales-Led
  solar_sales: [
    "https://www.sunpowersolutionssales.com",
    "https://www.brightfuturesolar.com",
    "https://www.cleanenergypros.com",
  ],
  propane_sales: [
    "https://www.reliablepropanedelivery.com",
    "https://www.propaneprosupply.com",
    "https://www.fuelsourceconnection.com",
  ],
  equipment_sales: [
    "https://www.proequipmentsales.com",
    "https://www.industrialsolutionssupply.com",
    "https://www.machinemarketpros.com",
  ],
  
  // Specialty Local
  auto_repair: [
    "https://www.precisionautorepair.com",
    "https://www.trustymechanicshop.com",
    "https://www.fastfixautoservice.com",
  ],
  locksmith: [
    "https://www.securekeylocksmith.com",
    "https://www.24hourlockpros.com",
    "https://www.keymastersecurity.com",
  ],
  appliance_repair: [
    "https://www.appliancefixpros.com",
    "https://www.homeapplianceexperts.com",
    "https://www.reliableapplianceservice.com",
  ],
};

export function pickCuratedWebsite(industry: IndustryKey, seed?: number) {
  const list = CURATED_WEBSITES[industry] ?? [];
  if (!list.length) return null;
  const idx = typeof seed === "number" ? Math.abs(seed) % list.length : 0;
  return list[idx];
}

/**
 * Get a mock website URL for a specific industry.
 * Returns a random URL from the industry's list.
 */
export function getMockWebsiteForIndustry(industry_key: string): string | null {
  const websites = MOCK_WEBSITES_BY_INDUSTRY[industry_key];
  if (!websites || websites.length === 0) {
    return null;
  }
  
  // Return random website from the list
  const randomIndex = Math.floor(Math.random() * websites.length);
  return websites[randomIndex];
}

/**
 * Get the default mock website (HVAC as fallback).
 */
export function getDefaultMockWebsite(): string {
  return "https://www.coolcomfort.com";
}

/**
 * Get all available mock websites as a flat list.
 */
export function getAllMockWebsites(): string[] {
  return Object.values(MOCK_WEBSITES_BY_INDUSTRY).flat();
}

/**
 * Check if a URL is a mock website.
 */
export function isMockWebsite(url: string): boolean {
  const allMockWebsites = getAllMockWebsites();
  return allMockWebsites.includes(url);
}

