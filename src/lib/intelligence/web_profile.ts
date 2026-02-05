import { ingestRagDoc } from "@/lib/rag";

export type BusinessProfile = {
  name_guess: string | null;
  summary: string;
  services: string[];
  location_mentions: string[];
  industry_bucket: "trade" | "service" | "health" | "retail" | "professional" | "other";
  domain: string | null;
  found_contact: boolean;
  website_present: boolean;
  opportunity_signals: {
    has_phone: boolean;
    has_email: boolean;
    has_booking_cta: boolean;
    has_financing: boolean;
    has_reviews: boolean;
    has_service_pages: boolean;
    has_maintenance_plan: boolean;
  };
};

const MAX_BYTES = 200_000;

function stripHtml(input: string) {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function guessIndustry(text: string) {
  const t = text.toLowerCase();
  if (/(plumbing|hvac|electrical|roof|construction|contractor)/.test(t)) return "trade";
  if (/(cleaning|landscap|maintenance|install|repair|pest)/.test(t)) return "service";
  if (/(clinic|dental|medical|therapy|health|wellness)/.test(t)) return "health";
  if (/(shop|store|retail|boutique|market)/.test(t)) return "retail";
  if (/(consult|agency|law|accounting|finance|studio)/.test(t)) return "professional";
  return "other";
}

function findServices(text: string) {
  const keywords = [
    "installation",
    "repair",
    "maintenance",
    "design",
    "consulting",
    "inspection",
    "support",
    "cleaning",
    "delivery",
  ];
  return keywords.filter((k) => text.toLowerCase().includes(k));
}

function hasEmail(text: string) {
  return /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text);
}

function hasPhone(text: string) {
  return /(\+?\d{1,2}[\s.-]?)?(\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/.test(text);
}

function extractName(html: string) {
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  if (titleMatch) return titleMatch[1].trim();
  const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (h1Match) return h1Match[1].trim();
  return null;
}

function buildOpportunitySignals(text: string, candidateLinks: number) {
  const lower = text.toLowerCase();
  const has_booking_cta =
    /(schedule|book|estimate|request service|request a service|request a quote|get a quote|get quote)/.test(lower);
  const has_financing = /(financing|monthly payment|payment plan)/.test(lower);
  const has_reviews = /(google reviews|testimonials|rating|rated \d|reviews)/.test(lower);
  const has_maintenance_plan = /(maintenance plan|membership|club|service plan)/.test(lower);

  return {
    has_phone: hasPhone(text),
    has_email: hasEmail(text),
    has_booking_cta,
    has_financing,
    has_reviews,
    has_service_pages: candidateLinks > 0,
    has_maintenance_plan,
  };
}

async function fetchWithLimit(url: string) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const slice = buffer.length > MAX_BYTES ? buffer.slice(0, MAX_BYTES) : buffer;
  return slice.toString("utf8");
}

function findCandidateLinks(html: string, base: string) {
  const links: string[] = [];
  const regex = /href=["']([^"']+)["']/gi;
  let match;
  while ((match = regex.exec(html))) {
    const href = match[1];
    if (!href) continue;
    if (href.startsWith("#")) continue;
    if (href.includes("mailto:") || href.includes("tel:")) continue;
    if (href.includes("about") || href.includes("service")) {
      try {
        const url = new URL(href, base);
        links.push(url.toString());
      } catch {
        continue;
      }
    }
  }
  return Array.from(new Set(links)).slice(0, 2);
}

export function buildWebsiteOpportunities(
  profile: BusinessProfile,
  industry_bucket?: BusinessProfile["industry_bucket"]
) {
  if (!profile.website_present) return [];

  const signals =
    profile.opportunity_signals ??
    ({
      has_phone: false,
      has_email: false,
      has_booking_cta: false,
      has_financing: false,
      has_reviews: false,
      has_service_pages: false,
      has_maintenance_plan: false,
    } as BusinessProfile["opportunity_signals"]);
  const opportunities: Array<{ title: string; why: string; suggested_tool?: string }> = [];

  if (!signals.has_booking_cta) {
    opportunities.push({
      title: "Add a clear booking or request form",
      why: "The site does not surface a booking or estimate CTA, which can slow lead capture.",
      suggested_tool: "Cal.com or a simple request form",
    });
  }

  if (!signals.has_reviews) {
    opportunities.push({
      title: "Create a review capture workflow",
      why: "No reviews or testimonials were detected; social proof is often a quiet conversion driver.",
      suggested_tool: "Review request templates in your CRM",
    });
  }

  if (!signals.has_service_pages) {
    opportunities.push({
      title: "Clarify service pages and packaging",
      why: "No service-specific pages were detected, which can make offers feel vague.",
    });
  }

  if (!signals.has_maintenance_plan) {
    opportunities.push({
      title: "Consider a light maintenance plan",
      why: "No membership or maintenance plan signals were found; recurring plans can smooth demand.",
    });
  }

  if (!signals.has_financing && (industry_bucket === "trade" || industry_bucket === "service")) {
    opportunities.push({
      title: "Surface financing or payment options",
      why: "For higher-ticket work, clear payment options can reduce delay at approval.",
    });
  }

  if (!signals.has_phone && !signals.has_email) {
    opportunities.push({
      title: "Make contact options obvious",
      why: "We did not detect a clear phone or email, which can add friction for new leads.",
    });
  }

  if (opportunities.length < 2) {
    opportunities.push({
      title: "Add quote follow-up reminders",
      why: "Lightweight reminders ensure active quotes do not drift.",
      suggested_tool: "CRM reminders or inbox rules",
    });
  }

  if (opportunities.length < 2) {
    opportunities.push({
      title: "Tighten intake with a short pre-qual form",
      why: "A focused intake form can reduce back-and-forth and protect scheduling time.",
    });
  }

  return opportunities.slice(0, 5);
}

