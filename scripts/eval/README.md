Eval harness for Jobber-derived signal snapshots

What this is
- Minimal, dependency-free evaluation harness that:
  - converts Jobber CSV/JSON exports into a bucketed `jobber_snapshot.json`
  - runs the snapshot through a baseline and a finetuned model and stores JSON outputs
  - produces a small `diff.md` summarizing key changes

Files added
- `scripts/eval/build_jobber_snapshot.ts` — create `jobber_snapshot.json` from CSV/JSON
- `scripts/eval/run_model_eval.ts` — call baseline + finetuned models and save outputs
- `scripts/eval/rubric.md` — scoring rubric for manual review

Usage examples

1) Build snapshot (CSV or JSON):

```powershell
node scripts/eval/build_jobber_snapshot.ts --input path/to/estimates.csv --out jobber_snapshot.json
```

2) Run eval (requires `OPENAI_API_KEY` in env):

```powershell
$env:OPENAI_API_KEY="sk-..."
node scripts/eval/run_model_eval.ts --snapshot jobber_snapshot.json --outdir eval_out
```

Notes
- The snapshot builder buckets signals conservatively and avoids storing PII (evidence is aggregated).
- The eval script enforces JSON-only output and retries once if the model returns invalid JSON.
- This is intentionally minimal; if you want richer scoring automation, we can wire the outputs into `scripts/ml/eval_*` tools.
