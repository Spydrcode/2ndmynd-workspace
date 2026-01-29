# Decision Layer v2 Inventory + What's Left (2026-01-28)

## Repo status (read-only)
- Branch: `main` (tracking `origin/main`)
- Latest commit: `e1b0d8b` (message: `up`)
- Git status: modified `src/app/api/decision/route.ts`, untracked `docs/`

## Inventory map (key directories)
### `lib/`
- `lib/decisionModel.ts` - runtime API v1 inference (OpenAI chat completions, `conclusion_v1` validation).
- `lib/sampleSnapshot.ts` - sample snapshot_v1.
- `lib/utils.ts` - utilities (no decision logic).
- Missing: `lib/decision/**` and `lib/openai/**` (paths do not exist in repo).

### `src/app/api/decision/**`
- `src/app/api/decision/route.ts` - POST handler now routes by `snapshot_version`:
  - snapshot_v2 -> `inferDecisionV2` (v2)
  - otherwise -> `getDecisionConclusion` (v1)
- `src/app/api/decision/diag/route.ts` - model registry / latest run diagnostics.
- `src/app/api/decision/dev/set-model/route.ts` - dev helper.

### `scripts/ml/**`
- v2 core
  - `scripts/ml/lib/decision_infer_v2.ts` - canonical v2 inference (`inferDecisionV2`).
  - `scripts/ml/lib/decision_layer_v2.ts` - v2 prompts + schema.
  - `scripts/ml/lib/conclusion_schema_v2.ts` - snapshot_v2 + conclusion_v2 validators.
  - `scripts/ml/lib/snapshot/build_snapshot_v2.ts` - snapshot_v2 builder.
  - `scripts/ml/pipeline/run_pipeline_v2.ts` - deterministic v2 pipeline (scrub -> normalize -> snapshot_v2 -> infer -> validate -> JSONL log).
- v2 tooling
  - `scripts/ml/infer_decision_v2.ts` - CLI wrapper for v2 inference.
  - `scripts/ml/eval_decision_v2.ts` - v2 evaluation (direct OpenAI calls; no API/record/replay).
  - `scripts/ml/generate_decision_v2_dataset.ts` - synthetic dataset generator (snapshot_v2).
- v1 tooling still present
  - `scripts/ml/infer_decision.ts`, `scripts/ml/run_jobber_csv_snapshot.ts`, scenario pack generation/import, etc.
  - `scripts/seed/jobber_csv_to_ml_examples.ts` - creates snapshot_v1 examples.

### `supabase/migrations/**`
- `0002_ml_workspace_v1.sql` - schema `ml`, `runs`, `run_results`, datasets, examples.
- `0007_model_registry.sql` - `ml.model_registry` table.
- `0008_runs_eval_fields.sql` - adds eval fields to `ml.runs`.
- `0009_examples_meta.sql` - examples metadata.

### `mcp/tools/**`
- Missing: no `mcp/` directory; no MCP tool shim present.

## Canonical v2 entrypoint + callers
Canonical v2 function: `inferDecisionV2` in `scripts/ml/lib/decision_infer_v2.ts`.

Callers found:
- CLI wrapper: `scripts/ml/infer_decision_v2.ts`
- Eval runner: `scripts/ml/eval_decision_v2.ts`
- Pipeline: `scripts/ml/pipeline/run_pipeline_v2.ts`
- Micro rewrite test: `scripts/ml/test_micro_rewrite_v2.ts`
- Next API route: `src/app/api/decision/route.ts` (snapshot_v2 branch)

Missing callers:
- MCP tool shim (missing directory)

Evidence (rg):
```text
rg -n "inferDecisionV2" scripts/ml src/app/api/decision
src/app/api/decision\route.ts:4:import { inferDecisionV2 } from "@/scripts/ml/lib/decision_infer_v2";
scripts/ml\eval_decision_v2.ts:10:import { inferDecisionV2 } from "./lib/decision_infer_v2";
scripts/ml\infer_decision_v2.ts:4:import { inferDecisionV2 } from "./lib/decision_infer_v2";
scripts/ml\pipeline\run_pipeline_v2.ts:6:import { inferDecisionV2 } from "../lib/decision_infer_v2";
scripts/ml\test_micro_rewrite_v2.ts:4:import { inferDecisionV2 } from "./lib/decision_infer_v2";
```

## v1 code paths still used at runtime
- API route still supports v1 snapshots: `getDecisionConclusion` remains in `src/app/api/decision/route.ts`.
- Jobber CSV runner is v1: `scripts/ml/run_jobber_csv_snapshot.ts` builds snapshot_v1 and uses v1 prompts.

Evidence (rg):
```text
rg -n "getDecisionConclusion" -S src/app/api/decision lib
lib\decisionModel.ts:268:export async function getDecisionConclusion(inputSnapshot: unknown): Promise<
src/app/api/decision\route.ts:3:import { getDecisionConclusion } from "@/lib/decisionModel";

rg -n "snapshot_v1" scripts/ml/run_jobber_csv_snapshot.ts
scripts/ml/run_jobber_csv_snapshot.ts:2: * CSV -> snapshot_v1 -> call fine-tuned model -> validate schema + deterministic grounding
```

