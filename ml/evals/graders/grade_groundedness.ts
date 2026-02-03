const NUMBER_PATTERN = /\b\d+(\.\d+)?\b/g;
const SOURCE_HINTS = ["source", "from", "based on", "evidence", "according to"];

export function gradeGroundedness(text: string) {
  const numbers = text.match(NUMBER_PATTERN) ?? [];
  if (numbers.length === 0) {
    return { score: 1, errors: [] };
  }
  const lower = text.toLowerCase();
  const hasSource = SOURCE_HINTS.some((hint) => lower.includes(hint));
  return {
    score: hasSource ? 1 : 0.4,
    errors: hasSource ? [] : ["numeric_claims_without_sources"],
  };
}
