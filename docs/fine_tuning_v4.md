# Fine-Tuning v4

## Workflow
Recommended orchestrated path:
```bash
npm run synth:ship -- --dry_run=true --days=90
```

Recommended prep for distribution diversity:
```bash
npm run synth:packs
npm run synth:runpacks -- --iterations=10 --industry_mix=balanced --min_industries=6
```

Live guardrails in `synth:ship` (default):
- `--live_min_rows=40`
- `--max_homogeneity_share=0.8`
- policy-driven diversity gate in `config/intelligence_v4.policy.json`:
  - `training_diversity.min_total_rows`
  - `training_diversity.min_industries`
  - `training_diversity.max_industry_share`
  - `training_diversity.max_duplicate_actions_share`
  - `training_diversity.max_same_primary_constraint_prefix_share`

Manual step-by-step path:
1. Build stage datasets (approved-only by default):
```bash
npm run datasets:build -- --approved_only=true --days=30
```
2. Run stage-specific fine-tune prep (dry-run recommended first):
```bash
npm run ft:stage -- --stage=synthesis_decision --base_model=gpt-4.1-mini-2025-04-14 --dataset=train/datasets/stage_synthesis.jsonl --suffix=2ndmynd-synth-v1 --dry_run=true
```
3. Run evals:
```bash
npm run evals:v4
```
4. Promote if evals pass:
```bash
npm run promote:model -- --stage=synthesis_decision --model=<NEW_MODEL_ID>
```

## Dry-Run Without API Keys
`ft:stage` defaults to `--dry_run=true`; this writes:
- `train/finetune_runs/<stage>/<timestamp>/train_openai.jsonl`
- `train/finetune_runs/<stage>/<timestamp>/run_manifest.json`

No OpenAI API call is made during dry-run.

## Approvals
- Dataset rows are filtered to `approved === true` by default.
- Use `--approved_only=false` only for controlled curation/debug workflows.
- Promotion additionally enforces minimum eligible rows per stage unless `--force=true`.

## Stage-Specific Fine-Tuning
Each stage is independently trainable:
- `quant_signals`
- `emyth_owner_load`
- `competitive_lens`
- `blue_ocean`
- `synthesis_decision`

Training surfaces are strict contracts:
- stage input schema (`stage_input_*_v1`)
- stage output schema (`*_v1`)

Rows with schema mismatch are rejected before training file generation.

## Industry Tags
Datasets carry `industry` per row.
Current workflow does not split by industry automatically, but this metadata enables future stage-specific and industry-specific dataset selection.

## Promotion Behavior
`promote:model` does the following:
- runs v4 eval gate (pipeline + selected stage)
- blocks on any eval failure
- checks dataset eligibility and minimum row threshold
- writes promotion report to `train/promotion/reports/<stage>/promotion_<timestamp>.json`
- generates/updates model card at `train/model_cards/<stage>/<model_id>.md`
- updates `config/intelligence_v4.models.json` only when not `--dry_run=true`

## Troubleshooting
- Dashboard not showing expected fine-tunes:
  - `npm run ops:ft:doctor -- --list=true`
  - `npm run ops:ft:doctor -- --job_id=ftjob-...`
  - API output is the authoritative source of truth for job visibility and ownership metadata (including organization/project-scoped access context when provided by your environment).
- Missing dataset file:
  - verify `npm run datasets:build` output path and stage file.
- 0 eligible rows:
  - check `approved` flags and schema validity of input/output fields.
- Schema mismatch:
  - ensure row `input.schema_version` and `output.schema_version` match current contracts.
- Missing API key for live fine-tune:
  - set `OPENAI_API_KEY` or keep `--dry_run=true`.
- Promotion blocked:
  - inspect `evals/report_*.json` and promotion report for gate failure details.
