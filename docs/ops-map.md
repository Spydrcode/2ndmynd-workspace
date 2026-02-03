# 2ndmynd Workspace — Operator’s Map (Routes → Storage → Artifacts)

This repo ships two finite, document-like outputs:
- **Snapshot v1**: “Operational Pattern Snapshot” (peer baseline + healthy envelope + 3 static visuals + PDF)
- **Decision v2**: “Business snapshot” (one takeaway + one action + evidence chips, grounded to snapshot_v2)

No dashboards. No time-series monitoring. No scores.

---

## Snapshot v1 (Operational Pattern Snapshot)

### User flow (UI → artifact)
1) `GET /app/snapshot` → `src/app/app/snapshot/page.tsx`
2) Upload CSVs or use demo → `POST /api/snapshot/ingest`
3) Compute snapshot → `POST /api/snapshot/compute`
4) View artifact → `GET /app/snapshot/result/<runId>`
5) Download PDF → `GET /api/snapshot/pdf/<runId>`

### API routes (v1)
- Ingest: `src/app/api/snapshot/ingest/route.ts`
  - Input: `multipart/form-data` (`quotes_csv`, `invoices_csv`, optional cohort selection internal)
  - Writes:
    - `runs/snapshot/<runId>/meta.json`
    - `runs/snapshot/<runId>/input.json` (temporary; raw rows; deleted after compute by default)
- Compute: `src/app/api/snapshot/compute/route.ts`
  - Reads: `input.json` + baseline/envelope fixtures
  - Writes:
    - `companyProfile.json`
    - `deviationSummary.json`
    - `healthComparison.json`
    - `artifact.json`
  - Deletes: `input.json` in a privacy-safe path (try/finally cleanup)
- PDF: `src/app/api/snapshot/pdf/[runId]/route.ts`
  - Renders the result page via Playwright (server-side) and returns `application/pdf`
  - Optionally caches `runs/snapshot/<runId>/artifact.pdf`

### Storage (v1)
Filesystem only (no DB):
- `runs/snapshot/<runId>/meta.json` (cohort + resolved IDs for trace/debug)
- `runs/snapshot/<runId>/input.json` (temporary raw rows; should not persist)
- `runs/snapshot/<runId>/companyProfile.json` (bucketed fingerprint)
- `runs/snapshot/<runId>/deviationSummary.json` (baseline deltas + notes + one decision sentence)
- `runs/snapshot/<runId>/healthComparison.json` (stable range check results)
- `runs/snapshot/<runId>/artifact.json` (finite page model)
- `runs/snapshot/<runId>/artifact.pdf` (optional cache)

### Engine components (v1)
- Schemas/types: `src/lib/snapshot/schema.ts`
- Bucketing/parsing: `src/lib/snapshot/buckets.ts`
- Profile computation: `src/lib/snapshot/profile.ts`
- Baselines: `src/lib/snapshot/baseline.ts`
- Cohort registry: `src/lib/snapshot/cohorts.ts`
- Deviations: `src/lib/snapshot/deviation.ts`
- Healthy envelope checks: `src/lib/snapshot/healthy.ts`
- Calibration defaults + centralized thresholds: `src/lib/snapshot/calibration.ts`
- Narrative engine (deterministic rules): `src/lib/snapshot/insight_engine.ts`
- Artifact assembly: `src/lib/snapshot/text.ts`
- Run storage helpers: `src/lib/snapshot/storage.ts`

### Fixtures (v1)
- Baselines: `fixtures/baselines/*.json`
- Healthy envelopes: `fixtures/healthy_envelopes/*.json`
- Calibration defaults: `fixtures/calibration/defaults_v1.json`

### Demo fixtures (v1)
Public, synthetic CSVs:
- Typical: `public/fixtures/snapshot/quotes_export.csv`, `public/fixtures/snapshot/invoices_export.csv`
- Shape demos:
  - `public/fixtures/snapshot/demo_small_job_heavy/*`
  - `public/fixtures/snapshot/demo_high_concentration/*`

---

## Decision v2 (Business snapshot)

### User flow (upload → run → results)
1) `GET /app/upload` → `src/app/app/upload/page.tsx`
2) Upload exports (multiple files allowed) → server action: `src/app/app/upload/actions.ts`
3) Redirect: `GET /app/results/<run_id>` → `src/app/app/results/[run_id]/page.tsx`
4) Optional rerun (same pack) → `src/app/app/results/[run_id]/actions.ts`
5) Download JSON bundle → `GET /app/results/<run_id>/download`

### Core pipeline (Decision v2)
The “golden spine” is:
1) Parse files → `src/lib/intelligence/file_parsers.ts` (CSV/XLSX; normalized headers)
2) Normalize to DataPackV0 + PII redaction → `src/lib/intelligence/pack_normalizer.ts`
3) Build snapshot_v2 + recognition report → `src/lib/intelligence/snapshot_from_pack.ts`
4) Run inference + validate (schema + grounding) → `src/lib/intelligence/run_analysis.ts`
5) Persist run in Store → `src/lib/intelligence/store.ts`
6) Present result as a finite artifact (no raw keys by default) → `lib/decision/v2/present.ts` + `src/app/app/results/[run_id]/page.tsx`

