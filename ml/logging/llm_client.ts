import OpenAI from "openai";
import crypto from "node:crypto";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import type { LLMLogRecord, LoggedMessage, ToolCallRecord, UserContext } from "./log_types";
import { LogWriter } from "./log_writer";
import { redactJsonStrings, redactMessages, redactText } from "./pii_redaction";
import { gradeClarityArtifact } from "../evals/graders/grade_clarity_artifact";
import { gradeDoctrine } from "../evals/graders/grade_doctrine";
import { gradeGroundedness } from "../evals/graders/grade_groundedness";
import { gradeSchema } from "../evals/graders/grade_schema";
import { getRagContext } from "../rag";

export type LoggedCompletionParams = {
  messages: ChatCompletionMessageParam[];
  tools?: ChatCompletionTool[];
  model?: string;
  system_prompt?: string;
  user_context: UserContext;
  schema_path?: string;
  rag_query?: string;
  rag_context_ids?: string[];
};

type LoggedCompletionResult = {
  output_text: string;
  output_json: object | null;
  tool_calls: ToolCallRecord[];
  usage: { input_tokens: number; output_tokens: number; total_tokens: number };
  latency_ms: number;
  record: LLMLogRecord | null;
};

function hashText(text: string) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function resolveEnvironment() {
  const env = process.env.ML_ENVIRONMENT ?? process.env.NODE_ENV ?? "dev";
  if (env === "production") return "prod";
  if (env === "staging") return "staging";
  return "dev";
}

function extractOutputJson(text: string): object | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function mapToolCalls(toolCalls: Array<{ function: { name: string; arguments?: string } }>): ToolCallRecord[] {
  return toolCalls.map((call) => ({
    name: call.function.name,
    arguments: call.function.arguments ?? null,
  }));
}

function estimateCost(usage: { input_tokens: number; output_tokens: number }) {
  const inputRate = Number(process.env.OPENAI_INPUT_TOKEN_USD_PER_1K ?? "0");
  const outputRate = Number(process.env.OPENAI_OUTPUT_TOKEN_USD_PER_1K ?? "0");
  if (!Number.isFinite(inputRate) || !Number.isFinite(outputRate)) return null;
  return ((usage.input_tokens * inputRate) + (usage.output_tokens * outputRate)) / 1000;
}

function toLoggedMessages(messages: ChatCompletionMessageParam[]): LoggedMessage[] {
  return messages.map((msg) => ({
    role: msg.role,
    content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content ?? ""),
  }));
}

export async function runLoggedCompletion(params: LoggedCompletionParams): Promise<LoggedCompletionResult> {
  const start = Date.now();
  const model = params.model ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini-2024-07-18";

  const baseMessages = params.messages;
  let ragContextIds: string[] = params.rag_context_ids ?? [];
  let messages = [...baseMessages];

  if (params.rag_query) {
    const rag = await getRagContext({
      workspace_id: params.user_context.workspace_id,
      business_id: params.user_context.business_id,
      query: params.rag_query,
    });
    if (rag.context) {
      messages = [
        {
          role: "system",
          content: `Context (retrieved, scoped):\n${rag.context}\nSources: ${rag.sources.join(", ")}`,
        },
        ...messages,
      ];
    }
    ragContextIds = rag.context_ids;
  }

  const useMock = process.env.ML_LOG_USE_MOCK === "1" || !process.env.OPENAI_API_KEY;

  let output_text = "";
  let output_json: object | null = null;
  let tool_calls: ToolCallRecord[] = [];
  let usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 };

  if (useMock) {
    output_json = { next_step: "Gather missing business context before advising." };
    output_text = JSON.stringify(output_json);
  } else {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.chat.completions.create({
      model,
      messages,
      tools: params.tools,
    });
    const message = response.choices[0]?.message;
    output_text = message?.content ?? "";
    output_json = extractOutputJson(output_text);
    tool_calls = message?.tool_calls ? mapToolCalls(message.tool_calls as Array<{ function: { name: string; arguments?: string } }>) : [];
    usage = {
      input_tokens: response.usage?.prompt_tokens ?? 0,
      output_tokens: response.usage?.completion_tokens ?? 0,
      total_tokens: response.usage?.total_tokens ?? 0,
    };
  }

  const latency_ms = Date.now() - start;

  const loggedMessages = toLoggedMessages(messages);
  const { messages: redactedMessages, redacted: redactedMsg, notes: msgNotes } = redactMessages(loggedMessages);
  const redactedOutputText = redactText(output_text);
  const redactedOutputJson = output_json ? redactJsonStrings(output_json) : { value: null, redacted: false, notes: [] };

  const schemaResult = gradeSchema({
    schema_path: params.schema_path,
    output_json: redactedOutputJson.value as object | null,
  });
  const doctrineScore = gradeDoctrine(output_text).score;
  const clarityScore = gradeClarityArtifact(redactedOutputJson.value as object | null, output_text).score;
  const groundedScore = gradeGroundedness(output_text).score;

  const record: LLMLogRecord = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    environment: resolveEnvironment(),
    user_context: params.user_context,
    request: {
      system_prompt_hash: hashText(params.system_prompt ?? ""),
      model,
      messages: redactedMessages,
      tools_available: (params.tools ?? []).map((tool) => tool.function.name),
      rag_context_ids: ragContextIds,
    },
    response: {
      output_text: redactedOutputText.text,
      output_json: redactedOutputJson.value as object | null,
      tool_calls,
      latency_ms,
      token_usage: usage,
      cost_usd_estimate: estimateCost(usage),
    },
    validations: {
      schema_valid: schemaResult.ok,
      doctrine_score: doctrineScore,
      groundedness_score: groundedScore,
      clarity_score: clarityScore,
      errors: [...schemaResult.errors],
    },
    outcome: {
      accepted: false,
      corrected: false,
    },
    privacy: {
      pii_redacted: redactedMsg || redactedOutputText.redacted || redactedOutputJson.redacted,
      redaction_notes: Array.from(new Set([...msgNotes, ...redactedOutputText.notes, ...redactedOutputJson.notes])),
    },
  };

  if (process.env.ML_LOG_DISABLE !== "1") {
    const writer = new LogWriter();
    writer.write(record);
    writer.close();
  }

  return {
    output_text,
    output_json,
    tool_calls,
    usage,
    latency_ms,
    record,
  };
}
