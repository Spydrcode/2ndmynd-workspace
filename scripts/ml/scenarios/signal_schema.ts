export type Band = "low" | "medium" | "high";
export type Trend = "down" | "flat" | "up";

export const SIGNAL_SCHEMA: Record<string, string[]> = {
  "schedule.overbook_rate.band": ["low", "medium", "high"],
  "schedule.lead_time_p90.band": ["low", "medium", "high"],
  "schedule.reschedule_14d.band": ["low", "medium", "high"],
  "schedule.no_show_rate.band": ["low", "medium", "high"],
  "schedule.queue_wait_avg.band": ["low", "medium", "high"],
  "schedule.abandon_rate.band": ["low", "medium", "high"],
  "schedule.arrival_spikiness.band": ["low", "medium", "high"],
  "schedule.day_of_week_volatility.band": ["low", "medium", "high"],
  "schedule.reschedule_pressure.band": ["low", "medium", "high"],
  "schedule.queue_pressure.band": ["low", "medium", "high"],
  "schedule.volatility.band": ["low", "medium", "high"],
  "pipeline.open_quotes.band": ["low", "medium", "high"],
  "pipeline.quote_age_p90.band": ["low", "medium", "high"],
  "pipeline.unanswered_rate.band": ["low", "medium", "high"],
  "cash.days_to_paid_p90.band": ["low", "medium", "high"],
  "cash.late_rate.band": ["low", "medium", "high"],
  "cash.dispute_rate.band": ["low", "medium", "high"],
  "mix.low_value_job_share.band": ["low", "medium", "high"],
  "mix.high_effort_low_margin.band": ["low", "medium", "high"],
  "demand.job_count_trend.band": ["down", "flat", "up"],
  "demand.avg_ticket_trend.band": ["down", "flat", "up"],
  "ops.change_orders_rate.band": ["low", "medium", "high"],
  "ops.completion_time_p90.band": ["low", "medium", "high"],
  "ops.rework_rate.band": ["low", "medium", "high"],
  "ops.completion_proxy.band": ["low", "medium", "high"],
  "demand.arrival_spikiness.band": ["low", "medium", "high"],
  "crew_capacity.band": ["low", "medium", "high"],
  "weather_disruption.band": ["low", "medium", "high"],
  "seasonality.band": ["low", "medium", "high"],
  "job_mix.band": ["low", "medium", "high"],
  "contracting.seasonality.band": ["low", "medium", "high"],
  "contracting.weather_disruption.band": ["low", "medium", "high"],
  "contracting.ad_spend_shift.band": ["down", "flat", "up"],
};

export const SIGNAL_KEYS = Object.keys(SIGNAL_SCHEMA);

export const DISTINCTIVE_KEYS: Record<string, string[]> = {
  scheduling_window_pressure: [
    "schedule.lead_time_p90.band",
    "schedule.overbook_rate.band",
    "schedule.reschedule_14d.band",
  ],
  growth_value_drift: [
    "demand.job_count_trend.band",
    "demand.avg_ticket_trend.band",
    "mix.low_value_job_share.band",
  ],
  quote_followup_drag: ["pipeline.open_quotes.band", "pipeline.quote_age_p90.band"],
  cash_timing_stretch: ["cash.days_to_paid_p90.band", "cash.late_rate.band"],
  scope_instability_midjob: ["ops.change_orders_rate.band", "ops.completion_time_p90.band"],
  bad_fit_friction_jobs: ["mix.high_effort_low_margin.band", "ops.rework_rate.band"],
  admin_load_shadow_work: ["pipeline.open_quotes.band", "schedule.reschedule_14d.band"],
  low_impact_boundary: ["crew_capacity.band", "seasonality.band", "job_mix.band"],
};
