# Learning Layer - User Guide

## Overview

The Learning Layer enables 2ndmynd's Intelligence system to continuously improve by training small models on captured run data. It learns to:

- **Calibrate signals**: Map raw signals → accurate benchmark percentiles
- **Select pressures**: Predict top business pressures from features
- **Classify boundaries**: Determine appropriate safety boundaries

## Architecture

```
┌─────────────────┐
│  Pipeline Run   │
│  (Mock or Real) │
└────────┬────────┘
         │
         │ LEARNING_CAPTURE=true
         ▼
┌─────────────────┐
│ Feature Extract │ ◄── Privacy-safe aggregates only
│  + PII Guards   │     NO raw CSVs, NO customer data
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ SQLite Storage  │
│ ./runs/learning.db
└────────┬────────┘
         │
         │ Manual: Train Models
         ▼
┌─────────────────┐
│ Python Training │ ◄── scikit-learn
│  Harness        │     RandomForest models
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Model Storage   │
│ ./models/       │
└────────┬────────┘
         │
         │ LEARNING_INFERENCE=true
         ▼
┌─────────────────┐
│ Pipeline Augment│ ◄── Learned outputs enhance decisions
│ (Feature Flag)  │
└─────────────────┘
```

## Privacy & Safety

### What Gets Stored

✅ **Allowed** (aggregated features):
- Row counts: `quote_count`, `invoice_count`, `paid_invoice_count`
- Rates: `approval_rate`, `overdue_ratio`, `concentration_top5_share`
- Lags: `decision_lag_p50`, `invoiced_to_paid_p50`
- Trends: `volatility_index`, `seasonality_strength`, `revenue_trend_slope`
- Metadata: `window_days`, `coverage_ratio`, `mapping_confidence`

❌ **Forbidden** (PII / raw data):
- Customer names, addresses, emails, phone numbers
- Invoice/quote descriptions or line items
- Website scrape text
- Any identifiable information

### PII Guards

Hard fail if string features contain:
- Email patterns: `john@example.com`
- Phone patterns: `555-123-4567`
- Address patterns: `123 Main Street`

## Setup

### 1. Install Python Dependencies

```bash
pip install scikit-learn numpy joblib better-sqlite3
```

Or add to `requirements.txt`:

```
scikit-learn>=1.3.0
numpy>=1.24.0
joblib>=1.3.0
```

### 2. Enable Capture

In `.env.local`:

```bash
# Capture training examples from every run
LEARNING_CAPTURE=true

# Pipeline version (for model compatibility)
PIPELINE_VERSION=v2
```

### 3. Run Mock Tests

Captured examples populate `./runs/learning.db` automatically:

```bash
npm run dev
# Visit http://localhost:3000/app/testing?internal=1
# Run mock tests in different industries
```

## Training Models

### Via Internal UI

1. Navigate to Testing page: `/app/testing?internal=1`
2. Scroll to **Learning Layer** card
3. View dataset stats (mock vs real examples)
4. Click **Train Models** button
5. Monitor training progress
6. Check metrics when complete

### Via Python CLI

```bash
# Train all models
python src/lib/learning/train.py \
  --model all \
  --dataset ./runs/learning.db \
  --output ./models/

# Train specific model
python src/lib/learning/train.py \
  --model calibrator \
  --dataset ./runs/learning.db \
  --output ./models/ \
  --source mock

# Minimum 10 examples required
```

Output:
```
[CALIBRATOR] Training on 50 examples...
[CALIBRATOR] MAE: 5.23
[CALIBRATOR] Model saved to ./models/calibrator/v1

[PRESSURE] Training on 50 examples...
[PRESSURE] Precision@3: 0.714
[PRESSURE] Model saved to ./models/pressure_selector/v1

[BOUNDARY] Training on 50 examples...
[BOUNDARY] Accuracy: 0.820
[BOUNDARY] False-safe rate: 0.050 (CRITICAL)
[BOUNDARY] Model saved to ./models/boundary_classifier/v1
```

## Model Evaluation

### Via Python CLI

```bash
python src/lib/learning/evaluate.py \
  --models ./models/ \
  --dataset ./runs/learning.db \
  --output ./eval_out/
```

