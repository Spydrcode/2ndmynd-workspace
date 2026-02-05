# Benchmark Narratives

Benchmarks are rendered as short owner-felt insights rather than KPI panels.

## Source
- `src/lib/present/benchmark_narratives.ts`

## Formatter
`formatBenchmarkInsight({ metric_key, value, peer_median, percentile, direction, industry_group })`

## Rules
- One headline + one "so what" sentence per metric.
- Owner-felt language varies by `IndustryGroup`.
- No dashboard or monitoring language.
- If `peer_median` is missing, returns a safe "context unavailable" line plus an actionable cue.

## UI Integration
- Benchmarks accordion in `src/app/app/results/[run_id]/DecisionArtifactView.tsx`.
- Shows:
  - headline
  - so_what
  - small numeric line (you vs peer median + percentile)

## Tests
- `src/lib/present/__tests__/benchmark_narratives.test.ts`
