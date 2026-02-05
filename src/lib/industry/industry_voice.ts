/**
 * Industry Voice Hints - Enforce at least one industry-specific sentence per artifact
 * 
 * Pattern: Each industry gets opinionated phrases that replace generic language
 * Goal: Artifacts feel native to the reader's world, not consultant boilerplate
 */

export type IndustryBucket =
  | "home_services"
  | "professional_services"
  | "field_services"
  | "manufacturing"
  | "retail"
  | "construction"
  | "other";

export type IndustryVoiceHint = {
  /** Industry-native phrase to inject */
  phrase: string;
  /** When to use this phrase (pressure type or context) */
  context: "concentration" | "follow_up" | "capacity" | "cashflow" | "rhythm" | "general";
  /** Replacement target (what generic phrase this replaces) */
  replaces?: string;
};

/**
 * Industry-specific voice hints by bucket
 * Each bucket has 3-5 context-specific phrases
 */
export const INDUSTRY_VOICE_HINTS: Record<IndustryBucket, IndustryVoiceHint[]> = {
  home_services: [
    {
      phrase: "Most of your revenue is tied to a handful of projects",
      context: "concentration",
      replaces: "Revenue is concentrated",
    },
    {
      phrase: "Quotes are sitting longer than they should before homeowners decide",
      context: "follow_up",
      replaces: "Quotes are aging",
    },
    {
      phrase: "Your calendar is filling faster than you can schedule crews cleanly",
      context: "capacity",
      replaces: "Capacity is constrained",
    },
    {
      phrase: "Jobs are finishing but invoices aren't catching up",
      context: "cashflow",
      replaces: "Cash conversion is slow",
    },
    {
      phrase: "Work volume is jumping around week to week",
      context: "rhythm",
      replaces: "Volume is volatile",
    },
  ],
  professional_services: [
    {
      phrase: "A few large engagements are driving most of your billed revenue",
      context: "concentration",
      replaces: "Revenue is concentrated",
    },
    {
      phrase: "Proposals are lingering in client inboxes without clear next steps",
      context: "follow_up",
      replaces: "Quotes are aging",
    },
    {
      phrase: "Partner availability is the bottleneck between approval and project kickoff",
      context: "capacity",
      replaces: "Capacity is constrained",
    },
    {
      phrase: "Completed work is waiting to be invoiced, slowing your cash cycle",
      context: "cashflow",
      replaces: "Cash conversion is slow",
    },
    {
      phrase: "Project starts are uneven, making resource planning unpredictable",
      context: "rhythm",
      replaces: "Volume is volatile",
    },
  ],
  field_services: [
    {
      phrase: "A small number of service contracts are carrying most of your revenue",
      context: "concentration",
      replaces: "Revenue is concentrated",
    },
    {
      phrase: "Service quotes are sitting idle without follow-up touchpoints",
      context: "follow_up",
      replaces: "Quotes are aging",
    },
    {
      phrase: "Your dispatch board is full but technician assignments are lagging",
      context: "capacity",
      replaces: "Capacity is constrained",
    },
    {
      phrase: "Service tickets are closed but invoices aren't being sent promptly",
      context: "cashflow",
      replaces: "Cash conversion is slow",
    },
    {
      phrase: "Call volume is spiking unpredictably, making crew planning difficult",
      context: "rhythm",
      replaces: "Volume is volatile",
    },
  ],
  construction: [
    {
      phrase: "Your book of business is leaning heavily on a few big jobs",
      context: "concentration",
      replaces: "Revenue is concentrated",
    },
    {
      phrase: "Bids are out but GCs or property owners aren't responding on timeline",
      context: "follow_up",
      replaces: "Quotes are aging",
    },
    {
      phrase: "You're awarded work faster than you can slot it into your build schedule",
      context: "capacity",
      replaces: "Capacity is constrained",
    },
    {
      phrase: "Projects are wrapping but billing milestones are falling behind",
      context: "cashflow",
      replaces: "Cash conversion is slow",
    },
    {
      phrase: "Job starts are uneven, creating feast-or-famine crew loading",
      context: "rhythm",
      replaces: "Volume is volatile",
    },
  ],
  manufacturing: [
    {
      phrase: "Production volume is concentrated in a few large purchase orders",
      context: "concentration",
      replaces: "Revenue is concentrated",
    },
    {
      phrase: "Quotes are pending customer approval without active pursuit",
      context: "follow_up",
      replaces: "Quotes are aging",
    },
    {
      phrase: "Orders are coming in faster than production slots can absorb them",
      context: "capacity",
      replaces: "Capacity is constrained",
    },
    {
      phrase: "Shipments are complete but invoicing is trailing the delivery cycle",
      context: "cashflow",
      replaces: "Cash conversion is slow",
    },
    {
      phrase: "Order intake is fluctuating, making production planning inconsistent",
      context: "rhythm",
      replaces: "Volume is volatile",
    },
  ],
  retail: [
    {
      phrase: "A small set of customers or SKUs are driving most of your revenue",
      context: "concentration",
      replaces: "Revenue is concentrated",
    },
    {
      phrase: "Custom orders or quotes are sitting without clear customer engagement",
      context: "follow_up",
      replaces: "Quotes are aging",
    },
    {
      phrase: "Order fulfillment is backing up faster than you can ship or deliver",
      context: "capacity",
      replaces: "Capacity is constrained",
    },
    {
      phrase: "Sales are happening but invoices or payment processing is lagging",
      context: "cashflow",
      replaces: "Cash conversion is slow",
    },
    {
      phrase: "Sales volume is swinging unpredictably week over week",
      context: "rhythm",
      replaces: "Volume is volatile",
    },
  ],
  other: [
    {
      phrase: "Revenue is concentrated in a few big transactions",
      context: "concentration",
      replaces: "Revenue is concentrated",
    },
    {
      phrase: "Quotes are sitting without follow-up",
      context: "follow_up",
      replaces: "Quotes are aging",
    },
    {
      phrase: "Approved work is waiting longer than expected to start",
      context: "capacity",
      replaces: "Capacity is constrained",
    },
    {
      phrase: "Completed work isn't being invoiced promptly",
      context: "cashflow",
      replaces: "Cash conversion is slow",
    },
    {
      phrase: "Work volume is uneven week to week",
      context: "rhythm",
      replaces: "Volume is volatile",
    },
  ],
};

