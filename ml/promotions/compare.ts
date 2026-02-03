export type MetricSummary = {
  schema_valid_rate: number;
  doctrine_avg: number;
  groundedness_avg: number;
  clarity_avg: number;
  pass_rate: number;
};

export function compareMetrics(candidate: MetricSummary, champion: MetricSummary) {
  return {
    schema_delta: candidate.schema_valid_rate - champion.schema_valid_rate,
    doctrine_delta: candidate.doctrine_avg - champion.doctrine_avg,
    groundedness_delta: candidate.groundedness_avg - champion.groundedness_avg,
    clarity_delta: candidate.clarity_avg - champion.clarity_avg,
    pass_rate_delta: candidate.pass_rate - champion.pass_rate,
  };
}
