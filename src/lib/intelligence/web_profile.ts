export type BusinessProfile = {
  name_guess: string | null;
  summary: string;
  services: string[];
  location_mentions: string[];
  industry_bucket: "trade" | "service" | "health" | "retail" | "professional" | "other";
  domain: string | null;
  found_contact: boolean;
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

function extractName(html: string) {
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  if (titleMatch) return titleMatch[1].trim();
  const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (h1Match) return h1Match[1].trim();
  return null;
}

function findContact(text: string) {
  const email = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text);
  const phone = /(\+?\d{1,2}[\s.-]?)?(\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/.test(text);
  return email || phone;
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

export async function buildBusinessProfile(websiteUrl?: string | null): Promise<BusinessProfile> {
  if (!websiteUrl) {
    return {
      name_guess: null,
      summary: "No website provided. A business summary was not generated.",
      services: [],
      location_mentions: [],
      industry_bucket: "other",
      domain: null,
      found_contact: false,
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
  const foundContact = findContact(combined);

  const summary = `We reviewed ${pages.length} page${
    pages.length === 1 ? "" : "s"
  } from ${domain}. The site suggests ${
    industry === "other" ? "a general services business" : `a ${industry} business`
  } focused on ${services.length ? services.join(", ") : "core service delivery"}.`;

  return {
    name_guess: nameGuess,
    summary,
    services,
    location_mentions: [],
    industry_bucket: industry,
    domain,
    found_contact: foundContact,
  };
}
