/**
 * data_coverage.ts — Data Coverage Card + Value Visibility Impact
 *
 * DOCTRINE:
 * - No benchmarks, no judgment, no "you're missing" language.
 * - State what is present and what is absent — let the owner decide what to add.
 * - Visibility impact is structural, not prescriptive.
 */

import type {
  DataCoverage,
  CoverageSource,
  CoverageStatus,
  ValueVisibilityImpact,
  RealitySignals,
  ValuePropAlignment,
} from "../types/coherence_engine";
import type { SnapshotV2 } from "../../../lib/decision/v2/conclusion_schema_v2";

// ============================================================================
// COMPUTE DATA COVERAGE
// ============================================================================

type CoverageInput = {
  snapshot: SnapshotV2;
  signals: RealitySignals;
};

/**
 * Determine which data sources are present, partial, or absent
 * from the uploaded CSV data. Returns a structural note for each source.
 */
export function computeDataCoverage(input: CoverageInput): DataCoverage {
  const { snapshot, signals } = input;
  const sources: DataCoverage["sources"] = [];

  // Quotes
  const quotesCount = snapshot.activity_signals.quotes.quotes_count;
  sources.push({
    name: "quotes",
    status: coverageStatus(quotesCount, 10),
    record_count: quotesCount,
    note:
      quotesCount === 0
        ? "No quote data provided."
        : quotesCount < 10
          ? `${quotesCount} quotes in this window — limited visibility into quoting patterns.`
          : `${quotesCount} quotes in this window.`,
  });

  // Invoices
  const invoicesCount = snapshot.activity_signals.invoices.invoices_count;
  sources.push({
    name: "invoices",
    status: coverageStatus(invoicesCount, 10),
    record_count: invoicesCount,
    note:
      invoicesCount === 0
        ? "No invoice data provided."
        : invoicesCount < 10
          ? `${invoicesCount} invoices in this window — limited visibility into billing patterns.`
          : `${invoicesCount} invoices in this window.`,
  });

  // Calendar (check if calendar signals exist — currently not tracked in snapshot)
  const hasCalendar = signals.signals.some((s) => s.category === "capacity" && s.id.includes("calendar"));
  sources.push({
    name: "calendar",
    status: hasCalendar ? "present" : "absent",
    record_count: 0,
    note: hasCalendar
      ? "Calendar data is available."
      : "No calendar data provided — scheduling patterns aren't visible.",
  });

  // Expenses (check for input_costs in snapshot)
  const expenseCount = snapshot.input_costs?.length ?? 0;
  sources.push({
    name: "expenses",
    status: coverageStatus(expenseCount, 5),
    record_count: expenseCount,
    note:
      expenseCount === 0
        ? "No expense data provided."
        : expenseCount < 5
          ? `${expenseCount} expense entries — limited cost visibility.`
          : `${expenseCount} expense entries available.`,
  });

  // Estimates (check for estimate-related signals)
  const hasEstimates = signals.signals.some(
    (s) => s.id.includes("estimate") || s.id.includes("approval")
  );
  sources.push({
    name: "estimates",
    status: hasEstimates ? "present" : "absent",
    record_count: 0,
    note: hasEstimates
      ? "Estimate data is reflected in signals."
      : "No separate estimate data provided.",
  });

  // Build overall note
  const presentCount = sources.filter((s) => s.status === "present").length;
  const absentCount = sources.filter((s) => s.status === "absent").length;

  let overall_note: string;
  if (absentCount === 0) {
    overall_note = "All expected data sources are present. Coverage is strong.";
  } else if (presentCount >= 2) {
    overall_note = `${presentCount} of ${sources.length} data sources are present. Some areas have limited visibility.`;
  } else {
    overall_note = `Limited data sources available. Analysis is based on what was provided.`;
  }

  return { sources, overall_note };
}

// ============================================================================
// VALUE VISIBILITY IMPACT
// ============================================================================

