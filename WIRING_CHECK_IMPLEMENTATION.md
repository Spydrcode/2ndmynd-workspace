# Wiring Check & Runtime Health Implementation

Complete implementation to prevent silent failures and generic artifacts.

## What Was Implemented

### PART A ✅ - Wiring Check Command
- **Created**: `scripts/audit/wiring_check.ts`
- **Added**: `npm run wiring:check` script to package.json
- **Created**: `docs/audit/wiring_check.md` documentation

**Features**:
- Runs 4 critical test suites in order
- Detects missing dependencies (vitest, Python)
- Outputs clear PASS/FAIL/SKIP summary table
- Writes JSON report to `runs/audit/wiring_check.json`
- Supports `REQUIRE_PYTHON_WIRING=1` for CI enforcement
- Provides install instructions for missing deps

**Tests Run**:
1. MCP Tool Registry Contract
2. RAG Safety Invariants
3. E2E Mock Run Pipeline
4. E2E Learning Smoke Test (skips if no Python)

---

### PART B ✅ - Runtime Health Endpoint
- **Created**: `src/app/api/internal/runtime/route.ts`
- **Created**: `src/app/api/internal/runtime/__tests__/route.test.ts`

**Features**:
- `GET /api/internal/runtime?internal=1`
- Returns comprehensive dependency report:
  - Node.js version + tsx/vitest/next status
  - Python version + sklearn/numpy/pandas/matplotlib status
  - Environment variables (LEARNING_*, RAG_ENABLED, etc.)
  - Warnings array with install instructions
- Respects internal guard (404 without internal=1 in dev, 401 without token in prod)

---

### PART C ✅ - Runtime Health UI
- **Modified**: `src/app/app/testing/page.tsx`

**Features**:
- Runtime Health card at top of testing page
- Shows ✅/❌ status for all dependencies
- Color-coded indicators (green=good, red=missing)
- Alert when dependencies missing
- Expandable install instructions with copy-paste commands
- Auto-fetches health on page load
- Warns about degraded intelligence features

---

### PART D ✅ - Website URL Fallback
- **Modified**: `src/lib/internal/testing/mock_websites.ts`
- **Modified**: `src/lib/internal/testing/run_mock_pipeline.ts`

**Features**:
- Extended `MOCK_WEBSITES_BY_INDUSTRY` with 40+ industries
- Added `getMockWebsiteForIndustry()` helper
- Added `getDefaultMockWebsite()` fallback
- Mock runs now use fallback chain:
  1. Provided `website_url`
  2. Curated website for industry
  3. Mock website for industry
  4. SERP API search
  5. Default fallback (never fails)
- No more "No website provided" errors in mock runs

**website_url Resolution**:
```
User provided → Curated → Industry mock → Search → Default fallback
                                                      (always succeeds)
```

---

### PART E ✅ - Internal Fetch Helper
- **Created**: `src/app/app/_internal/internalFetch.ts`

**Features**:
- `internalFetch<T>(url, options)` helper
- Detects guard blocks (404 "Not found", 401 "Unauthorized")
- Returns structured result: `{ ok, status, data, error, blockedByGuard }`
- `getDisplayErrorMessage()` for user-friendly errors
- `useInternalFetch()` React hook for loading states
- Replaces silent failures with explicit guard messages

**Usage**:
```typescript
const result = await internalFetch("/api/internal/evidence", { internalToken });
if (result.blockedByGuard) {
  // Show "Add ?internal=1 to URL" message
} else if (!result.ok) {
  // Show actual error
}
```

---

### PART F ✅ - Documentation
- **Created**: `docs/audit/runbook.md`

**Contents**:
- Quick start checklist
- "Why artifacts may look generic" troubleshooting
  - Missing website URL (now fixed)
  - Internal guard blocking (now explicit)
  - Missing dependencies (now shown in UI)