/**
 * Ingest website scan into RAG for context enrichment.
 * 
 * Creates a RAG document containing:
 * - Website summary
 * - Detected signals
 * - Service mentions
 * - Industry classification
 * 
 * This is CONTEXT ONLY and never used for deterministic signals.
 * 
 * Guardrails:
 * - Only ingests if website_url exists
 * - Max 1 doc per workspace_id + run_id combination
 * - Internal use only for now
 */
async function ingestWebsiteScanToRag(params: {
  profile: BusinessProfile;
  workspace_id: string;
  run_id?: string;
}) {
  const { profile, workspace_id, run_id } = params;

  if (!profile.website_present || !profile.domain) {
    return; // Skip if no website
  }

  try {
    // Build RAG document text
    const ragText = `
Website Analysis for ${profile.domain}

Business Name: ${profile.name_guess ?? "Not detected"}
Industry: ${profile.industry_bucket}
Services: ${profile.services.join(", ") || "Not specified"}

Summary:
${profile.summary}

Detected Signals:
- Booking/CTA present: ${profile.opportunity_signals.has_booking_cta ? "Yes" : "No"}
- Reviews visible: ${profile.opportunity_signals.has_reviews ? "Yes" : "No"}
- Financing mentioned: ${profile.opportunity_signals.has_financing ? "Yes" : "No"}
- Maintenance plan: ${profile.opportunity_signals.has_maintenance_plan ? "Yes" : "No"}
- Service pages: ${profile.opportunity_signals.has_service_pages ? "Yes" : "No"}
- Contact info: ${profile.found_contact ? "Yes" : "No"}

This website scan provides context for understanding the business's online presence and service offerings.
    `.trim();

    // Ingest to RAG
    await ingestRagDoc({
      text: ragText,
      metadata: {
        workspace_id,
        industry_key: profile.industry_bucket,
        doc_type: "website_scan",
        source: "website",
        created_at: new Date().toISOString(),
        run_id,
      },
    });
  } catch (error) {
    // Fail gracefully - RAG is advisory only
    console.warn("Failed to ingest website scan to RAG:", error);
  }
}

export async function buildBusinessProfile(
  websiteUrl?: string | null,
  options?: { workspace_id?: string; run_id?: string }
): Promise<BusinessProfile> {
  if (!websiteUrl) {
    return {
      name_guess: null,
      summary: "No website provided. A business summary was not generated.",
      services: [],
      location_mentions: [],
      industry_bucket: "other",
      domain: null,
      found_contact: false,
      website_present: false,
      opportunity_signals: {
        has_phone: false,
        has_email: false,
        has_booking_cta: false,
        has_financing: false,
        has_reviews: false,
        has_service_pages: false,
        has_maintenance_plan: false,
      },
    };
  }

  const url = new URL(websiteUrl);
  const domain = url.hostname;
  const pages: string[] = [];

  const homepageHtml = await fetchWithLimit(url.toString());
  pages.push(homepageHtml);

  const candidates = findCandidateLinks(homepageHtml, url.toString());
  for (const link of candidates) {
    try {
      pages.push(await fetchWithLimit(link));
    } catch {
      continue;
    }
  }

  const combined = pages.map(stripHtml).join(" ");
  const nameGuess = extractName(homepageHtml);
  const services = findServices(combined);
  const industry = guessIndustry(combined);
  const opportunity_signals = buildOpportunitySignals(combined, candidates.length);
  const foundContact = opportunity_signals.has_email || opportunity_signals.has_phone;

  const summary = `We reviewed ${pages.length} page${
    pages.length === 1 ? "" : "s"
  } from ${domain}. The site suggests ${
    industry === "other" ? "a general services business" : `a ${industry} business`
  } focused on ${services.length ? services.join(", ") : "core service delivery"}.`;

  const profile: BusinessProfile = {
    name_guess: nameGuess,
    summary,
    services,
    location_mentions: [],
    industry_bucket: industry,
    domain,
    found_contact: foundContact,
    website_present: true,
    opportunity_signals,
  };

  // Ingest to RAG if workspace_id provided
  if (options?.workspace_id) {
    // Fire and forget - don't block on RAG ingestion
    ingestWebsiteScanToRag({
      profile,
      workspace_id: options.workspace_id,
      run_id: options.run_id,
    }).catch((err) => {
      console.warn("RAG ingestion failed (non-blocking):", err);
    });
  }

  return profile;
}
