# 2ndmynd Leverage Systems - Quick Reference

## Hugging Face Dataset Export

```bash
# Export training data to HF format
npm run hf:export

# With filters
npm run hf:export -- --source=mock --industry=hvac --max-rows=1000

# Push to HF Hub
npm run hf:export -- --push --repo=2ndmynd/signals_v1_private

# Check job status (API)
curl "http://localhost:3000/api/internal/hf/status?internal=1&job_id=<uuid>"
```

**Docs**: [docs/leverage/hf_dataset.md](./hf_dataset.md)

## Cohort Engine

```bash
# Train new cohort model
npm run cohort:train

# Evaluate model
npm run cohort:evaluate -- --model_version=v20260205_120000

# Promote model (if gates pass)
npm run cohort:promote -- --model_version=v20260205_120000

# Full pipeline: train → evaluate → promote
npm run cohort:train_all

# Check model status (API)
curl "http://localhost:3000/api/internal/runtime/models?internal=1"
```

**Docs**: [docs/leverage/cohort_engine.md](./cohort_engine.md)

## Local Embeddings

```bash
# Install Python dependencies
pip install sentence-transformers torch

# Apply Supabase migration
supabase migration up

# Set in .env
LOCAL_EMBEDDINGS_ENABLED=true
LEARNING_VECTOR_BACKEND=local

# Test single embedding
python src/lib/learning/vector_index/local_embed.py \
  --text="HVAC mock 50 jobs $150k revenue" \
  --output=embedding.json

# Test batch
python src/lib/learning/vector_index/local_embed.py \
  --batch_file=texts.jsonl \
  --output=embeddings.jsonl
```

**Docs**: [docs/leverage/local_embeddings.md](./local_embeddings.md)

## Environment Variables

```bash
# HF Export
HF_TOKEN=hf_...
HF_DATASET_REPO=2ndmynd/signals_v1_private
HF_EXPORT_ENABLED=false
HF_EXPORT_MAX_ROWS=50000

# Cohort Engine
COHORT_ENGINE_ENABLED=false
COHORT_ENGINE_MODEL_VERSION=latest

# Local Embeddings
LOCAL_EMBEDDINGS_ENABLED=false
LOCAL_EMBEDDINGS_MODEL=sentence-transformers/all-MiniLM-L6-v2
LOCAL_EMBEDDINGS_DIM=384
LEARNING_VECTOR_BACKEND=local

# Python Wiring
REQUIRE_PYTHON_WIRING=0
```

## Testing

```bash
# HF Export
npm test -- hf_export_safety

# Cohort Engine
npm test -- cohort_engine_contract

# Local Embeddings
npm test -- local_embeddings_backend

# All wiring checks
npm run audit:wiring
```

## Architecture Decisions

### HF Export
- **Allowlist-only**: 70 features from signals_v1, explicitly ordered
- **PII guards**: Email, phone, long strings rejected
- **NO RAG**: RAG context NEVER enters export
- **Schema versioning**: Hash-based compatibility tracking

### Cohort Engine
- **Augmentative**: Adds context, never overwrites metrics
- **KMeans clustering**: k=8 cohorts
- **Promotion gates**: Silhouette ≥0.15, ARI ≥0.60, outlier ≤12%
- **Expected ranges**: 12 benchmarkable metrics per cohort

### Local Embeddings
- **Privacy-first**: 100% local, no API calls
- **384-d vectors**: sentence-transformers/all-MiniLM-L6-v2
- **Supabase storage**: pgvector with HNSW index
- **Graceful fallback**: JSONL if Python unavailable

## Troubleshooting

### HF Export
- **PII error**: Check `guardAgainstPII()` patterns
- **No rows**: Ensure `data/learning/train/*.jsonl` exists
- **Push fails**: Install `pip install huggingface_hub`

### Cohort Engine
- **No model**: Run `npm run cohort:train` first
- **Gates fail**: Check `meta.json` metrics, retrain with more data
- **Python not found**: Set `REQUIRE_PYTHON_WIRING=0` for graceful fallback

### Local Embeddings
- **Import error**: `pip install sentence-transformers torch`
- **Dim mismatch**: Verify LOCAL_EMBEDDINGS_DIM=384
- **Supabase error**: Run `supabase migration up`

## Files Created

### HF Export
- `src/lib/hf_export/types.ts`
- `src/lib/hf_export/build_dataset_row.ts`
- `src/lib/hf_export/export_local.ts`
- `src/lib/hf_export/push_to_hf.ts`
- `scripts/hf/export_signals_dataset.ts`
- `scripts/hf/push_dataset.py`
- `src/app/api/internal/hf/export/route.ts`
- `src/app/api/internal/hf/status/route.ts`

### Cohort Engine
- `src/lib/cohort_engine/types.ts`
- `src/lib/cohort_engine/config.ts`
- `src/lib/cohort_engine/infer.ts`
- `packages/cohort_engine/train_cohorts.py`
- `packages/cohort_engine/evaluate_cohorts.py`
- `packages/cohort_engine/infer_cohort.py`
- `scripts/ml/promote_cohort_engine.ts`
- `src/app/api/internal/runtime/models/route.ts`

### Local Embeddings
- `src/lib/learning/vector_index/local_embed.py`
- `src/lib/learning/vector_index/local_embed.ts`
- `supabase/migrations/20260205000000_learning_vectors_384_v1.sql`

### Documentation
- `docs/leverage/hf_dataset.md`
- `docs/leverage/cohort_engine.md`
- `docs/leverage/local_embeddings.md`

## Status Endpoints

```bash
# HF export job status
GET /api/internal/hf/status?internal=1&job_id=<uuid>

# Model status (cohort engine)
GET /api/internal/runtime/models?internal=1
```

## Safety Invariants

✅ **HF Export**: Only allowlisted features, PII rejected, NO RAG
✅ **Cohort Engine**: Augmentative only, never overwrites metrics
✅ **Local Embeddings**: Only sanitized summaries, NO PII, NO RAG
✅ **All Systems**: Fail gracefully if Python unavailable
