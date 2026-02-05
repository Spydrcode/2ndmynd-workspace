# Hugging Face Dataset Export

## Overview

Exports privacy-safe `signals_v1` training data to Hugging Face datasets.

**Purpose**: Enable external ML training, model sharing, and reproducible research.

**Safety Guarantees**:
- ✅ Only allowlisted numeric/enum features
- ✅ PII guards enforced (emails, phones rejected)
- ✅ NO raw CSV rows or text blobs
- ✅ NO RAG context (verified by tests)
- ✅ Schema versioning with hash tracking

## Configuration

Add to `.env`:

```bash
# Hugging Face Export
HF_TOKEN=hf_...                                  # HF API token
HF_DATASET_REPO=2ndmynd/signals_v1_private       # Target repo
HF_DATASET_PRIVATE=true                          # Keep dataset private
HF_EXPORT_ENABLED=false                          # Enable/disable export
HF_EXPORT_MAX_ROWS=50000                         # Row limit
HF_EXPORT_SPLIT_STRATEGY=by_source_industry      # Split strategy
HF_EXPORT_OUT_DIR=runs/hf_export                 # Local output directory
```

## Usage

### CLI Export

```bash
# Export all training data
npm run hf:export

# Filter by source
npm run hf:export -- --source=mock

# Filter by industry
npm run hf:export -- --industry=hvac

# Limit rows
npm run hf:export -- --max-rows=1000

# Push to HF Hub
npm run hf:export -- --push

# Custom output directory
npm run hf:export -- --out-dir=./my_export
```

### Internal API

```bash
# Start export job (background)
curl -X POST "http://localhost:3000/api/internal/hf/export?internal=1" \
  -H "Content-Type: application/json" \
  -d '{"source": "mock", "push": true}'

# Check job status
curl "http://localhost:3000/api/internal/hf/status?internal=1&job_id=<uuid>"
```

## Output Structure

```
runs/hf_export/{job_id}/
├── dataset.jsonl           # Main dataset (JSONL format)
├── dataset_info.json       # Metadata (schema hash, row counts)
└── splits/                 # Optional splits
    ├── mock_hvac.jsonl
    ├── mock_plumbing.jsonl
    ├── real_hvac.jsonl
    └── ...
```

### dataset.jsonl Format

```json
{
  "example_id": "ex_001",
  "created_at": "2026-01-01T00:00:00Z",
  "source": "mock",
  "industry_key": "hvac",
  "schema_version": "signals_v1",
  "schema_hash": "a1b2c3d4",
  "window_rule": "last_90_days",
  "features": {
    "total_revenue": 150000,
    "total_jobs": 50,
    "avg_job_value": 3000,
    ...
  },
  "targets": {
    "boundary_class": "healthy",
    "pressure_keys": []
  },
  "labels": {
    "reviewer_score": 5,
    "mapping_was_wrong": false
  }
}
```

## Feature Allowlist

The export includes **70 deterministic features** from `signals_v1`:

**String Enums (3)**:
- `industry_key`
- `source`
- `window_rule`

**Numeric Features (67)**:
- Revenue metrics (total_revenue, avg_job_value, etc.)
- Volume metrics (total_jobs, total_quoted_jobs, etc.)
- Timing metrics (avg_days_to_invoice, avg_payment_lag_days, etc.)
- Ratio metrics (pct_jobs_paid_on_time, pct_quoted_won, etc.)

**Blocked Fields** (never exported):
- `rag_*` - RAG context
- `website_*` - Website scans
- `tool_*` - Raw tool outputs
- `raw_*`, `content_*`, `summary_*` - Text blobs

## Schema Versioning

Each export includes a **schema_hash** computed from:
- Feature keys (ordered)
- Schema version (`signals_v1`)

Example: `schema_hash: "a1b2c3d4"`

If features change, the hash changes → version incompatibility detected.

## PII Guards

All exports are validated by `guardAgainstPII()`:

**Rejection Patterns**:
- Email: `/@/`
- Phone: `/\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/`
- Long strings: >100 chars
- Unexpected string values

**Test Coverage**:
- `src/lib/hf_export/__tests__/hf_export_safety.test.ts`

## Python Helper

The `push_to_hf.ts` module calls `scripts/hf/push_dataset.py`:

```bash
python scripts/hf/push_dataset.py \
  --bundle-dir=./runs/hf_export/123 \
  --repo=2ndmynd/signals_v1_private \
  --commit-message="Update signals_v1 dataset" \
  --private
```

**Requirements**:
```bash
pip install huggingface_hub
```

## Testing

```bash
# Run HF export tests
npm test -- hf_export_safety

# Verify schema hash stability
npm test -- hf_export
```

## Architecture

```
CLI (export_signals_dataset.ts)
  ↓
[Load training examples from data/learning/train/*.jsonl]
  ↓
Build HF Rows (build_dataset_row.ts)
  - Apply feature allowlist
  - Run PII guards
  - Compute schema hash
  ↓
Export Local Bundle (export_local.ts)
  - Write dataset.jsonl
  - Write dataset_info.json
  - Create splits (if enabled)
  ↓
Push to HF (push_to_hf.ts)
  - Call Python helper
  - Upload to HF Hub
  - Return revision
```

## Troubleshooting

**"PII detected" error**:
- Check string features for emails/phones
- Review allowlist in `types.ts`
- Run `guardAgainstPII()` standalone

**"No valid rows to export"**:
- Ensure training data exists in `data/learning/train/`
- Check filters (source, industry)
- Verify PII guards aren't too strict

**Python push fails**:
- Install: `pip install huggingface_hub`
- Set `HF_TOKEN` in .env
- Check network/HF Hub status

**Schema hash mismatch**:
- Features changed → update `SIGNALS_V1_KEYS`
- Retrain models with new schema
- Document breaking change
