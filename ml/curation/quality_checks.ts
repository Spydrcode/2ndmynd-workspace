import type { LLMLogRecord } from "../logging/log_types";

export function isPIIHeavy(record: LLMLogRecord): boolean {
  return record.privacy.pii_redacted && record.privacy.redaction_notes.length > 2;
}

export function isCorrected(record: LLMLogRecord): boolean {
  return record.outcome.corrected || Boolean(record.outcome.correction_reference_id);
}

export function isHighImpact(record: LLMLogRecord): boolean {
  if (!record.validations.schema_valid) return true;
  if (record.validations.doctrine_score < 0.7) return true;
  if (record.validations.clarity_score < 0.7) return true;
  if (record.response.latency_ms > 5000) return true;
  if ((record.response.cost_usd_estimate ?? 0) > 0.05) return true;
  return false;
}
