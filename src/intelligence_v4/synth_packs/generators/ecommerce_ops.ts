import { buildPackFromProfile } from "./base";

export function generateEcommerceOpsPack(params: {
  pack_id: string;
  seed: number;
  window_days: number;
  anchor_date: string;
}) {
  return buildPackFromProfile({
    ...params,
    profile: {
      industry: "ecommerce_ops",
      business_name: "Ecommerce Operations Owner",
      emyth_role: "mixed",
      notes: [
        "Order spikes and fulfillment load are represented as synthetic operations rows.",
        "No names, emails, phones, or addresses are included.",
      ],
      expected_patterns: ["seasonality_spike", "capacity_squeeze", "returns_pressure_proxy"],
      estimate_count: [36, 60],
      base_estimate_total: [120, 1100],
      approval_lag_days: [1, 10],
      invoice_delay_days: [0, 3],
      payment_delay_days: [1, 16],
      overdue_rate: 0.11,
      seasonality_peak_months: [11, 12, 1],
      concentration_strength: "high",
      include_schedule: true,
      schedule_pressure: "high",
    },
  });
}
