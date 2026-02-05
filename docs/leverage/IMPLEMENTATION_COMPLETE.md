# Leverage ML Systems - Implementation Complete

## Summary

Successfully implemented **"Leverage" ML upgrade** with 4 major components:

### ✅ Part A: Hugging Face Dataset Export
- Privacy-safe export of `signals_v1` features (70 ordered features)
- PII guards enforced (email, phone patterns rejected)
- Schema versioning (hash-based compatibility)
- NO RAG context (verified by tests)
- CLI + Internal API routes
- Python helper for HF Hub upload

**Files Created**: 8 files in `src/lib/hf_export/`, `scripts/hf/`, `src/app/api/internal/hf/`

### ✅ Part B: Cohort/Shape Engine
- KMeans clustering (k=8) on `signals_v1` features
- Expected ranges for 12 benchmarkable metrics
- Augmentative only (adds context, never overwrites)
- Promotion gates (silhouette, stability_ari, outlier_rate)
- Python training + Node inference wrapper
- Wired into `run_analysis.ts` → artifact builder

**Files Created**: 9 files in `src/lib/cohort_engine/`, `packages/cohort_engine/`, `scripts/ml/`

### ✅ Part C: Evaluation Gates & Model Status
- Model promotion with quality gates
- LATEST.json pointer system
- Internal API for model status
- Promotion script with gate validation

**Files Created**: 2 files in `scripts/ml/`, `src/app/api/internal/runtime/models/`

### ✅ Part D: Local Embeddings Backend
- sentence-transformers/all-MiniLM-L6-v2 (384-d)
- Supabase pgvector table with HNSW index
- Python embedding generator + Node wrapper
- Backend wiring in `index_client.ts`
- Graceful fallback to JSONL if Python unavailable

**Files Created**: 4 files in `src/lib/learning/vector_index/`, `supabase/migrations/`

### ✅ Documentation
- 3 comprehensive docs: HF dataset, Cohort engine, Local embeddings
- Quickstart guide with all commands
- Architecture diagrams and troubleshooting

**Files Created**: 4 docs in `docs/leverage/`

## Architecture Guarantees

### ✅ NO PII
- HF export: `guardAgainstPII()` enforced on all features
- Local embeddings: Only sanitized summaries embedded
- Cohort engine: Uses numeric signals only, no text

### ✅ NO RAG in Learning/ML
- HF export: RAG fields blocked by pattern matching
- Cohort engine: Trained on `signals_v1` only (RAG-free)
- Local embeddings: Summary built from signals, no RAG context
- Tests verify: `rag_*`, `website_*`, `tool_*` fields rejected

### ✅ Augmentative Behavior
- Cohort engine adds `cohort_context` to artifacts
- NEVER overwrites computed metrics
- Client sees both computed values AND expected ranges
- Doctrine preserved: finite artifact, not dashboard

### ✅ Internal Guard Consistency
- All new internal routes use `internal_guard.ts`
- Dev: requires `?internal=1` query param
- Prod: requires `ALLOW_INTERNAL_TESTING=true` + header
- Consistent 404/401 responses

### ✅ Python Wiring
- All Python scripts have Node wrappers
- Graceful fallback if Python unavailable
- `REQUIRE_PYTHON_WIRING` flag controls strictness
- No silent failures - logs warnings clearly

## New npm Scripts

```bash
# HF Export
npm run hf:export                           # Export training data to HF format

# Cohort Engine
npm run cohort:train                        # Train KMeans model
npm run cohort:evaluate -- --model_version=... # Evaluate model
npm run cohort:promote -- --model_version=...  # Promote if gates pass
npm run cohort:train_all                    # Full pipeline

# Testing
npm test -- hf_export_safety                # HF export tests
npm test -- cohort_engine_contract          # Cohort tests
npm test -- local_embeddings_backend        # Embeddings tests
```

## Environment Variables

All new systems are **disabled by default**:

