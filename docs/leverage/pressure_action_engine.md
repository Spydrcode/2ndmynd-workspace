# Pressure Action Engine

The action engine turns pressures into evidence-linked, numeric moves while staying within doctrine.

## Source
- `src/lib/present/pressure_action_engine.ts`

## Inputs
- `snapshot` aggregates (window counts, lag bands, volatility)
- `benchmarks` (peer median + percentile)
- `pressure_key` (canonical)
- `industry_group` / `industry_key`

## Outputs
- `recommended_move` (numeric when metrics exist)
- `next_7_days` (2-3 concrete steps)
- `boundary` (safety condition)
- `action_degraded_missing_metric` (internal only)

## Rules
- Uses only snapshot/benchmark values (no invented metrics).
- If a metric is missing, degrades gracefully with clear operational moves.
- Top pressure drives `next_7_days`; secondary pressures only provide `recommended_move` + boundary.

## Tests
- `src/lib/present/__tests__/pressure_action_engine.test.ts`
- Confirms numeric targets when benchmarks exist and safe degradation otherwise.