Output:
- `./eval_out/evaluation_results.json`
- `./eval_out/evaluation_report.md`

### Metrics

**Calibrator** (regression):
- `calibration_mae`: Mean absolute error on percentile predictions (lower is better)
- `calibration_stability`: Standard deviation of errors (lower is better)

**Pressure Selector** (multi-label classification):
- `pressure_precision_at_3`: Precision of top-3 pressure predictions
- `pressure_recall`: Recall across all pressures
- `pressure_f1`: F1 score

**Boundary Classifier** (safety-critical classification):
- `boundary_accuracy`: Overall classification accuracy
- `boundary_false_safe_rate`: **CRITICAL** - rate of predicting "stable" when unsafe (must minimize)

## Enabling Inference

Once models are trained and evaluated:

### 1. Enable Feature Flag

In `.env.local`:

```bash
# Apply learned models to pipeline outputs
LEARNING_INFERENCE=true
```

### 2. Verify Model Files

```bash
ls -la models/
# models/
#   calibrator/v1/
#     model.pkl
#     metadata.json
#   pressure_selector/v1/
#     model.pkl
#     metadata.json
#     pressure_keys.json
#   boundary_classifier/v1/
#     model.pkl
#     metadata.json
#     class_names.json
#   training_summary.json
```

### 3. Restart Server

```bash
npm run dev
```

Models will automatically augment pipeline outputs with learned insights.

## Labeling Examples

Add human feedback to improve model quality:

### Via API

```bash
curl -X POST http://localhost:3000/api/internal/learning/label \
  -H "Content-Type: application/json" \
  -d '{
    "id": "example-id-123",
    "labels": {
      "reviewer_score": 3,
      "reviewer_notes": "Excellent pressure identification",
      "client_feedback": "up"
    }
  }'
```

### Label Schema

```typescript
{
  reviewer_score?: 0 | 1 | 2 | 3;     // 0=bad, 3=excellent
  reviewer_notes?: string;
  client_feedback?: "up" | "down";
  client_feedback_reason?: string;
  mapping_was_wrong?: boolean;
  outcome_next_step_chosen?: boolean;
}
```

Labeled examples improve future training runs.

## Production Deployment

### Security

**Multi-layer protection**:

1. **Feature flag disabled by default**: `LEARNING_INFERENCE` must be explicitly enabled
2. **Production lockout**: Requires `ALLOW_INTERNAL_LEARNING=true` in production
3. **Token authentication**: Set `INTERNAL_LEARNING_TOKEN` for API access
4. **File isolation**: All data in `./runs/learning.db` (not main database)

### Environment Variables

Production `.env`:

```bash
# Enable learning capture (captures from real client runs)
LEARNING_CAPTURE=true

# Enable inference (applies learned models)
LEARNING_INFERENCE=true

# Production safety
ALLOW_INTERNAL_LEARNING=true
INTERNAL_LEARNING_TOKEN=<secure-random-token>

# Pipeline version
PIPELINE_VERSION=v2

# Python path (if not in PATH)
PYTHON_PATH=/usr/bin/python3
```

### API Authentication

All internal learning APIs require token in production:

```bash
curl -X POST /api/internal/learning/train \
  -H "x-2ndmynd-internal: <token>" \
  -H "Content-Type: application/json" \
  -d '{"model": "all", "source": "all"}'
```

## Monitoring

### Dataset Stats

```bash
curl http://localhost:3000/api/internal/learning/dataset
```

Response:
```json
{
  "exists": true,
  "total_count": 150,
  "mock_count": 100,
  "real_count": 50,
  "labeled_count": 20,
  "industries": {
    "hvac": 60,
    "plumbing": 40,
    "electrical": 30,
    "landscaping": 20
  },
  "earliest_date": "2026-01-15T10:00:00Z",
  "latest_date": "2026-02-03T15:30:00Z"
}
```

### Training Job Status

```bash
curl http://localhost:3000/api/internal/learning/status?job_id=abc123
```

Response:
```json
{
  "job_id": "abc123",
  "status": "done",
  "model_name": "all",
  "examples_count": 150,
  "model_version": "v1",
  "metrics": {
    "calibration_mae": 5.23,
    "pressure_precision_at_3": 0.714,
    "boundary_accuracy": 0.820,
    "boundary_false_safe_rate": 0.050
  },
  "completed_at": "2026-02-03T16:00:00Z"
}
```

