/**
 * SYSTEM 1: Compute Signals from Normalized Pack
 * 
 * Extracts bucketed/aggregated signals from data pack.
 * DOCTRINE: Only bucketed/aggregated signals; no raw data in agent prompts.
 */

import type { SnapshotV2 } from "../../lib/decision/v2/conclusion_schema_v2";

export const tool = {
  name: "signals.compute_v2",
  description: "Compute aggregated business signals from snapshot_v2. Returns bucketed/aggregated features only.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["snapshot"],
    properties: {
      snapshot: {
        type: "object",
        description: "snapshot_v2 with activity_signals, season, volatility",
      },
      include_concentration: {
        type: "boolean",
        description: "Include concentration analysis (customer/job type)",
      },
    },
  },
} as const;

export type ComputeSignalsV2Args = {
  snapshot: SnapshotV2;
  include_concentration?: boolean;
};

type ConcentrationSignal = {
  source: "customer" | "job_type" | "season";
  concentration_pct: number;
  risk_level: "low" | "medium" | "high" | "critical";
  description: string;
};

type CapacitySignal = {
  signal_type: "demand_exceeds_capacity" | "capacity_exceeds_demand" | "balanced";
  severity: "low" | "medium" | "high";
  evidence: string;
};

type OwnerDependencySignal = {
  dependency_type: "approval_bottleneck" | "hero_dynamic" | "non_repeatable_work" | "decision_fatigue";
  frequency: "occasional" | "frequent" | "constant";
  impact: string;
};

export type ComputedSignals = {
  seasonality_pattern: "none" | "weak" | "moderate" | "strong";
  seasonality_evidence: string;
  volatility_band: string;
  volatility_evidence: string;
  approval_lag_signal: string;
  payment_lag_signal: string;
  concentration_signals: ConcentrationSignal[];
  capacity_signals: CapacitySignal[];
  owner_dependency: OwnerDependencySignal[];
  business_type_hypothesis: string;
  confidence: "low" | "medium" | "high";
  missing_data_flags: string[];
};

export async function handler(args: ComputeSignalsV2Args): Promise<ComputedSignals> {
  const { snapshot } = args;
  const signals: ComputedSignals = {
    seasonality_pattern: "none",
    seasonality_evidence: "",
    volatility_band: snapshot.volatility_band,
    volatility_evidence: "",
    approval_lag_signal: "",
    payment_lag_signal: "",
    concentration_signals: [],
    capacity_signals: [],
    owner_dependency: [],
    business_type_hypothesis: "",
    confidence: snapshot.window.sample_confidence,
    missing_data_flags: [],
  };

  // Seasonality pattern
  const { season } = snapshot;
  if (season.strength === "strong") {
    signals.seasonality_pattern = "strong";
  } else if (season.strength === "moderate") {
    signals.seasonality_pattern = "moderate";
  } else if (season.strength === "weak") {
    signals.seasonality_pattern = "weak";
  }
  signals.seasonality_evidence = `Phase: ${season.phase}, Strength: ${season.strength}, Predictability: ${season.predictability}`;

  // Volatility evidence
  signals.volatility_evidence = `Overall volatility: ${snapshot.volatility_band}`;

  // Approval lag signal
  const { quotes } = snapshot.activity_signals;
  if (quotes.decision_lag_band === "very_high" || quotes.decision_lag_band === "high") {
    signals.approval_lag_signal = `High decision lag detected (${quotes.decision_lag_band})`;
    signals.owner_dependency.push({
      dependency_type: "approval_bottleneck",
      frequency: "frequent",
      impact: "Quotes waiting for approval; slows revenue conversion",
    });
  } else {
    signals.approval_lag_signal = `Decision lag normal (${quotes.decision_lag_band})`;
  }

  // Payment lag signal
  const { invoices } = snapshot.activity_signals;
  const highPaymentLagPct =
    (invoices.payment_lag_band_distribution.high + invoices.payment_lag_band_distribution.very_high) * 100;
  if (highPaymentLagPct > 30) {
    signals.payment_lag_signal = `${highPaymentLagPct.toFixed(0)}% of invoices have high payment lag`;
  } else {
    signals.payment_lag_signal = `Payment lag is normal`;
  }

  // Capacity signal (heuristic based on quote/invoice counts)
  const quotesCount = quotes.quotes_count;
  const invoicesCount = invoices.invoices_count;
  const approvalRate = quotes.quotes_approved_count / quotesCount;

  if (approvalRate < 0.3 && quotesCount > 20) {
    signals.capacity_signals.push({
      signal_type: "demand_exceeds_capacity",
      severity: "high",
      evidence: `Low approval rate (${(approvalRate * 100).toFixed(0)}%) suggests selective capacity`,
    });
  }

  // Hero dynamic detection (approval bottleneck + high volatility)
  if (
    signals.owner_dependency.some((d) => d.dependency_type === "approval_bottleneck") &&
    snapshot.volatility_band === "high"
  ) {
    signals.owner_dependency.push({
      dependency_type: "hero_dynamic",
      frequency: "frequent",
      impact: "Owner is critical path for decisions; creates bottleneck",
    });
  }

  // Business type hypothesis (based on job size distribution)
  const smallJobsPct = (quotes.quote_total_bands.small / quotesCount) * 100;
  const largeJobsPct = (quotes.quote_total_bands.large / quotesCount) * 100;

  if (smallJobsPct > 60) {
    signals.business_type_hypothesis = "High-volume, low-ticket service business";
  } else if (largeJobsPct > 40) {
    signals.business_type_hypothesis = "Project-based, high-ticket business";
  } else {
    signals.business_type_hypothesis = "Mixed job size distribution";
  }

  // Missing data flags
  if (!snapshot.weekly_volume_series || snapshot.weekly_volume_series.length < 4) {
    signals.missing_data_flags.push("Insufficient weekly volume data for trend analysis");
  }
  if (quotesCount < 25) {
    signals.missing_data_flags.push("Low quote count; confidence reduced");
  }

  return signals;
}
