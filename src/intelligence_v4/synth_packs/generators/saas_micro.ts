import { buildPackFromProfile } from "./base";

export function generateSaasMicroPack(params: {
  pack_id: string;
  seed: number;
  window_days: number;
  anchor_date: string;
}) {
  return buildPackFromProfile({
    ...params,
    profile: {
      industry: "saas_micro",
      business_name: "Micro SaaS Founder",
      emyth_role: "mixed",
      notes: [
        "Founder-led SaaS operations with support and roadmap pull.",
        "Synthetic pack only includes bucketable operational exports.",
      ],
      expected_patterns: ["decision_latency", "support_load_proxy", "cash_timing"],
      estimate_count: [28, 46],
      base_estimate_total: [450, 2800],
      approval_lag_days: [2, 18],
      invoice_delay_days: [0, 4],
      payment_delay_days: [3, 26],
      overdue_rate: 0.14,
      seasonality_peak_months: [1, 2, 9, 11],
      concentration_strength: "high",
      include_schedule: false,
      schedule_pressure: "low",
    },
  });
}
