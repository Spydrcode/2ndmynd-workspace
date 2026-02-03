# Learning Layer (v1)

Backend-only learning subsystem for privacy-safe training and evaluation.

## Enable Capture

Set environment flags:

```
LEARNING_CAPTURE=true
```

Captured examples are stored at `./runs/learning/examples.jsonl`.

## Export Dataset

Internal route:

```
POST /api/internal/learning/export
Body: { source?: "mock"|"real", industry_key?: string, outPath?: string, since?: string }
```

Response: `{ ok, outPath, count }`

## Train + Evaluate

Internal route:

```
POST /api/internal/learning/train
Body: {}
```

Response: `{ job_id, status_url }`

Check status:

```
GET /api/internal/learning/status?job_id=...
```

Evaluation report:

```
GET /api/internal/learning/report?job_id=...
```

Latest reports:

```
GET /api/internal/learning/reports/latest?internal=1
```

Models are written to `./models/<model_name>/<YYYYMMDD-HHMMSS>/`.
Evaluation reports are written to `./eval_out/<YYYYMMDD-HHMMSS>/report.md`.

## Enable Inference

```
LEARNING_INFERENCE=true
```

Inference loads the latest models and adjusts the decision artifact when enabled.

## Vector Search Backends

Set backend:

```
LEARNING_VECTOR_BACKEND=openai|pinecone|supabase|none
```

Embedding model:

```
LEARNING_EMBEDDING_MODEL=text-embedding-3-small
```

Required env vars:

- **OpenAI**
  - `OPENAI_API_KEY`
  - `OPENAI_VECTOR_STORE_ID` (optional; if omitted uses local JSONL fallback)
- **Pinecone**
  - `PINECONE_API_KEY`
  - `PINECONE_INDEX` (index host or full URL)
- **Supabase**
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`

Supabase migration (pgvector + RPC):

```
supabase db push
```

Migration file: `supabase/migrations/20260203_learning_vectors_v1.sql`

Backfill local JSONL vectors to Supabase:

```
npm run learning:backfill:vectors -- --file ./runs/learning/vector_index.jsonl
```

Backfill options:
- `--resume` uses checkpoint file (default `./runs/learning/backfill.checkpoint.json`)
- `--checkpoint <path>` override checkpoint location
- `--batch-size N` (default 100)
- `--concurrency N` (default 1)
- `--strict` fail on first invalid row
- `--verify` check Supabase coverage without writing

If embedding dims are not 1536, Supabase upsert is rejected. Use `LEARNING_VECTOR_FALLBACK_JSONL=true` to keep local JSONL fallback.

## Internal Route Gating

In production, internal learning routes are blocked unless:

```
ALLOW_INTERNAL_TESTING=true
```

and requests include:

```
x-2ndmynd-internal: <INTERNAL_TESTING_TOKEN>
```

## Internal Views

- `GET /app/internal/runs/[run_id]?internal=1` for diffing baseline vs learned artifacts.
- `/api/internal/runs/artifacts?run_id=...&mode=baseline|learned&internal=1` for artifact diffs.
