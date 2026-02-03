import Ajv from "ajv";
import type { ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import llmLogSchema from "./llm_log_record.schema.json";
import trainExampleSchema from "./train_example.schema.json";
import evalCaseSchema from "./eval_case.schema.json";
import evalResultSchema from "./eval_result.schema.json";
import ragDocSchema from "./rag_doc.schema.json";
import modelEntrySchema from "./model_entry.schema.json";

const ajv = new Ajv({ allErrors: true, strict: true });
addFormats(ajv);

export const validateLLMLogRecord = ajv.compile(llmLogSchema);
export const validateTrainExample = ajv.compile(trainExampleSchema);
export const validateEvalCase = ajv.compile(evalCaseSchema);
export const validateEvalResult = ajv.compile(evalResultSchema);
export const validateRagDoc = ajv.compile(ragDocSchema);
export const validateModelEntry = ajv.compile(modelEntrySchema);

export function assertValid(validate: ValidateFunction, data: unknown, label: string): void {
  const ok = validate(data);
  if (!ok) {
    const errors = validate.errors?.map((e) => `${e.instancePath} ${e.message}`).join("; ");
    throw new Error(`Schema validation failed for ${label}: ${errors}`);
  }
}
