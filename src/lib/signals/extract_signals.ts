/**
 * Signal Extraction - Convert snapshot/analysis data into benchmark-ready metrics
 */

import type { SnapshotV2 } from "@/lib/decision/v2/conclusion_schema_v2";
import type { LayerFusionResult } from "../intelligence/layer_fusion/types";

/**
 * Extract key signals for benchmark comparison
 */
export function extractSignals(input: {
  snapshot: SnapshotV2;
  layer_fusion?: LayerFusionResult;
  invoice_totals?: number[];
  weekly_counts?: number[];
}): Record<string, number> {
  const signals: Record<string, number> = {};

  // 1. Revenue concentration (approximate from invoice data or use default)
  if (input.invoice_totals && input.invoice_totals.length >= 5) {
    const sorted = [...input.invoice_totals].sort((a, b) => b - a);
    const total = sorted.reduce((sum, v) => sum + v, 0);
    if (total > 0) {
      const top5Count = Math.min(5, Math.ceil(sorted.length * 0.05));
      const top5Sum = sorted.slice(0, top5Count).reduce((sum, v) => sum + v, 0);
      signals.revenue_concentration_top5_share = top5Sum / total;
    }
  }

  // 2. Quote age over 14 days share (estimate from snapshot if available)
  // In real implementation, this would come from pack analysis
  // For now, use a heuristic based on volatility/decision lag
  const decisionLag = input.snapshot.activity_signals.quotes.decision_lag_band;
  if (decisionLag === "very_high" || decisionLag === "high") {
    signals.quote_age_over_14d_share = 0.45; // High estimate
  } else if (decisionLag === "medium") {
    signals.quote_age_over_14d_share = 0.30; // Medium estimate
  } else {
    signals.quote_age_over_14d_share = 0.18; // Low estimate
  }

  // 3. Approved to scheduled (from layer fusion if available)
  if (input.layer_fusion?.timing.approved_to_scheduled_p50_days !== undefined) {
    signals.approved_to_scheduled_p50_days = input.layer_fusion.timing.approved_to_scheduled_p50_days;
  }

  // 4. Invoiced to paid (from layer fusion if available)
  if (input.layer_fusion?.timing.invoiced_to_paid_p50_days !== undefined) {
    signals.invoiced_to_paid_p50_days = input.layer_fusion.timing.invoiced_to_paid_p50_days;
  }

  // 5. Weekly volume volatility (use snapshot volatility_band as proxy)
  const volatilityBand = input.snapshot.volatility_band;
  if (volatilityBand === "very_high") {
    signals.weekly_volume_volatility_index = 0.65;
  } else if (volatilityBand === "high") {
    signals.weekly_volume_volatility_index = 0.48;
  } else if (volatilityBand === "medium") {
    signals.weekly_volume_volatility_index = 0.35;
  } else if (volatilityBand === "low") {
    signals.weekly_volume_volatility_index = 0.22;
  } else {
    signals.weekly_volume_volatility_index = 0.15;
  }

  return signals;
}
