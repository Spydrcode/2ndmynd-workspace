import { THRESHOLDS } from "./thresholds";
import type { MetricSummary } from "./compare";

export function evaluateGates(candidate: MetricSummary, champion: MetricSummary) {
  const reasons: string[] = [];

  if (candidate.schema_valid_rate < THRESHOLDS.schema_valid_rate) {
    reasons.push("schema_valid_rate_below_threshold");
  }
  if (candidate.doctrine_avg < THRESHOLDS.doctrine_min) {
    reasons.push("doctrine_below_threshold");
  }
  if (candidate.groundedness_avg < THRESHOLDS.groundedness_min) {
    reasons.push("groundedness_below_threshold");
  }
  if (candidate.clarity_avg < THRESHOLDS.clarity_min) {
    reasons.push("clarity_below_threshold");
  }
  if (candidate.pass_rate < THRESHOLDS.pass_rate_min) {
    reasons.push("pass_rate_below_threshold");
  }

  if (candidate.schema_valid_rate < champion.schema_valid_rate - THRESHOLDS.allowed_schema_drop) {
    reasons.push("schema_regression");
  }
  if (candidate.doctrine_avg < champion.doctrine_avg - THRESHOLDS.allowed_doctrine_drop) {
    reasons.push("doctrine_regression");
  }
  if (candidate.clarity_avg < champion.clarity_avg - THRESHOLDS.allowed_clarity_drop) {
    reasons.push("clarity_regression");
  }
  if (candidate.groundedness_avg < champion.groundedness_avg - THRESHOLDS.allowed_groundedness_drop) {
    reasons.push("groundedness_regression");
  }

  return { pass: reasons.length === 0, reasons };
}
