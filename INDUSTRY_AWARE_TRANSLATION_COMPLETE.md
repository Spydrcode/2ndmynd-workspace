# Industry-Aware Decision Translation System — COMPLETE ✅

**Objective**: Upgrade 2ndmynd decision artifact to produce non-generic, industry-felt insights across ~40 owner-led industries without hand-writing 40 bespoke narratives.

**Result**: System scales cleanly to all industries through 6 IndustryGroups, with specific overrides for 3 showcase industries (HVAC, Painter, Taco Stand).

---

## PART A — PRESSURE MODEL (CANONICAL) ✅

**File**: `src/lib/pressures/pressure_translation.ts`

**Canonical Pressure Keys** (7 total + 1 meta):
```typescript
type CanonicalPressureKey =
  | "concentration_risk"
  | "follow_up_drift"
  | "capacity_pressure"
  | "decision_lag"
  | "low_conversion"
  | "rhythm_volatility"
  | "cashflow_drag"
  | "mapping_low_confidence";
```

Each pressure resolves to:
- `owner_felt_line` - Plain owner language
- `explanation` - Why this matters
- `recommended_move` - What to do
- `boundary` - When NOT to act

---

## PART B — INDUSTRY GROUP MODEL ✅

**File**: `src/lib/industry/industry_groups.ts`

**Industry Groups** (6 total):
```typescript
type IndustryGroup =
  | "home_services_trade"     // HVAC, plumbing, electrician
  | "project_trades"           // Painter, roofer, GC, flooring
  | "route_service"            // Pest, pool, lawn, cleaning
  | "food_mobile"              // Taco stand, food truck, catering
  | "sales_led"                // Solar, propane, equipment sales
  | "specialty_local";         // Auto repair, locksmith, appliance
```

**Industry Mapping** (`INDUSTRY_TO_GROUP`):
- **40+ industries mapped** to exactly one group
- Guarantees 100% coverage immediately
- Examples:
  - `hvac` → `home_services_trade`
  - `painter` → `project_trades`
  - `taco_stand` → `food_mobile`
  - `solar_sales` → `sales_led`
  - `auto_repair` → `specialty_local`

**Fallback Logic**:
- `getIndustryGroup(industry_key)` - Maps industry_key to group
- `getIndustryGroupFromCohort(cohort_label)` - Derives from cohort when industry_key missing
- Fallback: `specialty_local` for unknowns

---

## PART C — GROUP-LEVEL TRANSLATIONS ✅

**File**: `src/lib/pressures/group_translations.ts`

**Coverage**: 6 groups × 8 pressures = **48 translations**

Each translation provides industry-specific language:

### Example: `home_services_trade` × `concentration_risk`
```typescript
{
  owner_felt_line: "A few big jobs are carrying the month, so when one moves, everything feels unstable.",
  explanation: "When revenue concentrates into a small number of installs or projects, scheduling and cash planning become fragile.",
  recommended_move: "Build a mid-ticket service lane that can absorb slips without owner intervention.",
  boundary: "If your model is intentionally install-heavy with deposits and milestones, this pressure is expected."
}
```

### Example: `food_mobile` × `capacity_pressure`
```typescript
{
  owner_felt_line: "Prep and service compete; you run out before the rush ends.",
  explanation: "When prep capacity limits throughput, peak demand becomes constrained. Revenue is left on the table.",
  recommended_move: "Separate prep from service: prep in bulk off-peak, simplify menu to 3-5 fast items during rush.",
  boundary: "If your menu is complex or made-to-order, capacity pressure is structural—protect with pre-orders or limited hours."
}
```

**All 6 groups have complete coverage** for all 8 pressure keys.

---

## PART D — NAMED INDUSTRY OVERRIDES ✅

**File**: `src/lib/pressures/industry_overrides.ts`

**3 Showcase Industries** (quality bar + proof of portability):

### 1. HVAC (`industry_key="hvac"`, group=`home_services_trade`)

