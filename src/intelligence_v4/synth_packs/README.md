# Synthetic Pack Generator (v4)

This module generates deterministic, non-PII CSV packs for cross-industry v4 runpack coverage.

## Guarantees
- Deterministic output for a fixed `seed` + `industry` + `pack_id` + `window_days`.
- No raw personal data fields are emitted.
- `customers.csv` is intentionally never generated.
- IDs are synthetic (for example `EST_AGEN_0001`).

## Output Shape
Each generated pack directory contains:
- `pack.json`
- `estimates.csv`
- `invoices.csv`
- `schedule.csv` (only when relevant)

`pack.json` includes:
- `industry`
- `seed`
- `window_start`
- `window_end`
- `notes`
- `expected_patterns` (optional)
