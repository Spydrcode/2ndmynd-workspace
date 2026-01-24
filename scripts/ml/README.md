# ML Gold-Set Workflow

## Overview
This workflow exports draft snapshots, allows you to write one decision + one boundary, then re-imports approved conclusions and freezes datasets.

## Required environment variables
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

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
