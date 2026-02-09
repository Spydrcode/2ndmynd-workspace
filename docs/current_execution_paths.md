# Current Execution Paths

Generated: 2026-02-09

## Authoritative Intelligence Entry Point
`src/intelligence_v4/pipeline/run_pipeline_v4.ts`

This is the only path that should be treated as the **current intelligence kernel** for new intelligence development.

## API Route Mapping
| route | downstream execution path | status | notes |
|---|---|---|---|
| `POST /api/decision` (`src/app/api/decision/route.ts`) | `inferDecisionV2` / legacy `getDecisionConclusion` | LEGACY | v2/v3 decision endpoint; legacy-labeled in code header. |
| `GET /api/decision/diag` (`src/app/api/decision/diag/route.ts`) | Supabase model registry diagnostics | LEGACY | dev/support endpoint; legacy-labeled. |
| `POST /api/decision/dev/set-model` (`src/app/api/decision/dev/set-model/route.ts`) | Supabase model registry write | LEGACY | dev-only override path; legacy-labeled. |
| `POST /api/snapshot/ingest` (`src/app/api/snapshot/ingest/route.ts`) | snapshot ingest parser + `src/lib/snapshot/*` | LEGACY | snapshot v1 flow retained for current UI. |
| `POST /api/snapshot/compute` (`src/app/api/snapshot/compute/route.ts`) | snapshot compute + narrative artifact | LEGACY | snapshot v1 flow retained for current UI. |
| `POST /api/second-look` (`src/app/api/second-look/route.ts`) | `runAnalysisFromPack` + second_look_v2 assembly | TRANSITIONAL (v3 + second_look_v2) | not a v4 route yet; transitional-labeled. |
| `POST /api/internal/mock-run` (`src/app/api/internal/mock-run/route.ts`) | internal mock pipeline job runner | LEGACY INTERNAL | guarded internal tooling only. |
| `GET /api/internal/mock-run/status` (`src/app/api/internal/mock-run/status/route.ts`) | internal mock job status file reader | LEGACY INTERNAL | guarded internal tooling only. |

## UI Action Paths Still Using Legacy Orchestration
| UI action path | execution target | status |
|---|---|---|
| `src/app/app/upload/actions.ts` | `runAnalysisFromPack` | LEGACY-ACTIVE |
| `src/app/app/results/[run_id]/actions.ts` | `runAnalysisFromPack` | LEGACY-ACTIVE |

## MCP Tool Paths
| tool | implementation | status | notes |
|---|---|---|---|
| `pipeline.run_v2` | `mcp/tools/run_pipeline_v2.ts` | LEGACY | compatibility + fallback only. |
| `pipeline.run_v3` | `mcp/tools/run_pipeline_v3.ts` | LEGACY-ACTIVE | current coherence-oriented production path in legacy stack. |

## Effective Runtime Chain Today
Most active product flows still execute:

`UI -> API/action -> runAnalysisFromPack -> mcp pipeline.run_v3 (fallback v2) -> present/store`

Kernel path exists in parallel:

`script/eval/test -> runPipelineV4 -> stage artifacts -> final decision artifact`

## Enforcement in This Cleanup Pass
- Legacy routes were explicitly labeled in headers.
- No route behavior changes were introduced.
- No v4 logic was moved or rewritten.
