# Runtime Governance System — Decision v2

**Status**: Implemented
**Last Updated**: 2026-02-02

## Overview

This document describes the runtime governance system for the Decision v2 pipeline (`upload` → `rerun` → `/app/results/[run_id]`). The system ensures that:

1. ML signals execute and are tracked
2. Agent inference only runs when safe to do so
3. Steps execute in order exactly once
4. No overlapping runs occur for the same workspace
5. Predictive context exists as a finite watch list

This is **NOT** a monitoring/dashboard system. It is a runtime gating and proof-of-execution system with doctrine-safe fallbacks.

---

## Part A — Single-Run Lock (Concurrency Control)

### Problem
Without locking, two uploads or reruns for the same workspace could execute simultaneously, causing:
- Race conditions in database writes
- Confused run states
- Wasted compute

### Solution: Workspace-Scoped Lock with TTL

**Location**: `src/lib/intelligence/run_lock.ts`

**Functions**:
- `acquireRunLock(workspace_id, owner, ttl_seconds)`: Acquires a lock or returns `acquired: false`
- `releaseRunLock(lock_id)`: Releases the lock

**Enforcement Points**:
1. **Primary**: `src/app/app/upload/actions.ts` (`runUploadAction`)
2. **Primary**: `src/app/app/results/[run_id]/actions.ts` (`rerunSnapshot`)

**Behavior**:
- If lock cannot be acquired, the user sees: *"A snapshot is already running for this workspace. Please wait a moment and refresh."*
- Lock is **always** released in a `finally` block after `runAnalysisFromPack` completes
- TTL default: 300 seconds (prevents deadlocks)

**Implementation**:
- **SQLite** (local dev): `run_locks` table with `UPSERT` on `workspace_id`
- **Supabase** (production): `run_locks` table with `UPSERT` on `workspace_id`
- Migration: `supabase/migrations/0011_run_locks.sql`

**Test Coverage**: `tests/run_lock.test.ts`

---

## Part B — Run Manifest (Receipt System)

### Purpose
Track which steps ran, in what order, and whether they succeeded/skipped/failed. This is a **receipt**, not a monitoring system.

**Location**: `src/lib/intelligence/run_manifest.ts`

**Type**: `RunManifest`
```typescript
{
  run_id: string;
  workspace_id: string;
  mode: string;
  lock_id?: string;
  created_at: string;
  finalized_at?: string;
  steps: ManifestStep[];
}
```

**Steps Tracked** (Decision v2):
1. `parse_normalize_pack`
2. `build_business_profile`
3. `build_snapshot_v2` (ML signals)
4. `predictive_context`
5. `infer_decision_v2` (agent)
6. `validate_conclusion_v2`

**Functions**:
- `createManifest(run_id, workspace_id, mode, lock_id?)`
- `markStepStart(manifest, step_name, input_fingerprint?)`
- `markStepSuccess(manifest, step_name, output_refs?, notes?)`
- `markStepSkipped(manifest, step_name, reason?)`
- `markStepError(manifest, step_name, error_message)`
- `finalizeManifest(manifest)`

**Integration**:
- Built in `src/lib/intelligence/run_analysis.ts` (`runAnalysisFromPack`)
- Persisted in `results_json` under `run_manifest` key
- Exposed via `run_adapter.ts` → UI in "Technical details" section

**Input Fingerprinting**:
- Uses `createInputFingerprint()` to hash **aggregate-only metadata** (file names, row counts, date range)
- Does NOT hash raw rows (prevents bloat and privacy issues)

**Test Coverage**: `tests/run_manifest.test.ts`

---

## Part C — Step Gating (Agent Safety)

### Problem
If ML signals are missing or data is broken (e.g., invoices file uploaded but zero invoices detected), the agent should NOT produce confident nonsense.

### Solution: Gate Check Before Inference

**Location**: `src/lib/intelligence/run_analysis.ts` (within `runAnalysisFromPack`)

