# Cohort Engine

## Overview

The **Cohort/Shape Engine** classifies business signals into clusters (k=8).

**Purpose**: Provide context-rich benchmarking by grouping similar businesses.

**Output**:
- `cohort_id` (0-7)
- `cohort_label` (e.g., "cohort_2")
- `expected_ranges` for 12-20 metrics (min, max, median, p25, p75)

**Doctrine**: **Augmentative only** - adds context, NEVER overwrites computed metrics.

## Configuration

Add to `.env`:

```bash
# Cohort Engine
COHORT_ENGINE_ENABLED=false              # Enable/disable cohort inference
COHORT_ENGINE_MODEL_VERSION=latest       # Model version or "latest"
REQUIRE_PYTHON_WIRING=0                  # Require Python for cohort inference (0 or 1)
```

## Training

### 1. Train Model

```bash
npm run cohort:train
```

This calls `packages/cohort_engine/train_cohorts.py`:

**Inputs**:
- Training data: `data/learning/train/*.jsonl`
- Features: 18 numeric signals from `signals_v1`

**Outputs**:
- `models/cohort_engine/v{timestamp}/model.pkl` (KMeans + Scaler)
- `models/cohort_engine/v{timestamp}/ranges.json` (Expected ranges per cohort)
- `models/cohort_engine/v{timestamp}/meta.json` (Metadata)

**Algorithm**: KMeans (k=8, standardized features)

### 2. Evaluate Model

```bash
npm run cohort:evaluate -- --model_version=v20260205_120000
```

This calls `packages/cohort_engine/evaluate_cohorts.py`:

**Metrics**:
- **Silhouette score**: Cluster quality (0-1, higher is better)
- **Stability ARI**: Adjusted Rand Index on re-sampling (0-1, higher is better)
- **Outlier rate**: Pct of clusters below min size threshold
- **Min cluster size**: Smallest cluster size

### 3. Promote Model

```bash
npm run cohort:promote -- --model_version=v20260205_120000
```

This applies **promotion gates**:

| Gate | Threshold | Rationale |
|------|-----------|-----------|
| `silhouette_score` | ≥ 0.15 | Cluster quality |
| `stability_ari` | ≥ 0.60 | Consistency across samples |
| `outlier_rate` | ≤ 0.12 | Max 12% tiny clusters |
| `min_cluster_size` | ≥ max(50, 0.02*N) | Each cluster has ≥50 examples |

If all gates pass:
- Update `meta.json` with `promoted: true`
- Update `models/cohort_engine/LATEST.json` pointer

### 4. Full Pipeline

```bash
npm run cohort:train_all
```

Runs: `train` → `evaluate` → `promote`

## Inference

### Node API

```typescript
import { inferCohort } from "@/lib/cohort_engine/infer";
import type { SignalsV1Record } from "@/lib/learning/types";

const features: SignalsV1Record = {
  total_revenue: 150000,
  total_jobs: 50,
  avg_job_value: 3000,
  // ... other features
};

const result = await inferCohort(features);

if (result) {
  console.log(`Cohort: ${result.cohort_id}`);
  console.log(`Confidence: ${result.confidence.toFixed(2)}`);
  console.log(`Expected ranges:`, result.expected_ranges);
}
```

### Internal API

```bash
# Get model status
curl "http://localhost:3000/api/internal/runtime/models?internal=1"
```

Response:
```json
{
  "cohort_engine": {
    "enabled": true,
    "model_version": "v20260205_120000",
    "promoted": true,
    "available": true,
    "silhouette_score": 0.18,
    "stability_ari": 0.65,
    "outlier_rate": 0.08,
    "min_cluster_size": 120,
    "training_rows": 3500,
    "trained_at": "2026-02-05T12:00:00Z"
  }
}
```

## Wiring

Cohort inference is automatically called in `run_analysis.ts`:

```typescript
// Extract signals
const signals = extractSignalsV1({ run_id, result: { snapshot, layer_fusion, business_profile, conclusion } });

// Infer cohort
const cohort_inference = await inferCohort(signals);

// Pass to artifact builder
const decision_artifact = buildDecisionArtifact({
  snapshot,
  conclusion,
  layer_fusion,
  business_profile,
  readiness_level,
  diagnose_mode,
  mapping_confidence,
  benchmarks,
  cohort_inference, // ← Wired here
});
```

The artifact includes `cohort_context` field:

```json
{
  "version": "v1",
  "takeaway": "...",
  "cohort_context": {
    "cohort_id": 2,
    "cohort_label": "cohort_2",
    "confidence": 0.85,
    "expected_ranges": [
      {
        "metric_key": "avg_job_value",
        "min": 2000,
        "max": 5000,
        "median": 3500,
        "p25": 2800,
        "p75": 4200
      }
    ]
  }
}
```

## Features Used

The cohort engine uses **18 numeric features** from `signals_v1`:

- `total_revenue`
- `total_jobs`
- `avg_job_value`
- `total_quoted_amount`
- `total_quoted_jobs`
- `pct_quoted_won`
- `avg_quote_to_win_days`
- `avg_days_to_invoice`
- `avg_payment_lag_days`
- `pct_jobs_paid_on_time`
- `avg_job_duration_days`
- `pct_jobs_with_followup`
- `avg_items_per_job`
- `revenue_concentration_top3`
- `pct_revenue_top_client`
- `window_days`
- `jobs_per_month_rate`
- `revenue_per_month_rate`

**Excluded**: String enums (`industry_key`, `source`, `window_rule`)

## Benchmarkable Metrics

Expected ranges are provided for **12 metrics**:

1. `avg_job_value`
2. `total_revenue`
3. `total_jobs`
4. `avg_days_to_invoice`
5. `avg_payment_lag_days`
6. `pct_jobs_paid_on_time`
7. `pct_quoted_won`
8. `avg_quote_to_win_days`
9. `avg_job_duration_days`
10. `pct_jobs_with_followup`
11. `avg_items_per_job`
12. `revenue_concentration_top3`

## Testing

```bash
# Run cohort engine tests
npm test -- cohort_engine_contract

# Verify config
npm test -- cohort_engine
```

## Python Requirements

```bash
pip install scikit-learn numpy pandas
```

## Troubleshooting

**"Python wiring required but not enabled"**:
- Set `REQUIRE_PYTHON_WIRING=1` in .env
- Or disable: `REQUIRE_PYTHON_WIRING=0`

**"Model directory not found"**:
- Run `npm run cohort:train` first
- Check `models/cohort_engine/` directory

**"LATEST.json not found"**:
- No promoted model yet
- Run `npm run cohort:promote` after training

**Promotion gates fail**:
- Check metrics in `meta.json`
- Retrain with more data
- Adjust gates if appropriate (with team approval)

## Architecture

```
Training Flow:
  train_cohorts.py
    → KMeans clustering (k=8)
    → Compute expected ranges per cohort
    → Save model.pkl + ranges.json + meta.json

Evaluation Flow:
  evaluate_cohorts.py
    → Load model + data
    → Compute silhouette, stability_ari, outlier_rate
    → Update meta.json

Promotion Flow:
  promote_cohort_engine.ts
    → Load meta.json
    → Apply gates
    → Update LATEST.json pointer

Inference Flow:
  API call → extractSignalsV1() → inferCohort() → buildDecisionArtifact()
    → Artifact with cohort_context
```