/**
 * Get industry-specific phrase for a given pressure context
 * Returns null if no match found (caller should use generic language)
 */
export function getIndustryPhrase(
  industry: IndustryBucket | null | undefined,
  pressureContext: IndustryVoiceHint["context"]
): string | null {
  if (!industry || industry === "other") {
    return null; // Use generic language for unknown industries
  }

  const hints = INDUSTRY_VOICE_HINTS[industry];
  const match = hints.find((h) => h.context === pressureContext);
  return match?.phrase ?? null;
}

/**
 * Map pressure keys to voice hint contexts
 */
export function pressureKeyToContext(
  pressureKey: string
): IndustryVoiceHint["context"] {
  if (pressureKey.includes("concentration")) return "concentration";
  if (pressureKey.includes("follow_up")) return "follow_up";
  if (pressureKey.includes("capacity")) return "capacity";
  if (pressureKey.includes("cashflow") || pressureKey.includes("paid")) return "cashflow";
  if (pressureKey.includes("rhythm") || pressureKey.includes("volatility")) return "rhythm";
  return "general";
}

/**
 * Get industry anchor sentence - ALWAYS returns a sentence
 * Anchors narrative in industry-specific operational context
 */
export function getIndustryAnchor(
  industry_key: IndustryBucket | null | undefined,
  cohort_label?: string
): string {
  // Try to derive industry from cohort_label if industry_key missing
  let industry = industry_key;
  if (!industry && cohort_label) {
    const label = cohort_label.toLowerCase();
    if (label.includes("home") || label.includes("hvac") || label.includes("plumbing")) {
      industry = "home_services";
    } else if (label.includes("professional") || label.includes("consulting")) {
      industry = "professional_services";
    } else if (label.includes("field") || label.includes("pest") || label.includes("clean")) {
      industry = "field_services";
    } else if (label.includes("construction") || label.includes("contractor")) {
      industry = "construction";
    }
  }

  switch (industry) {
    case "home_services":
      return "In home services, this usually shows up as crew planning + materials timing pressure when large jobs slip.";
    case "construction":
      return "In construction, the business feels heavy when milestone billing lags and pipeline visibility drops below 3 months.";
    case "professional_services":
      return "In professional services, pressure builds when engagement cycle length stretches and follow-up becomes inconsistent.";
    case "field_services":
      return "In field services, efficiency breaks down when routing gets reactive and recurring revenue lanes stall.";
    case "manufacturing":
      return "In manufacturing, capacity pressure shows up as order queue unpredictability and production slot conflicts.";
    case "retail":
      return "In retail, strain appears when custom orders pile up and fulfillment timing becomes unreliable.";
    default:
      // Generic fallback when industry unknown
      return "In sales-led businesses, pressure builds when cycle length stretches and follow-up becomes inconsistent.";
  }
}
