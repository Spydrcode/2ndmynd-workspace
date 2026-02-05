# Local Embeddings Backend

## Overview

The **Local Embeddings Backend** generates 384-d vectors using sentence-transformers.

**Purpose**: Privacy-safe, self-hosted embedding generation for learning examples.

**Model**: `sentence-transformers/all-MiniLM-L6-v2`
**Dimension**: 384
**Storage**: Supabase `learning_vectors_384_v1` table (pgvector)

**Safety Guarantees**:
- ✅ Only embeds sanitized summaries (no PII)
- ✅ NO RAG context (verified by tests)
- ✅ Fallback to JSONL if Python unavailable

## Configuration

Add to `.env`:

```bash
# Local Embeddings
LOCAL_EMBEDDINGS_ENABLED=false                              # Enable/disable local embeddings
LOCAL_EMBEDDINGS_MODEL=sentence-transformers/all-MiniLM-L6-v2  # Model name
LOCAL_EMBEDDINGS_DIM=384                                    # Embedding dimension
LEARNING_VECTOR_BACKEND=local                               # Backend: local | openai | supabase | pinecone | none
```

## Setup

### 1. Install Python Dependencies

```bash
pip install sentence-transformers torch
```

### 2. Apply Supabase Migration

```bash
# Enable pgvector extension + create learning_vectors_384_v1 table
supabase migration up
```

Migration file: `supabase/migrations/20260205000000_learning_vectors_384_v1.sql`

### 3. Enable Backend

```bash
# Set in .env
LOCAL_EMBEDDINGS_ENABLED=true
LEARNING_VECTOR_BACKEND=local
```

## Usage

### Node API

```typescript
import { generateLocalEmbedding } from "@/lib/learning/vector_index/local_embed";

const text = "HVAC mock 50 jobs $150k revenue";
const embedding = await generateLocalEmbedding(text);

if (embedding) {
  console.log(`Generated ${embedding.length}-d vector`);
}
```

### Batch Generation

```typescript
import { generateBatchEmbeddings } from "@/lib/learning/vector_index/local_embed";

const items = [
  { id: "ex_001", text: "HVAC mock 50 jobs $150k revenue" },
  { id: "ex_002", text: "Plumbing real 120 jobs $400k revenue" },
];

const results = await generateBatchEmbeddings(items);

if (results) {
  results.forEach(({ id, embedding }) => {
    console.log(`${id}: ${embedding.length}-d`);
  });
}
```

### Python CLI

```bash
# Single text
python src/lib/learning/vector_index/local_embed.py \
  --text="example text" \
  --output=embedding.json

# Batch
python src/lib/learning/vector_index/local_embed.py \
  --batch_file=texts.jsonl \
  --output=embeddings.jsonl
```

**texts.jsonl format**:
```json
{"id": "001", "text": "example"}
{"id": "002", "text": "another example"}
```

**embeddings.jsonl output**:
```json
{"id": "001", "embedding": [0.123, -0.456, ...]}
{"id": "002", "embedding": [0.789, 0.012, ...]}
```

## Vector Index Wiring

The `index_client.ts` automatically uses local embeddings when `LEARNING_VECTOR_BACKEND=local`:

```typescript
// Before (OpenAI embeddings)
LEARNING_VECTOR_BACKEND=openai

// After (Local embeddings)
LEARNING_VECTOR_BACKEND=local
```

**Backend options**:
- `local` - sentence-transformers (384-d)
- `openai` - OpenAI embeddings (1536-d)
- `supabase` - Supabase pgvector (1536-d)
- `pinecone` - Pinecone (custom dim)
- `none` - JSONL fallback (no vector search)

## Supabase Table Schema

```sql
CREATE TABLE learning_vectors_384_v1 (
  id TEXT PRIMARY KEY,
  example_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  embedding VECTOR(384) NOT NULL,
  schema_version TEXT NOT NULL DEFAULT 'signals_v1',
  source TEXT NOT NULL,
  industry_key TEXT NOT NULL,
  pii_scrubbed BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB
);
```

**Indexes**:
- `example_id_idx` - Fast lookup by example
- `source_idx` - Filter by source (mock/real)
- `industry_key_idx` - Filter by industry
- `embedding_idx` - HNSW for fast cosine similarity search

## Query Examples

### Upsert Vectors

