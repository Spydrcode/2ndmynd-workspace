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

# Model Card - test-model-1

## Stage
- Stage name: synthesis_decision
- Model ID: test-model-1
- Base model: gpt-4o-mini-2024-07-18

## Purpose
- Stage job: synthesis_decision artifact generation in the v4 sequential pipeline.
- Boundaries: JSON-only output, schema-first validation, doctrine-safe language, bucketed evidence refs only.

## Schema Versions
- Input schema: see stage input contract
- Output schema: see stage output contract

## Dataset Stats
- Dataset path: C:\Users\dusti\AppData\Local\Temp\model-card-qET4JD\dataset.jsonl
- Total rows: 1
- Approved rows: 1
- Industries: plumbing: 1
- Date window: 2026-02-09T00:00:00.000Z to 2026-02-09T00:00:00.000Z

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
- Notes: test card
