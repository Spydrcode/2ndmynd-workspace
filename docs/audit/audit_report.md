# Intelligence Layer Audit Report

## Executive Summary
The Intelligence Layer is end-to-end wired (agents -> MCP -> snapshot -> decision -> ML -> RAG -> vectors -> UI). No silent degradation paths remain; generic artifacts now surface explicit causes. Internal-only systems are safely gated. Learning is production-safe and non-contaminated by RAG.

## Verified Connections
- MCP tools registration and usage: VERIFIED. Evidence: wiring check PASS in `runs/audit/wiring_check.json` (2026-02-05).
- Snapshot -> decision pipeline: VERIFIED. Evidence: E2E mock run pipeline PASS in `runs/audit/wiring_check.json`.
- Decision artifact -> UI rendering: VERIFIED WITH FLAGS. Evidence: render path exists in `src/app/app/results/[run_id]/page.tsx`, but UI rendering is not covered by wiring check; confirm via internal testing UI in `docs/audit/runbook.md`.
- ML learning capture -> storage -> training -> inference: VERIFIED WITH FLAGS. Evidence: capture + invariants in `src/lib/learning/__tests__/build_training_example_v1.test.ts`, storage in `src/lib/learning/__tests__/store_jsonl.test.ts`, inference behavior in `src/lib/learning/__tests__/infer.test.ts`; training execution is Python-driven and not part of wiring check.
- Vector similarity backends + fallback: VERIFIED WITH FLAGS. Evidence: backend selection + JSONL fallback in `src/lib/learning/vector_index/index_client.ts`; runtime configuration dependent.
- RAG ingestion + retrieval (context-only): VERIFIED. Evidence: RAG integration PASS in `runs/audit/wiring_check.json` (`src/lib/rag/__tests__/integration.test.ts`).
- Internal testing UI + routes: VERIFIED WITH FLAGS. Evidence: guard + integration coverage in `src/lib/internal/testing/__tests__/status.test.ts`, `src/lib/internal/testing/__tests__/integration.test.ts`, and `src/app/api/internal/runtime/__tests__/route.test.ts`; route access is gated by internal guard.

## Safety & Invariants
- RAG excluded from learning (see `rag_safety_invariants.test.ts`; current enforcement in `src/lib/prompts/__tests__/rag_safety.test.ts` and `src/lib/learning/__tests__/build_training_example_v1.test.ts`).
- No PII in learning or vectors (`src/lib/learning/__tests__/pii_guards.test.ts`).
- Learning inference is augmentative only (`src/lib/learning/__tests__/infer.test.ts`).
- Finite artifact doctrine preserved (`src/lib/present/__tests__/build_decision_artifact.test.ts`).
- Internal routes gated (internal=1 + token in prod) (`src/lib/internal/testing/__tests__/status.test.ts`, `src/app/api/internal/runtime/__tests__/route.test.ts`).

## Common Failure Modes (Now Explicit)
- Missing website_url -> fallback_used flag is set in pipeline output instead of silent generic artifacts.
- Internal endpoints blocked -> UI banner surfaces the guard block instead of hanging requests.
- Missing runtime deps -> Runtime Health card surfaces missing Node/Python dependencies.
- Missing python deps -> learning smoke test is skipped with warning rather than silently failing.

## Leverage Enhancements
Leverage layers sit on top of verified wiring and do not change wiring status.
- Industry translations: `docs/leverage/industry_translations.md`
- Pressure action engine: `docs/leverage/pressure_action_engine.md`
- Benchmark narratives: `docs/leverage/benchmark_narratives.md`

## Verification Commands
- Run `npm run audit:wiring` (alias of `npm run wiring:check`) for the wiring check.
- See `docs/audit/wiring_check.md` for interpretation.
- See `docs/audit/runbook.md` for setup and operating procedure.

## Launch Readiness Statement
Done enough for launch when all of the following are true:
- `npm run audit:wiring` passes.
- E2E mock run test passes.
- DecisionArtifact always includes quantified takeaway + pressure translation.
- No generic artifact without an explicit warning explaining why.
