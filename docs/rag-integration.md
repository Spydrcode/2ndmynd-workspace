# RAG Integration Documentation

## Overview

The RAG (Retrieval-Augmented Generation) system is integrated into the Intelligence Layer to provide **context enrichment** for business narratives, website analysis, and opportunity suggestions.

**Critical**: This is **CONTEXT RAG**, not **ANSWER RAG**.

## Design Principles

### RAG is Used ONLY For:
1. Business context enrichment
2. Website-derived understanding
3. Opportunity/tool suggestions quality
4. Narrative clarity (wording, not conclusions)

### RAG is NEVER Used For:
- Snapshot math
- Signals_v1 (deterministic features)
- Benchmarks
- Learning targets
- Boundary logic
- Model training data

**RAG output is advisory context only.**

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Intelligence Layer                        │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Website Scan           Business Profile                     │
│       ↓                       ↓                               │
│  [RAG Ingest]           [RAG Ingest]                         │
│       ↓                       ↓                               │
│  ┌──────────────────────────────────────┐                   │
│  │         RAG Store (ml/rag)            │                   │
│  │  • website_scan                       │                   │
│  │  • business_profile                   │                   │
│  │  • industry_baseline (curated)        │                   │
│  │  • tool_playbook (curated)            │                   │
│  └──────────────────────────────────────┘                   │
│                     ↓                                         │
│            [RAG Retrieve]                                     │
│                     ↓                                         │
│        Narrative Building (Presentation)                     │
│                                                               │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                     Learning Layer                           │
│                  (RAG EXCLUDED BY DESIGN)                    │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  signals_v1 ─→ TrainingExampleV1 ─→ Vector Docs             │
│                                                               │
│  ✅ Deterministic features only                              │
│  ❌ No RAG context                                           │
│  ❌ No narrative text                                        │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## Document Types

```typescript
type RagDocType =
  | "business_profile"   // Business summary + snapshot context
  | "website_scan"       // Website analysis results
  | "industry_baseline"  // Curated industry knowledge (global)
  | "tool_playbook"      // Tool recommendations (global)
  | "internal_doctrine"; // (Reserved for future use)
```

## Metadata Requirements

All RAG documents MUST include:
- `workspace_id` (or "global" for curated content)
- `industry_key` (optional for global content)
- `doc_type`
- `source` ("website" | "internal" | "curated")
- `created_at`

**No raw CSV rows, no PII, no customer names.**

## Integration Points

### 1. Website Scanning (Part B)

After website scan in `web_profile.ts`:
```typescript
await ingestRagDoc({
  text: websiteSummaryText,
  metadata: {
    workspace_id,
    industry_key,
    doc_type: "website_scan",
    source: "website",
    created_at: new Date().toISOString(),
    run_id,
  },
});
```

**Guardrails**:
- Only ingest if `website_url` exists
- Max 1 doc per `run_id`
- Fire-and-forget (non-blocking)

### 2. Business Profile Ingestion (Part C)

After snapshot and benchmarks in `run_analysis.ts`:
```typescript
await ingestRagDoc({
  text: businessContextSummary,
  metadata: {
    workspace_id,
    industry_key,
    doc_type: "business_profile",
    source: "internal",
    created_at: new Date().toISOString(),
    run_id,
  },
});
```

**Content includes**:
- Business summary (1-2 paragraphs)
- Service mix
- Detected pressures (keys only, not prose)
- Benchmark cohort

### 3. Narrative Building (Part D)

Before generating narrative in `build_decision_artifact.ts`:
```typescript
const ragContext = await getRagContext({
  query: `
    Business: ${industry_key}
    Focus: services, website gaps, growth blockers, clarity improvements
  `,
  filters: {
    workspace_id,
    industry_key,
    doc_type: ["website_scan", "business_profile", "industry_baseline", "tool_playbook"],
  },
  limit: 6,
});
```

**Rules**:
- RAG content may improve wording and suggestions
- RAG content may NOT introduce new metrics or override conclusions
- If RAG is empty, behavior is unchanged

### 4. Curated Industry Baselines (Part E)

