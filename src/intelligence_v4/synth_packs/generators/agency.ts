import { buildPackFromProfile } from "./base";

export function generateAgencyPack(params: {
  pack_id: string;
  seed: number;
  window_days: number;
  anchor_date: string;
}) {
  return buildPackFromProfile({
    ...params,
    profile: {
      industry: "agency",
      business_name: "Agency Operator",
      emyth_role: "entrepreneur",
      notes: [
        "Retainer + project mix with approval bottlenecks.",
        "Synthetic owner-led pack with no customer PII.",
      ],
      expected_patterns: ["approval_lag", "throughput_variability", "scope_pressure"],
      estimate_count: [34, 52],
      base_estimate_total: [1800, 6200],
      approval_lag_days: [5, 24],
      invoice_delay_days: [1, 7],
      payment_delay_days: [6, 30],
      overdue_rate: 0.18,
      seasonality_peak_months: [3, 4, 9, 10],
      concentration_strength: "medium",
      include_schedule: false,
      schedule_pressure: "low",
    },
  });
}
