# RAG Industry Expansion: Implementation Summary

**Date**: January 23, 2026  
**Status**: ✅ Complete

## Overview

This implementation expands the 2ndmynd Intelligence Layer RAG system with:
1. **Canonical Industry Index** (49 owner-led industries across 5 categories)
2. **Industry Baseline Documents** (11 created, following 6-section format)
3. **Enhanced Tool Playbook** (problem-focused, system-agnostic)
4. **Updated Seed Ingest Script** (reads from canonical index)
5. **LLM Prompt Template** (blends signals + RAG + ML with safety guards)
6. **Comprehensive Safety Tests** (verifies RAG never contaminates learning layer)

---

## 1. Canonical Industry Index

**File**: `rag_seed/industry_index.ts`

Defines the complete universe of owner-led businesses served by 2ndmynd.

### Structure
- **5 Categories**: trades, service_businesses, food_and_mobile, sales_led, specialty_local
- **49 Industries**: Complete mapping from business type to standardized key
- **Helper Functions**: `getAllIndustryKeys()`, `mapBucketToIndustryKey()`

### Example
```typescript
export const OWNER_LED_INDUSTRIES = {
  trades: [
    { key: "hvac", label: "HVAC (Heating, Ventilation, AC)" },
    { key: "plumbing", label: "Plumbing" },
    { key: "electrical", label: "Electrical" },
    // ... 15 total
  ],
  service_businesses: [
    { key: "cleaning_residential", label: "Residential Cleaning" },
    { key: "landscaping", label: "Landscaping & Lawn Care" },
    // ... 14 total
  ],
  // ... 3 more categories
};
```

---

## 2. Industry Baseline Documents

**Directory**: `rag_seed/industries/`

Industry-specific operational patterns and pressure points. Each baseline follows a canonical 6-section format.

### Canonical Format

1. **What Usually Drives Revenue**  
   - Core revenue mechanisms specific to the industry
   - Example: HVAC seasonal maintenance contracts vs painter project-based work

2. **Where Owner Pressure Commonly Builds**  
   - Predictable friction points in operations
   - Example: Route optimization for service businesses, inventory for food trucks

3. **Common Blind Spots**  
   - What owners often miss or deprioritize
   - Example: Follow-up on quotes, weekend/evening scheduling patterns

4. **Healthy Shape (Not KPIs)**  
   - Observable characteristics of well-functioning businesses
   - No specific metrics unless unavoidable
   - Example: "Jobs are scheduled by geography, not request order"

5. **Common Missing Systems (Tool-Agnostic)**  
   - Systemic gaps that reduce efficiency
   - Problem-focused, not tool-specific
   - Example: "No systematic quote follow-up" vs "Needs a CRM"

6. **Seasonality & Patterns**  
   - Time-based rhythms unique to the industry
   - Example: Tax prep (Jan-Apr surge), pool service (summer peak)

### Tone Principles
- ✅ **Calm, observational**: No shaming or guilt
- ✅ **Industry-specific**: HVAC ≠ Painter ≠ Taco Stand
- ✅ **Reduced burden**: Focus on what matters
- ❌ **No generic advice**: Avoid "best practices" language
- ❌ **No metrics**: Unless truly unavoidable

### Created Baselines (11 total)

| Industry | Category | Key Differentiators |
|----------|----------|---------------------|
| **HVAC** | trades | Seasonal patterns, equipment lifecycle, maintenance contracts |
| **General Contractor** | trades | Project-based, subcontractor management, change orders |
| **Handyman** | trades | Small jobs, route efficiency, broad skill mix |
| **Painter** | trades | Weather dependency, prep time, project-based |
| **Residential Cleaning** | service_businesses | Recurring contracts, route density, turnover management |
| **Landscaping** | service_businesses | 60-70% recurring maintenance, seasonal surge work |
| **Pool Service** | service_businesses | 70-80% recurring contracts, route density critical |
| **Pest Control** | service_businesses | High retention focus, re-treatment tracking |
| **Taco Stand** | food_and_mobile | Daily cash, prep-heavy, location-dependent |
| **Solar Sales** | sales_led | Long sales cycles, financing dependency, installation coordination |
| **Auto Repair** | specialty_local | Diagnostic complexity, parts markup, trust-building |

**Note**: 38 industries still need baseline documents. These can be created incrementally following the canonical format.

---

## 3. Enhanced Tool Playbook

**File**: `rag_seed/tool_playbook.md`

Cross-industry guidance on systems that reduce owner burden. Problem-focused, not vendor-specific.

### Structure

1. **Intake & Booking**  
   - Problem: Phone tag and missed opportunities
   - Problem: Unclear service requests

2. **Follow-Up & Conversion**  
   - Problem: Quotes sitting unanswered
   - Problem: Leads falling through cracks

3. **Cashflow & Billing**  
   - Problem: Invoice delays and payment chasing
   - Problem: No visibility into what's owed

4. **Capacity & Scheduling**  
   - Problem: Scattered jobs = windshield time
   - Problem: No pipeline visibility

