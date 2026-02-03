import crypto from "node:crypto";
import type { LLMLogRecord, TrainExample } from "../logging/log_types";

export function buildTrainExample(params: {
  record: LLMLogRecord;
  corrected_output: object;
  split: "gold" | "growth";
  reviewer: string;
  notes: string;
  score: number;
}): TrainExample {
  return {
    id: crypto.randomUUID(),
    source_log_id: params.record.id,
    split: params.split,
    instruction: params.record.request.messages.map((m) => `${m.role}: ${m.content}`).join("\n"),
    expected_output_json: params.corrected_output,
    expected_output_text: params.record.response.output_text,
    tags: ["schema", "doctrine", "clarity"],
    created_at: new Date().toISOString(),
    reviewer: params.reviewer,
    quality: {
      score: params.score,
      notes: params.notes,
    },
  };
}