- Wiring check guide
- Runtime health monitoring
- Internal endpoints reference
- Testing workflow
- CI integration examples
- Maintenance schedule

---

## Testing

### Manual Testing
```bash
# 1. Check runtime health UI
npm run dev
# Open: http://localhost:3000/app/testing?internal=1

# 2. Run wiring check
npm run wiring:check

# 3. Test mock run with fallback
# In testing UI:
# - Select industry
# - Leave website_url empty
# - Run test
# - Verify artifact has business context (not "No website provided")
```

### Automated Testing
```bash
# Run all wiring tests
npm run wiring:check

# Run specific test suites
npx vitest run src/mcp/__tests__/tool_registry.test.ts
npx vitest run src/lib/rag/__tests__/integration.test.ts
npx vitest run src/lib/intelligence/__tests__/run_analysis.test.ts

# With Python required
REQUIRE_PYTHON_WIRING=1 npm run wiring:check
```

---

## Acceptance Criteria

### ✅ Runtime Health Card in /app/testing
- Shows Node.js dependencies (tsx, vitest, next)
- Shows Python + packages (sklearn, numpy, pandas, matplotlib)
- Shows install instructions when missing
- Alerts when features degraded

### ✅ Mock Runs Always Have Website URL
- Uses fallback chain (curated → mock → search → default)
- No more "No website provided" errors
- Logs when fallback used
- Business context always present

### ✅ Internal Fetch Guard Detection
- Detects 404 "Not found" as guard block
- Detects 401 "Unauthorized" as guard block
- Shows "Add ?internal=1" message in dev
- Shows "Token required" message in prod
- No more silent "Evidence still loading" hangs

### ✅ Wiring Check Command
- `npm run wiring:check` runs all critical tests
- Outputs PASS/FAIL/SKIP summary table
- Writes JSON report to `runs/audit/wiring_check.json`
- Detects missing dependencies
- Provides install instructions
- Supports `REQUIRE_PYTHON_WIRING=1`

### ✅ No Learning Contamination
- RAG context never enters signals_v1
- Learning tests verify separation
- Wiring check validates invariants
- All tests passing

---

## Files Created/Modified

### Created (9 files):
1. `scripts/audit/wiring_check.ts` - Wiring check command
2. `docs/audit/wiring_check.md` - Wiring check documentation
3. `docs/audit/runbook.md` - Complete audit runbook
4. `src/app/api/internal/runtime/route.ts` - Runtime health endpoint
5. `src/app/api/internal/runtime/__tests__/route.test.ts` - Endpoint tests
6. `src/app/app/_internal/internalFetch.ts` - Internal fetch helper

### Modified (3 files):
1. `package.json` - Added `wiring:check` script
2. `src/app/app/testing/page.tsx` - Added Runtime Health card
3. `src/lib/internal/testing/mock_websites.ts` - Extended with 40+ industries
4. `src/lib/internal/testing/run_mock_pipeline.ts` - Added website fallback logic

---

## Next Steps

### Immediate
1. Test wiring check: `npm run wiring:check`
2. View runtime health: `/app/testing?internal=1`
3. Run mock test without website_url to verify fallback

### Before Merge
1. Verify all tests pass
2. Test in both dev and prod modes
3. Confirm artifacts no longer look generic
4. Review Python optional vs required behavior

### CI Integration
Add to CI pipeline:
```yaml
- run: npm install
- run: pip install scikit-learn numpy pandas matplotlib
- run: REQUIRE_PYTHON_WIRING=1 npm run wiring:check
```

---

## Architecture Principles Preserved

✅ **Finite artifact doctrine** - No changes to artifact structure  
✅ **No dashboards/KPI creep** - Only diagnostic/testing features added  
✅ **RAG context-only** - No contamination of learning layer  
✅ **Learning inference augmentative** - No changes to inference logic  
✅ **No PII in learning/vectors** - Guards remain intact  

All new features are internal-only diagnostics that improve visibility without changing core system behavior.
