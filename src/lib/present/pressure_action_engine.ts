/**
 * Pressure-to-Action Engine
 *
 * Generates evidence-linked, numeric actions with boundaries.
 * Uses only snapshot and benchmark values; degrades gracefully when metrics are missing.
 */

import type { SnapshotV2 } from "@/lib/decision/v2/conclusion_schema_v2";
import type { BenchmarkPackV1, BenchmarkMetricV1 } from "../types/decision_artifact";
import type { IndustryGroup, IndustryKey } from "../intelligence/industry_groups";
import type { PressureKey, PressureTranslation } from "./pressure_translations";

export type PressureActionResult = {
  recommended_move: string;
  next_7_days: string[];
  boundary: string;
  action_degraded_missing_metric: boolean;
  used_metrics: string[];
};

const METRIC_KEYS: Record<PressureKey, string | null> = {
  concentration_risk: "revenue_concentration_top5_share",
  follow_up_drift: "quote_age_over_14d_share",
  capacity_pressure: "approved_to_scheduled_p50_days",
  decision_lag: "approved_to_scheduled_p50_days",
  low_conversion: "quote_to_job_conversion_rate",
  rhythm_volatility: "weekly_volume_volatility_index",
  cashflow_drag: "invoiced_to_paid_p50_days",
  mapping_low_confidence: null,
};

const GROUP_CONTEXT: Record<IndustryGroup, { unit: string; plural: string; lane: string; schedule: string }> = {
  home_services_trade: {
    unit: "install",
    plural: "installs",
    lane: "mid-ticket lane",
    schedule: "crew calendar",
  },
  project_trades: {
    unit: "project",
    plural: "projects",
    lane: "small-project lane",
    schedule: "build schedule",
  },
  route_service: {
    unit: "route",
    plural: "routes",
    lane: "recurring lane",
    schedule: "route plan",
  },
  food_mobile: {
    unit: "service window",
    plural: "service windows",
    lane: "prep-and-rush lane",
    schedule: "service plan",
  },
  sales_led: {
    unit: "deal",
    plural: "deals",
    lane: "mid-ticket offer",
    schedule: "delivery calendar",
  },
  specialty_local: {
    unit: "repair",
    plural: "repairs",
    lane: "maintenance lane",
    schedule: "shop calendar",
  },
};

function formatPercent(value: number): string {
  return `~${Math.round(value)}%`;
}

function formatDays(value: number): string {
  return `${Math.round(value)} days`;
}

function formatRatio(value: number): string {
  return value.toFixed(1);
}

function formatMetricValue(metric: BenchmarkMetricV1): string {
  if (metric.unit === "%") return formatPercent(metric.value);
  if (metric.unit === "days") return formatDays(metric.value);
  if (metric.unit === "ratio") return formatRatio(metric.value);
  return `${metric.value}`;
}

function formatPeerMedian(metric: BenchmarkMetricV1): string {
  if (metric.unit === "%") return formatPercent(metric.peer_median);
  if (metric.unit === "days") return formatDays(metric.peer_median);
  if (metric.unit === "ratio") return formatRatio(metric.peer_median);
  return `${metric.peer_median}`;
}

function getBenchmarkMetric(
  benchmarks: BenchmarkPackV1 | undefined,
  metricKey: string | null
): BenchmarkMetricV1 | null {
  if (!benchmarks || !metricKey) return null;
  const metric = benchmarks.metrics.find((m) => m.key === metricKey);
  if (!metric) return null;
  if (metric.peer_median === undefined || metric.peer_median === null) return null;
  return metric;
}

function getQuoteAgeOver14Share(snapshot: SnapshotV2): { value: number; count: number } | null {
  const buckets = snapshot.quote_age_buckets ?? [];
  if (!buckets.length) return null;
  const total = buckets.reduce((sum, b) => sum + (b.count ?? 0), 0);
  if (total <= 0) return null;
  const over14 = buckets
    .filter((b) => /15|30/.test(b.bucket))
    .reduce((sum, b) => sum + (b.count ?? 0), 0);
  if (over14 <= 0) return null;
  return { value: (over14 / total) * 100, count: over14 };
}

function getQuoteConversionRate(snapshot: SnapshotV2): number | null {
  const quotes = snapshot.activity_signals?.quotes?.quotes_count ?? 0;
  const approved = snapshot.activity_signals?.quotes?.quotes_approved_count ?? 0;
  if (quotes <= 0) return null;
  return (approved / quotes) * 100;
}