### Snapshot_v2 and conclusion_v2 contracts
- snapshot_v2 schema + grounding rules: `lib/decision/v2/conclusion_schema_v2.ts`
- snapshot_v2 builder (windowed, aggregate-only): `lib/decision/v2/snapshot/build_snapshot_v2.ts`
- inference engine (LLM + deterministic fallback + forbidden-term checks): `lib/decision/v2/decision_infer_v2.ts`
- full pipeline runner (scrub → snapshot_v2 → infer → validate; logging optional): `lib/decision/v2/run_pipeline_v2.ts`

### Evidence signals (v2)
Evidence is a list of **grounded literals**:
- Format: `signals.<path>=<value>`
- Examples:
  - `signals.activity_signals.invoices.invoices_paid_count=28`
  - `signals.activity_signals.quotes.decision_lag_band=high`
  - `signals.volatility_band=very_high`

Grounding rules:
- Every evidence path must exist in the snapshot and resolve to a literal leaf value.
- If grounding fails, inference applies a deterministic evidence patch (still grounded).

### Results presentation layer (v2)
Server-side translation of signals to human labels:
- Signal catalog: `lib/decision/v2/signal_catalog.ts`
- Presenter (builds view model): `lib/decision/v2/present.ts`

Client-facing UI rules:
- No raw `signals.*` shown by default.
- Technical details are explicitly user-expanded.
- Evidence and data health are collapsed by default.
- Quiet mode: `GET /app/results/<run_id>?quiet=1`

---

## Storage model (Decision v2)

### Store implementation
`src/lib/intelligence/store.ts` chooses storage by environment:
- If Supabase admin config exists → uses Supabase tables.
- Else → uses local SQLite at `tmp/intelligence.db`.

### Run payloads (Decision v2)
`runs` store includes:
- `results_json`:
  - `snapshot` (snapshot_v2 aggregates)
  - `conclusion` (conclusion_v2)
  - `validation`
  - `meta` (pipeline meta when available)
  - `input_recognition` (aggregate-only)
  - `data_warnings` (strings; aggregate-only)
- `business_profile_json` (website-based context; optional)

Privacy boundaries:
- pack normalization redacts email/phone patterns before building snapshot.
- tools/LLM only see snapshot_v2 aggregates, not raw CSV rows.

---

## MCP tools (agent boundary enforcement)

Tool registry (AJV-validated I/O):
- `mcp/tool_registry.ts`

Tools:
- `decision.infer_v2` → `mcp/tools/infer_decision_v2.ts`
- `decision.validate_v2` → `mcp/tools/validate_conclusion_v2.ts`
- `pipeline.run_v2` → `mcp/tools/run_pipeline_v2.ts`
- `datasets.run_mock_pack_v2` → `mcp/tools/run_mock_pack_v2.ts`

Key rule:
- Tools enforce schema at the boundary and operate on aggregates only.

---

## Offline calibration (HF datasets) — never runtime

Scripts (offline only):
- `scripts/calibration/requirements.txt`
- `scripts/calibration/calibrate_from_hf.py`
- `scripts/calibration/emit_calibration_fixtures.py`

Runtime reads fixtures only:
- `fixtures/calibration/defaults_v1.json`

---

## Environment flags (operator controls)

Auth gating:
- `AUTH_DISABLED`:
  - default (not `"0"`) → login gating disabled in `middleware.ts`
  - `"0"` → re-enable middleware protection

Decision pipeline mode:
- `INTELLIGENCE_MODE` (affects upload/rerun labeling; mock/live)

OpenAI:
- `OPENAI_API_KEY` (required for live v2 inference; mock/fallback paths exist)

Playwright:
- install browsers: `npm run pw:install`

---

## Quick troubleshooting checklist

### “Invoices = 0” (Decision v2)
Likely causes:
- invoice date column didn’t parse → `issued_at` missing → dropped by lookback window
- status/total columns not recognized

Where to check:
- `src/lib/intelligence/pack_normalizer.ts` (header mapping + date parsing)
- `lib/decision/v2/snapshot/build_snapshot_v2.ts` (filter uses `issued_at`)
- Result page “Data note” + “Recognition” line (aggregate-only)

### Snapshot v1 result page fails to render
Check:
- `runs/snapshot/<runId>/artifact.json` exists
- `artifact.baseline_id` resolves to a file in `fixtures/baselines/*.json`

### Raw input lingering (Snapshot v1)
Expectation:
- `runs/snapshot/<runId>/input.json` should not exist after compute attempt
If it does, inspect `src/app/api/snapshot/compute/route.ts` error path.

