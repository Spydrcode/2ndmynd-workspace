# Repository Inventory (Pre-Refactor Cleanup)

Generated: 2026-02-09  
Scope: Intelligence/orchestration surfaces, API routes, prompt/model routing, eval/training tooling.  
Method: import/reference scan (`rg`), route handler scan, and latest commit check (`git log -1`) for each module path below.

## Classification Key
- `KERNEL`: Authoritative v4 intelligence execution surface.
- `LEGACY`: Superseded or transitional logic still present.
- `EXPERIMENTAL`: Demo/spike paths, not part of runtime kernel.
- `UTILITY`: Shared infrastructure/helpers with cross-version use.
- `UNKNOWN`: Ownership/runtime path unclear.

## Inventory Table
| path | last_modified | category | referenced_by | runtime_path | overlaps_v4 | recommended_action |
|---|---|---|---|---|---|---|
| `src/intelligence_v4/pipeline/run_pipeline_v4.ts` | untracked | KERNEL | `scripts/intelligence/smoke_v4.ts`, `src/intelligence_v4/evals/run_evals.ts`, `src/intelligence_v4/__tests__/pipeline_v4.test.ts` | yes | yes | Keep authoritative orchestration entrypoint. |
| `src/intelligence_v4/pipeline/contracts.ts` | untracked | KERNEL | v4 stage runners + v4 tests | yes | yes | Keep strict contract source-of-truth. |
| `src/intelligence_v4/pipeline/guards.ts` | untracked | KERNEL | v4 stage runners + guard tests | yes | yes | Keep doctrine gate authority here only. |
| `src/intelligence_v4/pipeline/model_registry.ts` | untracked | KERNEL | v4 runners/pipeline | yes | yes | Keep single v4 model routing layer. |
| `src/intelligence_v4/stages/quant_signals/*` | untracked | KERNEL | `stage_registry.ts` | yes | yes | Keep; continue stage-local isolation only. |
| `src/intelligence_v4/stages/emyth_owner_load/*` | untracked | KERNEL | `stage_registry.ts` | yes | yes | Keep; no cross-stage coupling. |
| `src/intelligence_v4/stages/competitive_lens/*` | untracked | KERNEL | `stage_registry.ts` | yes | yes | Keep; enforce stage drift rules. |
| `src/intelligence_v4/stages/blue_ocean/*` | untracked | KERNEL | `stage_registry.ts` | yes | yes | Keep; bounded opportunity shaping only. |
| `src/intelligence_v4/stages/synthesis_decision/*` | untracked | KERNEL | `stage_registry.ts` | yes | yes | Keep final artifact ownership here. |
| `src/intelligence_v4/evals/*` | untracked | KERNEL | `run_evals.ts`, CI/local eval flow | no (offline) | yes | Keep; required regression safety net. |
| `src/intelligence_v4/train/*` | untracked | KERNEL | curation/promotion scripts | no (offline) | yes | Keep scaffold; do not mix with legacy train scripts. |
| `config/intelligence_v4.models.json` | untracked | KERNEL | `model_registry.ts` | yes | yes | Keep pinned model config authority. |
| `config/intelligence_v4.policy.json` | untracked | KERNEL | `guards.ts` | yes | yes | Keep doctrine vocabulary/policy authority. |
| `scripts/intelligence/smoke_v4.ts` | untracked | KERNEL | `npm run smoke:intelligence:v4` | no (script) | yes | Keep mandatory smoke gate. |
| `src/lib/intelligence/run_analysis.ts` | 2026-02-09 | LEGACY | `/api/second-look`, upload/result actions, integration tests | yes | partial | Freeze feature growth; migrate callers to v4 entrypoint over time. |
| `src/lib/intelligence/run_adapter.ts` | 2026-02-09 | LEGACY | run orchestration/tests | yes | partial | Keep transitional adapter; no new behavior additions. |
| `mcp/tool_registry.ts` | 2026-02-09 | LEGACY | MCP tool execution path + tests | yes | no | Keep for compatibility; introduce v4 tool separately later. |
| `mcp/tools/run_pipeline_v3.ts` | 2026-02-09 | LEGACY | `tool_registry.ts`, pipeline v3 tests/smokes | yes | no | Retain as legacy-active; no new net-new scope. |
| `mcp/tools/run_pipeline_v2.ts` | 2026-01-31 | LEGACY | `tool_registry.ts`, fallback path from `run_analysis` | yes | no | Retain only as explicit fallback. |
| `src/lib/present/build_decision_artifact.ts` | 2026-02-05 | LEGACY | `run_analysis.ts` | yes | no | Keep for v2/v3 outputs; do not extend for v4. |
| `src/lib/present/present_coherence.ts` | 2026-02-06 | LEGACY | `run_analysis.ts`, v3 pipeline | yes | no | Keep legacy presentation adapter only. |
| `src/lib/prompts/decision_snapshot_prompt.ts` | 2026-02-04 | LEGACY | `src/lib/prompts/index.ts`, prompt safety tests | yes | no | Keep deprecated; no new prompt variants here. |
| `src/lib/prompts/index.ts` | 2026-02-09 | LEGACY | local prompt imports/tests | yes | no | Keep as legacy prompt export surface only. |
| `src/app/api/decision/route.ts` | 2026-02-05 | LEGACY | UI/API clients for v2 decision inference | yes | no | Keep route, label legacy, avoid new features. |
| `src/app/api/decision/diag/route.ts` | 2026-02-05 | LEGACY | dev diagnostics | yes (dev) | no | Keep for diagnostics; legacy-labeled. |
| `src/app/api/decision/dev/set-model/route.ts` | 2026-02-05 | LEGACY | dev model override flow | yes (dev) | no | Keep dev-only; legacy-labeled. |
| `src/app/api/snapshot/ingest/route.ts` | 2026-01-31 | LEGACY | snapshot UI ingest flow | yes | no | Keep for existing snapshot UX; no expansion. |
| `src/app/api/snapshot/compute/route.ts` | 2026-01-31 | LEGACY | snapshot UI compute flow | yes | no | Keep for existing snapshot UX; no expansion. |
| `src/app/api/second-look/route.ts` | untracked | LEGACY | second-look wizard; calls `run_analysis` | yes | partial | Transitional; migrate to direct v4 orchestration after parity. |
| `src/app/app/upload/actions.ts` | 2026-02-09 | LEGACY | upload UI path to `run_analysis` | yes | partial | Keep current behavior; migrate after v4 API route exists. |
| `src/app/app/results/[run_id]/actions.ts` | 2026-02-09 | LEGACY | rerun/regenerate actions via `run_analysis` | yes | partial | Keep until v4-backed actions are introduced. |
| `src/lib/intelligence/store.ts` | 2026-02-03 | UTILITY | routes, pipeline tools, run persistence | yes | yes | Keep shared persistence layer. |
| `src/lib/intelligence/storage.ts` | 2026-01-31 | UTILITY | storage-backed flows/tests | yes | yes | Keep as shared utility, no product logic. |
| `src/lib/intelligence/run_lock.ts` | 2026-02-03 | UTILITY | `/api/second-look`, tests | yes | yes | Keep deterministic lock primitive. |
| `src/lib/intelligence/predictive/predictive_context.ts` | 2026-02-03 | LEGACY | `run_analysis.ts`, tests | yes | partial | Keep legacy prediction context; avoid coupling with v4. |
| `src/lib/snapshot/storage.ts` | 2026-01-31 | UTILITY | snapshot routes and print/pdf helpers | yes | no | Keep storage helper for snapshot artifacts. |
| `src/lib/coherence/index.ts` | 2026-02-06 | LEGACY | `run_pipeline_v3.ts`, coherence tests | yes | no | Keep v3 engine isolated from v4. |
| `src/lib/cohort_engine/index.ts` | untracked | UNKNOWN | cohort tests/reference only | unclear | no | Leave in place; verify runtime necessity before moving. |
| `src/lib/second_look_v2/contracts/*` | untracked | LEGACY | second-look route + run_analysis | yes | no | Keep as separate artifact line; do not merge into v4 kernel yet. |
| `src/lib/second_look_v2/assembly/*` | untracked | LEGACY | second-look route + tests | yes | no | Keep modular assembly isolated from kernel. |
| `src/app/api/internal/mock-run/route.ts` | 2026-02-09 | LEGACY | internal test tooling | yes (guarded) | no | Keep internal-only; not kernel. |
| `src/app/api/internal/mock-run/status/route.ts` | 2026-02-06 | LEGACY | internal test tooling | yes (guarded) | no | Keep internal-only; not kernel. |
| `experiments/mcp/mcp_run_demo.ts` | untracked | EXPERIMENTAL | none | no | no | Keep quarantined in `experiments/`. |
| `experiments/mcp/mcp_call.ts` | untracked | EXPERIMENTAL | demo callers only | no | no | Keep quarantined in `experiments/`. |
| `experiments/scripts/decision_closure_demo.ts` | untracked | EXPERIMENTAL | none | no | no | Keep quarantined in `experiments/`. |
| `experiments/scripts/eval/*` | untracked | EXPERIMENTAL | none in runtime path | no | no | Keep quarantined; do not import from active code. |

## Quarantine Moves Performed
- `mcp/mcp_run_demo.ts` -> `experiments/mcp/mcp_run_demo.ts`
- `mcp/mcp_call.ts` -> `experiments/mcp/mcp_call.ts`
- `scripts/decision_closure_demo.ts` -> `experiments/scripts/decision_closure_demo.ts`
- `scripts/mcp_call.ts` -> `experiments/scripts/mcp_call.ts`
- `scripts/eval/*` -> `experiments/scripts/eval/*`

## Notes
- This inventory is module-level (not every single file) to keep kernel boundaries actionable.
- Non-intelligence UI components were not moved in this pass; behavior preservation is prioritized.
