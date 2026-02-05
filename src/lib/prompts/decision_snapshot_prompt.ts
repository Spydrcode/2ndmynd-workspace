/**
 * Decision Snapshot Prompt: Canonical LLM Template
 *
 * This prompt blends:
 * - Deterministic signals from snapshot (NEVER override these)
 * - RAG context (industry baselines, tool playbook)
 * - ML inference (if enabled)
 * - 2ndmynd doctrine (calm, finite, reduced burden)
 *
 * CRITICAL RULES:
 * 1. Never invent metrics not in the snapshot
 * 2. RAG context guides TONE and SUGGESTIONS, not FACTS
 * 3. If no RAG context available, still generate useful output
 * 4. No generic advice—industry differentiation is essential
 */

import type { RagContextResult } from "../rag";

// Internal Snapshot type for prompt generation (not SnapshotV2 schema)
interface Snapshot {
  snapshot_id?: string;
  workspace_id?: string;
  metadata: {
    snapshot_start_date: string;
    snapshot_end_date: string;
    industry_bucket?: string;
    snapshot_version?: string;
    created_at?: string;
  };
  signals_v1: Record<string, number | string | boolean | null>;
}

// Extended RAG context with full document content for prompt generation
interface RagDoc {
  content: string;
  metadata: {
    workspace_id?: string;
    industry_key?: string;
    doc_type: string;
    source: string;
    created_at: string;
  };
}

interface ExtendedRagContext extends RagContextResult {
  docs?: RagDoc[];
}

export interface DecisionSnapshotPromptInput {
  snapshot: Snapshot;
  rag_context?: ExtendedRagContext;
  ml_inference?: {
    predicted_class?: string;
    confidence?: number;
    recommended_actions?: string[];
  };
  business_context?: {
    industry_key?: string;
    business_name?: string;
    owner_name?: string;
  };
}

/**
 * Build the canonical prompt for LLM-powered decision snapshots.
 *
 * This is the SINGLE SOURCE OF TRUTH for how we structure prompts
 * that generate client-facing decision artifacts.
 */
export function buildDecisionSnapshotPrompt(
  input: DecisionSnapshotPromptInput
): string {
  const { snapshot, rag_context, ml_inference, business_context } = input;

  // Extract signal values (these are the GROUND TRUTH)
  const signals = snapshot.signals_v1;
  const metadata = snapshot.metadata;

  // Extract RAG context if available
  const industryContext =
    rag_context?.docs
      ?.filter((doc) => doc.metadata.doc_type === "industry_baseline")
      .map((doc) => doc.content)
      .join("\n\n") || null;

  const toolContext =
    rag_context?.docs
      ?.filter((doc) => doc.metadata.doc_type === "tool_playbook")
      .map((doc) => doc.content)
      .join("\n\n") || null;

  // Build prompt sections
  const systemSection = buildSystemSection();
  const dataSection = buildDataSection(signals, metadata, business_context);
  const contextSection = buildContextSection(industryContext, toolContext);
  const mlSection = buildMLSection(ml_inference);
  const instructionsSection = buildInstructionsSection();

  return [
    systemSection,
    dataSection,
    contextSection,
    mlSection,
    instructionsSection,
  ]
    .filter(Boolean)
    .join("\n\n---\n\n");
}

// ============================================================================
// Section Builders
// ============================================================================

function buildSystemSection(): string {
  return `# System Role: 2ndmynd Intelligence Analyst

You are a financial operations analyst for owner-led businesses. Your role is to:
1. Interpret numerical signals from a business snapshot
2. Provide calm, finite, useful observations
3. Suggest concrete next steps that reduce owner burden

## Doctrine
- **Calm**: No alarmism, no guilt, no shame
- **Finite**: Bounded problem space; owners can't fix everything at once
- **Reduced burden**: Tools and systems should make life easier, not add complexity
- **Industry-specific**: HVAC ≠ Painter ≠ Taco Stand—context matters
- **Facts over advice**: Observations grounded in data, not generic "best practices"`;
}

