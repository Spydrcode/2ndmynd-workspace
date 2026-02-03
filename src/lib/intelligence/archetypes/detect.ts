import type { SnapshotV2 } from "@/lib/decision/v2/conclusion_schema_v2";
import type { BusinessProfile } from "../web_profile";
import type {
  OperatingArchetype,
  OperatingArchetypeId,
  ArchetypeDetectionResult,
  ConfidenceBand,
} from "./types";

/**
 * Detect operating archetypes from snapshot_v2 signals
 * Uses only existing aggregates — no job-type catalogs or industry lists
 * Resilient to missing signals
 */
export function detectOperatingArchetypes(
  snapshot: SnapshotV2,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  businessProfile?: BusinessProfile | null
): ArchetypeDetectionResult {
  const archetypes: OperatingArchetype[] = [];
  const notes: string[] = [];

  // Check data completeness
  const hasMinimalData =
    snapshot.activity_signals.invoices.invoices_count > 0 ||
    snapshot.activity_signals.quotes.quotes_count > 0;

  if (!hasMinimalData) {
    notes.push("Minimal activity data; archetype confidence reduced.");
  }

  // A) quote_to_job — Estimates → Approvals → Jobs pattern
  const quoteArchetype = detectQuoteToJob(snapshot);
  if (quoteArchetype) archetypes.push(quoteArchetype);

  // B) ticket_driven — Many small jobs / high volume
  const ticketArchetype = detectTicketDriven(snapshot);
  if (ticketArchetype) archetypes.push(ticketArchetype);

  // C) inventory_sensitive — Input costs matter
  const inventoryArchetype = detectInventorySensitive(snapshot);
  if (inventoryArchetype) archetypes.push(inventoryArchetype);

  // D) project_heavy — Few big jobs / long cycle
  const projectArchetype = detectProjectHeavy(snapshot);
  if (projectArchetype) archetypes.push(projectArchetype);

  // E) seasonal_spike_driven — Predictable swings
  const seasonalArchetype = detectSeasonalSpikeDriven(snapshot);
  if (seasonalArchetype) archetypes.push(seasonalArchetype);

  // F) repeat_relationship — Repeat customers (future: if signal exists)
  // Skip for now unless snapshot includes repeat_customer_rate

  // Select primary archetype
  let primary: OperatingArchetypeId | undefined;
  if (archetypes.length > 0) {
    // Choose highest confidence, break ties by evidence strength
    const sorted = [...archetypes].sort((a, b) => {
      const confMap = { high: 3, medium: 2, low: 1 };
      const confDiff = confMap[b.confidence] - confMap[a.confidence];
      if (confDiff !== 0) return confDiff;
      return b.evidence.length - a.evidence.length;
    });
    primary = sorted[0].id;
  }

  return { archetypes, primary, notes: notes.length > 0 ? notes : undefined };
}

function detectQuoteToJob(snapshot: SnapshotV2): OperatingArchetype | null {
  const quotes = snapshot.activity_signals.quotes;
  const quotesCount = quotes.quotes_count;
  const approvalRateBand = quotes.approval_rate_band;
  const decisionLagBand = quotes.decision_lag_band;

  // Require quotes with meaningful approval signals
  if (quotesCount < 5) return null;
  if (quotes.quotes_approved_count === 0) return null;

  const evidence: string[] = [];
  let confidence: ConfidenceBand = "low";

  if (quotesCount >= 10) {
    evidence.push(`${quotesCount} quotes with approval tracking`);
    confidence = "medium";
  }

  if (decisionLagBand === "medium" || decisionLagBand === "high" || decisionLagBand === "very_high") {
    evidence.push(`Decision lag: ${decisionLagBand}`);
  }

  if (approvalRateBand !== "very_low") {
    evidence.push(`Approval rate: ${approvalRateBand}`);
  }

  if (evidence.length >= 2) {
    confidence = quotesCount >= 20 ? "high" : "medium";
  }

  if (evidence.length === 0) return null;

  return {
    id: "quote_to_job",
    label: "Quote-to-Job Pattern",
    confidence,
    evidence,
  };
}

