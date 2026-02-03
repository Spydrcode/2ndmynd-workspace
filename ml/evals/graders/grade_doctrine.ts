const FORBIDDEN = [
  "dashboard",
  "kpi",
  "kpis",
  "monitoring",
  "business intelligence",
  "bi",
  "analytics",
];

const REQUIRED_HINTS = ["next", "do next", "next steps", "what to do"];

export function gradeDoctrine(text: string) {
  const lower = text.toLowerCase();
  const forbiddenHits = FORBIDDEN.filter((word) => lower.includes(word));
  const hasRequired = REQUIRED_HINTS.some((hint) => lower.includes(hint));
  const score = forbiddenHits.length > 0 ? 0 : hasRequired ? 1 : 0.6;
  return {
    score,
    errors: forbiddenHits.map((hit) => `forbidden_language:${hit}`),
  };
}