/**
 * For each value-prop alignment item, assess how data coverage
 * affects our ability to see that value clearly.
 */
export function computeValueVisibilityImpact(
  alignments: ValuePropAlignment[],
  coverage: DataCoverage
): ValueVisibilityImpact[] {
  return alignments.map((a) => {
    const { visibility, reason } = assessVisibility(a.tag, a.support, a.confidence, coverage);
    return {
      tag: a.tag,
      label: a.label,
      visibility,
      reason,
    };
  });
}

// ============================================================================
// HELPERS
// ============================================================================

function coverageStatus(count: number, threshold: number): CoverageStatus {
  if (count === 0) return "absent";
  if (count < threshold) return "partial";
  return "present";
}

/**
 * Determine visibility level for a value prop based on available data.
 *
 * Tag-to-source mapping:
 * - speed/responsiveness → quotes, calendar
 * - affordability → invoices, expenses
 * - clarity/communication → quotes, calendar
 * - safety/compliance → (always partial without external data)
 * - quality → invoices, estimates
 * - availability → calendar
 * - local_trust → invoices, quotes (concentration)
 * - convenience → quotes, calendar
 * - relationship → invoices (repeat customer patterns), quotes
 * - other → neutral
 */
function assessVisibility(
  tag: string,
  support: string,
  confidence: string,
  coverage: DataCoverage
): { visibility: ValueVisibilityImpact["visibility"]; reason: string } {
  const sourceMap = getSourceRequirements(tag);
  const available = sourceMap.filter((s) => {
    const src = coverage.sources.find((cs) => cs.name === s);
    return src && src.status !== "absent";
  });

  if (support === "unknown" || confidence === "low") {
    const missing = sourceMap.filter((s) => {
      const src = coverage.sources.find((cs) => cs.name === s);
      return !src || src.status === "absent";
    });

    if (missing.length > 0) {
      return {
        visibility: "limited",
        reason: `No ${missing.join(" or ")} data to observe ${tagDescription(tag)}.`,
      };
    }

    return {
      visibility: "partial",
      reason: `Data is available but confidence is ${confidence} — patterns may become clearer with more records.`,
    };
  }

  if (available.length === sourceMap.length) {
    return {
      visibility: "clear",
      reason: `Sufficient data to observe ${tagDescription(tag)}.`,
    };
  }

  if (available.length > 0) {
    return {
      visibility: "partial",
      reason: `Some data is available, but full visibility requires additional sources.`,
    };
  }

  return {
    visibility: "limited",
    reason: `The data needed to fully assess this value isn't available yet.`,
  };
}

function getSourceRequirements(tag: string): CoverageSource[] {
  switch (tag) {
    case "speed_responsiveness":
      return ["quotes", "calendar"];
    case "affordability":
      return ["invoices", "expenses"];
    case "clarity_communication":
      return ["quotes", "calendar"];
    case "safety_compliance":
      return ["invoices"];
    case "premium_quality":
      return ["invoices", "estimates"];
    case "availability_when_others_wont":
      return ["calendar"];
    case "local_trust":
      return ["invoices", "quotes"];
    case "convenience_low_hassle":
      return ["quotes", "calendar"];
    case "relationship_care":
      return ["invoices", "quotes"];
    default:
      return ["quotes", "invoices"];
  }
}

function tagDescription(tag: string): string {
  switch (tag) {
    case "speed_responsiveness":
      return "response-time patterns";
    case "affordability":
      return "pricing and cost patterns";
    case "clarity_communication":
      return "communication patterns";
    case "safety_compliance":
      return "compliance patterns";
    case "premium_quality":
      return "quality indicators";
    case "availability_when_others_wont":
      return "availability patterns";
    case "local_trust":
      return "local relationship patterns";
    case "convenience_low_hassle":
      return "convenience indicators";
    case "relationship_care":
      return "relationship patterns";
    default:
      return "this value";
  }
}