Located in `rag_seed/`:
- `hvac_baseline.md`
- `plumbing_baseline.md`
- `electrical_baseline.md`
- `tool_playbook.md`

**Seed with**:
```bash
npm run rag:seed
# or
node --loader tsx scripts/rag_seed_ingest.ts
```

## Learning Layer Exclusion (Part F)

RAG is **explicitly excluded** from:
- `signals_v1.ts` - Deterministic features only
- `capture.ts` - Training example creation
- `infer.ts` - Model inference
- `vector_index/build_vector_doc.ts` - Vector embeddings

**Comment blocks added** to enforce this at code level.

## Tests (Part H)

### RAG Integration Tests
Location: `src/lib/rag/__tests__/integration.test.ts`

Tests:
1. Website scan ingestion
2. Business context ingestion
3. RAG context retrieval
4. RAG exclusion from signals_v1
5. Size limits and guardrails
6. Graceful failure handling

### Decision Artifact RAG Tests
Location: `src/lib/present/__tests__/rag_integration.test.ts`

Tests:
1. Artifact building without RAG
2. Artifact building with RAG
3. **Identical metrics with/without RAG** (critical)
4. Empty RAG context handling

## Success Criteria

✅ Business snapshot feels customized and intelligent  
✅ Website gaps and tool suggestions feel specific  
✅ ML signals remain deterministic and clean  
✅ Learning layer untouched by RAG  
✅ No dashboards, no monitoring, no KPI creep  
✅ Finite artifact still ends with:
   - Clear takeaway
   - Next 7 days
   - Boundary

## Usage Examples

### Ingesting Custom Industry Knowledge
```typescript
import { ingestRagDoc } from "@/lib/rag";

await ingestRagDoc({
  text: "Custom industry insight here...",
  metadata: {
    workspace_id: "global",
    industry_key: "trade",
    doc_type: "industry_baseline",
    source: "curated",
    created_at: new Date().toISOString(),
  },
});
```

### Retrieving Context for Narrative
```typescript
import { getRagContext } from "@/lib/rag";

const ragContext = await getRagContext({
  query: "HVAC business with focus on maintenance plans",
  filters: {
    workspace_id: "workspace-123",
    industry_key: "trade",
    doc_type: ["business_profile", "industry_baseline"],
  },
  limit: 5,
});

// Use ragContext.context in LLM prompts
// Use ragContext.sources for transparency
```

## Guardrails

1. **Size Limits**: Max 50KB per RAG document (auto-truncated)
2. **Required Metadata**: workspace_id, doc_type, source must be present
3. **No PII**: Never ingest customer names, emails, phone numbers
4. **Fail Gracefully**: All RAG operations are non-blocking
5. **Determinism Protection**: RAG never included in signals_v1 or learning data

## Future Enhancements (Out of Scope)

- Active LLM integration for narrative transformation
- Internal UI to view "Context Sources" (optional visibility)
- More granular doc types (e.g., `seasonal_pattern`, `market_condition`)
- User-provided notes and context

## Maintenance

### Adding New Industry Baselines
1. Create new `.md` file in `rag_seed/`
2. Follow existing format
3. Run `npm run rag:seed`

### Monitoring RAG Health
Currently no monitoring dashboard. RAG failures log warnings but don't block operations.

Future: Could add metrics for:
- RAG ingestion success rate
- RAG retrieval latency
- Context relevance scores (if user feedback available)

## Questions & Troubleshooting

### Q: Why is RAG not showing up in narratives?
A: Check:
- Is `workspace_id` provided when calling `getRagContext`?
- Has RAG been seeded (`npm run rag:seed`)?
- Is the query specific enough?

### Q: Can RAG change snapshot metrics?
A: **No.** RAG is context-only and excluded from all deterministic computations.

### Q: How do I verify RAG is excluded from learning?
A: Run tests:
```bash
npm test -- src/lib/rag/__tests__/integration.test.ts
npm test -- src/lib/present/__tests__/rag_integration.test.ts
```

Both should pass, confirming RAG exclusion.

---

**Remember**: RAG is context enrichment, not a decision engine. It should make narratives feel smarter without changing the math.
