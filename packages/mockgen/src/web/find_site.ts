/**
 * Find business websites via search or curated list
 */

import type { IndustryKey } from "../types";

export interface SiteResult {
  url: string;
  title: string;
  snippet: string;
}

/**
 * Find a business website for the given industry and service area
 * Falls back to curated list if search unavailable
 */
export async function findBusinessSite(
  industry: IndustryKey,
  serviceArea: string,
  apiKey?: string
): Promise<SiteResult | null> {
  // Try search API if available
  if (apiKey) {
    try {
      const result = await searchWithAPI(industry, serviceArea, apiKey);
      if (result) return result;
    } catch (err) {
      console.warn(`Search API failed: ${err}`);
    }
  }
  
  // Fallback to curated list
  return getCuratedSite(industry, serviceArea);
}

async function searchWithAPI(
  industry: IndustryKey,
  serviceArea: string,
  apiKey: string
): Promise<SiteResult | null> {
  // Example: SerpAPI integration
  const query = `${industry} service ${serviceArea}`;
  const url = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${apiKey}&num=10`;
  
  const response = await fetch(url);
  if (!response.ok) return null;
  
  const data = await response.json();
  const results = data.organic_results || [];
  
  // Filter for valid sites (HTTPS, no marketplaces)
  for (const result of results) {
    const url = result.link || "";
    if (!url.startsWith("https://")) continue;
    if (isMarketplace(url)) continue;
    
    return {
      url,
      title: result.title || "",
      snippet: result.snippet || "",
    };
  }
  
  return null;
}

function isMarketplace(url: string): boolean {
  const marketplaces = [
    "yelp.com",
    "angi.com",
    "homeadvisor.com",
    "thumbtack.com",
    "facebook.com",
    "yellowpages.com",
  ];
  return marketplaces.some((m) => url.includes(m));
}

function getCuratedSite(industry: IndustryKey, serviceArea: string): SiteResult | null {
  const sites = CURATED_SITES[industry];
  if (!sites || sites.length === 0) return null;
  
  // Try to find site matching service area
  const match = sites.find((s) => s.area === serviceArea);
  if (match) return { url: match.url, title: match.title, snippet: "" };
  
  // Otherwise return first site
  return { url: sites[0].url, title: sites[0].title, snippet: "" };
}

interface CuratedSite {
  url: string;
  title: string;
  area: string;
}

const CURATED_SITES: Record<IndustryKey, CuratedSite[]> = {
  hvac: [
    { url: "https://www.abrahamlincolnheatingandac.com", title: "Abraham Lincoln Heating & AC", area: "Phoenix, AZ" },
    { url: "https://www.comfortsystemsusa.com", title: "Comfort Systems USA", area: "Houston, TX" },
    { url: "https://www.cooltoday.com", title: "Cool Today", area: "Tampa, FL" },
    { url: "https://www.americanstandardair.com", title: "American Standard", area: "Denver, CO" },
    { url: "https://www.carrierenterprise.com", title: "Carrier", area: "Atlanta, GA" },
    { url: "https://www.boeingheating.com", title: "Boeing Heating & Cooling", area: "Seattle, WA" },
  ],
  plumbing: [
    { url: "https://www.benfranklinplumbing.com", title: "Ben Franklin Plumbing", area: "Dallas, TX" },
    { url: "https://www.rooter.com", title: "Roto-Rooter", area: "Phoenix, AZ" },
    { url: "https://www.mrplumber.com", title: "Mr. Plumber", area: "Atlanta, GA" },
    { url: "https://www.plumbersdirect.com", title: "Plumbers Direct", area: "Denver, CO" },
    { url: "https://www.accurateleakandline.com", title: "Accurate Leak", area: "Houston, TX" },
    { url: "https://www.joetheserviceplumber.com", title: "Joe the Plumber", area: "Tampa, FL" },
  ],
  electrical: [
    { url: "https://www.mrelectric.com", title: "Mr. Electric", area: "Dallas, TX" },
    { url: "https://www.onhourelectric.com", title: "On Time Electric", area: "Phoenix, AZ" },
    { url: "https://www.electricianstoday.com", title: "Electricians Today", area: "Atlanta, GA" },
    { url: "https://www.wirenutelectric.com", title: "Wire Nut Electric", area: "Denver, CO" },
    { url: "https://www.johnstonelectric.com", title: "Johnston Electric", area: "Seattle, WA" },
    { url: "https://www.theworkingelectrician.com", title: "The Working Electrician", area: "Houston, TX" },
  ],
  landscaping: [
    { url: "https://www.brightviewlandscapes.com", title: "BrightView", area: "Phoenix, AZ" },
    { url: "https://www.thelawnguys.com", title: "The Lawn Guys", area: "Dallas, TX" },
    { url: "https://www.groundguyslandscaping.com", title: "Grounds Guys", area: "Denver, CO" },
    { url: "https://www.greenacreslandscaping.com", title: "Green Acres", area: "Atlanta, GA" },
    { url: "https://www.grasshopper.com", title: "Grasshopper", area: "Seattle, WA" },
    { url: "https://www.naturallawn.com", title: "Natural Lawn", area: "Tampa, FL" },
  ],
  cleaning: [
    { url: "https://www.mollymaid.com", title: "Molly Maid", area: "Phoenix, AZ" },
    { url: "https://www.maidright.com", title: "Maid Right", area: "Dallas, TX" },
    { url: "https://www.cleaningauthority.com", title: "The Cleaning Authority", area: "Atlanta, GA" },
    { url: "https://www.homejoyservices.com", title: "HomeJoy", area: "Denver, CO" },
    { url: "https://www.tidyservices.com", title: "Tidy", area: "Seattle, WA" },
    { url: "https://www.sparklemaidservice.com", title: "Sparkle Maid", area: "Tampa, FL" },
  ],
};
