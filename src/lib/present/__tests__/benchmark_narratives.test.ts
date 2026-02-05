import { describe, expect, it } from "vitest";

import { formatBenchmarkInsight } from "../benchmark_narratives";

describe("benchmark narratives", () => {
  it("renders differently by industry group", () => {
    const home = formatBenchmarkInsight({
      metric_key: "revenue_concentration_top5_share",
      value: 73,
      peer_median: 42,
      percentile: 82,
      direction: "higher_is_risk",
      industry_group: "home_services_trade",
    });

    const food = formatBenchmarkInsight({
      metric_key: "revenue_concentration_top5_share",
      value: 73,
      peer_median: 42,
      percentile: 82,
      direction: "higher_is_risk",
      industry_group: "food_mobile",
    });

    expect(home.headline).not.toBe(food.headline);
  });

  it("enforces length limits", () => {
    const insight = formatBenchmarkInsight({
      metric_key: "quote_age_over_14d_share",
      value: 38,
      peer_median: 24,
      percentile: 71,
      direction: "higher_is_risk",
      industry_group: "project_trades",
    });

    expect(insight.headline.length).toBeLessThanOrEqual(120);
    expect(insight.so_what.length).toBeLessThanOrEqual(160);
  });

  it("returns safe copy when peer median is missing", () => {
    const insight = formatBenchmarkInsight({
      metric_key: "quote_age_over_14d_share",
      value: 38,
      peer_median: undefined,
      percentile: undefined,
      direction: "higher_is_risk",
      industry_group: "route_service",
    });

    expect(insight.headline.toLowerCase()).toContain("peer context");
    expect(insight.so_what.toLowerCase()).toContain("directional");
  });
});
