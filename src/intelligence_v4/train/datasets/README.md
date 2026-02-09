# Intelligence v4 Stage Datasets

Build with:

```bash
npm run datasets:build
```

Default behavior:
- window: last 7 days (`--days=7`)
- source: persisted v4 stage input/output artifacts
- filter: approved-only (`--approved_only=true`)

JSONL files written:
- `train/datasets/stage_quant.jsonl`
- `train/datasets/stage_emyth.jsonl`
- `train/datasets/stage_competitive.jsonl`
- `train/datasets/stage_blueocean.jsonl`
- `train/datasets/stage_synthesis.jsonl`

Each line format:

```json
{
  "id": "run:<run_id>/stage:<stage_name>",
  "created_at": "2026-02-09T00:00:00.000Z",
  "client_id": "workspace_123",
  "industry": "plumbing",
  "input": {},
  "output": {},
  "grades": {
    "schema": "pass",
    "doctrine": "pass",
    "drift": "pass",
    "decision": "pass"
  },
  "model": {
    "model_id": "deterministic:synthesis-v1",
    "prompt_version": "v1"
  },
  "approved": true,
  "notes": ""
}
```

Safety constraints:
- No raw rows or PII in stage input payloads.
- Inputs are schema-validated stage training surfaces (`stage_input_*_v1`).
- Outputs are schema-validated stage artifacts with guard results attached.

Fine-tuning next step:
- See `docs/fine_tuning_v4.md` for the end-to-end workflow (`datasets:build -> ft:stage -> evals:v4 -> promote:model`).
- Preferred synthesis path: `npm run synth:ship -- --dry_run=true --days=90`.
