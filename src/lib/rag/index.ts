/**
 * RAG Integration Index
 * 
 * Central exports for RAG context enrichment in Intelligence Layer.
 */

export { ingestRagDoc, ingestRagDocsBatch } from "./ingest";
export { getRagContext } from "./retrieve";
export type {
  RagDocType,
  RagSource,
  RagDocMetadata,
  RagDocInput,
  RagQueryFilters,
  RagContextResult,
} from "./types";
