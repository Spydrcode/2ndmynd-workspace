# RAG Store (Scoped Retrieval)

This module stores **aggregated, bucketed** business facts and doctrine references for retrieval. It never ingests raw CSV rows or free-text exports. All content must be pre-sanitized.

## Storage
- SQLite at `ML_RAG_DB_PATH` (default: `ml/rag/rag.db`)
- Each doc is scoped by `workspace_id` and optional `business_id`

## Embeddings
- Default: OpenAI embeddings (`OPENAI_API_KEY`, `OPENAI_EMBED_MODEL`)
- Offline/dev: `ML_RAG_EMBED_MODE=mock` uses deterministic hash embeddings

## Usage
- `ingestDocs()` or `ingestFromJsonl()` to add documents
- `getRagContext({ workspace_id, business_id, query })` to retrieve

## Safety
- Only aggregated/bucketed facts and internal doctrine are allowed.
- Retrieval is strictly scoped by `workspace_id` (and optionally `business_id`).
