import { buildPackFromProfile } from "./base";

export function generateLogisticsDispatchPack(params: {
  pack_id: string;
  seed: number;
  window_days: number;
  anchor_date: string;
}) {
  return buildPackFromProfile({
    ...params,
    profile: {
      industry: "logistics_dispatch",
      business_name: "Dispatch Operations Owner",
      emyth_role: "manager",
      notes: [
        "Dispatch-heavy synthetic dataset with SLA and coordination load signals.",
        "All identifiers are synthetic and non-personal.",
      ],
      expected_patterns: ["dispatch_pressure", "schedule_fill", "coordination_overhead"],
      estimate_count: [34, 56],
      base_estimate_total: [700, 4200],
      approval_lag_days: [1, 12],
      invoice_delay_days: [0, 5],
      payment_delay_days: [7, 30],
      overdue_rate: 0.16,
      seasonality_peak_months: [5, 6, 7, 10],
      concentration_strength: "medium",
      include_schedule: true,
      schedule_pressure: "high",
    },
  });
}
