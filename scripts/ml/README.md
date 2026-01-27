# ML Gold-Set Workflow

## Overview
This workflow exports draft snapshots, allows you to write one decision + one boundary, then re-imports approved conclusions and freezes datasets.

## Required environment variables
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Decision Layer v2 (Locked)

This repo contains a **locked** "Decision Layer v2" for 2ndmynd / 2ndlook that turns normalized `snapshot_v2` signals into a single `conclusion_v2` JSON object.

### What "locked" means
- The **default fine-tuned model ID** is pinned.
- The **system prompts** (primary + rewrite) are centralized and versioned.
- Output is **strict JSON** (`conclusion_v2`) with **deterministic grounding**.
- A **single rewrite attempt** is allowed only on schema/grounding failure.
- If grounding still fails, the system returns a deterministic **insufficient-evidence fallback** (and logs the failure for future patching).

This is intentional: the Decision Layer exists to reduce owner decision burden and return a finite, actionable conclusion - not to behave like a dashboard, KPI monitor, or analytics surface.

### Default model
The default model is pinned in `decision_layer_v2.ts`:

- `DEFAULT_DECISION_MODEL_ID = ft:gpt-4.1-mini-2025-04-14:personal:decision-layer-v2-PLACEHOLDER`

Override for experiments only:
- Env: `TEST_MODEL`
- CLI: `--model`

### Evidence grounding contract (required)
`evidence_signals` must contain **3-6** entries, each formatted exactly as:

- `signals.<full.leaf.path>=<literal_value>`

Rules:
- Must start with `signals.`
- Must reference a **leaf** field (number/string/bool/null)
- Must match the literal snapshot value exactly
- No objects/arrays (e.g. `signals.activity_signals.quotes=...` is invalid)

This contract is enforced by a deterministic validator in code.

### Guardrail behavior (one-shot rewrite)
Decision flow:
1. Primary model call -> validate schema + evidence grounding
2. If failure: **one** rewrite call (same model, strict JSON schema, leaf-only evidence rules)
3. If still failing: return **insufficient-evidence fallback** (schema-valid + grounded) and log failure

### Logging + patch queue
- Jobber CSV run logs: `ml_artifacts/jobber_csv_run.jsonl`
- Rewrite diagnostics: `smoke_rewrites.jsonl` (if enabled)
- Future misses: append to `patch_queue.jsonl`

**Do not** retrain the model based on a single miss.
Batch patches when `patch_queue.jsonl` contains ~10+ real-world failures with clear patterns.

### Quick run: snapshot_v2 -> conclusion_v2
```bash
# PowerShell
$env:OPENAI_API_KEY="sk-..."
npx tsx scripts/ml/infer_decision_v2.ts --json "<snapshot_v2 JSON>"
```

Expected:

Snapshot JSON is valid

Model returns conclusion_v2 JSON

Grounding reports { "ok": true }

## Step 1: Export draft examples
```bash
npm run ml:export-drafts
```

## Step 2: Curate decisions
Edit `./ml_review/drafts.json` and fill in:
- `decision`
- `boundary`
- `why_this_now`
- `one_sentence_pattern`
- `confidence`

## Step 3: Import gold approvals
```bash
npm run ml:import-gold
```

Validation rules:
- Decision and boundary must be present.
- Forbidden terms are blocked: dashboard, kpi, analytics, monitor, bi, performance tracking.

## Step 4: Freeze datasets
```bash
npm run ml:freeze-train
npm run ml:freeze-eval
```

## One-step finalize + freeze
```bash
npm run ml:finalize-train
```

Required environment variables:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Fine-tuning workflow
```bash
npm run ml:export-jsonl
npm run ml:finetune
```

Required environment variables:
- `OPENAI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Fine-tune + smoke test
```bash
npm run ml:finetune
npm run ml:smoke-test
```

Required environment variables:
- `OPENAI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Default base model: `gpt-4o-mini-2024-07-18`

Override the base model:
```bash
npm run ml:finetune -- --base_model <MODEL_ID>
```

Additional tools:
```bash
npm run ml:smoke-report
npm run ml:infer -- --json "<snapshot json>"
```

Runtime guardrail:
```bash
npm run ml:infer -- --model <ft-model> --json "<snapshot json>"
```

Negative examples + retrain:
```bash
npm run ml:extract-offenders
npm run ml:gen-negatives
npm run ml:finetune:v2
```


## Reset alignment

After any Supabase DB reset, always run:

```bash
npm run ml:rebuild-train
```

This will:
- Reseed ml.examples from Jobber CSVs
- Export drafts.json with fresh ids
- Autofill and finalize train_v1
- Ensure train_v1 example_ids match ml.examples

**Important:** drafts.json is ephemeral and tied to DB ids. Always regenerate after a DB reset or reseed.

## Notes
- No PII is exported or printed to console.
- The output is designed around one decision + one boundary.