## Troubleshooting

### "No training data found"

**Cause**: `LEARNING_CAPTURE` not enabled or no runs completed.

**Fix**:
1. Add `LEARNING_CAPTURE=true` to `.env.local`
2. Restart server: `npm run dev`
3. Run mock tests or wait for real client runs
4. Check: `ls -la runs/learning.db`

### "Insufficient training data"

**Cause**: Fewer than 10 examples in database.

**Fix**: Run more mock tests to generate examples.

### "Python command not found"

**Cause**: Python not in PATH or wrong Python version.

**Fix**:
1. Install Python 3.8+: `python3 --version`
2. Set custom path: `PYTHON_PATH=/usr/bin/python3`
3. Restart server

### "PII detected" error

**Cause**: Feature extraction trying to store string field with PII patterns.

**Fix**: This is working correctly! PII guards prevented privacy leak. Check feature extraction logic to ensure only aggregated values are captured.

### High false-safe rate

**Cause**: Boundary classifier predicting "stable" when actually unsafe.

**Fix**:
1. Add more labeled examples with correct boundaries
2. Increase training data (especially real runs)
3. Review boundary class inference logic
4. Consider ensemble methods or manual overrides for critical cases

## Best Practices

### Data Quality

1. **Balanced dataset**: Mix mock and real runs (aim for 30%+ real)
2. **Industry diversity**: Capture examples across all industries
3. **Label important cases**: Add reviewer scores for edge cases
4. **Version tracking**: Record `pipeline_version` and `generator_version`

### Training Schedule

1. **Initial training**: After 50+ mock runs (establish baseline)
2. **Incremental updates**: Weekly or bi-weekly with new real runs
3. **Validation**: Always evaluate on held-out test set
4. **A/B testing**: Compare learned vs deterministic outputs before full rollout

### Safety

1. **Monitor false-safe rate**: Must be < 0.05 (5%)
2. **Human review**: Always review boundary classifier outputs
3. **Graceful fallback**: If inference fails, use deterministic pipeline
4. **Audit trail**: Log when learned models are applied

## Files Reference

```
src/lib/learning/
├── types.ts                    # Type definitions
├── build_training_example_v1.ts # Feature extraction + PII guards
├── store.ts                    # SQLite storage layer
├── capture.ts                  # Pipeline capture hook
├── train.py                    # Python training harness
├── evaluate.py                 # Model evaluation
├── infer.ts                    # TypeScript inference wrapper
├── infer.py                    # Python inference script
└── __tests__/
    ├── pii_guards.test.ts      # PII safety tests
    └── feature_extraction.test.ts # Feature tests

src/app/api/internal/learning/
├── train/route.ts              # POST /api/internal/learning/train
├── status/route.ts             # GET /api/internal/learning/status
├── dataset/route.ts            # GET /api/internal/learning/dataset
└── label/route.ts              # POST /api/internal/learning/label

runs/
├── learning.db                 # SQLite training dataset
└── _learning_jobs/             # Training job status files

models/
├── calibrator/v1/              # Calibration model
├── pressure_selector/v1/       # Pressure selection model
├── boundary_classifier/v1/     # Boundary classification model
└── training_summary.json       # Last training summary
```

## Next Steps

1. **Capture baseline**: Run 50+ mock tests across industries
2. **Train initial models**: `python train.py --model all`
3. **Evaluate**: Check metrics, especially false-safe rate
4. **Enable inference**: Set `LEARNING_INFERENCE=true` (dev only initially)
5. **Compare outputs**: Run same mock tests with/without inference
6. **Collect real data**: Enable `LEARNING_CAPTURE` in production (after validation)
7. **Incremental improvement**: Weekly training updates with new data
8. **Human-in-loop**: Add labels for important cases

## Questions?

The Learning Layer is designed to be:
- **Safe**: Multi-layer PII guards + production lockouts
- **Isolated**: Separate database, disabled by default
- **Transparent**: Full audit trail + metrics
- **Gradual**: Enable feature-by-feature with flags

Start small, validate thoroughly, scale carefully.
