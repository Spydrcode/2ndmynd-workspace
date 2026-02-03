# 2ndmynd Continual Improvement System (CIS)

This system improves LLM behavior safely over time by curating real interactions, enforcing doctrine, and gating model promotion through evaluation suites. It is **not** a dashboard or KPI system. The goal is stable, calm, grounded artifacts with prioritized next steps.

## Weekly Operating Procedure
1) Let logs accumulate (production + internal).
2) Run `npm run ml:curate:weekly`.
3) Review packets in `ml/datasets/quarantine/review_packets/<YYYY-WW>/packet.json`.
4) Fill `decisions.json` with reviewer decisions and corrected outputs.
5) Re-run `npm run ml:curate:weekly` to append Gold/Growth.
6) Run `npm run ml:finetune:prepare`.
7) Run `npm run ml:finetune:train`.
8) When complete, run `npm run ml:finetune:promote` to evaluate + gate promotion.

## RAG Usage
RAG is used for **current + business-specific facts** only. All content must be aggregated/bucketed. Retrieval is scoped to `workspace_id` and optionally `business_id`. Use `npm run rag:ingest` for internal docs or sanitized facts.

## Data Safety
- Logs are PII-redacted before storage.
- Quarantine never trains directly.
- Gold/Growth only include human-reviewed, corrected examples.
- No raw CSV rows or customer identifiers are stored.

## Adding a New Eval Suite
1) Add a JSON file under `ml/evals/suites/`.
2) Add a grader (if needed) under `ml/evals/graders/`.
3) Ensure `EvalCase` schema is satisfied.
4) Run `npm run ml:eval` and check the report under `ml/evals/reports/`.

## Add a Gold Example Safely
- Only via review packets + `decisions.json`.
- Must include `reviewer` and `quality.score`.
- Should represent a canonical, high-signal example.
