export const THRESHOLDS = {
  schema_valid_rate: 0.99,
  doctrine_min: 0.9,
  groundedness_min: 0.7,
  clarity_min: 0.8,
  pass_rate_min: 0.8,
  allowed_schema_drop: 0.01,
  allowed_doctrine_drop: 0.05,
  allowed_clarity_drop: 0.05,
  allowed_groundedness_drop: 0.05,
  primary_metrics: ["schema_valid_rate", "doctrine_avg", "clarity_avg"] as const,
};