```typescript
import { upsertVectorDocs } from "@/lib/learning/vector_index/index_client";
import type { VectorDoc } from "@/lib/learning/vector_index/vector_types";

const docs: VectorDoc[] = [
  {
    id: "vec_001",
    run_id: "run_001",
    source: "mock",
    industry_key: "hvac",
    created_at: "2026-01-01T00:00:00Z",
    embedding_model: "sentence-transformers/all-MiniLM-L6-v2",
    embedding_dim: 384,
    embedding: [], // Will be auto-generated
    summary: "HVAC mock 50 jobs $150k revenue",
    metadata: {
      boundary_class: "healthy",
      pressure_keys: [],
      pii_scrubbed: true,
    },
  },
];

await upsertVectorDocs(docs);
```

### Search Similar Vectors

```typescript
import { searchSimilarVectors } from "@/lib/learning/vector_index/index_client";

const queryText = "HVAC 60 jobs $180k revenue";
const results = await searchSimilarVectors(queryText, { topK: 5 });

results.forEach(({ id, score, boundary_class }) => {
  console.log(`${id}: ${score.toFixed(3)} (${boundary_class})`);
});
```

## PII Safety

Local embeddings only embed the **sanitized summary field** from `VectorDoc`.

**Summary Construction** (from `build_vector_doc.ts`):
```typescript
const summary = `${industry_key} ${source} ${features.total_jobs} jobs $${features.total_revenue} revenue`;
```

**Blocked Content**:
- ❌ RAG context
- ❌ Website scans
- ❌ Raw text blobs
- ❌ Customer names, emails, phones

**Test Coverage**:
- `src/lib/learning/vector_index/__tests__/local_embeddings_backend.test.ts`

## Performance

| Operation | Latency | Notes |
|-----------|---------|-------|
| Single embedding | ~50ms | CPU-bound |
| Batch (100 texts) | ~2s | Batched inference |
| Vector search (1k docs) | ~5ms | HNSW index |
| Vector search (100k docs) | ~20ms | HNSW index |

**Model Loading**: First call takes ~2-3s (model download + init)

## Fallback Behavior

If Python is unavailable:
1. Local embeddings return `null`
2. System falls back to JSONL storage
3. Vector search uses cosine similarity on cached embeddings

**No Errors** - system degrades gracefully.

## Testing

```bash
# Run local embeddings tests
npm test -- local_embeddings_backend

# Verify backend wiring
npm test -- vector_index
```

## Comparison: Local vs OpenAI

| Feature | Local (sentence-transformers) | OpenAI (text-embedding-3-small) |
|---------|-------------------------------|----------------------------------|
| Dimension | 384 | 1536 |
| Cost | $0 (self-hosted) | ~$0.02 per 1M tokens |
| Latency | ~50ms (single) | ~200ms (API call) |
| Privacy | 100% local | Data sent to OpenAI |
| Model | all-MiniLM-L6-v2 | OpenAI proprietary |
| Quality | Good for similarity | Better for semantic nuance |

**Recommendation**: Use `local` for privacy-sensitive workloads, `openai` for production quality.

## Troubleshooting

**"sentence-transformers not installed"**:
```bash
pip install sentence-transformers torch
```

**"Invalid embedding dim: 0 (expected 384)"**:
- Python script failed silently
- Check stderr logs
- Verify model name is correct

**"Python wiring required but not enabled"**:
- Set `REQUIRE_PYTHON_WIRING=0` to allow graceful fallback
- Or set `REQUIRE_PYTHON_WIRING=1` and ensure Python is available

**Supabase connection fails**:
- Check `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
- Verify pgvector extension enabled
- Run migration: `supabase migration up`

**Vector search returns no results**:
- Ensure vectors are upserted first
- Check embedding_model matches (local vs openai)
- Verify HNSW index created

## Architecture

```
Node API Call
  ↓
generateLocalEmbedding(text)
  ↓
[Spawn Python script: local_embed.py]
  ↓
[sentence-transformers model.encode(text)]
  ↓
[Return 384-d vector as JSON]
  ↓
Parse & validate dimension
  ↓
Return to Node (or null if failed)

Storage Flow:
  upsertVectorDocs(docs)
    ↓
  [Auto-generate embeddings if missing]
    ↓
  [Insert into Supabase learning_vectors_384_v1]
    ↓
  [HNSW index for fast search]
```

## Future Enhancements

- [ ] GPU acceleration (CUDA)
- [ ] Model quantization (8-bit)
- [ ] Hybrid search (dense + sparse)
- [ ] Custom fine-tuned models
- [ ] Multi-lingual support
