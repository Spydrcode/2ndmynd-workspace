export type RagDoc = {
  id: string;
  workspace_id: string;
  business_id?: string;
  content: string;
  source: string;
  metadata?: Record<string, string | number | boolean | null>;
  created_at: string;
  embedding?: number[];
};

export type RagChunk = {
  id: string;
  content: string;
  source: string;
  score: number;
  workspace_id: string;
  business_id?: string;
};

export type RagContext = {
  context: string;
  sources: string[];
  context_ids: string[];
};
