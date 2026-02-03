/**
 * Scrape website for business context (keywords, location, services)
 */

export interface WebsiteContext {
  url: string;
  businessName: string;
  city: string;
  state: string;
  serviceKeywords: string[];
  rawText: string;
}

/**
 * Scrape a website to extract business context
 */
export async function scrapeSite(url: string): Promise<WebsiteContext | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; 2ndMyndMockGen/1.0)",
      },
    });
    
    if (!response.ok) return null;
    
    const html = await response.text();
    const text = extractText(html);
    
    // Extract business name from title tag
    const titleMatch = html.match(/<title>(.*?)<\/title>/i);
    const businessName = titleMatch
      ? titleMatch[1].replace(/\s*\|.*$/, "").trim()
      : new URL(url).hostname.replace(/^www\./, "").replace(/\..+$/, "");
    
    // Extract location
    const location = extractLocation(text);
    
    // Extract service keywords
    const keywords = extractServiceKeywords(text);
    
    return {
      url,
      businessName,
      city: location.city,
      state: location.state,
      serviceKeywords: keywords,
      rawText: text.substring(0, 5000), // Store first 5k chars for diagnostics
    };
  } catch (err) {
    console.warn(`Scrape failed for ${url}: ${err}`);
    return null;
  }
}

function extractText(html: string): string {
  // Remove script and style tags
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ");
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ");
  
  // Remove HTML tags
  text = text.replace(/<[^>]+>/g, " ");
  
  // Decode HTML entities
  text = text.replace(/&nbsp;/g, " ");
  text = text.replace(/&amp;/g, "&");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/&quot;/g, '"');
  
  // Collapse whitespace
  text = text.replace(/\s+/g, " ").trim();
  
  return text;
}

function extractLocation(text: string): { city: string; state: string } {
  // Look for patterns like "City, ST" or "serving City, State"
  const patterns = [
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s*([A-Z]{2})\b/g,
    /\bin\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),?\s+([A-Z][a-z]+)\b/g,
    /\bserving\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),?\s+([A-Z]{2})\b/gi,
  ];
  
  for (const pattern of patterns) {
    const matches = [...text.matchAll(pattern)];
    if (matches.length > 0) {
      const [, city, state] = matches[0];
      return { city: city.trim(), state: normalizeState(state) };
    }
  }
  
  // Default fallback
  return { city: "Unknown", state: "XX" };
}

function normalizeState(state: string): string {
  const stateMap: Record<string, string> = {
    Arizona: "AZ",
    Texas: "TX",
    Florida: "FL",
    Georgia: "GA",
    Colorado: "CO",
    Washington: "WA",
    California: "CA",
  };
  
  // If already abbreviation, return as-is
  if (state.length === 2) return state.toUpperCase();
  
  // Otherwise lookup
  return stateMap[state] || "XX";
}

function extractServiceKeywords(text: string): string[] {
  const commonServices = [
    "repair",
    "installation",
    "maintenance",
    "service",
    "emergency",
    "24/7",
    "licensed",
    "insured",
    "certified",
    "residential",
    "commercial",
    "hvac",
    "heating",
    "cooling",
    "air conditioning",
    "furnace",
    "plumbing",
    "drain cleaning",
    "water heater",
    "sewer",
    "electrical",
    "panel",
    "wiring",
    "outlets",
    "lighting",
    "landscaping",
    "lawn care",
    "mowing",
    "irrigation",
    "tree",
    "cleaning",
    "maid",
    "janitorial",
    "carpet cleaning",
  ];
  
  const lowerText = text.toLowerCase();
  const found = new Set<string>();
  
  for (const keyword of commonServices) {
    if (lowerText.includes(keyword)) {
      found.add(keyword);
    }
  }
  
  return Array.from(found).slice(0, 10);
}
