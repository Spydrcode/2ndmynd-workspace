# RAG Industry Expansion: Quick Start

## For Contributors: Adding a New Industry Baseline

### 1. Check the Industry Index
```typescript
// rag_seed/industry_index.ts
export const OWNER_LED_INDUSTRIES = {
  trades: [
    { key: "roofing", label: "Roofing" }, // ← Find the industry key here
  ],
  // ...
};
```

### 2. Create the Baseline File
**File**: `rag_seed/industries/{industry_key}.md`

Example: `rag_seed/industries/roofing.md`

### 3. Follow the Canonical Format

```markdown
# Roofing Industry Baseline

## What Usually Drives Revenue

- Emergency repairs (storm damage, leaks) = urgent, premium pricing
- Full replacement projects (age-based, aesthetics)
- Inspection + maintenance contracts (growing but uncommon)

Most roofing is reactive, not proactive.

## Where Owner Pressure Commonly Builds

- **Weather dependency**: Can't work in rain, extreme heat/cold affects crew
- **Job scheduling gaps**: Multi-day projects need contiguous days
- **Material price volatility**: Supply costs fluctuate, quotes can go stale fast
- **Crew safety & liability**: Fall protection, insurance, licensing critical

## Common Blind Spots

- **Permit tracking**: Residential jobs often need permits, easy to forget
- **Warranty documentation**: Manufacturers require proof of certified installers
- **Waste/material overage**: Over-ordering is common, under-ordering delays jobs
- **Re-roof inspection timing**: Homeowners delay until leak happens (emergency pricing)

## Healthy Shape (Not KPIs)

- Jobs are scheduled around weather forecasts, not just "next available"
- Material orders happen at least 2 days before job start
- Crew knows which jobs are warranty-sensitive vs standard
- Re-inspection offers are sent to 5-10 year old roofs proactively

## Common Missing Systems (Tool-Agnostic)

- **No systematic permit tracking**: Permits filed manually, no reminder system
- **No proactive re-roof outreach**: Waiting for customers to call with leaks
- **No material inventory visibility**: Owner doesn't know what's on hand vs in-transit
- **No weather-based job rescheduling workflow**: Manual scramble when forecast changes

## Seasonality & Patterns

- **Storm season = surge work**: Spring/summer storms create backlog, premium pricing
- **Winter slowdown**: Cold weather limits work, revenue dips
- **Insurance claim cycles**: Post-storm work involves insurance coordination (slower payment)
- **Re-roof season**: Late summer/fall before winter (preventative mindset)
```

### 4. Tone Checklist

Before submitting:
- [ ] No shaming language ("you should have", "failing to")
- [ ] Industry-specific (not generic advice)
- [ ] Observable patterns, not invented metrics
- [ ] 1-2 pages max
- [ ] Calm, finite, reduced-burden focused

### 5. Ingest the New Baseline

```bash
npm run rag:seed
```

You should see:
```
✓ Loaded: roofing (trades)
```

---

## For Developers: Using RAG in Decision Artifacts

### 1. Retrieve RAG Context

```typescript
import { getRagContext } from "@/lib/rag";

const ragContext = await getRagContext({
  workspace_id: snapshot.workspace_id,
  industry_key: "roofing", // From business profile
  doc_types: ["industry_baseline", "tool_playbook"],
  limit: 5,
});
```

### 2. Build LLM Prompt

```typescript
import { buildDecisionSnapshotPrompt } from "@/lib/prompts";

const prompt = buildDecisionSnapshotPrompt({
  snapshot, // Your deterministic signals
  rag_context: ragContext,
  ml_inference: mlPredictions, // Optional
  business_context: {
    industry_key: "roofing",
    business_name: "Summit Roofing",
    owner_name: "Mike Johnson",
  },
});
```

### 3. Generate Decision Artifact

```typescript
const artifact = await generateWithLLM({
  prompt,
  model: "gpt-4o", // Or your preferred model
  temperature: 0.7,
  max_tokens: 1500,
});
```

### 4. Safety: Never Pass RAG to ML Training

