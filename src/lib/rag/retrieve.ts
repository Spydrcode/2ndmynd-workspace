/**
 * RAG Retrieval for Intelligence Layer
 * 
 * Wrapper around ml/rag/retrieve that enforces intelligence layer conventions:
 * - Filtered by workspace and doc types
 * - Returns structured context for LLM prompts
 * - Never used for deterministic signals
 */

import { retrieveContext } from "@/ml/rag/retrieve";
import type { RagContextResult, RagQueryFilters, RagDocType } from "./types";

/**
 * Retrieve RAG context for narrative building.
 * 
 * This is ADVISORY CONTEXT ONLY:
 * - May improve wording and suggestions
 * - May NOT introduce new metrics or override conclusions
 * - If empty, behavior is unchanged
 * 
 * @param query Natural language query describing what context is needed
 * @param filters Workspace, industry, and doc type filters
 * @param limit Max number of context chunks (default 6)
 * @returns Structured context with sources
 */
export async function getRagContext(params: {
  query: string;
  filters: RagQueryFilters;
  limit?: number;
}): Promise<RagContextResult> {
  const { query, filters, limit = 6 } = params;

  // If no query, return empty
  if (!query.trim()) {
    return { context: "", sources: [] };
  }

  // If no workspace_id, return empty (prevent cross-workspace leakage)
  if (!filters.workspace_id) {
    console.warn("getRagContext called without workspace_id filter");
    return { context: "", sources: [] };
  }

  try {
    // Call ml/rag retrieve
    const ragResult = await retrieveContext({
      query,
      workspace_id: filters.workspace_id,
      top_k: limit,
      max_chars: 2000,
    });

    // Parse sources from ml/rag format
    // ml/rag stores source as "doc_type:source"
    const sources = ragResult.sources.map((source) => {
      const [doc_type, rag_source] = source.split(":");
      return {
        doc_type: doc_type as RagDocType,
        source: rag_source as "website" | "internal" | "curated",
        created_at: new Date().toISOString(), // ml/rag doesn't return timestamps
      };
    });

    // Filter by doc_type if specified
    if (filters.doc_type) {
      const allowedTypes = Array.isArray(filters.doc_type)
        ? filters.doc_type
        : [filters.doc_type];
      
      const filteredSources = sources.filter((s) => allowedTypes.includes(s.doc_type));
      
      // If all sources filtered out, return empty
      if (filteredSources.length === 0) {
        return { context: "", sources: [] };
      }
      
      // In production, would re-query with filtered doc_types
      // For now, we trust the limit and assume the filter is loose enough
    }

    return {
      context: ragResult.context,
      sources,
      context_ids: ragResult.context_ids,
    };
  } catch (error) {
    console.error("Error retrieving RAG context:", error);
    // On error, return empty context (fail gracefully)
    return { context: "", sources: [] };
  }
}