function buildBoundary(group: IndustryGroup, pressure_key: PressureKey): string {
  switch (pressure_key) {
    case "concentration_risk":
      if (group === "food_mobile") {
        return "If you are event-based or weekend-heavy, concentration is expected. Protect with deposits and pre-orders.";
      }
      if (group === "sales_led") {
        return "If you sell enterprise or long-cycle deals, concentration is expected. Protect with pipeline coverage and deposits.";
      }
      if (group === "route_service") {
        return "If your book is commercial-heavy by design, concentration is expected. Protect with retention touches and contracts.";
      }
      if (group === "specialty_local") {
        return "If your work is diagnostic-heavy, concentration is expected. Protect with deposits and parts prepayment.";
      }
      return "If your model is intentionally high-ticket, do not force small work. Protect with deposits and milestones.";
    case "follow_up_drift":
      return "If cycles are seasonal or permit-driven, longer decisions are expected. Use light follow-up only.";
    case "capacity_pressure":
      if (group === "food_mobile") {
        return "If your menu is complex or made-to-order, capacity pressure is structural. Protect with pre-orders or a rush menu.";
      }
      return "If lead times are client- or permit-driven, this lag is structural. Set expectations and buffer schedules.";
    case "decision_lag":
      return "If approvals require committees or financing, longer cycles are expected. Focus on qualification and deposits.";
    case "low_conversion":
      return "If leads are exploratory by design, lower conversion is expected. Focus on qualification, not pressure.";
    case "cashflow_drag":
      return "If clients are on NET terms, slower payment is contractual. Protect with deposits or milestone billing.";
    case "rhythm_volatility":
      return "If your work is seasonal, volatility is structural. Protect with cash buffers and off-season lanes.";
    case "mapping_low_confidence":
    default:
      return "Do not act on specific numbers until mapping is verified. Use patterns directionally only.";
  }
}

