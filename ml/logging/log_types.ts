export type Environment = "dev" | "staging" | "prod";

export type UserContext = {
  workspace_id: string;
  business_id?: string;
  operator_role?: string;
};

export type LoggedMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
};

export type ToolCallRecord = {
  name: string;
  arguments?: string | object | null;
};

export type LLMLogRecord = {
  id: string;
  timestamp: string;
  environment: Environment;
  user_context: UserContext;
  request: {
    system_prompt_hash: string;
    model: string;
    messages: LoggedMessage[];
    tools_available: string[];
    rag_context_ids: string[];
  };
  response: {
    output_text: string;
    output_json?: object | null;
    tool_calls: ToolCallRecord[];
    latency_ms: number;
    token_usage: {
      input_tokens: number;
      output_tokens: number;
      total_tokens: number;
    };
    cost_usd_estimate?: number | null;
  };
  validations: {
    schema_valid: boolean;
    doctrine_score: number;
    groundedness_score: number;
    clarity_score: number;
    errors: string[];
  };
  outcome: {
    accepted: boolean;
    corrected: boolean;
    correction_reference_id?: string;
  };
  privacy: {
    pii_redacted: boolean;
    redaction_notes: string[];
  };
};

export type TrainExample = {
  id: string;
  source_log_id?: string;
  split: "gold" | "growth";
  instruction: string;
  messages?: LoggedMessage[];
  expected_output_json: object;
  expected_output_text?: string;
  tags: string[];
  created_at: string;
  reviewer: string;
  quality: {
    score: number;
    notes: string;
  };
};

export type EvalCase = {
  id: string;
  suite: string;
  messages: LoggedMessage[];
  expected_schema_path?: string;
  expected_tool_calls?: string[];
  expected_refusal?: boolean;
  expected_output_json?: object;
  expected_output_text?: string;
  tags?: string[];
};

export type EvalResult = {
  id: string;
  suite: string;
  model_id: string;
  scores: {
    schema_valid: number;
    doctrine_score: number;
    groundedness_score: number;
    clarity_score: number;
  };
  pass: boolean;
  errors: string[];
  latency_ms?: number;
  output_json?: object | null;
  output_text?: string;
};

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

export type ModelEntry = {
  model_id: string;
  job_id?: string;
  created_at: string;
  dataset_hash: string;
  eval_report_path?: string;
  status: "candidate" | "champion" | "rejected" | "training";
};
