export function gradeToolChoice(params: { expected_tools?: string[]; actual_tools: string[] }) {
  if (!params.expected_tools || params.expected_tools.length === 0) {
    return { score: 1, errors: [] };
  }
  const expected = new Set(params.expected_tools);
  const actual = new Set(params.actual_tools);
  const missing = params.expected_tools.filter((tool) => !actual.has(tool));
  const hallucinated = params.actual_tools.filter((tool) => !expected.has(tool));
  const score = missing.length === 0 && hallucinated.length === 0 ? 1 : missing.length === 0 ? 0.7 : 0.3;
  const errors = [
    ...missing.map((tool) => `missing_tool:${tool}`),
    ...hallucinated.map((tool) => `unexpected_tool:${tool}`),
  ];
  return { score, errors };
}