5. **Reputation & Reviews**  
   - Problem: No systematic review capture
   - Problem: Reviews aren't visible on website

### Principles
- Start with one gap, not five
- Measure before and after
- Tool ≠ strategy (tools make friction visible, don't fix habits)
- Integration > perfection
- If it's not used weekly, kill it

---

## 4. Updated Seed Ingest Script

**File**: `scripts/rag_seed_ingest.ts`

Automatically ingests all industry baselines from the canonical index.

### Key Changes
- Reads from `industry_index.ts` (single source of truth)
- Loops through all `rag_seed/industries/*.md` files
- Tags each document with proper category and industry_key
- Reports missing baselines (currently 38/49)

### Usage
```bash
npm run rag:seed
# or
node --loader tsx scripts/rag_seed_ingest.ts
```

### Output
```
📥 Ingesting 12 documents...

✅ RAG seed ingest complete!
📊 Summary:
   - Industry baselines loaded: 11
   - Industry baselines skipped: 38
   - Tool playbook: ✓
   - Total documents ingested: 12

⚠️  38 industries are missing baseline documents.
   Create them in rag_seed/industries/ following the canonical format.
```

---

## 5. LLM Prompt Template

**File**: `src/lib/prompts/decision_snapshot_prompt.ts`

Canonical prompt builder that blends deterministic signals, RAG context, and ML inference.

### Function: `buildDecisionSnapshotPrompt()`

**Inputs**:
- `snapshot`: Deterministic signals (GROUND TRUTH)
- `rag_context`: Industry baselines + tool playbook (optional)
- `ml_inference`: ML predictions (optional)
- `business_context`: Industry key, business name, owner name

**Output**: Structured markdown prompt for LLM

### Prompt Structure

1. **System Role**: 2ndmynd Intelligence Analyst doctrine
2. **Business Data (Ground Truth)**: All numerical signals with explicit warning
3. **Industry Context**: RAG baseline + tool playbook (if available)
4. **ML Inference**: Predictions marked as "advisory only"
5. **Output Instructions**: 5-section decision snapshot format

### Safety Features

✅ **No Invented Metrics**: Explicit warning against hallucination  
✅ **RAG as Context**: Guides tone/suggestions, never overrides facts  
✅ **ML as Advisory**: Predictions are supplementary, not authoritative  
✅ **Industry Differentiation**: HVAC ≠ Painter ≠ Taco Stand snapshots  
✅ **Graceful Degradation**: Works without RAG or ML

### Example Usage
```typescript
import { buildDecisionSnapshotPrompt } from "@/lib/prompts";

const prompt = buildDecisionSnapshotPrompt({
  snapshot: mySnapshot,
  rag_context: ragContext,
  ml_inference: mlPredictions,
  business_context: {
    industry_key: "hvac",
    business_name: "Cool Air Systems",
  },
});

// Send prompt to LLM for decision artifact generation
const artifact = await generateWithLLM(prompt);
```

### Helper: `extractPromptWithoutRag()`

Generates prompt with RAG context excluded. Used for:
- ML training data (RAG must NEVER contaminate training)
- Debugging (verify numerical consistency)
- A/B testing (measure RAG impact on tone)

---

## 6. Comprehensive Safety Tests

**File**: `src/lib/prompts/__tests__/rag_safety.test.ts`

15 tests verifying RAG integration safety and correctness.

### Test Suites

#### A. Industry Differentiation (4 tests)
- ✅ 49+ industries in canonical index
- ✅ Different industries generate different prompts
- ✅ Industry-specific context included when RAG available
- ✅ Graceful handling when RAG missing

#### B. Learning Layer Protection (3 tests)
- ✅ RAG content NEVER in signals_v1
- ✅ Prompt extraction without RAG for ML training
- ✅ Numerical consistency with/without RAG

#### C. No Invented Metrics (3 tests)
- ✅ Only references signals that exist in snapshot
- ✅ Explicit warning against inventing metrics
- ✅ No hallucinated signal values

#### D. Tool Playbook Integration (2 tests)
- ✅ Tool playbook included when available
- ✅ Industry baseline separated from tool playbook

#### E. ML Inference Integration (3 tests)
- ✅ ML predictions included when available
- ✅ Works without ML inference
- ✅ ML predictions marked as advisory

### Running Tests
```bash
npm test -- src/lib/prompts/__tests__/rag_safety.test.ts
```

**Result**: ✅ All 15 tests passing

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                   INTELLIGENCE LAYER                     │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌─────────────────┐      ┌──────────────────┐         │
│  │  Deterministic  │      │   RAG Context    │         │
│  │    Signals      │      │   (ENRICHMENT    │         │
│  │   (signals_v1)  │      │    ONLY)         │         │
│  └────────┬────────┘      └────────┬─────────┘         │
│           │                        │                    │
│           │                        │                    │
│           ├────────────┬───────────┤                    │
│                        │                                │
│                        ▼                                │
│           ┌─────────────────────────────┐              │
│           │  buildDecisionSnapshotPrompt │              │
│           │                               │              │
│           │  • Blends signals + RAG      │              │
│           │  • Never invents metrics     │              │
│           │  • Industry differentiation  │              │
│           └─────────────┬───────────────┘              │
│                         │                               │
│                         ▼                               │
│               ┌──────────────────┐                     │
│               │   LLM Generate   │                     │
│               │  Decision Artifact│                     │
│               └──────────────────┘                     │
│                                                          │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │  LEARNING LAYER     │
              │  (signals_v1 ONLY)  │
              │                     │
              │  ❌ RAG EXCLUDED    │
              │  ✅ Pure signals    │
              └─────────────────────┘
```

---

## File Inventory

### Created Files (6)
1. `rag_seed/industry_index.ts` - Canonical industry universe
2. `rag_seed/industries/*.md` - 11 industry baseline documents
3. `src/lib/prompts/decision_snapshot_prompt.ts` - LLM prompt template
4. `src/lib/prompts/index.ts` - Module exports
5. `src/lib/prompts/__tests__/rag_safety.test.ts` - Safety tests
6. This summary document

### Modified Files (2)
1. `rag_seed/tool_playbook.md` - Enhanced with problem-focused structure
2. `scripts/rag_seed_ingest.ts` - Reads from canonical index

---

## Success Criteria: ✅ Verified

| Criterion | Status | Evidence |
|-----------|--------|----------|
| **Industry Universe Defined** | ✅ | 49 industries across 5 categories in `industry_index.ts` |
| **Baseline Format Canonical** | ✅ | 11 baselines follow 6-section format consistently |
| **Tool Playbook Problem-Focused** | ✅ | 5 categories, system-agnostic guidance |
| **Seed Script Uses Index** | ✅ | Loops through all industry keys, reports missing docs |
| **LLM Prompt Template Complete** | ✅ | Blends signals + RAG + ML, includes safety guards |
| **RAG Never in signals_v1** | ✅ | 3 tests verify learning layer protection |
| **Industry Differentiation** | ✅ | Tests verify HVAC ≠ Painter ≠ Taco Stand prompts |
| **No Invented Metrics** | ✅ | 3 tests verify no hallucination, explicit warnings |
| **All Tests Pass** | ✅ | 15/15 tests passing |

---

## Next Steps

### Immediate (Before Launch)
1. **Create remaining industry baselines** (38/49 missing)
   - Priority: Most common industries (general contractor, electrician, bookkeeping, etc.)
   - Can be done incrementally using canonical format

2. **Run seed ingest with full baselines**
   ```bash
   npm run rag:seed
   ```

3. **Integrate prompt template into `build_decision_artifact.ts`**
   - Replace placeholder "future: LLM integration" comment
   - Add LLM API call using `buildDecisionSnapshotPrompt()`

### Future Enhancements
1. **A/B test RAG impact on client perception**
   - Measure: "Felt personalized" scores with/without RAG
   - Measure: Close rate on tool suggestions

2. **Track RAG context usage patterns**
   - Which industries benefit most from baselines?
   - Are tool suggestions being followed?

3. **Expand RAG doc types**
   - Regional patterns (e.g., "Northeast HVAC seasonal trends")
   - Industry-specific financial benchmarks (where data available)

---

## Key Architectural Decisions

### 1. RAG is Context-Only
**Why**: Deterministic signals must remain trustworthy. RAG guides tone and suggestions but NEVER overrides facts.

### 2. Industry Index as Single Source of Truth
**Why**: Prevents drift between seed script, prompt logic, and business logic. One place to add industries.

### 3. Canonical 6-Section Baseline Format
**Why**: Consistency enables pattern recognition. Easy for contributors to follow. Prevents generic advice creep.

### 4. Tool Playbook is Problem-Focused
**Why**: Tool-specific advice goes stale. Problem patterns are durable. Owners need to understand the gap first.

### 5. ML Predictions are Advisory
**Why**: ML is helpful but not infallible. Ground snapshots in observable signals, use ML to guide attention.

---

## Testing Philosophy

Tests verify **safety boundaries**, not implementation details:

- ✅ RAG never contaminates learning layer
- ✅ Numerical signals identical with/without RAG
- ✅ Industry differentiation exists (not all prompts are the same)
- ✅ No invented metrics or hallucinations
- ✅ Graceful degradation when RAG/ML unavailable

This ensures RAG remains an **enrichment layer**, not a dependency.

---

## Conclusion

This implementation delivers a **comprehensive, industry-differentiated RAG system** that:
- Respects the separation between context (RAG) and facts (signals)
- Enables "HVAC ≠ Painter ≠ Taco Stand" snapshots
- Protects the learning layer from RAG contamination
- Provides a canonical LLM prompt template for decision artifacts
- Can be expanded incrementally (38 industries to go)

All safety tests pass. System is ready for integration into the main decision artifact pipeline.

---

**Last Updated**: January 23, 2026  
**Maintained By**: 2ndmynd Engineering  
**Questions?**: See [rag-integration.md](./rag-integration.md) for context
