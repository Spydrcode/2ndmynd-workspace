import crypto from "node:crypto";
import type { TrainExample } from "../logging/log_types";

function hashText(text: string) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

export function hashExample(example: TrainExample): string {
  const payload = JSON.stringify({
    instruction: example.instruction,
    expected_output_json: example.expected_output_json,
  });
  return hashText(payload);
}

export function dedupeExamples(examples: TrainExample[]): TrainExample[] {
  const seen = new Set<string>();
  const result: TrainExample[] = [];
  for (const ex of examples) {
    const hash = hashExample(ex);
    if (seen.has(hash)) continue;
    seen.add(hash);
    result.push(ex);
  }
  return result;
}