function detectTicketDriven(snapshot: SnapshotV2): OperatingArchetype | null {
  const invoices = snapshot.activity_signals.invoices;
  const invoicesCount = invoices.invoices_count;
  const bands = invoices.invoice_total_bands;

  // High volume with predominantly small tickets
  if (invoicesCount < 20) return null;

  const evidence: string[] = [];
  let confidence: ConfidenceBand = "low";

  const smallRatio = bands.small / Math.max(invoicesCount, 1);

  if (smallRatio > 0.5) {
    evidence.push(`${invoicesCount} invoices with ${Math.round(smallRatio * 100)}% small tickets`);
    confidence = "medium";
  }

  if (invoicesCount >= 50 && smallRatio > 0.6) {
    confidence = "high";
    evidence.push("High volume activity");
  }

  // Check payment lag distribution (fast payments = ticket-driven)
  const paymentDist = invoices.payment_lag_band_distribution;
  const fastPayments = paymentDist.very_low + paymentDist.low;
  const totalWithPayment = Object.values(paymentDist).reduce((a, b) => a + b, 0);
  if (totalWithPayment > 0 && fastPayments / totalWithPayment > 0.6) {
    evidence.push("Fast payment patterns");
  }

  if (evidence.length === 0) return null;

  return {
    id: "ticket_driven",
    label: "Ticket-Driven Operations",
    confidence,
    evidence,
  };
}

function detectInventorySensitive(snapshot: SnapshotV2): OperatingArchetype | null {
  const inputCosts = snapshot.input_costs;

  // Conservative: only detect if explicit input cost signals exist
  if (!inputCosts || inputCosts.length === 0) return null;

  const evidence: string[] = [];
  let confidence: ConfidenceBand = "low";

  const volatileInputs = inputCosts.filter(
    (cost) => cost.volatility_band === "high" || cost.volatility_band === "very_high"
  );

  if (volatileInputs.length > 0) {
    evidence.push(`${volatileInputs.length} volatile input costs tracked`);
    confidence = "medium";
  }

  const significantChanges = inputCosts.filter(
    (cost) => Math.abs(cost.change_30d_pct) > 10 || Math.abs(cost.change_90d_pct) > 15
  );

  if (significantChanges.length > 0) {
    evidence.push("Recent input cost movements");
    confidence = significantChanges.length >= 2 ? "medium" : "low";
  }

  if (evidence.length === 0) return null;

  return {
    id: "inventory_sensitive",
    label: "Inventory-Sensitive Operations",
    confidence,
    evidence,
  };
}

function detectProjectHeavy(snapshot: SnapshotV2): OperatingArchetype | null {
  const invoices = snapshot.activity_signals.invoices;
  const quotes = snapshot.activity_signals.quotes;
  const invoicesCount = invoices.invoices_count;
  const bands = invoices.invoice_total_bands;

  // Few invoices with large tickets and/or longer decision cycles
  if (invoicesCount === 0) return null;

  const evidence: string[] = [];
  let confidence: ConfidenceBand = "low";

  // Concentration check: high ratio of large tickets
  const largeRatio = bands.large / Math.max(invoicesCount, 1);
  if (largeRatio > 0.4) {
    evidence.push(`${Math.round(largeRatio * 100)}% large-ticket invoices`);
    confidence = "medium";
  }

  // Low volume
  if (invoicesCount <= 15 && invoicesCount >= 3) {
    evidence.push("Low volume, higher complexity");
  }

  // Longer decision lag
  if (quotes.decision_lag_band === "high" || quotes.decision_lag_band === "very_high") {
    evidence.push(`Extended decision cycle: ${quotes.decision_lag_band}`);
    if (largeRatio > 0.4) {
      confidence = "high";
    }
  }

  if (evidence.length === 0) return null;

  return {
    id: "project_heavy",
    label: "Project-Heavy Pattern",
    confidence,
    evidence,
  };
}

function detectSeasonalSpikeDriven(snapshot: SnapshotV2): OperatingArchetype | null {
  const volatilityBand = snapshot.volatility_band;
  const season = snapshot.season;
  const lookbackDays = snapshot.window.lookback_days;

  // High volatility over meaningful time window
  if (volatilityBand !== "high" && volatilityBand !== "very_high") return null;
  if (lookbackDays < 60) return null; // Need at least 2 months

  const evidence: string[] = [];
  let confidence: ConfidenceBand = "medium";

  evidence.push(`High volatility: ${volatilityBand}`);

  if (season.strength === "moderate" || season.strength === "strong") {
    evidence.push(`Seasonal strength: ${season.strength}`);
  }

  if (season.predictability === "medium" || season.predictability === "high") {
    evidence.push(`Pattern predictability: ${season.predictability}`);
    if (season.strength === "strong") {
      confidence = "high";
    }
  }

  if (evidence.length < 2) {
    confidence = "low";
  }

  return {
    id: "seasonal_spike_driven",
    label: "Seasonal Spike Pattern",
    confidence,
    evidence,
  };
}
