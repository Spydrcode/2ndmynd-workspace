/**
 * Cohort definitions with reference baseline distributions
 * 
 * Starting with heuristic distributions for HVAC/trades service businesses.
 * These are informed estimates pending real peer data collection.
 */

import type { CohortDefinition } from "./types";

/**
 * HVAC / trades service cohort
 * Characteristics:
 * - Service-based revenue (installation, repair, maintenance)
 * - Mix of residential and light commercial
 * - Typical job size: $500-$5000
 * - 2-10 techs
 */
const TRADES_HVAC_SERVICE: CohortDefinition = {
  id: "trades_hvac_service",
  label: "HVAC & trades (service)",
  description: "Service-focused HVAC and trade businesses with residential/light commercial mix",
  reference: {
    // Revenue concentration (top 5 customers % of total) - lower is better (less fragility)
    // Healthy service businesses spread across many customers
    revenue_concentration_top5_share: [0.15, 0.25, 0.40], // p25: 15%, median: 25%, p75: 40%

    // Invoice size distribution (Gini coefficient 0-1) - lower is better (more consistent)
    // 0 = perfectly equal, 1 = one customer gets everything
    invoice_size_distribution_gini: [0.35, 0.45, 0.60], // p25: 0.35, median: 0.45, p75: 0.60

    // Quote age over 14 days (% of open quotes) - lower is better
    // Strong operators follow up quickly
    quote_age_over_14d_share: [0.15, 0.30, 0.50], // p25: 15%, median: 30%, p75: 50%

    // Quote to job conversion (if mapping exists) - higher is better
    // This is approval-to-scheduled conversion rate
    quote_to_job_conversion_rate: [0.55, 0.70, 0.85], // p25: 55%, median: 70%, p75: 85%

    // Approved to scheduled (days, p50) - lower is better
    // Strong operators schedule quickly after approval
    approved_to_scheduled_p50_days: [2, 5, 10], // p25: 2d, median: 5d, p75: 10d

    // Invoiced to paid (days, p50) - lower is better (but interpret carefully)
    // This is a cash cycle metric but can be influenced by payment terms
    invoiced_to_paid_p50_days: [14, 21, 35], // p25: 14d, median: 21d, p75: 35d

    // Weekly volume volatility (coefficient of variation) - lower is better (more rhythm)
    // CV = std_dev / mean of weekly invoice counts
    weekly_volume_volatility_index: [0.20, 0.35, 0.55], // p25: 0.20, median: 0.35, p75: 0.55
  },
};

/**
 * General service business cohort (fallback)
 */
const GENERAL_SERVICE: CohortDefinition = {
  id: "general_service",
  label: "Service businesses (general)",
  description: "General service businesses across industries",
  reference: {
    revenue_concentration_top5_share: [0.20, 0.30, 0.45],
    invoice_size_distribution_gini: [0.40, 0.50, 0.65],
    quote_age_over_14d_share: [0.20, 0.35, 0.55],
    quote_to_job_conversion_rate: [0.50, 0.65, 0.80],
    approved_to_scheduled_p50_days: [3, 7, 14],
    invoiced_to_paid_p50_days: [15, 25, 40],
    weekly_volume_volatility_index: [0.25, 0.40, 0.60],
  },
};

export const COHORT_DEFINITIONS: Record<string, CohortDefinition> = {
  trades_hvac_service: TRADES_HVAC_SERVICE,
  general_service: GENERAL_SERVICE,
};

/**
 * Select appropriate cohort based on industry tags and business profile
 */
export function selectCohort(industryTags: string[]): CohortDefinition {
  const normalized = industryTags.map((tag) => tag.toLowerCase());

  // Check for HVAC/trades indicators
  const hvacIndicators = ["hvac", "plumbing", "electrical", "trades", "contractor", "service"];
  if (normalized.some((tag) => hvacIndicators.some((ind) => tag.includes(ind)))) {
    return TRADES_HVAC_SERVICE;
  }

  // Default to general service
  return GENERAL_SERVICE;
}
