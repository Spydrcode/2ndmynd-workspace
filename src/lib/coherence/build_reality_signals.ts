/**
 * buildRealitySignals — Convert computed signals into neutral, non-judgmental observations.
 *
 * DOCTRINE:
 * - Every observation is stated as "what appears true," never "what is wrong."
 * - No good/bad framing. No comparisons to peers or standards.
 * - Magnitude = how large the effect is, not how "concerning" it is.
 */

import type { RealitySignals, RealitySignal, SignalConfidence } from "../types/coherence_engine";
import type { ComputedSignals } from "../../../mcp/tools/compute_signals_v2";
import type { SnapshotV2 } from "../../../lib/decision/v2/conclusion_schema_v2";

type BuildRealitySignalsInput = {
  computedSignals: ComputedSignals;
  snapshot: SnapshotV2;
};

function signalConfidence(raw: "low" | "medium" | "high"): SignalConfidence {
  if (raw === "medium") return "med";
  return raw as SignalConfidence;
}

function magnitude(value: number, max: number): number {
  return Math.min(Math.round((value / max) * 100), 100);
}

export function buildRealitySignals(input: BuildRealitySignalsInput): RealitySignals {
  const { computedSignals: cs, snapshot } = input;
  const signals: RealitySignal[] = [];
  const missing: string[] = [...cs.missing_data_flags];

  // ── Volume signals ──
  const quoteCount = snapshot.activity_signals.quotes.quotes_count;
  const invoiceCount = snapshot.activity_signals.invoices.invoices_count;

  signals.push({
    id: "sig_volume_quotes",
    category: "volume",
    observation: `${quoteCount} quotes were created during this window.`,
    magnitude: magnitude(quoteCount, 200),
    confidence: quoteCount >= 25 ? "high" : "med",
    data_points: { quotes_count: quoteCount },
  });

  signals.push({
    id: "sig_volume_invoices",
    category: "volume",
    observation: `${invoiceCount} invoices were issued during this window.`,
    magnitude: magnitude(invoiceCount, 200),
    confidence: invoiceCount >= 10 ? "high" : "med",
    data_points: { invoices_count: invoiceCount },
  });

  // ── Timing signals ──
  const decisionLag = snapshot.activity_signals.quotes.decision_lag_band;
  if (decisionLag === "high" || decisionLag === "very_high") {
    signals.push({
      id: "sig_timing_decision_lag",
      category: "timing",
      observation: `Quotes typically wait a ${decisionLag.replace("_", " ")} amount of time before a decision is made.`,
      magnitude: decisionLag === "very_high" ? 90 : 65,
      confidence: "high",
      data_points: { decision_lag_band: decisionLag },
    });
  }

  const paymentDist = snapshot.activity_signals.invoices.payment_lag_band_distribution;
  const highPaymentPct = Math.round((paymentDist.high + paymentDist.very_high) * 100);
  if (highPaymentPct > 15) {
    signals.push({
      id: "sig_timing_payment_lag",
      category: "cash",
      observation: `${highPaymentPct}% of invoices have longer-than-typical payment windows.`,
      magnitude: magnitude(highPaymentPct, 100),
      confidence: "high",
      data_points: { high_payment_lag_pct: highPaymentPct, distribution: paymentDist },
    });
  }

  // ── Concentration signals ──
  for (const conc of cs.concentration_signals) {
    signals.push({
      id: `sig_concentration_${conc.source}`,
      category: "concentration",
      observation: conc.description,
      magnitude: magnitude(conc.concentration_pct, 100),
      confidence: "high",
      data_points: { source: conc.source, concentration_pct: conc.concentration_pct },
    });
  }

  // ── Capacity signals ──
  for (const cap of cs.capacity_signals) {
    signals.push({
      id: `sig_capacity_${cap.signal_type}`,
      category: "capacity",
      observation: cap.evidence,
      magnitude: cap.severity === "high" ? 80 : cap.severity === "medium" ? 55 : 30,
      confidence: signalConfidence(cs.confidence),
      data_points: { signal_type: cap.signal_type, severity: cap.severity },
    });
  }

  // ── Owner dependency signals ──
  for (const dep of cs.owner_dependency) {
    signals.push({
      id: `sig_owner_${dep.dependency_type}`,
      category: "owner_dependency",
      observation: dep.impact,
      magnitude: dep.frequency === "constant" ? 90 : dep.frequency === "frequent" ? 65 : 35,
      confidence: signalConfidence(cs.confidence),
      data_points: { dependency_type: dep.dependency_type, frequency: dep.frequency },
    });
  }

  // ── Rhythm/volatility signals ──
  const volBand = snapshot.volatility_band;
  if (volBand === "high" || volBand === "very_high") {
    signals.push({
      id: "sig_rhythm_volatility",
      category: "rhythm",
      observation: `Week-to-week volume varies significantly (${volBand.replace("_", " ")} volatility).`,
      magnitude: volBand === "very_high" ? 85 : 65,
      confidence: "high",
      data_points: { volatility_band: volBand },
    });
  }

  if (cs.seasonality_pattern === "strong" || cs.seasonality_pattern === "moderate") {
    signals.push({
      id: "sig_rhythm_seasonality",
      category: "rhythm",
      observation: `Business volume follows a ${cs.seasonality_pattern} seasonal pattern.`,
      magnitude: cs.seasonality_pattern === "strong" ? 70 : 45,
      confidence: "high",
      data_points: { seasonality_pattern: cs.seasonality_pattern, evidence: cs.seasonality_evidence },
    });
  }

  // ── Approval rate ──
  const approvalRate = snapshot.activity_signals.quotes.approval_rate_band;
  if (approvalRate === "very_low" || approvalRate === "low") {
    signals.push({
      id: "sig_volume_approval_rate",
      category: "volume",
      observation: `A ${approvalRate.replace("_", " ")} share of quotes are being approved.`,
      magnitude: approvalRate === "very_low" ? 80 : 55,
      confidence: quoteCount >= 20 ? "high" : "med",
      data_points: {
        approval_rate_band: approvalRate,
        approved: snapshot.activity_signals.quotes.quotes_approved_count,
        total: quoteCount,
      },
    });
  }

  return {
    version: "signals_v1",
    signals,
    window: {
      start_date: snapshot.window.slice_start,
      end_date: snapshot.window.slice_end,
      records_used: quoteCount + invoiceCount,
    },
    missing_data: missing,
  };
}
