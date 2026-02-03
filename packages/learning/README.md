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

## Internal Route Gating

In production, internal learning routes are blocked unless:

```
ALLOW_INTERNAL_TESTING=true
```

and requests include:

```
x-2ndmynd-internal: <INTERNAL_TESTING_TOKEN>
```