**Owner-felt lines** (verbatim):
- `concentration_risk`: "**One install slipping can move your whole month.**"
- `rhythm_volatility`: "**Busy weeks don't feel repeatable.**"

**Action patterns**:
- Service vs install lanes
- Mid-ticket maintenance bundles
- 48-hour follow-up rhythm for mid-sized work

**Boundary**:
- Install-heavy by design → protect with deposits + service lane

### 2. Painter (`industry_key="painter"`, group=`project_trades`)

**Owner-felt lines**:
- `concentration_risk`: "**One big paint job sets the pace for the whole month**"
- `follow_up_drift`: "**Quotes stall while customers decide colors and timing**"
- `capacity_pressure`: "**Prep time breaks the schedule even when the calendar looks full**"

**Action patterns**:
- Batching by neighborhood
- Deposits + milestone billing
- Dedicated prep days
- Quote clarity (3 tiers)

**Boundary**:
- Custom high-end projects → pipeline depth + milestone discipline

### 3. Taco Stand (`industry_key="taco_stand"`, group=`food_mobile`)

**Owner-felt lines**:
- `concentration_risk`: "**A few slow days can erase a week's profit**"
- `follow_up_drift`: "**Demand is real-time—if the line isn't there, you feel it immediately**" (reframed: not applicable)
- `capacity_pressure`: "**Prep and service compete; you run out before the rush ends**"

**Action patterns**:
- Prep forecasting (bulk off-peak)
- Menu simplification (3-5 fast items)
- Peak-hour throughput optimization
- Location/slot strategy

**Boundary**:
- Event-based/seasonal → variability expected; protect cash buffer + pre-orders

**These 3 industries feel unmistakably different** in tests.

---

## PART E — RESOLUTION LOGIC ✅

**File**: `src/lib/pressures/pressure_translation.ts`

**Function**: `resolvePressureTranslation()`

**Resolution Order** (3-tier fallback):
1. **Named industry override** (if `industry_key` matches)
2. **IndustryGroup translation** (derived from `industry_key` or `cohort_label`)
3. **Fallback generic** (should almost never be used)

**Example Resolution**:
```typescript
// HVAC with override
resolvePressureTranslation({
  pressure_key: "concentration_risk",
  industry_key: "hvac",
}) 
// Returns: "One install slipping can move your whole month."

// Plumbing without override (uses group)
resolvePressureTranslation({
  pressure_key: "concentration_risk",
  industry_key: "plumbing",
})
// Returns: "A few big jobs are carrying the month, so when one moves, everything feels unstable."

// Cohort fallback
resolvePressureTranslation({
  pressure_key: "concentration_risk",
  cohort_label: "Home Services",
})
// Returns: "A few big jobs are carrying the month..." (home_services_trade group)
```

---

## PART F — DECISION ARTIFACT INTEGRATION ✅

**File**: `src/lib/present/build_decision_artifact.ts`

**Updated Functions**:
1. `buildPressureMap()` - Uses `resolvePressureTranslation()` for industry-aware language
2. `buildTakeaway()` - Combines owner-felt line + quantified benchmarks
3. `buildWhyHeavy()` - Industry anchor sentence always appears
4. `next_7_days` - Industry-aware action templates with bound numbers
5. `buildBoundary()` - Industry-aware boundary conditions

**Artifact Output** remains finite:
- One clear takeaway (owner-felt + benchmarks)
- Next 7 days (2-3 industry-specific actions)
- Boundary (industry context)
- Pressure map (max 3 pressures, industry language)

**No dashboards. No KPI creep. No monitoring.**

---

## PART G — ML + RAG SAFETY ✅

**Guarantees**:
- ✅ Pressure translations NEVER enter `signals_v1`
- ✅ Learning layer trains only on deterministic aggregates
- ✅ RAG context: advisory only, excluded from capture/vectors/training
- ✅ Learning inference remains augmentative only
- ✅ Identical metrics with or without RAG (test-verified)