## Golden path status (v2)
| Capability | Status | Notes |
|---|---|---|
| snapshot_v2 builder | ✅ | `scripts/ml/lib/snapshot/build_snapshot_v2.ts` exists + used in `run_pipeline_v2.ts` |
| API wiring (v2) | ✅ | `/api/decision` routes snapshot_v2 to `inferDecisionV2` |
| MCP tool | ❌ | no `mcp/tools` directory |
| eval via API | ❌ | `eval_decision_v2.ts` calls OpenAI directly; no `--via_api` |
| record/replay | ❌ | no `--record` / `--replay` / `--offline` in eval runner |
| PII scrub | ⚠️ | scrub + assert in `run_pipeline_v2.ts`, but snapshot_v2 builder sets `pii_scrubbed: true` without enforcement; other entrypoints bypass scrub |
| run logging | ⚠️ | JSONL logging in `run_pipeline_v2.ts` only; no Supabase writes |
| patch queue | ⚠️ | `inferDecisionV2` appends only on micro rewrite failure, not on fallback/validation fails |

Evidence (PII + logging):
```text
rg -n "scrubPII|assertNoPII" scripts/ml
scripts/ml\pipeline\run_pipeline_v2.ts:4:import { scrubPII, assertNoPII } from "../lib/pii_scrub";
scripts/ml\pipeline\run_pipeline_v2.ts:88:  const scrubbed = scrubPII(rawInput);
scripts/ml\pipeline\run_pipeline_v2.ts:89:  assertNoPII(scrubbed.scrubbed);

rg -n "createRunContext|pipeline_v2_runs" scripts/ml
scripts/ml\pipeline\run_pipeline_v2.ts:8:import { createRunContext, finalizeRunContext } from "../lib/run_context";
scripts/ml\pipeline\run_pipeline_v2.ts:141:    path.join(outDir, "pipeline_v2_runs.jsonl"),
```

## What's left checklist
### P0 tasks (must do before real dataset testing)
1) Add MCP tool shim
   - Minimal tool that posts to `/api/decision` with strict schema and returns `conclusion_v2` only.
2) Create API-based eval with record/replay
   - Add `--via_api`, `--record`, `--replay`, `--offline` to `eval_decision_v2.ts` (or a small wrapper) to test without direct OpenAI calls.
3) Jobber CSV -> snapshot_v2 adapter
   - Current Jobber runner is v1. Add a thin v2 wrapper that reuses CSV parsing and feeds `buildSnapshotV2`.
4) PII scrub enforcement across all v2 entrypoints
   - Ensure `pii_scrubbed` is based on actual scrub, not a hard-coded `true`.
5) Patch queue completeness
   - Append on fallback usage and validation failures (not only micro rewrite failure) so patch data is not lost.

### P1 tasks (robustness/scale)
1) Run logging to Supabase
   - Write run_id + input_hash + results to `ml.runs` / `ml.run_results` (or an equivalent deterministic table).
2) Proxy compatibility
   - Add explicit proxy support (env + agent) so API evals work in restricted networks.
3) Unify golden path CLI
   - A single deterministic CLI that can ingest a dataset, build snapshot_v2, call API, and emit JSONL results.

## Exact commands to run dataset tests
Note: eval via API + record/replay are not implemented yet. Commands below include current direct OpenAI path plus the exact API commands to run once wiring is added.

### Current (direct OpenAI)
```bash
# 1) Generate synthetic decision v2 dataset (train + valid)
npx tsx scripts/ml/generate_decision_v2_dataset.ts --out_train ml_artifacts/train_decision_v2.jsonl --out_valid ml_artifacts/valid_decision_v2.jsonl

# 2) Quick sanity run (limit 1)
npx tsx scripts/ml/eval_decision_v2.ts --in ml_artifacts/valid_decision_v2.jsonl --limit 1 --out ml_artifacts/decision_v2_eval_sample.json

# 3) Full eval
npx tsx scripts/ml/eval_decision_v2.ts --in ml_artifacts/valid_decision_v2.jsonl --out ml_artifacts/decision_v2_eval_full.json
```

### After API + record/replay wiring (exact flags to add)
```bash
# via API, record JSONL
npx tsx scripts/ml/eval_decision_v2.ts --in ml_artifacts/valid_decision_v2.jsonl --via_api http://localhost:3000/api/decision --record ml_artifacts/decision_v2_api_record.jsonl

# replay without network
npx tsx scripts/ml/eval_decision_v2.ts --replay ml_artifacts/decision_v2_api_record.jsonl --offline
```

## Known environment hazards + mitigation path
- Node version: assume Node `22.21.1` (per your note); repo has no `engines` field enforcing it.
- Required env vars (from code/README):
  - `OPENAI_API_KEY` (v2 inference + eval scripts)
  - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (API v1 + ML workflows)
  - `DECISION_MODEL_ID` or `TEST_MODEL` (optional overrides)
  - `PATCH_QUEUE_PATH`, `MICRO_REWRITE_DECISION` (optional v2 behavior)
  - Proxy vars (if needed): `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY`
- Proxy handling: no explicit proxy agent wiring; `undici` is present in `devDependencies` only, and the codebase does not read `HTTP_PROXY`/`HTTPS_PROXY`.
- Mitigation path: add a small proxy agent wiring layer in the API + eval runner so `--via_api` works in restricted environments.

## Canonical golden path pipeline (exists today)
- `scripts/ml/pipeline/run_pipeline_v2.ts` already implements:
  - scrub PII -> normalize input -> `buildSnapshotV2` -> `inferDecisionV2` -> validate -> JSONL log

This pipeline is the right spine to reuse for API/MCP evals; it just is not wired to MCP yet.
