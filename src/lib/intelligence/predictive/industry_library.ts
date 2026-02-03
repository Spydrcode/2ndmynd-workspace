export type IndustryWatchItem = {
  topic: string;
  why_it_matters: string;
  time_horizon: string;
  what_to_watch: string;
};

export type IndustryProfile = {
  industry_tag: string;
  watch_items: IndustryWatchItem[];
};

export const INDUSTRY_LIBRARY: Record<string, IndustryProfile> = {
  hvac: {
    industry_tag: "hvac",
    watch_items: [
      {
        topic: "Refrigerant regulations",
        why_it_matters: "EPA phase-downs affect equipment costs and job pricing",
        time_horizon: "30-90 days",
        what_to_watch: "New equipment orders, refrigerant inventory costs",
      },
      {
        topic: "Seasonal demand shift",
        why_it_matters: "Cooling season ending can shift cash flow patterns",
        time_horizon: "30-60 days",
        what_to_watch: "Quote conversion rates, maintenance contract renewals",
      },
      {
        topic: "Energy efficiency rebates",
        why_it_matters: "Local utility programs change customer willingness to upgrade",
        time_horizon: "60-90 days",
        what_to_watch: "Quote sizes for replacement jobs, customer objections",
      },
    ],
  },
  bbq_restaurant: {
    industry_tag: "bbq_restaurant",
    watch_items: [
      {
        topic: "Meat price volatility",
        why_it_matters: "Brisket and pork prices affect margins without immediate menu adjustments",
        time_horizon: "30-60 days",
        what_to_watch: "Food cost percentage, vendor invoice trends",
      },
      {
        topic: "Event season bookings",
        why_it_matters: "Catering deposits drive cash flow for slower dine-in periods",
        time_horizon: "30-90 days",
        what_to_watch: "Deposit timing vs. event dates, large order pipeline",
      },
      {
        topic: "Labor availability",
        why_it_matters: "Weekend kitchen staff shortages can limit revenue capacity",
        time_horizon: "30-60 days",
        what_to_watch: "Overtime costs, weekend sales vs. capacity",
      },
    ],
  },
  contractor: {
    industry_tag: "contractor",
    watch_items: [
      {
        topic: "Material lead times",
        why_it_matters: "Longer delays can push job completion and final payment out",
        time_horizon: "30-90 days",
        what_to_watch: "Supplier order dates vs. install dates, change order frequency",
      },
      {
        topic: "Weather patterns",
        why_it_matters: "Exterior work delays cascade into cash collection timing",
        time_horizon: "30-60 days",
        what_to_watch: "Job schedule compression, customer extension requests",
      },
      {
        topic: "Permit processing times",
        why_it_matters: "Municipal backlog delays project starts and deposit collection",
        time_horizon: "60-90 days",
        what_to_watch: "Permit submission to approval lag, customer frustration signals",
      },
    ],
  },
  landscaping: {
    industry_tag: "landscaping",
    watch_items: [
      {
        topic: "End-of-season transitions",
        why_it_matters: "Mowing revenue drops while maintenance contracts sustain cash flow",
        time_horizon: "30-90 days",
        what_to_watch: "Service mix shift, contract renewal timing",
      },
      {
        topic: "Equipment maintenance cycles",
        why_it_matters: "Fall maintenance spend hits before winter lull",
        time_horizon: "30-60 days",
        what_to_watch: "Repair invoice timing, equipment downtime costs",
      },
      {
        topic: "Snow service prep",
        why_it_matters: "Pre-season contracts provide winter revenue predictability",
        time_horizon: "60-90 days",
        what_to_watch: "Snow contract signings, plow equipment investment needs",
      },
    ],
  },
  plumbing: {
    industry_tag: "plumbing",
    watch_items: [
      {
        topic: "Emergency call patterns",
        why_it_matters: "Cold weather increases burst pipe emergencies with faster payment",
        time_horizon: "30-60 days",
        what_to_watch: "Service mix (emergency vs. scheduled), average ticket size",
      },
      {
        topic: "Water heater replacement cycle",
        why_it_matters: "Seasonal failures drive higher-margin equipment sales",
        time_horizon: "30-90 days",
        what_to_watch: "Equipment job frequency, financing take rate",
      },
      {
        topic: "New construction activity",
        why_it_matters: "Builder payment terms differ from residential service cash flow",
        time_horizon: "60-90 days",
        what_to_watch: "Commercial job percentage, days to payment for builder work",
      },
    ],
  },
  electrician: {
    industry_tag: "electrician",
    watch_items: [
      {
        topic: "Panel upgrade demand",
        why_it_matters: "EV charger and solar installs drive service panel work with permit delays",
        time_horizon: "30-90 days",
        what_to_watch: "Quote pipeline for electrical capacity upgrades, permit wait times",
      },
      {
        topic: "Generator season",
        why_it_matters: "Storm season increases backup power inquiries and deposits",
        time_horizon: "30-60 days",
        what_to_watch: "Generator quote conversion, equipment availability lead times",
      },
      {
        topic: "Commercial tenant improvements",
        why_it_matters: "Retail build-outs have different payment terms than residential",
        time_horizon: "60-90 days",
        what_to_watch: "Commercial job percentage, retainage holding periods",
      },
    ],
  },
  general_local_service: {
    industry_tag: "general_local_service",
    watch_items: [
      {
        topic: "Seasonal revenue patterns",
        why_it_matters: "Most service businesses have cyclical cash flow",
        time_horizon: "30-90 days",
        what_to_watch: "Monthly revenue trends, customer inquiry volume",
      },
      {
        topic: "Payment terms pressure",
        why_it_matters: "Customers requesting longer payment windows during slower periods",
        time_horizon: "30-60 days",
        what_to_watch: "Days to payment trends, payment plan requests",
      },
      {
        topic: "Competition and pricing",
        why_it_matters: "New entrants or economic stress affect quote conversion rates",
        time_horizon: "60-90 days",
        what_to_watch: "Quote-to-job conversion rate, average job value changes",
      },
    ],
  },
};