```bash
# HF Export
HF_EXPORT_ENABLED=false                     # Default: disabled
HF_TOKEN=                                   # Required for push

# Cohort Engine
COHORT_ENGINE_ENABLED=false                 # Default: disabled
COHORT_ENGINE_MODEL_VERSION=latest          # Points to promoted model

# Local Embeddings
LOCAL_EMBEDDINGS_ENABLED=false              # Default: disabled
LEARNING_VECTOR_BACKEND=none                # Options: local|openai|supabase|pinecone|none

# Python Wiring
REQUIRE_PYTHON_WIRING=0                     # 0=graceful fallback, 1=strict
```

## Safety Test Coverage

**Created 3 test files**:
1. `src/lib/hf_export/__tests__/hf_export_safety.test.ts`
   - PII rejection (email, phone)
   - Feature allowlist enforcement
   - RAG exclusion
   - Schema hash stability

2. `src/lib/cohort_engine/__tests__/cohort_engine_contract.test.ts`
   - Config reads from environment
   - Availability checks
   - Augmentative behavior (no metric overwriting)
   - Inference contract

3. `src/lib/learning/vector_index/__tests__/local_embeddings_backend.test.ts`
   - Config reads from environment
   - Backend wiring (LEARNING_VECTOR_BACKEND=local)
   - 384-d dimension verification
   - PII safety (only sanitized summaries)
   - RAG exclusion

## Files Modified

**Core Intelligence Pipeline**:
- `src/lib/intelligence/run_analysis.ts` - Added cohort inference
- `src/lib/present/build_decision_artifact.ts` - Added cohort_context field
- `src/lib/types/decision_artifact.ts` - Added CohortContextV1 type
- `src/lib/learning/vector_index/index_client.ts` - Added local backend support

**Configuration**:
- `.env.example` - Added 15+ new environment variables
- `package.json` - Added 5 new npm scripts

## TypeScript Errors Fixed

✅ All TypeScript compile errors resolved:
- Removed unused imports
- Fixed ChildProcess type annotations
- Fixed test type issues (BoundaryClass, reviewer_score, client_feedback)
- Added missing `vi` import for vitest mocks
- Fixed cohort engine type import paths

## Wiring Verification

All 4 critical wiring tests still passing:
1. ✅ MCP tool registry
2. ✅ RAG safety
3. ✅ E2E pipeline
4. ✅ E2E learning

**No regressions introduced.**

## PR-Ready Checklist

- ✅ All TypeScript errors fixed
- ✅ New features disabled by default
- ✅ Comprehensive documentation written
- ✅ Tests created for all new systems
- ✅ Internal guard consistently applied
- ✅ RAG safety invariants preserved
- ✅ PII guards enforced everywhere
- ✅ Python fallback mechanisms in place
- ✅ No breaking changes to existing code
- ✅ Artifact doctrine preserved (finite, not dashboard)
- ✅ Owner language maintained (calm, technical)

## Next Steps

1. **Enable Systems** (when ready):
   ```bash
   HF_EXPORT_ENABLED=true
   COHORT_ENGINE_ENABLED=true
   LOCAL_EMBEDDINGS_ENABLED=true
   ```

2. **Train Cohort Model**:
   ```bash
   npm run cohort:train_all
   ```

3. **Export Dataset**:
   ```bash
   npm run hf:export -- --push
   ```

4. **Apply Supabase Migration**:
   ```bash
   supabase migration up
   ```

5. **Install Python Dependencies**:
   ```bash
   pip install scikit-learn sentence-transformers huggingface_hub
   ```

## Metrics

- **Total Files Created**: 27 files
- **Total Lines of Code**: ~3,500 lines
- **Test Coverage**: 3 test files with 40+ assertions
- **Documentation**: 4 comprehensive docs (3,000+ words)
- **npm Scripts Added**: 5 new commands
- **Environment Variables**: 15+ new config options

## Conclusion

The "Leverage" ML upgrade is **complete and PR-ready**. All systems are:
- ✅ Implemented with safety guarantees
- ✅ Tested and documented
- ✅ Disabled by default
- ✅ Wired into the intelligence pipeline
- ✅ Following existing patterns and doctrines

**No silent degradations. No broken pipelines. No RAG leaks.**
