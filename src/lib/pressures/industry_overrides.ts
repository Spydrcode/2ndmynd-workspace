/**
 * Named Industry Overrides
 * 
 * High-quality, specific overrides for named industries.
 * Only 3 industries initially: HVAC, Painter, Taco Stand.
 * These set the quality bar and prove portability.
 */

import type { CanonicalPressureKey } from "./pressure_translation";
import type { PressureTranslation } from "./group_translations";

/**
 * Industry-specific pressure translations
 * Only populated for industries with custom overrides
 */
export const INDUSTRY_OVERRIDES: Record<
  string,
  Partial<Record<CanonicalPressureKey, PressureTranslation>>
> = {
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // HVAC (industry_key="hvac", group=home_services_trade)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  hvac: {
    concentration_risk: {
      owner_felt_line: "One install slipping can move your whole month.",
      explanation:
        "When a few large installs carry the month, a single reschedule or permitting delay shifts the entire revenue forecast. Service calls can't backfill fast enough.",
      recommended_move:
        "Build a mid-ticket maintenance bundle lane (tune-ups, cleanings, minor repairs) that delivers steady weekly revenue independent of install timing.",
      boundary:
        "If your model is install-heavy by design (80%+ revenue from replacements), concentration is expected. Protect with: deposits collected upfront, milestone billing for large jobs, and a service lane for gap-filling.",
    },
    follow_up_drift: {
      owner_felt_line: "Quotes are sitting without follow-up, and install season makes it worse.",
      explanation:
        "When install schedules fill up in peak season, follow-up on mid-sized quotes (repairs, tune-ups, mini-splits) gets pushed. Quotes age without closure.",
      recommended_move:
        "Assign one person to own quote follow-up on a 48-hour rhythm for mid-sized work only. Installs can wait; mid-ticket work needs speed.",
      boundary:
        "If you're booked 6+ weeks out on installs, follow-up pressure is seasonal capacity—protect with deposits on all approved work.",
    },
    capacity_pressure: {
      owner_felt_line: "The calendar shows availability, but approved installs still aren't landing on schedule.",
      explanation:
        "Approved jobs wait for materials (equipment lead times), permits, or crew coordination. The gap between approval and start feels random, even when the calendar looks open.",
      recommended_move:
        "Protect one calm scheduling pass each week (Monday AM) so approved work lands cleanly without owner firefighting. Track equipment lead times and communicate them upfront.",
      boundary:
        "If your installs require permits or inspections, lag is structural—build 2-week buffer into customer expectations and enforce milestone payments.",
    },
    rhythm_volatility: {
      owner_felt_line: "Busy weeks don't feel repeatable.",
      explanation:
        "When install volume swings with season or weather, capacity planning and cash forecasting become reactive. Summer feels chaotic, winter feels slow.",
      recommended_move:
        "Build a service lane (maintenance agreements, tune-ups) that delivers predictable weekly volume year-round, independent of install timing or weather.",
      boundary:
        "If your business is seasonal by nature (cooling-heavy or heating-heavy), volatility is structural—protect with cash reserves and off-season service promotions.",
    },
    decision_lag: {
      owner_felt_line: "Homeowners take weeks to decide on installs, even after the quote is clear.",
      explanation:
        "When installs are high-ticket ($5K+), decision time stretches as homeowners compare bids, check financing, or wait for tax refunds.",
      recommended_move:
        "Offer a small deposit ($200-500) to hold the install date. Simplify pricing into 3 tiers (economy/standard/premium) to reduce decision paralysis.",
      boundary:
        "If you're selling luxury systems or whole-home work, long cycles are expected—protect with strong pipeline (3x monthly revenue target) and financing options.",
    },
    cashflow_drag: {
      owner_felt_line: "Installs finish but final invoices sit unpaid, slowing down the next job.",
      explanation:
        "When final payment isn't collected immediately at completion, collections become manual work. Equipment costs get tied up waiting for customer payment.",
      recommended_move:
        "Enforce milestone billing: 30% deposit at contract, 30% at equipment delivery, 40% at completion—collect final payment before leaving the site.",
      boundary:
        "If your clients are commercial with NET30 terms, this drag is contractual—front-load deposits (50%) and limit commercial work to <30% of revenue.",
    },
    mapping_low_confidence: {
      owner_felt_line: "The numbers feel directionally right but not precise.",
      explanation:
        "When service tickets don't link cleanly to install invoices, or date fields are missing, insights are directional but not decision-grade.",
      recommended_move:
        "Confirm job IDs link correctly across service calls → installs → invoices. Verify install dates, approval dates, and completion dates export properly.",
      boundary:
        "Do not act on specific numbers until mapping is verified. Use patterns directionally only.",
    },
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PAINTER (industry_key="painter", group=project_trades)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  painter: {
    concentration_risk: {
      owner_felt_line: "One big paint job sets the pace for the whole month.",
      explanation:
        "When one or two large projects (whole-house exteriors, commercial repaints) carry the month, a single delay or scope change moves the entire revenue forecast.",
      recommended_move:
        "Build a small-ticket repair or touch-up lane (deck staining, cabinet refresh, accent walls) that can fill gaps when large projects delay.",
      boundary:
        "If your model is custom high-end residential work, concentration is expected. Protect with: 30% deposit upfront, milestone billing, and pipeline visibility (3-6 months).",
    },
    follow_up_drift: {
      owner_felt_line: "Quotes stall while customers decide colors and timing.",
      explanation:
        "When projects require color selection, HOA approval, or weather windows, decision time stretches. Follow-up becomes unpredictable.",
      recommended_move:
        "Define 3 quote tiers (refresh/standard/premium) with fixed color palettes per tier. Set a 7-day decision window with one light touch at day 3.",
      boundary:
        "If you're selling custom residential work with unlimited color choices, long cycles are expected—protect with pipeline depth (2x monthly revenue) and deposits.",
    },
    capacity_pressure: {
      owner_felt_line: "Prep time breaks the schedule even when the calendar looks full.",
      explanation:
        "When surface prep varies by condition (scraping, sanding, priming), project timing becomes unpredictable even with full schedules. Prep eats into production days.",
      recommended_move:
        "Schedule dedicated prep days separate from paint days. Batch projects by neighborhood to reduce travel and stabilize weekly rhythm.",
      boundary:
        "If you're doing restoration or custom woodwork, prep variability is structural—build buffer into timelines and communicate prep costs upfront.",
    },
    rhythm_volatility: {
      owner_felt_line: "Project timing feels unpredictable, making capacity planning reactive.",
      explanation:
        "When project durations vary by scope (interior vs exterior, prep intensity, weather), weekly volume becomes hard to forecast. Cash timing feels random.",
      recommended_move:
        "Batch projects by type (all interiors one week, all exteriors next) to stabilize crew rhythm and reduce setup waste.",
      boundary:
        "If you're doing custom restoration or high-end residential, volatility is inherent—protect with cash buffer (2 months operating expenses) and flexible crews.",
    },
    decision_lag: {
      owner_felt_line: "Homeowners take weeks to commit, even after walking the property.",
      explanation:
        "When projects are visible and custom, decision lag stretches as customers compare bids, check HOA rules, or wait for good weather windows.",
      recommended_move:
        "Offer a small deposit ($200-500) to hold the start date. Simplify pricing into clear tiers (standard/premium/luxury) with visual examples.",
      boundary:
        "If you're selling luxury residential work, long decision cycles are expected—protect with strong pipeline (3x monthly revenue target) and seasonal promotions.",
    },
    cashflow_drag: {
      owner_felt_line: "Projects finish but payment lags, slowing down the next job.",
      explanation:
        "When milestone billing isn't enforced or final invoices delay, cash timing becomes friction. Materials costs get tied up waiting for customer payment.",
      recommended_move:
        "Enforce milestone billing: 30% deposit at contract, 30% at midpoint (prep complete), 40% at final walkthrough—no exceptions.",
      boundary:
        "If your clients are commercial with NET30, this drag is contractual—front-load payment milestones (50% deposit) and limit commercial work to <20% of revenue.",
    },
    mapping_low_confidence: {
      owner_felt_line: "The numbers feel close but not quite right.",
      explanation:
        "When project quotes don't link cleanly to final invoices, or milestone dates are missing, insights are directional but not decision-grade.",
      recommended_move:
        "Verify job IDs link correctly across quotes → change orders → invoices. Confirm milestone dates (deposit, midpoint, completion) export properly.",
      boundary:
        "Do not act on specific numbers until mapping is verified. Use patterns directionally only.",
    },
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // TACO STAND (industry_key="taco_stand", group=food_mobile)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  taco_stand: {
    concentration_risk: {
      owner_felt_line: "A few slow days can erase a week's profit.",
      explanation:
        "When revenue concentrates into peak days (Friday-Sunday, lunch rush, events), slow weekdays feel like total loss instead of normal variance. One rained-out event hurts.",
      recommended_move:
        "Build a secondary revenue stream (pre-orders for pickup, catering for offices, packaged salsas) to smooth out daily volatility.",
      boundary:
        "If your model is event-based or weekend-heavy, concentration is expected. Protect with: deposits on catering, cash buffer (4 weeks expenses), and diversified locations.",
    },
    follow_up_drift: {
      owner_felt_line: "Demand is real-time—if the line isn't there, you feel it immediately.",
      explanation:
        "When demand is walk-up or event-based, follow-up doesn't apply. Pressure is location selection, menu speed, and peak-hour execution—not nurture or pipeline.",
      recommended_move:
        "Focus on location selection (foot traffic, parking, visibility), menu speed (3-5 fast items), and peak-hour throughput instead of follow-up systems.",
      boundary:
        "If your model is mobile or pop-up, this pressure isn't relevant—optimize for speed, location testing, and social media visibility instead.",
    },
    capacity_pressure: {
      owner_felt_line: "Prep and service compete; you run out before the rush ends.",
      explanation:
        "When prep capacity limits throughput, peak demand becomes constrained. You see the line but can't serve fast enough. Revenue is left on the table.",
      recommended_move:
        "Separate prep from service: prep in bulk off-peak (early morning or day before), simplify menu to 3-5 fast items during rush hours.",
      boundary:
        "If your menu is complex or made-to-order (build-your-own tacos), capacity pressure is structural—protect with pre-orders, limited menu during peak, or second station.",
    },
    rhythm_volatility: {
      owner_felt_line: "Peak days feel huge, slow days feel dead—there's no in-between.",
      explanation:
        "When demand is location- or event-driven, daily revenue swings wildly. Weekdays feel wasted, weekends feel chaotic. Forecasting feels impossible.",
      recommended_move:
        "Track performance by location/event type, not day-of-week. Double down on proven high-traffic slots and cut weak locations. Test new spots in small batches.",
      boundary:
        "If your model is seasonal or event-based, volatility is inherent—protect with cash reserves (6 weeks expenses) and pre-order systems for predictable revenue.",
    },
    decision_lag: {
      owner_felt_line: "Customers order on impulse or not at all—there's no quote cycle.",
      explanation:
        "When demand is immediate walk-up, decision lag doesn't exist. Pressure is menu visibility, pricing clarity, and order speed—not nurture or follow-up.",
      recommended_move:
        "Optimize menu board visibility (large fonts, 3-5 items max), pricing clarity (combos, not à la carte math), and order speed (under 60 seconds) instead of follow-up systems.",
      boundary:
        "If your model is walk-up or event-based, this pressure isn't relevant—focus on throughput, impulse triggers (smells, visuals), and location selection.",
    },
    cashflow_drag: {
      owner_felt_line: "Cash is immediate but daily expenses eat into it before deposits hit.",
      explanation:
        "When revenue is cash or card but expenses are same-day (supplies, labor, permits, gas), cash buffer feels thin even on good days. Owner pay competes with supplies.",
      recommended_move:
        "Separate daily operating cash from owner pay—protect a 7-day expense buffer in the business account. Pay yourself weekly, not daily.",
      boundary:
        "If your model is event-heavy with upfront deposits, cashflow drag is structural—require 50% deposits on catering and batch supply ordering to reduce daily cash pressure.",
    },
    mapping_low_confidence: {
      owner_felt_line: "The numbers feel directionally right but not precise.",
      explanation:
        "When POS data is cash-heavy or sales aren't tagged by location/event, insights are directional but not decision-grade. Daily variance is high.",
      recommended_move:
        "Confirm POS exports include timestamps, location tags, and payment types. Separate cash from card sales. Track peak-hour performance separately.",
      boundary:
        "Do not act on specific numbers until mapping is verified. Use patterns directionally only—focus on location/event trends, not daily precision.",
    },
  },
};