export function buildPressureAction(params: {
  pressure_key: PressureKey;
  snapshot: SnapshotV2;
  benchmarks?: BenchmarkPackV1;
  industry_group: IndustryGroup;
  industry_key?: IndustryKey | string | null;
  fallback?: PressureTranslation;
}): PressureActionResult {
  const { pressure_key, snapshot, benchmarks, industry_group, industry_key: _industry_key, fallback } = params;
  void _industry_key;
  const metricKey = METRIC_KEYS[pressure_key];
  const metric = getBenchmarkMetric(benchmarks, metricKey);
  const context = GROUP_CONTEXT[industry_group];

  const used_metrics: string[] = [];
  let action_degraded_missing_metric = false;

  const lookback = snapshot.window?.lookback_days ?? 90;

  const quoteAgeDerived = getQuoteAgeOver14Share(snapshot);
  const conversionDerived = getQuoteConversionRate(snapshot);

  let recommended_move = fallback?.recommended_move ?? "";
  let next_7_days: string[] = [];

  switch (pressure_key) {
    case "concentration_risk": {
      if (metric) {
        used_metrics.push(metric.key);
        recommended_move = `Build a ${context.lane} so top-5 concentration moves from ${formatMetricValue(
          metric
        )} toward ${formatPeerMedian(metric)} (peer median) over the next 60 days.`;
      } else {
        action_degraded_missing_metric = true;
        recommended_move = fallback?.recommended_move || `Build a ${context.lane} that produces repeatable smaller ${context.plural} each week.`;
      }

      next_7_days = [
        `List your 5 largest ${context.plural} from the last ${lookback} days and flag which ones would hurt if delayed.`,
        `Define one repeatable ${context.lane} offer that can run weekly without owner approval.`,
        `Reserve 1-2 slots per week for that lane and protect them from high-ticket work.`,
      ];
      break;
    }
    case "follow_up_drift": {
      if (industry_group === "food_mobile") {
        recommended_move = "Follow-up is not the lever here. Protect demand with location selection and rush-speed execution.";
        next_7_days = [
          "Test one new high-traffic location and compare peak-hour throughput.",
          "Run a 3-5 item rush menu and measure line speed during peak windows.",
          "Post the next two service windows clearly so repeat customers know when to find you.",
        ];
        action_degraded_missing_metric = metric ? false : true;
        break;
      }
      if (metric) {
        used_metrics.push(metric.key);
        recommended_move = `Aim to pull quote age over 14 days from ${formatMetricValue(metric)} toward ${formatPeerMedian(
          metric
        )} (peer median) over 30 days.`;
      } else if (quoteAgeDerived) {
        recommended_move = `Pull quote age over 14 days down from ${formatPercent(quoteAgeDerived.value)} over the next 30 days.`;
        action_degraded_missing_metric = true;
      } else {
        action_degraded_missing_metric = true;
        recommended_move = fallback?.recommended_move || "Reset follow-up cadence so quotes do not age silently.";
      }

      const countLine = quoteAgeDerived?.count
        ? `Pull the ${quoteAgeDerived.count} quotes older than 14 days and run a two-touch follow-up this week.`
        : "Pull quotes older than 14 days and run a two-touch follow-up this week.";

      next_7_days = [
        countLine,
        "Set a 48-hour follow-up touch for every new quote, then a 7-day check-in.",
        "Route mid-ticket quotes to a single owner for closure so they do not drift.",
      ];
      break;
    }
    case "capacity_pressure": {
      if (industry_group === "food_mobile") {
        recommended_move = "Separate prep from service and run a 3-5 item rush menu to keep throughput high.";
        next_7_days = [
          "Prep in bulk before peak hours and stage ingredients for speed.",
          "Run a short rush menu during peak windows and protect it from custom requests.",
          "Track line length during peak hours and add a second service station if needed.",
        ];
        action_degraded_missing_metric = metric ? false : true;
        break;
      }

      if (metric) {
        used_metrics.push(metric.key);
        recommended_move = `Reduce approved-to-scheduled lag from ${formatMetricValue(metric)} toward ${formatPeerMedian(
          metric
        )} by running a weekly scheduling pass.`;
      } else {
        action_degraded_missing_metric = true;
        recommended_move = fallback?.recommended_move || `Protect one calm ${context.schedule} pass each week so approved work lands cleanly.`;
      }

      const lagLine = metric
        ? `Clear any approved ${context.plural} waiting longer than ${formatMetricValue(metric)} first.`
        : `Clear the oldest approved ${context.plural} first so the backlog does not stack.`;

      next_7_days = [
        `Schedule a weekly ${context.schedule} pass (e.g., Monday AM) to slot approved ${context.plural}.`,
        lagLine,
        "Protect one flex block for overruns or emergency work.",
      ];
      break;
    }
    case "decision_lag": {
      if (metric) {
        used_metrics.push(metric.key);
        recommended_move = `Shorten decision-to-start timing from ${formatMetricValue(metric)} toward ${formatPeerMedian(
          metric
        )} by offering two concrete dates and a light deposit.`;
      } else {
        action_degraded_missing_metric = true;
        recommended_move = fallback?.recommended_move || "Offer two concrete start dates and a light deposit to shorten decision time.";
      }

      next_7_days = [
        "Offer two specific start dates on every approval instead of waiting for the customer to choose.",
        "Hold the date with a small deposit to reduce back-and-forth.",
        "Set a 7-day decision window and keep one follow-up touch in that window.",
      ];
      break;
    }
    case "low_conversion": {
      if (metric) {
        used_metrics.push(metric.key);
        recommended_move = `Lift conversion from ${formatMetricValue(metric)} toward ${formatPeerMedian(
          metric
        )} (peer median) by simplifying quotes and follow-up.`;
      } else if (conversionDerived !== null) {
        recommended_move = `Lift conversion from ${formatPercent(conversionDerived)} by tightening qualification and quote tiers.`;
        action_degraded_missing_metric = true;
      } else {
        action_degraded_missing_metric = true;
        recommended_move = fallback?.recommended_move || "Tighten qualification and simplify quote tiers to improve conversion.";
      }

      next_7_days = [
        "Review the last 10 lost quotes and tag the reason (price, timing, no response).",
        "Add three tiers to your quotes so buyers can choose a clear fit.",
        "Follow up within 48 hours on every new quote to keep momentum.",
      ];
      break;
    }
    case "cashflow_drag": {
      if (metric) {
        used_metrics.push(metric.key);
        recommended_move = `Pull invoice-to-paid lag from ${formatMetricValue(metric)} toward ${formatPeerMedian(
          metric
        )} by invoicing within 48 hours and enforcing payment terms.`;
      } else {
        action_degraded_missing_metric = true;
        recommended_move = fallback?.recommended_move || "Invoice within 48 hours and enforce payment terms consistently.";
      }

      next_7_days = [
        "Invoice within 48 hours of completion and confirm the payment method up front.",
        "Send a light reminder on anything older than 21 days.",
        "Use deposits or milestone billing for larger work.",
      ];
      break;
    }
    case "rhythm_volatility": {
      if (metric) {
        used_metrics.push(metric.key);
        recommended_move = `Reduce weekly volatility from ${formatMetricValue(metric)} toward ${formatPeerMedian(
          metric
        )} by building a repeatable weekly lane.`;
      } else {
        action_degraded_missing_metric = true;
        recommended_move = fallback?.recommended_move || "Build a repeatable weekly lane to stabilize volume.";
      }

      next_7_days = [
        "Identify one recurring offer that can run every week without custom scoping.",
        "Protect two weekly slots for that offer before taking new one-off work.",
        "Track weekly volume for four weeks and adjust the lane size until it feels stable.",
      ];
      break;
    }
    case "mapping_low_confidence":
    default: {
      action_degraded_missing_metric = true;
      recommended_move = fallback?.recommended_move || "Verify exports and mappings before acting on the numbers.";
      next_7_days = [
        "Confirm quote and invoice IDs link correctly across exports.",
        "Verify approval, scheduled, and invoice dates are present and accurate.",
        "Re-run the snapshot after mapping corrections.",
      ];
      break;
    }
  }

  const boundary = fallback?.boundary ?? buildBoundary(industry_group, pressure_key);

  return {
    recommended_move,
    next_7_days,
    boundary,
    action_degraded_missing_metric,
    used_metrics,
  };
}