function buildDataSection(
  signals: Snapshot["signals_v1"],
  metadata: Snapshot["metadata"],
  business_context?: DecisionSnapshotPromptInput["business_context"]
): string {
  const businessName = business_context?.business_name || "this business";
  const industryKey = business_context?.industry_key || metadata.industry_bucket;

  return `# Business Data (Ground Truth)

**Business**: ${businessName}  
**Industry**: ${industryKey}  
**Snapshot Period**: ${metadata.snapshot_start_date} to ${metadata.snapshot_end_date}

## Financial Signals
- **Total Revenue**: $${Number(signals.agg_revenue_total ?? 0).toFixed(2)}
- **Average Invoice**: $${Number(signals.agg_avg_invoice_amt ?? 0).toFixed(2)}
- **Payment Lag (Median)**: ${signals.agg_median_collection_days ?? "N/A"} days
- **Quote-to-Close Rate**: ${(Number(signals.rate_quote_to_close ?? 0) * 100).toFixed(1)}%
- **Job Completion Rate**: ${(Number(signals.rate_job_completion ?? 0) * 100).toFixed(1)}%

## Volume Signals
- **Quotes Issued**: ${signals.count_quotes ?? 0}
- **Jobs Completed**: ${signals.count_jobs_done ?? 0}
- **Invoices Sent**: ${signals.count_invoices ?? 0}
- **Unpaid Invoices**: ${signals.count_invoices_unpaid ?? 0}

## Time-Based Signals
- **Days with Revenue**: ${signals.count_revenue_days ?? 0}
- **Days Since Last Sale**: ${signals.days_since_last_sale ?? "N/A"}
- **Weekend Work Pattern**: ${Number(signals.pct_weekend_jobs ?? 0) > 0 ? `${(Number(signals.pct_weekend_jobs) * 100).toFixed(1)}% of jobs` : "No weekend pattern"}

## CRITICAL INSTRUCTION
These numbers are FACTS. Do NOT invent additional metrics. If a signal is not listed here, DO NOT reference it.`;
}

function buildContextSection(
  industryContext: string | null,
  toolContext: string | null
): string {
  if (!industryContext && !toolContext) {
    return `# Industry Context

No industry-specific context available. Generate snapshot using general small business principles.`;
  }

  const sections: string[] = ["# Industry Context"];

  if (industryContext) {
    sections.push(`## Industry Baseline Knowledge\n\n${industryContext}`);
  }

  if (toolContext) {
    sections.push(`## Tool & Systems Playbook\n\n${toolContext}`);
  }

  sections.push(
    `## Usage Rules\n- Use this context to inform TONE and SUGGESTIONS\n- Do NOT use this context to override numerical signals\n- If context contradicts data, trust the data`
  );

  return sections.join("\n\n");
}

function buildMLSection(
  ml_inference?: DecisionSnapshotPromptInput["ml_inference"]
): string {
  if (!ml_inference || !ml_inference.predicted_class) {
    return ""; // ML inference is optional
  }

  return `# ML Inference (Optional Guidance)

**Predicted Health Class**: ${ml_inference.predicted_class}  
**Confidence**: ${ml_inference.confidence ? `${(ml_inference.confidence * 100).toFixed(1)}%` : "N/A"}

${
  ml_inference.recommended_actions
    ? `**Suggested Focus Areas**:\n${ml_inference.recommended_actions.map((action) => `- ${action}`).join("\n")}`
    : ""
}

**Note**: ML predictions are advisory only. Focus on factual observations from the data.`;
}

function buildInstructionsSection(): string {
  return `# Output Instructions

Generate a **Decision Snapshot** in markdown format with the following structure:

## 1. Opening Observation (2-3 sentences)
Calm, factual summary of what the numbers show. No judgment.

## 2. What's Working
Highlight 2-3 positive signals from the data. Be specific—reference actual numbers.

## 3. Where Friction Shows Up
Identify 2-3 areas where the data suggests friction or missed opportunity. Be observational, not prescriptive.

## 4. Next Steps (Finite, Actionable)
Suggest 1-3 concrete actions the owner can take. Each should:
- Be specific to this industry and data
- Reduce burden (not add complexity)
- Be achievable within 30 days

## 5. Tool/System Suggestions (If Relevant)
If the data suggests a gap that a tool/system could address:
- Name the gap (e.g., "payment delays", "quote follow-up")
- Suggest tool category (not specific vendors unless critical)
- Explain expected outcome (e.g., "cashflow becomes more predictable")

## Tone Guidelines
- ✅ Calm, observational, specific
- ✅ Industry-aware (HVAC ≠ Painter ≠ Taco Stand)
- ✅ Focused on reducing owner burden
- ❌ No guilt, shaming, or "you should have"
- ❌ No generic advice that applies to all businesses
- ❌ No invented metrics or assumptions beyond the data

## Length
800-1200 words. Concise but substantive.`;
}

// ============================================================================
// Helper: Extract Prompt for Testing
// ============================================================================

/**
 * Extract just the prompt text for validation/testing.
 * Useful for ensuring we don't accidentally include RAG docs in training data.
 */
export function extractPromptWithoutRag(
  input: DecisionSnapshotPromptInput
): string {
  const inputWithoutRag = { ...input, rag_context: undefined };
  return buildDecisionSnapshotPrompt(inputWithoutRag);
}
