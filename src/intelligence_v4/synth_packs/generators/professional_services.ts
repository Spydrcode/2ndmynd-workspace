import { buildPackFromProfile } from "./base";

export function generateProfessionalServicesPack(params: {
  pack_id: string;
  seed: number;
  window_days: number;
  anchor_date: string;
}) {
  return buildPackFromProfile({
    ...params,
    profile: {
      industry: "professional_services",
      business_name: "Professional Services Owner",
      emyth_role: "manager",
      notes: [
        "Proposal-to-delivery overlap creates fragmented attention.",
        "Synthetic pack generated without personal identifiers.",
      ],
      expected_patterns: ["proposal_lag", "delivery_overlap", "throughput_swings"],
      estimate_count: [30, 50],
      base_estimate_total: [2200, 9800],
      approval_lag_days: [6, 28],
      invoice_delay_days: [2, 10],
      payment_delay_days: [10, 36],
      overdue_rate: 0.2,
      seasonality_peak_months: [2, 3, 8, 9],
      concentration_strength: "medium",
      include_schedule: true,
      schedule_pressure: "medium",
    },
  });
}
