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

# Model Card - deterministic:quant-v2-test

## Stage
- Stage name: quant_signals
- Model ID: deterministic:quant-v2-test
- Base model: gpt-4o-mini-2024-07-18

## Purpose
- Stage job: quant_signals artifact generation in the v4 sequential pipeline.
- Boundaries: JSON-only output, schema-first validation, doctrine-safe language, bucketed evidence refs only.

## Schema Versions
- Input schema: see stage input contract
- Output schema: see stage output contract

## Dataset Stats
- Dataset path: C:\Users\dusti\AppData\Local\Temp\promotion-flow-k0ZSEY\stage_quant.jsonl
- Total rows: 1
- Approved rows: 1
- Industries: plumbing: 1
- Date window: 2026-02-09T20:07:45.701Z to 2026-02-09T20:07:45.701Z

## Doctrine + Guardrails
- Forbidden owner-facing terms are blocked (dashboard/KPI/analytics/monitoring/BI/scorecard/leaderboard).
- Raw data exposure checks run before training generation.
- additionalProperties:false contracts are enforced for input/output surfaces.

## Evals
- Status: pass (C:\Users\dusti\git\2ndmynd-workspace\evals\report_20260209T200748Z.json)

## Known Limitations
- Performance depends on dataset quality and stage-specific approvals.
- Industry-specific behavior is limited by available approved examples.

## Promotion Status
- Status: candidate
- Promotion report: C:\Users\dusti\git\2ndmynd-workspace\train\promotion\reports\quant_signals\promotion_20260209T200750Z.json
- Run manifest: none
- Notes: dry run test
