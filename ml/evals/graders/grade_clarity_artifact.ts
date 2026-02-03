export function gradeClarityArtifact(output_json: object | null, output_text: string) {
  if (!output_json) {
    return { score: 0.2, errors: ["missing_output_json"] };
  }
  const record = output_json as Record<string, unknown>;
  const missing: string[] = [];
  if (!record.takeaway) missing.push("takeaway");
  if (!record.boundary) missing.push("boundary");
  if (!record.next_7_days || !Array.isArray(record.next_7_days) || record.next_7_days.length === 0) {
    missing.push("next_7_days");
  }
  if (!record.why_heavy) missing.push("why_heavy");
  const score = missing.length === 0 ? 1 : missing.length <= 2 ? 0.6 : 0.3;
  return { score, errors: missing.map((m) => `missing_${m}`) };
}
