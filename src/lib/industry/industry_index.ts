/**
 * Industry Index - Priority flags and baseline metadata
 * 
 * This module tracks which industries are prioritized for baseline development
 * and provides metadata for seeding industry-specific benchmarks and patterns.
 */

import type { IndustryBucket } from "./industry_voice";

export type IndustryPriority = "high" | "medium" | "low";

export type IndustryMetadata = {
  bucket: IndustryBucket;
  label: string;
  priority: IndustryPriority;
  baseline_ready: boolean; // Whether baseline data is seeded
  typical_quote_range: [number, number]; // Min/max typical quote value
  typical_invoice_range: [number, number]; // Min/max typical invoice value
  typical_cycle_days: {
    quote_to_job: number; // Days from quote to job start
    job_duration: number; // Typical job duration
    invoice_to_paid: number; // Days from invoice to payment
  };
  sample_services: string[]; // Example service types for this industry
  notes?: string; // Context about this industry
};

/**
 * Industry metadata by bucket
 * Priority industries are marked high and have baseline_ready = true once seeded
 */
export const INDUSTRY_INDEX: Record<IndustryBucket, IndustryMetadata> = {
  home_services: {
    bucket: "home_services",
    label: "Home Services",
    priority: "high",
    baseline_ready: false,
    typical_quote_range: [500, 15000],
    typical_invoice_range: [800, 18000],
    typical_cycle_days: {
      quote_to_job: 7,
      job_duration: 3,
      invoice_to_paid: 21,
    },
    sample_services: [
      "HVAC repair",
      "Plumbing",
      "Electrical work",
      "Roofing",
      "Landscaping",
      "Pool maintenance",
    ],
    notes: "High-trust, high-variance. Revenue swings week-to-week based on weather and seasonality.",
  },
  
  professional_services: {
    bucket: "professional_services",
    label: "Professional Services",
    priority: "high",
    baseline_ready: false,
    typical_quote_range: [2000, 50000],
    typical_invoice_range: [3000, 75000],
    typical_cycle_days: {
      quote_to_job: 14,
      job_duration: 30,
      invoice_to_paid: 30,
    },
    sample_services: [
      "Consulting",
      "Accounting",
      "Legal services",
      "Marketing agency",
      "Design services",
      "Engineering",
    ],
    notes: "Long sales cycles, high-value engagements, often retainer-based or project-based.",
  },
  
  field_services: {
    bucket: "field_services",
    label: "Field Services",
    priority: "high",
    baseline_ready: false,
    typical_quote_range: [300, 8000],
    typical_invoice_range: [400, 10000],
    typical_cycle_days: {
      quote_to_job: 3,
      job_duration: 1,
      invoice_to_paid: 14,
    },
    sample_services: [
      "Pest control",
      "Cleaning services",
      "Security installation",
      "Fire suppression",
      "Equipment maintenance",
      "Inspection services",
    ],
    notes: "High volume, fast turnaround, often subscription or recurring revenue model.",
  },
  
  construction: {
    bucket: "construction",
    label: "Construction",
    priority: "high",
    baseline_ready: false,
    typical_quote_range: [10000, 500000],
    typical_invoice_range: [15000, 600000],
    typical_cycle_days: {
      quote_to_job: 30,
      job_duration: 60,
      invoice_to_paid: 45,
    },
    sample_services: [
      "General contracting",
      "Commercial build-out",
      "Residential remodeling",
      "Site work",
      "Concrete",
      "Framing",
    ],
    notes: "Long cycles, milestone-based billing, heavy cash flow management, GC dependencies.",
  },
  
  manufacturing: {
    bucket: "manufacturing",
    label: "Manufacturing",
    priority: "medium",
    baseline_ready: false,
    typical_quote_range: [5000, 100000],
    typical_invoice_range: [8000, 150000],
    typical_cycle_days: {
      quote_to_job: 10,
      job_duration: 21,
      invoice_to_paid: 30,
    },
    sample_services: [
      "Custom fabrication",
      "CNC machining",
      "Assembly",
      "Product manufacturing",
      "Component production",
      "Packaging",
    ],
    notes: "Purchase order driven, capacity constrained, inventory considerations.",
  },
  
  retail: {
    bucket: "retail",
    label: "Retail",
    priority: "medium",
    baseline_ready: false,
    typical_quote_range: [100, 5000],
    typical_invoice_range: [150, 8000],
    typical_cycle_days: {
      quote_to_job: 5,
      job_duration: 1,
      invoice_to_paid: 7,
    },
    sample_services: [
      "Custom orders",
      "Special orders",
      "Installation services",
      "Design consultation",
      "Delivery services",
    ],
    notes: "Fast cycles, lower value, high volume potential, seasonal patterns.",
  },
  
  other: {
    bucket: "other",
    label: "Other",
    priority: "low",
    baseline_ready: false,
    typical_quote_range: [1000, 25000],
    typical_invoice_range: [1500, 35000],
    typical_cycle_days: {
      quote_to_job: 10,
      job_duration: 14,
      invoice_to_paid: 21,
    },
    sample_services: ["Mixed services", "General business"],
    notes: "Catch-all for unclassified industries.",
  },
};

/**
 * Get priority industries (baseline development targets)
 */
export function getPriorityIndustries(): IndustryMetadata[] {
  return Object.values(INDUSTRY_INDEX).filter((meta) => meta.priority === "high");
}

/**
 * Get industries that need baseline seeding
 */
export function getIndustriesNeedingBaselines(): IndustryMetadata[] {
  return Object.values(INDUSTRY_INDEX).filter(
    (meta) => meta.priority === "high" && !meta.baseline_ready
  );
}

/**
 * Mark an industry baseline as ready
 */
export function markBaselineReady(bucket: IndustryBucket): void {
  INDUSTRY_INDEX[bucket].baseline_ready = true;
}
