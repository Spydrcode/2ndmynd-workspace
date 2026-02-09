# Current State: Workspace Analysis Spine (Ground Truth)

## 1) Call Chain (UI -> API/Action -> Intelligence -> Presentation -> Store -> UI)

```text
/app/upload (UI wizard)
  -> src/app/app/upload/UploadClient.tsx (form submit)
  -> src/app/app/upload/actions.ts:runUploadAction (server action)
  -> src/lib/intelligence/pack_normalizer.ts:normalizeUploadBuffersToDataPack
  -> src/lib/intelligence/run_analysis.ts:runAnalysisFromPack
      -> snapshot_from_pack.ts (snapshot + input recognition)
      -> layer_fusion/layer_fusion.ts (aggregate pressure synthesis)
      -> mcp/tool_registry.ts callTool("pipeline.run_v3") [with v2 fallback]
      -> present/build_decision_artifact.ts (DecisionArtifactV1)
      -> present/present_coherence.ts (PresentedCoherenceArtifact)
  -> src/lib/intelligence/store.ts:updateRun(results_json + business_profile_json)
  -> redirect /app/results/[run_id]
  -> src/app/app/results/[run_id]/page.tsx (reads run via run_adapter.ts)
```

Also active in production code:

```text
/app/results/[run_id] re-run
  -> src/app/app/results/[run_id]/actions.ts:rerunSnapshot
  -> runAnalysisFromPack(...) + store.updateRun(...)
  -> /app/results/[new_run_id]
```

Related but separate pipelines:

```text
/app/snapshot/*
  -> /api/snapshot/ingest + /api/snapshot/compute
  -> src/lib/snapshot/* (legacy one-page snapshot artifact)

/api/decision
  -> lib/decision/v2 inference endpoints (model API), not the upload/run persistence spine

/app/analysis
  -> static demo view (src/lib/demo/demoData), not runAnalysisFromPack
```

## 2) Spine File List (Current System)

- UI entrypoints
  - `src/app/app/upload/UploadClient.tsx`
  - `src/app/app/upload/actions.ts`
  - `src/app/app/results/[run_id]/page.tsx`
  - `src/app/app/results/[run_id]/actions.ts`
- Analysis orchestration
  - `src/lib/intelligence/run_analysis.ts`
  - `src/lib/intelligence/pack_normalizer.ts`
  - `src/lib/intelligence/snapshot_from_pack.ts`
  - `src/lib/intelligence/layer_fusion/layer_fusion.ts`
- Presentation/artifacts
  - `src/lib/present/build_decision_artifact.ts`
  - `src/lib/present/present_coherence.ts`
- Persistence/adapters
  - `src/lib/intelligence/store.ts`
  - `src/lib/intelligence/storage.ts`
  - `src/lib/intelligence/run_adapter.ts`
  - `src/lib/intelligence/run_manifest.ts`
  - `src/lib/intelligence/run_logger.ts`
  - `src/lib/intelligence/run_lock.ts`

## 3) Where Current Design Assumes a Fixed Shape

- `src/lib/present/build_decision_artifact.ts`
  - Artifact backbone is pressure-first and normalized into:
    - `takeaway`
    - `why_heavy`
    - `next_7_days` (max 3 strings)
    - `boundary`
    - `pressure_map`
  - It maps top pressure patterns into a small fixed set (`follow_up_drift`, `capacity_squeeze`, `fragility`), then builds narrative from those templates.
- `src/lib/intelligence/run_analysis.ts`
  - Auto owner intent is inferred from `layer_fusion.recommended_focus` (`follow_up`, `scheduling`, `collections`, etc.), steering toward a common shape before presentation.
- `src/app/app/results/[run_id]/page.tsx`
  - Primary render branches are coherence artifact or DecisionArtifactV1 card layout; no modular assembly surface exists.

Impact: verticals like propane/safety-first operations can be represented, but are still pulled into a common pressure/next-step narrative frame rather than module-selected artifact composition.

## 4) Reuse vs Adaptation for Second Look V2

### Reuse as-is

- Ingestion + normalization + run persistence
  - `pack_normalizer.ts`, `storage.ts`, `store.ts`, `run_lock.ts`, `run_logger.ts`
- Snapshot and bucketed aggregate generation
  - `snapshot_from_pack.ts`, `src/lib/snapshot/**`, `layer_fusion/**`
- Business profile + optional RAG context retrieval
  - `web_profile.ts`, `rag/index.ts` (`getRagContext`)
- Existing run/result storage shape in `runs.results_json`

### Adapt/add (without breaking legacy)

- Add new contracts and validator layer for mindset-first intake + assembled artifact.
- Add module registry/selector/assembler to build artifact sections by intake values/pressure context.
- Extend `runAnalysisFromPack` with optional `second_look_intake_v2` and return/store `second_look_artifact_v2`.
- Add a dedicated `/api/second-look` route for on-demand generation from existing run/pack context.
- Add separate `/second-look` UI flow (wizard + print/export), leaving `/app/*` unchanged.

## 5) Storage Ground Truth

- Runs are persisted in `runs.results_json` (SQLite or Supabase via `src/lib/intelligence/store.ts`).
- Existing artifact fields are already nested in `results_json` (`decision_artifact`, `presented_coherence_v1`, etc.).
- `second_look_artifact_v2` can be added as another sibling field in `results_json` with no schema migration in SQLite mode.
