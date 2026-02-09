# Model Card Template (Intelligence v4)

## Stage
- Stage name:
- Schema version:
- Prompt version:
- Model ID:

## Intended Use
- Supported industries:
- Decision contexts:
- Out-of-scope contexts:

## Training Data
- Source datasets:
- Date range:
- Positive/negative split:
- Curation notes:

## Evaluation
- Eval suite version:
- Schema pass rate:
- Doctrine pass rate:
- Stage drift pass rate:
- Decision finality pass rate:

## Known Failure Modes
- 

## Guardrails
- Forbidden vocabulary compliance:
- Raw data exposure checks:
- Required human review points:

## Promotion Decision
- Approved by:
- Date:
- Rollout strategy:

---

# Model Card - test-model

## Stage
- Stage name: quant_signals
- Model ID: test-model
- Base model: gpt-4o-mini-2024-07-18

## Purpose
- Stage job: quant_signals artifact generation in the v4 sequential pipeline.
- Boundaries: JSON-only output, schema-first validation, doctrine-safe language, bucketed evidence refs only.

## Schema Versions
- Input schema: see stage input contract
- Output schema: see stage output contract

## Dataset Stats
- Dataset path: C:\Users\dusti\git\2ndmynd-workspace\train\datasets\stage_quant.jsonl
- Total rows: 0
- Approved rows: 0
- Industries: none
- Date window: unknown

## Doctrine + Guardrails
- Forbidden owner-facing terms are blocked (dashboard/KPI/analytics/monitoring/BI/scorecard/leaderboard).
- Raw data exposure checks run before training generation.
- additionalProperties:false contracts are enforced for input/output surfaces.

## Evals
- Status: unknown

## Known Limitations
- Performance depends on dataset quality and stage-specific approvals.
- Industry-specific behavior is limited by available approved examples.

## Promotion Status
- Status: candidate
- Promotion report: none
- Run manifest: none
- Notes: 