```typescript
import { extractPromptWithoutRag } from "@/lib/prompts";

// For ML training data
const trainingPrompt = extractPromptWithoutRag({
  snapshot,
  ml_inference: undefined, // Also exclude ML predictions
  business_context: { industry_key: "roofing" },
});

// This ensures RAG never contaminates learning layer
await storeTrainingExample({
  input: trainingPrompt,
  output: artifact,
  metadata: { industry: "roofing" },
});
```

---

## For Testers: Verify Industry Differentiation

### Test 1: Same Numbers, Different Industries

```typescript
const snapshot = createMockSnapshot({ /* ... */ });

const hvacPrompt = buildDecisionSnapshotPrompt({
  snapshot,
  business_context: { industry_key: "hvac" },
});

const roofingPrompt = buildDecisionSnapshotPrompt({
  snapshot,
  business_context: { industry_key: "roofing" },
});

// Prompts should differ (RAG context changes)
expect(hvacPrompt).not.toBe(roofingPrompt);

// But both should contain identical signal values
expect(hvacPrompt).toContain("$45000.00");
expect(roofingPrompt).toContain("$45000.00");
```

### Test 2: RAG Doesn't Change Numbers

```typescript
const withRag = buildDecisionSnapshotPrompt({
  snapshot,
  rag_context: ragContext,
});

const withoutRag = buildDecisionSnapshotPrompt({
  snapshot,
  rag_context: undefined,
});

// Extract all dollar amounts from both prompts
const withRagNumbers = extractNumbers(withRag);
const withoutRagNumbers = extractNumbers(withoutRag);

// Should be identical
expect(withRagNumbers).toEqual(withoutRagNumbers);
```

### Test 3: Learning Layer Never Sees RAG

```typescript
const prompt = extractPromptWithoutRag({
  snapshot,
  rag_context: { /* ... RAG docs ... */ },
});

// Should NOT contain RAG content
expect(prompt).not.toContain("Industry Baseline Knowledge");
expect(prompt).not.toContain("Tool & Systems Playbook");

// Should still contain signal data
expect(prompt).toContain("Total Revenue");
```

---

## Common Tasks

### Add a New Industry to Index

```typescript
// rag_seed/industry_index.ts
export const OWNER_LED_INDUSTRIES = {
  trades: [
    // ... existing industries
    { key: "concrete", label: "Concrete & Flatwork" }, // ← Add here
  ],
};
```

### Update an Existing Baseline

1. Edit `rag_seed/industries/{industry_key}.md`
2. Run `npm run rag:seed`
3. RAG vector store will be updated

### Check Which Industries Are Missing

```bash
npm run rag:seed
```

Output will show:
```
⚠️  38 industries are missing baseline documents.
   Create them in rag_seed/industries/ following the canonical format.
```

### Test Prompt Generation

```bash
npm test -- src/lib/prompts/__tests__/rag_safety.test.ts
```

All 15 tests should pass.

---

## Architecture Reminders

### RAG is Context, Not Truth
```typescript
// ✅ Good: Use RAG to inform tone
"HVAC businesses often face seasonal demand patterns..."

// ❌ Bad: Use RAG to override signals
if (rag.says("summer is slow") && signals.show("high revenue")) {
  // Trust the signals, not the RAG
}
```

### Signals are Ground Truth
```typescript
// ✅ Always trust snapshot.signals_v1
const revenue = snapshot.signals_v1.agg_revenue_total; // $45000.00

// ❌ Never invent metrics
const assumed_cogs = revenue * 0.6; // BAD: Not in signals_v1
```

### Learning Layer is RAG-Free
```typescript
// ✅ signals_v1 feeds ML training
const trainingFeatures = extractSignalsV1(snapshot);

// ❌ RAG context never touches ML
const trainingFeatures = {
  ...extractSignalsV1(snapshot),
  rag_context: ragContext, // FORBIDDEN
};
```

---

## Resources

- **Full Implementation**: [rag-industry-expansion.md](./rag-industry-expansion.md)
- **Original RAG Integration**: [rag-integration.md](./rag-integration.md)
- **Industry Index**: `rag_seed/industry_index.ts`
- **Baseline Examples**: `rag_seed/industries/*.md`
- **Prompt Template**: `src/lib/prompts/decision_snapshot_prompt.ts`
- **Safety Tests**: `src/lib/prompts/__tests__/rag_safety.test.ts`

---

**Last Updated**: January 23, 2026
