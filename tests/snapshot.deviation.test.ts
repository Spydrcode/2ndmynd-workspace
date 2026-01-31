import { describe, expect, it } from "vitest";

import { compareToBaseline } from "../src/lib/snapshot/deviation";
import type { BaselineProfile, CompanyProfile } from "../src/lib/snapshot/schema";

function baselineBase(): BaselineProfile {
  return {
    cohort_id: "local_service_general_v1",
    version: "v1",
    sample_size: 100,
    created_at: "2026-01-01T00:00:00.000Z",
    job_value_distribution: { micro: 0.2, small: 0.3, medium: 0.3, large: 0.15, jumbo: 0.05 },
    decision_lag_distribution: {
      same_day: 0.1,
      "1_3_days": 0.2,
      "4_7_days": 0.25,
      "8_14_days": 0.2,
      "15_30_days": 0.15,
      over_30_days: 0.05,
      unknown: 0.05,
    },
    revenue_concentration: { top_10_percent_jobs_share: 0.3, top_25_percent_jobs_share: 0.5 },
    quote_to_invoice_flow: { approved: 0.5, stalled: 0.35, dropped: 0.15 },
  };
}

function companyBase(): CompanyProfile {
  return {
    run_id: "run_1",
    computed_at: "2026-01-02T00:00:00.000Z",
    sample_size: { quotes: 10, invoices: 10 },
    job_value_distribution: { micro: 0.2, small: 0.3, medium: 0.3, large: 0.15, jumbo: 0.05 },
    decision_lag_distribution: {
      same_day: 0.1,
      "1_3_days": 0.2,
      "4_7_days": 0.25,
      "8_14_days": 0.2,
      "15_30_days": 0.15,
      over_30_days: 0.05,
      unknown: 0.05,
    },
    revenue_concentration: { top_10_percent_jobs_share: 0.3, top_25_percent_jobs_share: 0.5 },
    quote_to_invoice_flow: { approved: 0.5, stalled: 0.35, dropped: 0.15 },
  };
}

describe("snapshot deviation", () => {
  it("flags over/under index at ±0.12 thresholds", () => {
    const baseline = baselineBase();
    const company = companyBase();
    company.job_value_distribution.micro = 0.32; // +0.12
    company.job_value_distribution.small = 0.18; // -0.12

    const deviation = compareToBaseline(company, baseline);
    expect(deviation.significant_overindex).toContain("job_value.micro");
    expect(deviation.significant_underindex).toContain("job_value.small");
  });

  it("computes concentration risk bands", () => {
    const baseline = baselineBase();

    const high = companyBase();
    high.revenue_concentration.top_10_percent_jobs_share = 0.45; // +0.15 => high
    expect(compareToBaseline(high, baseline).concentration_risk).toBe("high");

    const medium = companyBase();
    medium.revenue_concentration.top_10_percent_jobs_share = 0.38; // +0.08 => medium
    expect(compareToBaseline(medium, baseline).concentration_risk).toBe("medium");

    const low = companyBase();
    low.revenue_concentration.top_10_percent_jobs_share = 0.35; // +0.05 => low
    expect(compareToBaseline(low, baseline).concentration_risk).toBe("low");
  });
});

