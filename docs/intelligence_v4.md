# Intelligence Layer v4

## Summary
Intelligence v4 is a sequential, stage-gated assembly line that produces one governed decision artifact.
It runs five stages in strict order with stop-on-failure semantics and no parallel fan-out.

Stages:
1. `quant_signals`
2. `emyth_owner_load`
3. `competitive_lens`
4. `blue_ocean`
5. `synthesis_decision`

## Core Design
- Schema-first contracts for each stage (`src/intelligence_v4/pipeline/contracts.ts`)
- Stage-specific prompts and schemas under `src/intelligence_v4/stages/*`
- Model routing and version pinning in `src/intelligence_v4/pipeline/model_registry.ts`
- Sequential orchestration in `src/intelligence_v4/pipeline/run_pipeline_v4.ts`
- Doctrine + drift guards in `src/intelligence_v4/pipeline/guards.ts`
- Per-stage artifact persistence in `src/intelligence_v4/pipeline/artifact_store.ts`

## Data Handling
- Stage 1 bucketizes inputs and emits evidence refs (`bucket:*` IDs) only.
- No stage receives raw rows, names, phones, emails, addresses, or line-item payloads.
- Every stage must include `data_limits` to state visible boundaries.

## Failure Model
If any stage fails schema or doctrine checks:
- Pipeline stops immediately.
- Failure artifact is persisted with:
  - `stage_failed`
  - `reason`
  - `validation_errors`
  - `guard_failures`
  - `next_action`
- No final owner artifact is presented.

## Model Configuration
- `config/intelligence_v4.models.json` controls stage model IDs, schema versions, prompt versions, and rollout.
- Deterministic local model IDs are the default.
- OpenAI can be enabled per stage with `openai:<model_id>`.

## Policy Configuration
- `config/intelligence_v4.policy.json` controls forbidden vocabulary, infinite-feed phrases, shaming heuristics, stage drift terms, and action limits.

## Evaluation Workflow
Use:
- `tsx src/intelligence_v4/evals/run_evals.ts`
- Optional: `--mode=stage --stage=quant_signals`

Graders:
- Schema validity
- Doctrine compliance
- Stage drift checks
- Decision finality checks

Eval summaries are written to:
- `evals/report_<timestamp>.json`
- `tmp/intelligence_v4/eval_summary.json` (latest snapshot)

## Training Workflow
Capture -> Review -> Approve -> Dataset -> Eval -> Promote

Commands:
- `npm run curate:weekly -- --workspace_id=<id>`
  - writes review packs to `tmp/intelligence_v4/review/<YYYY-MM-DD>/review_pack.json`
- `npm run datasets:build`
  - writes stage JSONL files under `train/datasets/`
  - defaults to `approved_only=true`
- Optional overrides (recommended direct invocation):
  - `npx tsx src/intelligence_v4/train/datasets/build_datasets.ts --approved_only=false --days=14`
- `npm run ft:stage -- --stage=<stage> --base_model=<base> --suffix=<suffix> --dry_run=true`
  - writes `train/finetune_runs/<stage>/<timestamp>/train_openai.jsonl`
  - writes `train/finetune_runs/<stage>/<timestamp>/run_manifest.json`
- `npm run modelcard:build -- --stage=<stage> --model=<id> --base_model=<base>`
  - writes `train/model_cards/<stage>/<model_id>.md`
- `npm run promote:model -- --stage=<stage_name> --model=<model_id>`
  - runs pipeline eval + stage eval gate
  - writes promotion report to `train/promotion/reports/<stage>/promotion_<timestamp>.json`
  - updates `config/intelligence_v4.models.json` only if all evals pass (and dry-run is false)

Promotion report:
- `tmp/intelligence_v4/model_promotion_report.json`

## Smoke Test
Run:
- `npm run smoke:intelligence:v4`

Assertions:
- All stages complete and validate.
- Final artifact has exactly paths A/B/C.
- One valid recommendation.
- First 30 days has 5-9 actions.
- Forbidden vocabulary scan is clean.
