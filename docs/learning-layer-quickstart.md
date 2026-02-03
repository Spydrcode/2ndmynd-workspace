# Learning Layer - Quick Start

## What is the Learning Layer?

The Learning Layer enables 2ndmynd to **learn from every run** (mock and real) to continuously improve:
- Signal calibration (benchmark percentiles)
- Pressure selection (which business pressures to highlight)
- Boundary classification (safety guidance)

## Quick Start (5 minutes)

### 1. Enable Capture

Add to `.env.local`:

```bash
LEARNING_CAPTURE=true
NEXT_PUBLIC_INTERNAL_TESTING=true
```

### 2. Generate Training Data

```bash
npm run dev
```

Visit `http://localhost:3000/app/testing?internal=1`

Run 20+ mock tests across different industries.

### 3. Train Models

```bash
npm run learning:train
```

Or use the internal UI:
- Scroll to "Learning Layer" card
- Click "Train All Models"
- Wait ~30 seconds
- Check metrics

### 4. Enable Inference (Optional)

Add to `.env.local`:

```bash
LEARNING_INFERENCE=true
```

Restart server. Models will now augment pipeline outputs.

## What Gets Captured?

✅ **Privacy-safe aggregates**:
- Row counts, percentages, rates
- Median lags, volatility indexes
- Benchmark percentiles
- Pressure keys (triggered/not triggered)
- Boundary classes

❌ **Never stored**:
- Customer names, emails, phones
- Invoice/quote descriptions
- Website scrape text
- Any PII

## File Structure

```
runs/
  learning.db              # SQLite training dataset

models/
  calibrator/v1/           # Signal calibration model
  pressure_selector/v1/    # Pressure selection model
  boundary_classifier/v1/  # Boundary classifier
  training_summary.json    # Last training run

src/lib/learning/
  types.ts                 # Type definitions
  build_training_example_v1.ts  # Feature extraction
  store.ts                 # SQLite storage
  capture.ts               # Pipeline capture hook
  train.py                 # Training harness
  evaluate.py              # Model evaluation
  infer.ts / infer.py      # Inference
```

## NPM Scripts

```bash
# Train all models
npm run learning:train

# Train individual models
npm run learning:train:calibrator
npm run learning:train:pressure
npm run learning:train:boundary

# Evaluate models
npm run learning:evaluate
```

## API Endpoints (Internal Only)

```bash
# Get dataset stats
GET /api/internal/learning/dataset

# Train models
POST /api/internal/learning/train
{
  "model": "all",  // or calibrator, pressure_selector, boundary_classifier
  "source": "all"  // or mock, real
}

# Check training status
GET /api/internal/learning/status?job_id=xxx

# Add labels
POST /api/internal/learning/label
{
  "id": "example-id",
  "labels": {
    "reviewer_score": 3,  // 0-3
    "client_feedback": "up"
  }
}
```

## Environment Variables

```bash
# Capture training examples from runs
LEARNING_CAPTURE=true

# Apply learned models to pipeline
LEARNING_INFERENCE=true

# Production safety (required in production)
ALLOW_INTERNAL_LEARNING=true
INTERNAL_LEARNING_TOKEN=<secure-token>

# Pipeline version (for compatibility)
PIPELINE_VERSION=v2

# Python path (if not in PATH)
PYTHON_PATH=/usr/bin/python3
```

## Key Metrics

**Calibrator**:
- MAE < 10 (percentile error)
- Lower is better

**Pressure Selector**:
- Precision@3 > 0.6 (top 3 pressures correct)
- Higher is better

**Boundary Classifier**:
- Accuracy > 0.75
- **False-safe rate < 0.05** ⚠️ CRITICAL (must not predict "stable" when unsafe)

## Safety Features

1. **PII Guards**: Hard fail if email/phone/address patterns detected
2. **Production Lockout**: Disabled by default, requires explicit flags
3. **Token Auth**: Required for API access in production
4. **File Isolation**: Separate SQLite DB, not main database
5. **Graceful Fallback**: If inference fails, use deterministic pipeline

## Next Steps

1. **Read full guide**: [docs/learning-layer.md](./learning-layer.md)
2. **Review code**: `src/lib/learning/`
3. **Run tests**: `npm test -- src/lib/learning/__tests__/`
4. **Monitor metrics**: Check false-safe rate after training
5. **Label examples**: Add reviewer scores for important cases

## Questions?

The Learning Layer is:
- **Safe**: Multi-layer PII guards
- **Isolated**: Separate storage, disabled by default
- **Transparent**: Full metrics and audit trail
- **Gradual**: Enable feature-by-feature

Start with mock runs, validate thoroughly, scale carefully.
