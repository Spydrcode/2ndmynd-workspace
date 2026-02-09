# Synthesis Ship - 3 Week Plan

## Goal
Ship `synthesis_decision` fine-tuning with eval-gated promotion in 3 weeks using one in-repo command path.

## Recommended Command
Dry-run lifecycle:
```bash
npm run synth:ship -- --dry_run=true --days=90
```

Live lifecycle:
```bash
npm run synth:ship -- --dry_run=false --base_model=gpt-4.1-mini-2025-04-14 --suffix=2ndmynd-synth-v1 --auto_promote=true
```

Live guardrails (defaults):
- `--live_min_rows=40`: blocks live fine-tune if approved rows are below 40.
- `--max_homogeneity_share=0.8`: blocks live fine-tune if one industry exceeds 80% of approved rows.

Dataset diversity gate (from `config/intelligence_v4.policy.json`):
- `training_diversity.min_total_rows` (default `40`)
- `training_diversity.min_industries` (default `4`)
- `training_diversity.max_industry_share` (default `0.60`)
- `training_diversity.max_duplicate_actions_share` (default `0.35`)
- `training_diversity.max_same_primary_constraint_prefix_share` (default `0.35`)

## Week-by-Week
### Week 1
0. Diversify fixture supply first:
   - `npm run synth:packs`
1. Generate candidate runs:
   - `npm run synth:runpacks -- --iterations=10`
2. Optional larger mix build:
   - `npm run synth:runpacks -- --iterations=20 --industry_mix=balanced --min_industries=6`
3. Create review pack:
   - `npm run synth:curate -- --days=90 --stage=synthesis_decision`
4. Approve review items in `train/curation/review_packs/review_pack_<YYYY-MM-DD>.json`.

### Week 2
1. Generate candidate runs:
   - `npm run synth:runpacks -- --iterations=10`
2. Build approved dataset:
   - `npm run synth:datasets -- --approved_only=true --days=90`
3. Build fine-tune payload (dry-run first):
   - `npm run synth:ft -- --dataset=train/datasets/stage_synthesis.jsonl --base_model=gpt-4.1-mini-2025-04-14 --suffix=2ndmynd-synth-v1 --dry_run=true`
4. Run eval gate:
   - `npm run synth:eval`

### Week 3
1. Launch live job:
   - `npm run synth:ft -- --dataset=train/datasets/stage_synthesis.jsonl --base_model=gpt-4.1-mini-2025-04-14 --suffix=2ndmynd-synth-v1 --dry_run=false`
2. Promote after eval pass:
   - `npm run synth:promote -- --model=<NEW_MODEL_ID>`
3. Verify pinned model and status:
   - `npm run ops:status`

## What "Approve" Means
An item is approved when review JSON entry has:
- `approved: true`
- edited output (if needed) doctrine-safe and schema-valid
- notes explaining why it is a good exemplar (or why it was corrected)

Only approved entries are exported into training datasets by default.

## Diversity Failure Recovery
If `synth:ship` stops with a diversity error:
1. Generate fresh cross-industry packs: `npm run synth:packs`
2. Generate more mixed runs: `npm run synth:runpacks -- --iterations=10 --industry_mix=balanced --min_industries=6`
3. Approve more entries from underrepresented industries in the latest review pack.
4. Re-run: `npm run synth:ship -- --dry_run=true --days=90`

## Auto-Promote Safety
`--auto_promote=true` only updates config if:
- eval gate passes
- promotion gate passes dataset minimum checks (unless forced)
- a concrete fine-tuned model ID is available

## Artifact Paths
- Ship attempt manifest: `train/ops/synth_ship/<timestamp>/ops_manifest.json`
- Candidate run IDs: `train/ops/synth_ship/<timestamp>/run_ids.json`
- Review pack: `train/curation/review_packs/review_pack_<YYYY-MM-DD>.json`
- Dataset: `train/datasets/stage_synthesis.jsonl`
- Fine-tune run: `train/finetune_runs/synthesis_decision/<timestamp>/`
- Eval reports: `evals/report_<timestamp>.json`
- Promotion reports: `train/promotion/reports/synthesis_decision/promotion_<timestamp>.json`
- Model cards: `train/model_cards/synthesis_decision/<model_id>.md`
- Pinned model config: `config/intelligence_v4.models.json`
