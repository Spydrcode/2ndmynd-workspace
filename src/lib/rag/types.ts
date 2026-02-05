/**
 * RAG Document Types
 * 
 * This is CONTEXT RAG, not ANSWER RAG.
 * 
 * RAG is used ONLY for:
 * - Business context enrichment
 * - Website understanding
 * - Opportunity suggestion quality
 * - Narrative clarity (wording, not conclusions)
 * 
 * RAG is NEVER used for:
 * - Snapshot math
 * - Signals_v1
 * - Benchmarks
 * - Learning targets
 * - Boundary logic
 * - Model training data
 */

export type RagDocType =
  | "business_profile"
  | "website_scan"
  | "industry_baseline"
  | "tool_playbook"
  | "internal_doctrine";

export type RagSource = "website" | "internal" | "curated";

export type RagDocMetadata = {
  workspace_id: string; // or "global" for curated content
  industry_key?: string;
  doc_type: RagDocType;
  source: RagSource;
  created_at: string;
  run_id?: string; // optional link to specific run
  [key: string]: string | number | boolean | undefined | null;
};

export type RagDocInput = {
  text: string;
  metadata: RagDocMetadata;
};

export type RagQueryFilters = {
  workspace_id?: string;
  industry_key?: string;
  doc_type?: RagDocType | RagDocType[];
};

export type RagContextResult = {
  context: string;
  sources: Array<{
    doc_type: RagDocType;
    source: RagSource;
    created_at: string;
  }>;
  // Internal tracking only, not for display
  context_ids?: string[];
};
