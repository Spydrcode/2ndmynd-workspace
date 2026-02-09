import { buildPackFromProfile } from "./base";

export function generateHomeServicesGenericPack(params: {
  pack_id: string;
  seed: number;
  window_days: number;
  anchor_date: string;
}) {
  return buildPackFromProfile({
    ...params,
    profile: {
      industry: "home_services_generic",
      business_name: "Home Services Operator",
      emyth_role: "technician",
      notes: [
        "Generic home services pattern included to keep one trades-adjacent baseline.",
        "Pack avoids customer records and personal identifiers.",
      ],
      expected_patterns: ["dispatch_drag", "cash_timing", "reliability_pressure"],
      estimate_count: [32, 54],
      base_estimate_total: [350, 2600],
      approval_lag_days: [2, 16],
      invoice_delay_days: [1, 6],
      payment_delay_days: [5, 28],
      overdue_rate: 0.17,
      seasonality_peak_months: [6, 7, 8, 12],
      concentration_strength: "medium",
      include_schedule: true,
      schedule_pressure: "medium",
    },
  });
}