**All doctrines preserved**:
- Finite artifact ✅
- No dashboards ✅
- No KPI sprawl ✅
- ML signals deterministic ✅
- RAG enriches narrative only ✅
- Learning layer clean ✅

---

## TESTING ✅

**File**: `src/lib/pressures/__tests__/industry_resolution.test.ts`

**18 Tests - ALL PASSING**:

### Named Industry Overrides (4 tests) ✅
- HVAC uses "One install slipping can move your whole month"
- Painter uses "Quotes stall while customers decide colors and timing"
- Taco Stand uses "A few slow days can erase a week's profit"
- Complete translation structure returned

### Group-Level Translations (5 tests) ✅
- Falls back to group when no override exists
- All 6 groups have distinct language
- Examples: plumber, roofer, pest_control, solar_sales, auto_repair

### Cohort Label Fallback (2 tests) ✅
- "Home Services" → `home_services_trade` group
- "Professional Services" → `sales_led` group

### Coverage Guarantees (2 tests) ✅
- All 8 canonical pressure keys covered
- All 6 industry groups covered
- No generic fallback for known industries

### Industry Distinctions (2 tests) ✅
- HVAC vs Painter: unmistakably different for same pressure
- Taco Stand vs HVAC: completely different contexts

### Industry Mapping (2 tests) ✅
- All 40+ industries map to specific groups
- Unknown industries → `specialty_local` fallback

### No Generic Language (1 test) ✅
- "Something needs attention" never appears for known industries
- "Patterns detected" never appears in explanations

**Existing Tests** (6 tests) - ALL PASSING ✅:
- Snapshot quantified takeaway
- Benchmark numbers bound into artifact
- Industry anchor always present
- Real numbers in next_7_days
- Schema unchanged (no breaking changes)

---

## DONE CONDITION ✅

✅ **All industries resolve cleanly through group translations**  
- 40+ industries → 6 groups → 48 group translations

✅ **HVAC / Painter / Taco Stand feel unmistakably different**  
- Test-verified: different owner-felt language, different contexts

✅ **No generic language appears in client artifacts**  
- Test-verified: "Something needs attention" never used for known industries

✅ **ML signals remain unchanged**  
- Pressure translations separate from signals_v1
- RAG advisory only, excluded from training

✅ **Artifact reduces decision load, not adds analysis**  
- Finite structure preserved (takeaway, why, next 7 days, boundary)
- No dashboards, no monitoring, no KPI creep

---

## FILES CREATED/MODIFIED

### Created (5 files):
1. `src/lib/industry/industry_groups.ts` - IndustryGroup model + mapping (40+ industries)
2. `src/lib/pressures/group_translations.ts` - 6 groups × 8 pressures = 48 translations
3. `src/lib/pressures/industry_overrides.ts` - HVAC, Painter, Taco Stand overrides
4. `src/lib/pressures/__tests__/industry_resolution.test.ts` - 18 comprehensive tests
5. `NARRATIVE_QUALITY_UPGRADE_COMPLETE.md` - Previous narrative upgrade docs

### Modified (4 files):
1. `src/lib/pressures/pressure_translation.ts` - Added `resolvePressureTranslation()`
2. `src/lib/pressures/index.ts` - Exported new functions/types
3. `src/lib/industry/index.ts` - Exported IndustryGroup functions
4. `src/lib/present/build_decision_artifact.ts` - Integrated industry-aware resolution

---

## EXAMPLE OUTPUT COMPARISON

### Before (Generic):
```
Takeaway: Revenue concentration detected. Evidence: Based on 50 quotes and 40 invoices in the last 90 days.

Why Heavy: Revenue is concentrated in a few large invoices.

Next 7 Days:
  - Monitor and track patterns.
  - Review data coverage.

Boundary: Do not act until patterns stabilize.
```

