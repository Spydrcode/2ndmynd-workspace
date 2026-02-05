/**
 * Group-Level Pressure Translations
 * 
 * Default translations for EVERY IndustryGroup × PressureKey combination.
 * Guarantees coverage for all ~40 industries immediately.
 * Named industries can override these in industry_overrides.ts
 */

import type { IndustryGroup } from "../industry/industry_groups";
import type { CanonicalPressureKey } from "./pressure_translation";

export interface PressureTranslation {
  owner_felt_line: string;
  explanation: string;
  recommended_move: string;
  boundary: string;
}

/**
 * Group × Pressure translation matrix
 * 6 groups × 7 pressures = 42 translations
 */
export const GROUP_PRESSURE_TRANSLATIONS: Record<
  IndustryGroup,
  Record<CanonicalPressureKey, PressureTranslation>
> = {
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // HOME SERVICES TRADE (hvac, plumbing, electrician)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  home_services_trade: {
    concentration_risk: {
      owner_felt_line: "A few big jobs are carrying the month, so when one moves, everything feels unstable.",
      explanation: "When revenue concentrates into a small number of installs or projects, scheduling and cash planning become fragile.",
      recommended_move: "Build a mid-ticket service lane that can absorb slips without owner intervention.",
      boundary: "If your model is intentionally install-heavy with deposits and milestones, this pressure is expected.",
    },
    follow_up_drift: {
      owner_felt_line: "Quotes are sitting without follow-up, and busy weeks make it worse.",
      explanation: "When install schedules fill up, follow-up on mid-sized work gets pushed. Quotes age without closure.",
      recommended_move: "Assign one person to own quote follow-up on a 48-hour rhythm for mid-sized work only.",
      boundary: "If you're booked 6+ weeks out on installs, follow-up pressure is seasonal—protect with deposits.",
    },
    capacity_pressure: {
      owner_felt_line: "The calendar shows availability, but approved work still isn't landing on schedule.",
      explanation: "Approved jobs wait for materials, permits, or crew coordination. The gap between approval and start feels random.",
      recommended_move: "Protect one calm scheduling pass each week so approved work lands cleanly without owner firefighting.",
      boundary: "If your work requires permits or inspections, lag is structural—build buffer into customer expectations.",
    },
    decision_lag: {
      owner_felt_line: "Customers take weeks to decide, even after seeing the quote.",
      explanation: "When quotes are complex or high-ticket, decision time stretches. Follow-up becomes guesswork.",
      recommended_move: "Simplify quotes into tiers (good/better/best) and set a 7-day decision window with light nudges.",
      boundary: "If you're selling luxury or custom work, long cycles are expected—protect with deposits and pipeline depth.",
    },
    low_conversion: {
      owner_felt_line: "Quotes are being sent but not closing at the rate you expect.",
      explanation: "When conversion rates lag peer benchmarks, revenue potential is being left on the table even when lead flow is healthy.",
      recommended_move: "Review quote follow-up timing (call within 48 hours), simplify pricing tiers, and track close rates by quote size.",
      boundary: "If you're selling high-ticket or custom work, lower conversion is expected—focus on pipeline depth, not conversion speed.",
    },
    cashflow_drag: {
      owner_felt_line: "Work is done but invoices sit unpaid, slowing down the next job.",
      explanation: "When invoicing lags or collections drift, cash timing becomes background pressure even when work is steady.",
      recommended_move: "Invoice within 48 hours of completion and set a light collections rhythm for anything >21 days unpaid.",
      boundary: "If your clients are commercial with NET30 terms, this drag is contractual—protect with progress billing.",
    },
    rhythm_volatility: {
      owner_felt_line: "Busy weeks don't feel repeatable, and slow weeks come out of nowhere.",
      explanation: "When volume swings week-to-week, capacity planning and cash forecasting become reactive instead of steady.",
      recommended_move: "Build a service lane that delivers predictable weekly volume independent of install timing.",
      boundary: "If your work is seasonal (HVAC, roofing), volatility is structural—protect with cash reserves and off-season lanes.",
    },
    mapping_low_confidence: {
      owner_felt_line: "The numbers feel directionally right but not precise.",
      explanation: "When export mapping has gaps, insights are directional but not decision-grade.",
      recommended_move: "Confirm quote→invoice linkage in your system (job IDs or customer names) and verify date fields.",
      boundary: "Do not act on specific numbers until mapping is verified. Use patterns directionally only.",
    },
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PROJECT TRADES (painter, roofer, gc, flooring)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  project_trades: {
    concentration_risk: {
      owner_felt_line: "A few big projects set the pace for the whole month.",
      explanation: "When revenue concentrates in large scoped work, one project slipping or stretching moves the entire month.",
      recommended_move: "Build a small-ticket repair or touch-up lane that can fill gaps when large projects delay.",
      boundary: "If your model is custom high-end work, concentration is expected—protect with deposits and milestone billing.",
    },
    follow_up_drift: {
      owner_felt_line: "Quotes stall while customers decide on scope, timing, or budget.",
      explanation: "When project scope is complex, decision time stretches. Follow-up becomes unpredictable.",
      recommended_move: "Define 3 quote tiers (basic/standard/premium) and set a 7-day decision window with one touch at day 3.",
      boundary: "If you're selling custom residential work, long cycles are expected—protect with pipeline depth and deposits.",
    },
    capacity_pressure: {
      owner_felt_line: "Prep time breaks the schedule even when the calendar looks full.",
      explanation: "When surface prep, materials, or site conditions vary, project timing becomes unpredictable even with full schedules.",
      recommended_move: "Schedule dedicated prep days and separate them from production days to stabilize project flow.",
      boundary: "If you're doing restoration or custom work, prep variability is structural—build buffer into timelines.",
    },
    decision_lag: {
      owner_felt_line: "Homeowners take weeks to commit, even after walking the site.",
      explanation: "When projects are visible and custom, decision lag stretches as customers compare bids and financing.",
      recommended_move: "Offer a small deposit to hold the date and simplify pricing into clear tiers (standard/premium/luxury).",
      boundary: "If you're selling luxury residential work, long decision cycles are expected—protect with strong pipeline.",
    },
    low_conversion: {
      owner_felt_line: "Quotes are sent but not closing at expected rates.",
      explanation: "When project scope is complex, conversion rates drop. Customers get multiple bids and delay decisions.",
      recommended_move: "Simplify quotes into 3 tiers with visual examples. Follow up at 48 hours with one clarifying question.",
      boundary: "If you're selling custom high-end work, lower conversion is expected—focus on pipeline depth and deposit velocity.",
    },
    cashflow_drag: {
      owner_felt_line: "Projects finish but payment lags, slowing down the next job.",
      explanation: "When milestone billing isn't enforced or final invoices delay, cash timing becomes friction.",
      recommended_move: "Enforce milestone billing: 30% deposit, 30% at midpoint, 40% at completion—no exceptions.",
      boundary: "If your clients are commercial with NET30, this drag is contractual—front-load payment milestones.",
    },
    rhythm_volatility: {
      owner_felt_line: "Project timing feels unpredictable, making capacity planning reactive.",
      explanation: "When project durations vary by scope or conditions, weekly volume becomes hard to forecast.",
      recommended_move: "Batch projects by neighborhood or scope to stabilize weekly rhythm and reduce travel/setup waste.",
      boundary: "If you're doing custom restoration, volatility is inherent—protect with cash buffer and flexible crews.",
    },
    mapping_low_confidence: {
      owner_felt_line: "The numbers feel close but not quite right.",
      explanation: "When export mapping has gaps, project insights are directional but not decision-grade.",
      recommended_move: "Verify job IDs link correctly across quotes→invoices and confirm milestone dates export properly.",
      boundary: "Do not act on specific numbers until mapping is verified. Use patterns directionally only.",
    },
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ROUTE SERVICE (pest, pool, lawn, cleaning)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  route_service: {
    concentration_risk: {
      owner_felt_line: "A few large accounts are carrying the route, so losing one hurts.",
      explanation: "When revenue concentrates in a few high-value stops, route economics become fragile.",
      recommended_move: "Fill gaps with mid-sized recurring accounts to smooth out revenue if one large account churns.",
      boundary: "If your model is commercial-heavy by design, concentration is expected—protect with contracts and retention touches.",
    },
    follow_up_drift: {
      owner_felt_line: "Leads come in but follow-up slips when routes get busy.",
      explanation: "When route density is high, inbound leads don't get touched quickly. Conversion slows.",
      recommended_move: "Assign one person to own inbound follow-up within 24 hours, separate from route execution.",
      boundary: "If you're fully booked, follow-up pressure is capacity-driven—protect by raising prices or pausing ads.",
    },
    capacity_pressure: {
      owner_felt_line: "Routes feel full but new accounts are hard to fit in.",
      explanation: "When routes are geographically locked, adding density becomes harder even when time exists.",
      recommended_move: "Build one flex day per week to absorb new accounts or service interruptions without scrambling.",
      boundary: "If your territory is maxed, capacity pressure is geographic—protect by opening a second route or raising minimums.",
    },
    decision_lag: {
      owner_felt_line: "Homeowners take weeks to commit to recurring service.",
      explanation: "When service is preventative, urgency is low. Decision cycles stretch even after demos or quotes.",
      recommended_move: "Offer a one-time intro service with no commitment, then convert to recurring after the first visit.",
      boundary: "If you're selling preventative maintenance, long cycles are expected—protect with trial offers and seasonal urgency.",
    },
    low_conversion: {
      owner_felt_line: "Leads come in but aren't converting to recurring accounts.",
      explanation: "When service is preventative or non-urgent, conversion rates lag. Urgency is manufactured, not inherent.",
      recommended_move: "Offer trial service at 50% off first visit. Follow up 24 hours after with recurring pricing options.",
      boundary: "If you're selling preventative work, lower conversion is expected—focus on trial velocity and seasonal hooks.",
    },
    cashflow_drag: {
      owner_felt_line: "Recurring billing lags or payment methods fail, slowing cash flow.",
      explanation: "When autopay fails or invoices aren't sent immediately after service, collections become manual work.",
      recommended_move: "Enforce autopay for all recurring accounts and send invoices same-day after service completion.",
      boundary: "If your clients are commercial with NET15, this drag is contractual—require card on file for residential.",
    },
    rhythm_volatility: {
      owner_felt_line: "Route volume feels steady, but cancellations or weather create gaps.",
      explanation: "When recurring service is predictable but cancellations spike, weekly revenue becomes choppy.",
      recommended_move: "Build a waitlist for each route to backfill cancellations same-week without scrambling.",
      boundary: "If your service is seasonal (lawn, pool), volatility is structural—protect with off-season lanes or contracts.",
    },
    mapping_low_confidence: {
      owner_felt_line: "The numbers feel directionally right but not precise.",
      explanation: "When export mapping has gaps, route insights are directional but not decision-grade.",
      recommended_move: "Confirm recurring invoices link to the same customer ID and verify service dates export correctly.",
      boundary: "Do not act on specific numbers until mapping is verified. Use patterns directionally only.",
    },
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // FOOD MOBILE (taco stand, food truck, catering)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  food_mobile: {
    concentration_risk: {
      owner_felt_line: "A few slow days can erase a week's profit.",
      explanation: "When revenue concentrates into peak days or events, slow days feel like total loss instead of normal variance.",
      recommended_move: "Build a secondary revenue stream (pre-orders, catering, packaged goods) to smooth out daily volatility.",
      boundary: "If your model is event-based, concentration is expected—protect with deposits and minimum guarantees.",
    },
    follow_up_drift: {
      owner_felt_line: "Demand is real-time—if the line isn't there, you feel it immediately.",
      explanation: "When demand is walk-up or event-based, follow-up doesn't apply. Pressure is location and timing, not nurture.",
      recommended_move: "Focus on location selection, menu speed, and peak-hour throughput instead of follow-up systems.",
      boundary: "If your model is mobile or pop-up, this pressure isn't relevant—optimize for speed and location instead.",
    },
    capacity_pressure: {
      owner_felt_line: "Prep and service compete; you run out before the rush ends.",
      explanation: "When prep capacity limits throughput, peak demand becomes constrained. Revenue is left on the table.",
      recommended_move: "Separate prep from service: prep in bulk off-peak, simplify menu to 3-5 fast items during rush.",
      boundary: "If your menu is complex or made-to-order, capacity pressure is structural—protect with pre-orders or limited hours.",
    },
    decision_lag: {
      owner_felt_line: "Customers order on impulse or not at all—there's no quote cycle.",
      explanation: "When demand is immediate, decision lag doesn't exist. Pressure is visibility and speed, not nurture.",
      recommended_move: "Optimize menu visibility, pricing clarity, and order speed instead of follow-up systems.",
      boundary: "If your model is walk-up or event-based, this pressure isn't relevant—focus on throughput and location.",
    },
    low_conversion: {
      owner_felt_line: "Foot traffic is there but orders aren't converting at expected rates.",
      explanation: "When menu is complex or pricing unclear, walk-by becomes walk-away. Impulse buyers need instant clarity.",
      recommended_move: "Simplify menu to 3-5 items max. Use combo pricing ($8/$12/$15). Add photos or samples at POS.",
      boundary: "If your model is specialty or made-to-order, lower conversion is expected—focus on location and peak-hour execution.",
    },
    cashflow_drag: {
      owner_felt_line: "Cash is immediate but daily expenses eat into it before deposits hit.",
      explanation: "When revenue is cash or card but expenses are same-day (supplies, labor, permits), cash buffer feels thin.",
      recommended_move: "Separate daily operating cash from owner pay—protect a 7-day expense buffer in the business account.",
      boundary: "If your model is event-heavy, cashflow drag is structural—require deposits and batch expense ordering.",
    },
    rhythm_volatility: {
      owner_felt_line: "Peak days feel huge, slow days feel dead—there's no in-between.",
      explanation: "When demand is location- or event-driven, daily revenue swings wildly. Forecasting feels impossible.",
      recommended_move: "Track performance by location/event type, not day-of-week. Double down on proven slots and cut weak ones.",
      boundary: "If your model is seasonal or event-based, volatility is inherent—protect with cash reserves and pre-orders.",
    },
    mapping_low_confidence: {
      owner_felt_line: "The numbers feel directionally right but not precise.",
      explanation: "When POS data is cash-heavy or mixed, insights are directional but not decision-grade.",
      recommended_move: "Confirm POS exports include timestamps and location tags. Separate cash from card sales if possible.",
      boundary: "Do not act on specific numbers until mapping is verified. Use patterns directionally only.",
    },
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SALES-LED (solar, propane, equipment, wholesale)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  sales_led: {
    concentration_risk: {
      owner_felt_line: "A few large deals are carrying the quarter, so when one slips, everything stalls.",
      explanation: "When revenue concentrates in high-ticket sales, pipeline timing becomes fragile. One deal moving changes the quarter.",
      recommended_move: "Build a mid-ticket product or service lane that closes faster and fills gaps when large deals delay.",
      boundary: "If your model is enterprise or commercial sales, concentration is expected—protect with deposits and milestone payments.",
    },
    follow_up_drift: {
      owner_felt_line: "Proposals sit without follow-up, and busy weeks make it worse.",
      explanation: "When sales cycles are long, follow-up becomes manual and inconsistent. Deals age without closure.",
      recommended_move: "Assign one person to own proposal follow-up on a 72-hour rhythm for mid-sized deals only.",
      boundary: "If you're selling complex B2B solutions, long cycles are expected—protect with pipeline depth and CRM discipline.",
    },
    capacity_pressure: {
      owner_felt_line: "Proposals are approved but delivery timing lags, creating cash gaps.",
      explanation: "When fulfillment depends on supply chain or installation crews, approved deals don't convert to revenue immediately.",
      recommended_move: "Separate sales from delivery—protect a 30-day buffer between close and fulfillment expectations.",
      boundary: "If your product requires long lead times, capacity pressure is structural—set expectations upfront and collect deposits.",
    },
    decision_lag: {
      owner_felt_line: "Buyers take months to commit, even after multiple meetings.",
      explanation: "When deals require committee approval or financing, decision cycles stretch. Follow-up becomes guesswork.",
      recommended_move: "Qualify hard on budget and decision authority. Walk away from deals without clear timelines or champions.",
      boundary: "If you're selling enterprise or government contracts, long cycles are expected—protect with strong pipeline coverage (3x quota).",
    },
    low_conversion: {
      owner_felt_line: "Proposals are sent but not closing at expected rates.",
      explanation: "When sales cycles are long and complex, conversion rates drop. Deals stall in committee or budget cycles.",
      recommended_move: "Simplify proposals into tiers (starter/professional/enterprise). Qualify harder on budget authority upfront.",
      boundary: "If you're selling enterprise solutions, lower conversion is expected—focus on pipeline coverage (3x) and win rate by deal size.",
    },
    cashflow_drag: {
      owner_felt_line: "Deals close but invoices sit unpaid for 30-60 days, slowing growth.",
      explanation: "When clients are commercial with NET terms, cash timing lags revenue recognition. Growth feels constrained.",
      recommended_move: "Require 50% deposit on close and 50% on delivery. Offer 2% discount for payment within 10 days.",
      boundary: "If your clients are large commercial accounts, NET30-60 is contractual—protect with line of credit or factoring.",
    },
    rhythm_volatility: {
      owner_felt_line: "Pipeline feels lumpy—deals close in waves, then go quiet.",
      explanation: "When sales cycles are long and deal sizes vary, monthly revenue becomes unpredictable.",
      recommended_move: "Build a fast-close product (add-on, service contract) that delivers predictable monthly revenue independent of large deals.",
      boundary: "If you're selling complex solutions, volatility is structural—protect with recurring revenue and strong pipeline discipline.",
    },
    mapping_low_confidence: {
      owner_felt_line: "The numbers feel directionally right but not precise.",
      explanation: "When CRM data doesn't sync with invoicing, insights are directional but not decision-grade.",
      recommended_move: "Confirm proposal→invoice linkage (opportunity IDs) and verify close dates export correctly.",
      boundary: "Do not act on specific numbers until mapping is verified. Use patterns directionally only.",
    },
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SPECIALTY LOCAL (auto repair, appliance, locksmith)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  specialty_local: {
    concentration_risk: {
      owner_felt_line: "A few large repairs are carrying the month, so when one cancels, revenue drops.",
      explanation: "When revenue concentrates in diagnostic-heavy or large repairs, cancellations or parts delays create cash gaps.",
      recommended_move: "Build a fast-turn maintenance or inspection lane that delivers steady small-ticket revenue.",
      boundary: "If your work is diagnostic-heavy, concentration is expected—protect with deposits and parts prepayment.",
    },
    follow_up_drift: {
      owner_felt_line: "Estimates sit waiting for customer approval, and busy days make follow-up slip.",
      explanation: "When diagnostics are done but repairs aren't approved immediately, follow-up becomes manual and inconsistent.",
      recommended_move: "Call within 24 hours of diagnostic with approval options (fix now, fix later, parts-only). Set a 48-hour decision window.",
      boundary: "If repairs require parts ordering, follow-up lag is structural—communicate lead times upfront and require deposits.",
    },
    capacity_pressure: {
      owner_felt_line: "The bay shows availability but approved work waits for parts or diagnosis time.",
      explanation: "When repairs depend on diagnostics or parts availability, capacity feels full even when bays are open.",
      recommended_move: "Separate diagnostic slots from repair slots. Batch parts ordering to reduce wait time.",
      boundary: "If your work requires specialty parts, capacity pressure is structural—set expectations and offer loaner options.",
    },
    decision_lag: {
      owner_felt_line: "Customers delay repair decisions, even after seeing the estimate.",
      explanation: "When repairs are expensive or discretionary, decision time stretches. Follow-up becomes guesswork.",
      recommended_move: "Offer payment plans or tier pricing (fix critical now, defer non-urgent). Set a 7-day estimate validity window.",
      boundary: "If your repairs are high-ticket or luxury, long cycles are expected—protect with diagnostic fees and clear timelines.",
    },
    low_conversion: {
      owner_felt_line: "Diagnostics are done but repairs aren't being approved.",
      explanation: "When repairs are expensive or feel discretionary, approval rates drop. Customers shop around or delay.",
      recommended_move: "Offer tiered repair options (essential/recommended/optimal). Call within 24 hours with financing options.",
      boundary: "If your repairs are high-ticket, lower conversion is expected—focus on diagnostic fees, payment plans, and urgency framing.",
    },
    cashflow_drag: {
      owner_felt_line: "Repairs finish but invoices sit unpaid, slowing parts replenishment.",
      explanation: "When payment isn't collected at pickup, collections become manual work. Parts inventory gets constrained.",
      recommended_move: "Require payment at pickup—no exceptions. Offer card on file for commercial accounts only.",
      boundary: "If your clients are commercial fleets, NET15 is common—require deposits and progress billing for large repairs.",
    },
    rhythm_volatility: {
      owner_felt_line: "Busy weeks feel chaotic, slow weeks feel dead—there's no steady rhythm.",
      explanation: "When demand is reactive (breakdowns, emergencies), weekly volume swings wildly. Forecasting feels impossible.",
      recommended_move: "Build a recurring maintenance program (inspections, tune-ups) to create baseline revenue independent of breakdowns.",
      boundary: "If your work is emergency-driven, volatility is inherent—protect with cash reserves and flexible staffing.",
    },
    mapping_low_confidence: {
      owner_felt_line: "The numbers feel directionally right but not precise.",
      explanation: "When work orders don't link to invoices cleanly, insights are directional but not decision-grade.",
      recommended_move: "Confirm estimate→invoice linkage (work order IDs) and verify completion dates export correctly.",
      boundary: "Do not act on specific numbers until mapping is verified. Use patterns directionally only.",
    },
  },
};
