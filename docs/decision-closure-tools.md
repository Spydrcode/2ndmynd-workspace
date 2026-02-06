# Decision Closure Tools - MCP Server

Complete implementation of the **2ndmynd Decision System (Owner-Led Businesses)** doctrine as MCP server tools.

## 🎯 Doctrine Overview

This system enforces the following non-negotiable rules:
- **MAX 2 decision paths** (hard limit enforced at schema level)
- **Explicit NON-ACTIONS required** in every action plan
- **Forbidden language patterns** (dashboard, KPI, monitoring, real-time, BI, analytics platform, metrics tracking, data visualization)
- **Clean exits** if owner won't commit (no endless analysis)
- **NOT a dashboard/BI/analytics product** (it's a decision closure system)

## 📦 Architecture

### Schema Foundation (`schemas/decision_closure.ts`)

All 9 artifact types with Zod schemas + doctrine enforcement:

1. **OwnerIntentProfile** - Captures owner's primary priority, risk/change appetite, non-negotiables, time horizon
2. **BusinessRealityModel** - Concentration signals, capacity signals, owner dependency, seasonality
3. **StructuralFinding** - Insights across 4 lenses (E-Myth, Porter-lite, Blue Ocean, Financial)
4. **PrimaryConstraint** - The ONE constraint blocking progress
5. **DecisionPath** - Each path resolves constraint (MAX 2 allowed)
6. **CommitmentPlan** - Minimal actions + **explicit_non_actions** (required)
7. **AccountabilitySpec** - Re-evaluation triggers, failure conditions, success metrics
8. **OutcomeReview** - Monthly validation (expected vs actual signals)
9. **DecisionClosureArtifact** - Full contract (all above combined)

**Doctrine Enforcement Mechanisms**:
- `decisionPathsArraySchema.max(2)` - schema-level max 2 paths
- `commitmentPlanSchema` - requires `explicit_non_actions` array (min 1 item)
- `FORBIDDEN_LANGUAGE_PATTERNS` - 9 regex patterns
- `checkForbiddenLanguage()` - scans text for violations

## 🛠️ MCP Tools

### 1. `intent.capture_v1` (SYSTEM 0)

**Purpose**: Capture owner intent with contradiction detection

**Input**:
```typescript
{
  primary_priority: "revenue_growth" | "time_relief" | "profitability" | "stability",
  risk_appetite: "low" | "medium" | "high",
  change_appetite: "incremental" | "structural",
  non_negotiables: string[],
  time_horizon: "30_days" | "90_days" | "6_months" | "1_year"
}
```

**Output**:
```typescript
{
  profile: OwnerIntentProfile,
  contradictions: Array<{message: string, severity: "warning" | "error"}>,
  valid: boolean
}
```

**Contradiction Detection**:
- Growth + Low Risk + Incremental Change (warning)
- Stability + High Risk (warning)
- Structural Change + 30 Days (error)
- Time Relief + No Hiring (error)
- Conflicting Non-Negotiables (error)

**Usage**:
```javascript
const result = await mcp.call("intent.capture_v1", {
  primary_priority: "time_relief",
  risk_appetite: "medium",
  change_appetite: "structural",
  non_negotiables: ["No price increases"],
  time_horizon: "90_days"
});
```

---

### 2. `signals.compute_v2` (SYSTEM 1)

**Purpose**: Compute aggregated signals from SnapshotV2 (NO raw data)

**Input**:
```typescript
{
  snapshot: SnapshotV2,
  include_concentration?: boolean
}
```

**Output**:
```typescript
{
  seasonality_pattern: "none" | "weak" | "moderate" | "strong",
  volatility_band: "very_low" | "low" | "medium" | "high" | "very_high",
  approval_lag_signal: {
    decision_lag_band: string,
    owner_bottleneck_detected: boolean
  },
  payment_lag_signal: {
    payment_lag_distribution: object,
    collection_pressure_detected: boolean
  },
  concentration_signals: {
    customer_concentration: string,
    job_type_concentration: string,
    season_concentration: string
  },
  capacity_signals: {
    demand_signal: string,
    capacity_headroom: string,
    mismatch_detected: boolean
  },
  owner_dependency: {
    approval_dependency: boolean,
    operational_dependency: boolean
  },
  business_type_hypothesis: "high-volume low-ticket" | "project-based high-ticket" | "mixed",
  missing_data: string[]
}
```

**Doctrine Compliance**: Only bucketed/aggregated features, no raw invoices/estimates exposed

**Usage**:
```javascript
const signals = await mcp.call("signals.compute_v2", {
  snapshot: mySnapshot,
  include_concentration: true
});
```

---

### 3. `pipeline.run_v3` (SYSTEM 1→2→3)

**Purpose**: Orchestrate full 5-system decision closure pipeline

**Modes**:
- `initial_onboarding` - First time analysis
- `monthly_review` - Re-assessment with prior commitment

**Input**:
```typescript
{
  mode: "initial_onboarding" | "monthly_review",
  snapshot: SnapshotV2,
  owner_intent: OwnerIntentProfile,
  prior_commitment?: CommitmentPlan,
  prior_accountability?: AccountabilitySpec
}
```

**Output**:
```typescript
{
  artifact: DecisionClosureArtifact,
  summary: string, // markdown format
  end_cleanly: boolean
}
```

**Pipeline Flow**:
1. **SYSTEM 1**: Compute signals from snapshot
2. **SYSTEM 2**: Build BusinessRealityModel + StructuralFindings (4 lenses)
3. **SYSTEM 3**: Identify PrimaryConstraint + generate 2 DecisionPaths
4. **(If monthly_review)**: Call `outcomes.review_v1`
5. Assemble DecisionClosureArtifact
6. Validate against doctrine

**Path Generation Logic**:
- **Path A**: Direct resolution of primary constraint (60-day PoC)
- **Path B**: Workaround via structural adjustment (45-day PoC)

**Usage**:
```javascript
const result = await mcp.call("pipeline.run_v3", {
  mode: "initial_onboarding",
  snapshot: mySnapshot,
  owner_intent: intentProfile
});
```

---

### 4. `commitment.record_v1` (SYSTEM 4)

**Purpose**: Record commitment, generate action plan + accountability spec

**Input**:
```typescript
{
  owner_choice: "path_A" | "path_B" | "neither",
  chosen_path_details?: DecisionPath,
  time_box_days?: number,
  minimal_actions?: Array<{
    action: string,
    deadline_days: number,
    responsible: string
  }>,
  explicit_non_actions?: string[]
}
```

**Output**:
```typescript
{
  commitment_gate: {
    owner_choice: "path_A" | "path_B" | "neither",
    committed_timestamp: string
  },
  action_plan?: CommitmentPlan,
  accountability?: AccountabilitySpec,
  end_cleanly: boolean
}
```

**Validation**:
- Throws error if `explicit_non_actions` missing or empty when committed
- Supports clean exit: `owner_choice === "neither"` → no action plan, `end_cleanly: true`

**Accountability Derivation**:
- Re-evaluation triggers from chosen path's PoC signals
- Failure conditions from risks
- Success metrics from expected outcomes

**Usage**:
```javascript
const commitment = await mcp.call("commitment.record_v1", {
  owner_choice: "path_A",
  chosen_path_details: pathA,
  time_box_days: 90,
  minimal_actions: [
    { action: "Delegate quote approval", deadline_days: 14, responsible: "owner" }
  ],
  explicit_non_actions: [
    "NOT hiring additional staff",
    "NOT changing pricing"
  ]
});
```

---

### 5. `outcomes.review_v1` (SYSTEM 5)

**Purpose**: Monthly outcome validation (expected vs actual signals)

**Input**:
```typescript
{
  commitment_plan: CommitmentPlan,
  accountability_spec: AccountabilitySpec,
  current_signals: ComputedSignals,
  previous_signals: ComputedSignals,
  actions_completed: string[],
  actions_blocked?: string[]
}
```

**Output**:
```typescript
{
  review: OutcomeReview,
  pivot_recommendation: "continue" | "adjust" | "pivot" | "end"
}
```

**Classification Logic**:
- **Implementation Status**: fully/partially/not implemented/blocked
- **Strategy Assessment**: working_as_expected/working_partially/not_working/too_early_to_tell
- **Pressure Change**: reduced/unchanged/increased
- **Pivot Logic**: Based on implementation status × strategy assessment

**Usage**:
```javascript
const review = await mcp.call("outcomes.review_v1", {
  commitment_plan: myCommitment,
  accountability_spec: myAccountability,
  current_signals: newSignals,
  previous_signals: oldSignals,
  actions_completed: ["Delegated quote approval"]
});
```

---

### 6. `decision.validate_doctrine_v1` (Doctrine Gate)

**Purpose**: Validate artifact against all doctrine rules

**Input**:
```typescript
{
  artifact: DecisionClosureArtifact,
  strict?: boolean // default: false
}
```

**Output**:
```typescript
{
  doctrine_checks: DoctrineChecks,
  errors: string[],
  valid: boolean
}
```

**Doctrine Checks**:
1. Schema validation (Zod)
2. Max 2 paths enforced
3. Explicit_non_actions present (if committed)
4. Forbidden language absent
5. Commitment gate valid
6. Conclusions locked unless triggered
7. Clean exit pattern

**Strict Mode**: Throws error on first violation (use for CI/CD gates)

**Usage**:
```javascript
const validation = await mcp.call("decision.validate_doctrine_v1", {
  artifact: myArtifact,
  strict: true // throws on violation
});
```

---

## 🎬 Demo Script

Run the full end-to-end demo:

```bash
npx tsx scripts/decision_closure_demo.ts
```

**Demo Flow**:
1. Generate mock SnapshotV2
2. Capture owner intent (with contradiction detection)
3. Run pipeline.run_v3 (generates 2 decision paths)
4. Validate doctrine compliance
5. Record commitment (Path A chosen)
6. Save artifacts to `runs/decision_closure_demo/`

**Expected Output**:
- ✅ All 5 systems execute successfully
- ✅ Max 2 paths enforced
- ✅ Explicit non-actions present
- ✅ Doctrine checks passed
- 📄 Artifacts: `decision_closure_artifact.json` + `summary.md`

---

## 🧪 Unit Tests

Run doctrine enforcement tests:

```bash
npx vitest run mcp/__tests__/doctrine_enforcement.test.ts
```

**Test Coverage**:
- ✅ Max 2 Decision Paths Rule (1 pass, 3 fail)
- ✅ Explicit Non-Actions Required (committed but empty fails)
- ✅ Forbidden Language Detection (detects dashboard/KPI)
- ✅ Clean Exit on Owner Decline (neither choice passes)

---

## 📊 Monthly Review Loop

**Workflow**:
1. Owner executes minimal actions over time box (e.g., 90 days)
2. Monthly: Run `pipeline.run_v3` with `mode: "monthly_review"`
3. System calls `outcomes.review_v1` internally
4. Review compares expected vs actual signals
5. Pivot recommendation: continue / adjust / pivot / end

**Example Monthly Review**:
```javascript
const monthlyResult = await mcp.call("pipeline.run_v3", {
  mode: "monthly_review",
  snapshot: currentSnapshot,
  owner_intent: originalIntent,
  prior_commitment: lastCommitment,
  prior_accountability: lastAccountability
});

// Check pivot recommendation
if (monthlyResult.artifact.outcome_review.recommendation === "pivot") {
  console.log("Time to re-evaluate the strategy!");
}
```

---

## 🚫 Forbidden Language Patterns

The following language patterns are **forbidden** per doctrine:

1. `dashboard`
2. `KPI`
3. `monitoring` (standalone)
4. `real-time` (analytics context)
5. `BI` / `business intelligence`
6. `analytics platform`
7. `metrics tracking`
8. `data visualization` (platform context)
9. `performance dashboard`

**Why?** This is NOT a dashboard/BI product. It's a **decision closure system** for owner-led businesses.

All tools automatically scan for these patterns via `checkForbiddenLanguage()` helper.

---

## 🏗️ Extending the System

### Adding a New Tool

1. **Create tool file**: `mcp/tools/my_tool_v1.ts`
2. **Define Zod schema**: Export input/output types
3. **Implement handler**: `export const handler = async (input) => { ... }`
4. **Register in tool_registry.ts**:
   ```typescript
   import { handler as myTool } from "./tools/my_tool_v1";
   
   // Add output schema
   const myToolOutputSchema = { ... };
   
   // Add to registry
   {
     name: "namespace.my_tool_v1",
     description: "...",
     inputSchema: { ... },
     outputSchema: myToolOutputSchema,
     handler: myTool
   }
   ```

### Adding a New Doctrine Rule

1. **Update schema**: Add validation to relevant Zod schema
2. **Update validation tool**: Add check to `validate_doctrine_v1.ts`
3. **Add test**: Update `doctrine_enforcement.test.ts`
4. **Update docs**: Document in this file

---

## 📚 Related Documentation

- [README.md](../README.md) - Main doctrine & system overview
- [learning-layer.md](./learning-layer.md) - Learning layer architecture
- [decision-v2-inventory.md](./decision-v2-inventory.md) - SnapshotV2 schema reference

---

## ✅ Implementation Checklist

- ✅ Core Zod schemas (9 artifact types)
- ✅ SYSTEM 0: Intent capture tool
- ✅ SYSTEM 1: Signal computation tool
- ✅ SYSTEM 4: Commitment recording tool
- ✅ SYSTEM 5: Outcome review tool
- ✅ Doctrine gate validation tool
- ✅ Pipeline v3 orchestrator
- ✅ Tool registry wiring
- ✅ Unit tests
- ✅ Demo script
- ⏳ SYSTEM 1: normalize.field_diet_v2 tool (strict field mapping)
- ⏳ Learning curation tools (learning.curate_examples_v1, learning.regression_gate_v1)
- ⏳ Integration tests
- ⏳ README updates

---

**Last Updated**: 2025-02-03
