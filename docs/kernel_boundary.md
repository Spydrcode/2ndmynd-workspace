# Kernel Boundary (Binding)

Generated: 2026-02-09  
Status: Binding for intelligence development

## Intelligence Kernel Definition
The 2ndmynd Intelligence Kernel is the minimal, authoritative surface for governed intelligence execution:

- `src/intelligence_v4/pipeline/*`
- `src/intelligence_v4/stages/*`
- `src/intelligence_v4/evals/*`
- `src/intelligence_v4/train/*`
- `config/intelligence_v4.models.json`
- `config/intelligence_v4.policy.json`
- `scripts/intelligence/smoke_v4.ts`

## Authoritative Rules
1. New intelligence orchestration work must start at `src/intelligence_v4/pipeline/run_pipeline_v4.ts`.
2. New stage contracts/guards/models must live under `src/intelligence_v4/`.
3. Model routing and doctrine policy changes must be made through `config/intelligence_v4.*.json`.
4. Any kernel change must remain green on:
   - `npm run build`
   - `npm test`
   - `npm run smoke:intelligence:v4`

## Legacy Boundaries (Do Not Extend)
These areas are active for compatibility but are not authoritative for new intelligence features:

- `src/lib/intelligence/*` (legacy orchestration spine)
- `mcp/tools/run_pipeline_v2.ts`
- `mcp/tools/run_pipeline_v3.ts`
- `src/lib/prompts/*` (legacy prompt surface)
- `src/lib/present/*` (legacy presentation adapters)
- `src/app/api/decision/*`
- `src/app/api/snapshot/*`
- `src/app/api/internal/mock-run/*`

Allowed work in legacy areas:
- Bug fixes
- Compatibility fixes
- Guardrails/documentation labels

Disallowed work in legacy areas:
- New net-new intelligence features
- New model/prompt experimentation
- New decision contracts that should belong to v4

## Quarantine Areas
Non-runtime and spike code is quarantined and must remain isolated:

- `legacy/`
- `intelligence_v2_v3/`
- `agents_old/`
- `pipelines_old/`
- `experiments/`

Rules:
1. No production imports from `experiments/` or `legacy/`.
2. If uncertain whether code is still used, keep in place and mark `LEGACY` rather than moving blindly.
3. Any future removals require import/reference proof in PR notes.

## Where New Work Must Go
- New intelligence stages: `src/intelligence_v4/stages/<stage_name>/`
- New stage schemas/contracts: `src/intelligence_v4/pipeline/contracts.ts` or stage-local schema modules
- New doctrine checks: `src/intelligence_v4/pipeline/guards.ts`
- New eval fixtures/graders: `src/intelligence_v4/evals/`
- New train curation/promotion automation: `src/intelligence_v4/train/`

## Migration Direction
Near-term migration target:

`src/app/api/* intelligence routes -> direct v4 orchestration`

Until migration is complete, legacy paths remain supported but frozen for growth.