### After (HVAC-specific):
```
Takeaway: One install slipping can move your whole month ~73% (peer median ~42%, 82nd percentile risk).

Why Heavy: When a few large installs carry the month, a single reschedule or permitting delay shifts the entire revenue forecast. Service calls can't backfill fast enough. This is not a quote conversion issue—that's tracking well. In home services, this usually shows up as crew planning + materials timing pressure when large jobs slip.

Next 7 Days:
  - Build a mid-ticket maintenance bundle lane (tune-ups, cleanings, minor repairs) that delivers steady weekly revenue independent of install timing. (current: 73%)
  - Protect one calm scheduling pass each week (Monday AM) so approved work lands cleanly without owner firefighting.
  - Track equipment lead times and communicate them upfront.

Boundary: If your model is install-heavy by design (80%+ revenue from replacements), concentration is expected. Protect with: deposits collected upfront, milestone billing for large jobs, and a service lane for gap-filling.
```

### After (Taco Stand-specific):
```
Takeaway: A few slow days can erase a week's profit ~68% (peer median ~45%, 79th percentile volatility).

Why Heavy: When revenue concentrates into peak days (Friday-Sunday, lunch rush, events), slow weekdays feel like total loss instead of normal variance. One rained-out event hurts. This is not a follow-up issue—demand is real-time. In food mobile, this shows up as location risk and prep capacity pressure during peak hours.

Next 7 Days:
  - Build a secondary revenue stream (pre-orders for pickup, catering for offices, packaged salsas) to smooth out daily volatility.
  - Track performance by location/event type, not day-of-week. Double down on proven high-traffic slots and cut weak ones.
  - Separate prep from service: prep in bulk off-peak (early morning or day before).

Boundary: If your model is event-based or weekend-heavy, concentration is expected. Protect with: deposits on catering, cash buffer (4 weeks expenses), and diversified locations.
```

---

## KEY METRICS

**Scale Achievement**:
- 40+ industries covered immediately
- 6 industry groups (reusable across industries)
- 48 group-level translations (6 groups × 8 pressures)
- 3 named overrides (HVAC, Painter, Taco Stand showcase quality)
- 100% coverage guaranteed

**Quality Bar**:
- 0 generic sentences in client artifacts for known industries
- 3 industries feel unmistakably different (test-verified)
- Owner-felt language: plain, direct, context-specific
- Action-sharp: concrete moves, not monitoring
- Boundary-aware: when NOT to act

**Code Quality**:
- 24 tests total (18 new + 6 existing)
- 100% test pass rate
- 0 breaking schema changes
- Type-safe resolution (TypeScript)
- Clean fallback chain (override → group → generic)

---

## NEXT STEPS (OPTIONAL)

1. **Add More Named Overrides** (4-10 more industries):
   - Electrician (home_services_trade variant)
   - Roofer (project_trades variant)
   - Pool Service (route_service variant)
   - BBQ Vendor (food_mobile variant)
   - Equipment Sales (sales_led variant)

2. **Expand Industry Mapping** (50+ more industries):
   - Niche trades (welding, glass, upholstery)
   - Specialized services (IT, consulting, design)
   - Retail variants (boutique, shop, market)

3. **Calibrate Language** (field testing):
   - Collect real snapshots from each industry
   - Refine owner-felt lines based on user feedback
   - A/B test action templates for conversion

4. **Track Fallback Usage**:
   - Monitor how often generic fallback is used
   - Identify new industries needing group mapping
   - Measure impact on client perception

5. **Document Industry Playbooks**:
   - Create industry-specific guides
   - Example snapshots per industry
   - Best practices for each group

---

**Status**: ✅ **COMPLETE — ALL PARTS (A-G) IMPLEMENTED AND TESTED**

The system now produces non-generic, industry-felt insights across ~40 industries without hand-writing each one. HVAC, Painter, and Taco Stand feel unmistakably different. All doctrines preserved. ML signals remain clean. RAG is advisory only. Artifact stays finite.
