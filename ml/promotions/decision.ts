import { evaluateGates } from "./gates";
import { THRESHOLDS } from "./thresholds";
import type { MetricSummary } from "./compare";

export function decidePromotion(params: { candidateMetrics: MetricSummary; championMetrics: MetricSummary }) {
  const gate = evaluateGates(params.candidateMetrics, params.championMetrics);
  const primary = THRESHOLDS.primary_metrics;

  const improvements = primary.filter((metric) => {
    return params.candidateMetrics[metric] >= params.championMetrics[metric];
  });

  const doctrineZeroFailures = params.candidateMetrics.doctrine_avg >= 0.999;
  const pass =
    gate.pass &&
    improvements.length >= 2 &&
    params.candidateMetrics.schema_valid_rate >= THRESHOLDS.schema_valid_rate &&
    doctrineZeroFailures;

  const reasons = [
    ...gate.reasons,
    improvements.length >= 2 ? "primary_metrics_ok" : "insufficient_primary_metric_improvements",
    doctrineZeroFailures ? "doctrine_zero_failures" : "doctrine_failures_present",
  ];

  return { pass, reasons };
}
