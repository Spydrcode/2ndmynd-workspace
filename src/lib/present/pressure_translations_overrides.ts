/**
 * Named Industry Overrides (launch polish)
 *
 * These override group-level defaults with high-specificity phrases.
 */

import type { IndustryKey } from "../intelligence/industry_groups";
import type { PressureKey, PressureTranslation } from "./pressure_translations";

export const INDUSTRY_OVERRIDES: Partial<
  Record<IndustryKey, Partial<Record<PressureKey, Partial<PressureTranslation>>>>
> = {
  hvac: {
    concentration_risk: {
      owner_felt_line: "One install slipping can move your whole month.",
      recommended_move: "Build a mid-ticket maintenance lane so one reschedule does not swing the whole month.",
    },
    rhythm_volatility: {
      owner_felt_line: "Busy weeks don't feel repeatable.",
    },
    capacity_pressure: {
      owner_felt_line: "The calendar looks open, but approved installs still land late.",
    },
  },
  plumbing: {
    capacity_pressure: {
      owner_felt_line: "Emergency calls push scheduled work and the week keeps slipping.",
      recommended_move: "Protect one flex block each week for emergencies so scheduled jobs stay intact.",
    },
    cashflow_drag: {
      owner_felt_line: "Work is finished, but payment lags behind the parts bill.",
    },
  },
  electrical: {
    decision_lag: {
      owner_felt_line: "Customers wait on permits or panel approvals before green-lighting the job.",
      recommended_move: "Pre-clear permit requirements and offer two install windows so approvals do not stall scheduling.",
    },
  },
  general_contractor: {
    concentration_risk: {
      owner_felt_line: "One large project sets the pace for the whole quarter.",
      recommended_move: "Build a small-project lane so one job slip does not stall the whole pipeline.",
    },
  },
  painter: {
    concentration_risk: {
      owner_felt_line: "One big paint job sets the pace for the whole month.",
    },
    follow_up_drift: {
      owner_felt_line: "Quotes stall while customers decide colors and timing.",
    },
    capacity_pressure: {
      owner_felt_line: "Prep time breaks the schedule even when the calendar looks full.",
    },
  },
  roofer: {
    capacity_pressure: {
      owner_felt_line: "Crew time gets eaten by tear-offs, so installs slide even when demand is strong.",
      recommended_move: "Separate tear-off days from install days to keep production predictable.",
    },
  },
  landscaping: {
    rhythm_volatility: {
      owner_felt_line: "Weather and mowing cycles make volume spike, then go quiet.",
      recommended_move: "Anchor the week with recurring maintenance routes before adding one-off installs.",
    },
  },
  cleaning_residential: {
    follow_up_drift: {
      owner_felt_line: "Leads go quiet if you miss the first 24 hours after a quote.",
      recommended_move: "Reply within 24 hours and offer two start dates to lock the recurring slot.",
    },
  },
  pest_control: {
    low_conversion: {
      owner_felt_line: "Leads compare providers and stall if the first visit is not simple.",
      recommended_move: "Lead with a one-time intro visit, then convert to recurring after the first treatment.",
    },
  },
  taco_stand: {
    concentration_risk: {
      owner_felt_line: "A few slow days can erase a week's profit.",
    },
    follow_up_drift: {
      owner_felt_line: "Demand is real-time -- if the line isn't there, you feel it immediately.",
    },
    capacity_pressure: {
      owner_felt_line: "Prep and service compete; you run out before the rush ends.",
      recommended_move: "Prep in bulk before peak hours and run a 3-5 item rush menu to keep throughput high.",
    },
  },
};
