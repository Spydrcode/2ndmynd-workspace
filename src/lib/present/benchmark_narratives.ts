/**
 * Benchmark Narrative Formatter
 *
 * Converts peer comparisons into owner-felt, non-dashboard language.
 */

import type { IndustryGroup } from "../intelligence/industry_groups";
import type { BenchmarkMetricV1 } from "../types/decision_artifact";

export type BenchmarkInsight = {
  headline: string;
  so_what: string;
};

const GROUP_NOUNS: Record<IndustryGroup, { unit: string; rhythm: string }> = {
  home_services_trade: { unit: "job", rhythm: "crew weeks" },
  project_trades: { unit: "project", rhythm: "project weeks" },
  route_service: { unit: "route", rhythm: "route weeks" },
  food_mobile: { unit: "service window", rhythm: "service days" },
  sales_led: { unit: "deal", rhythm: "sales weeks" },
  specialty_local: { unit: "repair", rhythm: "shop weeks" },
};

function clampLength(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trim()}…`;
}

function missingPeerContext(industry_group: IndustryGroup): BenchmarkInsight {
  const noun = GROUP_NOUNS[industry_group];
  return {
    headline: "Peer context is unavailable for this measure.",
    so_what: `Use this as directional only and focus on the operational move that steadies ${noun.rhythm}.`,
  };
}

export function formatBenchmarkInsight(params: {
  metric_key: string;
  value: number;
  peer_median: number | null | undefined;
  percentile: number | null | undefined;
  direction: BenchmarkMetricV1["direction"];
  industry_group: IndustryGroup;
}): BenchmarkInsight {
  const { metric_key, peer_median, industry_group } = params;
  const noun = GROUP_NOUNS[industry_group];

  if (peer_median === null || peer_median === undefined) {
    return missingPeerContext(industry_group);
  }

  let headline = "";
  let so_what = "";

  switch (metric_key) {
    case "revenue_concentration_top5_share":
      if (industry_group === "food_mobile") {
        headline = "Your week leans on a few peak shifts more than most peers.";
        so_what = "Add a repeatable mid-week lane so one slow day does not erase the week.";
      } else {
        headline = `Your month is riding on a few big ${noun.unit}s more than most peers.`;
        so_what = `Add a mid-ticket lane so one ${noun.unit} moving does not swing the month.`;
      }
      break;
    case "quote_age_over_14d_share":
      headline = "More quotes are sitting past two weeks than most peers.";
      so_what = "Run a 48-hour follow-up rhythm on mid-ticket work and close aging quotes first.";
      break;
    case "approved_to_scheduled_p50_days":
      headline = `Work takes longer to land on the calendar than most peers.`;
      so_what = "Protect a weekly scheduling pass so approved work lands cleanly and the backlog does not stack.";
      break;
    case "invoiced_to_paid_p50_days":
      headline = "Cash is arriving slower after work is done than most peers.";
      so_what = "Invoice within 48 hours and use milestone billing to shorten the cash gap.";
      break;
    case "quote_to_job_conversion_rate":
      headline = "A smaller share of quotes are turning into work than most peers.";
      so_what = "Simplify quotes into tiers and tighten follow-up within 48 hours to recover momentum.";
      break;
    case "weekly_volume_volatility_index":
      headline = `Your ${noun.rhythm} swing more than most peers.`;
      so_what = "Build one repeatable weekly lane so volume stops lurching from spike to dip.";
      break;
    case "invoice_size_distribution_gini":
      headline = "Invoice sizes are more uneven than most peers.";
      so_what = "Create a mid-ticket offer so revenue is not dominated by a few outsized jobs.";
      break;
    default:
      headline = "You differ from peers on this measure.";
      so_what = "Treat this as directional and anchor decisions in the main takeaway.";
      break;
  }

  return {
    headline: clampLength(headline, 120),
    so_what: clampLength(so_what, 160),
  };
}