**Gate Logic**:
```typescript
const hasBlockingWarning = data_warnings.some(
  (w) =>
    w.includes("not recognized") ||
    (invoicesFileProvided && input_recognition.invoices_detected_count === 0) ||
    (quotesFileProvided && input_recognition.quotes_detected_count === 0)
);
```

**If Gated**:
- Skip `infer_decision_v2` and `validate_conclusion_v2` steps
- Mark them as `skipped` in manifest
- Return a doctrine-safe conclusion:
  ```typescript
  {
    takeaway: "We're missing some inputs, so this snapshot is less reliable.",
    nextAction: "Fix exports (check that invoices and quotes are recognized) then re-run.",
    evidence: data_warnings
  }
  ```

**Doctrine Alignment**:
- One clear takeaway (what's wrong)
- One action within 7 days (fix and rerun)
- Why it feels heavy (implicit: incomplete data is stressful)

**UI Behavior**:
- Top-level data warnings alert shows missing inputs
- No confident inference is displayed
- Next action clearly explains what to do

---

## Part D — Predictive Context (Industry Watch List)

### Purpose
Provide a **finite, non-forecast watch list** of industry-specific pressures that might affect cash flow or decision timing in 30-90 days.

**Location**:
- `src/lib/intelligence/predictive/industry_library.ts` (curated mappings)
- `src/lib/intelligence/predictive/predictive_context.ts` (builder)

**Supported Industries**:
- `hvac` — Refrigerant regulations, seasonal demand, energy rebates
- `bbq_restaurant` — Meat price volatility, event season, labor availability
- `contractor` — Material lead times, weather, permit delays
- `landscaping` — End-of-season transitions, equipment maintenance, snow prep
- `plumbing` — Emergency patterns, water heater cycle, new construction
- `electrician` — Panel upgrades, generator season, commercial tenant work
- `general_local_service` — Seasonal patterns, payment terms, competition

**Classification Logic**:
1. Prefer explicit `industry_bucket` from `business_profile`
2. Else infer from `snapshot_keywords` (job types, service mentions)
3. Else fallback to `general_local_service`

**Output**: `PredictiveContext`
```typescript
{
  industry_tag: string;
  watch_list: IndustryWatchItem[];
  disclaimer: "This is a watch list, not a forecast.";
}
```

**Integration**:
- Built in `runAnalysisFromPack` after `build_business_profile` and `build_snapshot_v2`
- Added to `results_json` under `predictive_context` key
- Exposed via presenter → UI in collapsed section: *"What might shift in the next 30–90 days (optional)"*

**UI Behavior** (Quiet Mode):
- Section is **collapsed by default**
- Shows 2-4 watch items when expanded
- Each item includes:
  - Topic
  - Why it matters
  - What to watch
  - Time horizon (e.g., "30-90 days")

**Doctrine Alignment**:
- Finite artifact (not trend dashboards)
- One clear next step (implied: be aware, not reactive)
- Context without prediction (watch items, not forecasts)

**Test Coverage**: `tests/predictive_context.test.ts`

---

## Part E — UI Presentation

### Changes to Results Page

**File**: `src/app/app/results/[run_id]/page.tsx`

1. **Predictive Watch List** (collapsed by default in quiet mode):
   - Section title: *"What might shift in the next 30–90 days (optional)"*
   - Shows `predictive_watch_list` from presenter
   - Disclaimer: *"This is a watch list, not a forecast."*

2. **Technical Details** (nested under "Show technical details"):
   - Shows manifest summary: `6 steps succeeded, 0 skipped, 0 failed (lock: abc123)`
   - Shows evidence signals (existing)

**Presenter Updates**: `lib/decision/v2/present.ts`
- `PresentedArtifact` now includes:
  - `predictive_watch_list?: IndustryWatchItem[]` (top 4 items)
  - `technical_details?: { manifest_summary: string; signals: ... }`
- Manifest summary generated from `run_manifest` step statuses

---

## Part F — Remote Assist Integration

**Status**: Already exists, enhanced with UI entry point

**Store Function**: `createRemoteAssistRequest` (in `store.ts`)

**UI Entry Points**:
1. `/app/remote-assist` page (already exists)
2. **New**: Link on upload page: *"Need help exporting data? Request remote assist"*

**File**: `src/app/app/upload/page.tsx`

**Purpose**: Provides a non-pipeline workflow for users stuck on data exports

---

## Acceptance Checklist

- [x] Two runs in same workspace: second run rejected with calm message
- [x] Normal run: manifest shows steps succeeded in order
- [x] Missing invoices recognition: inference skipped, UI shows warning + next action
- [x] Predictive watch list appears (collapsed by default in quiet mode)
- [x] No dashboards/trends added
- [x] Agent and ML never run simultaneously within a run
- [x] Lock prevents overlap between runs

---

## Testing

**Unit Tests**:
1. `tests/run_manifest.test.ts` — Manifest creation, step tracking, finalization
2. `tests/run_lock.test.ts` — Lock acquisition, rejection, TTL expiry, release
3. `tests/predictive_context.test.ts` — Industry classification, watch list generation

**Integration Testing** (Manual):
1. Upload invoices CSV with wrong headers → verify inference skipped
2. Start two uploads quickly → verify second rejected
3. Complete normal run → verify manifest in technical details
4. Check quiet mode → verify predictive section collapsed

---

## Migration Notes

**Supabase**:
- Run migration `0011_run_locks.sql` to create `run_locks` table
- Migration includes RLS policies matching existing patterns

**SQLite** (local dev):
- Table auto-created on first lock acquisition
- No migration needed

---

## Future Considerations

**NOT Implemented** (by design):
- Background jobs
- Monitoring dashboards
- KPI tracking
- Parallel execution
- Automatic retry logic
- Notification systems

**Why**: Doctrine maintains *finite artifact, one clear next step*. Governance proves execution, doesn't add observability surface area.

**If Needed Later**:
- Add `run_manifest` analysis endpoint (admin only)
- Create lock cleanup job for expired locks (optional, TTL handles it)
- Expand predictive library with more industries

---

## Key Files Reference

### Core Governance
- `src/lib/intelligence/run_lock.ts` — Lock acquisition/release
- `src/lib/intelligence/run_manifest.ts` — Manifest creation/tracking
- `src/lib/intelligence/run_analysis.ts` — Orchestration + gating

### Predictive Context
- `src/lib/intelligence/predictive/industry_library.ts` — Curated watch items
- `src/lib/intelligence/predictive/predictive_context.ts` — Classification + builder

### Actions (Lock Enforcement)
- `src/app/app/upload/actions.ts` — Upload action with lock
- `src/app/app/results/[run_id]/actions.ts` — Rerun action with lock

### UI Presentation
- `lib/decision/v2/present.ts` — Artifact presenter
- `src/app/app/results/[run_id]/page.tsx` — Results page
- `src/app/app/upload/page.tsx` — Upload page (remote assist link)

### Adapters
- `src/lib/intelligence/run_adapter.ts` — Run data adapter (includes manifest)
- `src/lib/intelligence/store.ts` — Storage abstraction (SQLite + Supabase)

### Migrations
- `supabase/migrations/0011_run_locks.sql` — Run locks table

### Tests
- `tests/run_manifest.test.ts`
- `tests/run_lock.test.ts`
- `tests/predictive_context.test.ts`

---

## Philosophy Alignment

This system respects the 2ndmynd doctrine:

1. **Finite artifact**: Manifest is a receipt, not a log stream
2. **One clear next step**: Gating returns actionable guidance
3. **No dashboards**: Predictive context is a watch list, not a trend tracker
4. **Proof over monitoring**: Manifest proves execution happened
5. **Calm operations**: Lock rejection is gentle, not alarming

The system enables **runtime governance** without creating **runtime complexity**.
