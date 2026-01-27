export const FORBIDDEN_TERMS = [
  "dashboard",
  "kpi",
  "analytics",
  "monitor",
  "monitoring",
  "bi",
  "performance tracking",
  "reporting",
  "optimize performance",
];

export function normalize(value: string) {
  return value.toLowerCase();
}

function matchesTerm(normalized: string, term: string) {
  if (term === "bi") {
    return /\bbi\b/i.test(normalized);
  }
  if (term === "kpi") {
    return /\bkpi\b/i.test(normalized);
  }
  return normalized.includes(term);
}

function scanValue(value: unknown, path: string[], hits: Map<string, Set<string>>) {
  if (typeof value === "string") {
    const normalized = normalize(value);
    for (const term of FORBIDDEN_TERMS) {
      if (matchesTerm(normalized, term)) {
        if (!hits.has(term)) hits.set(term, new Set());
        hits.get(term)!.add(path.join("."));
      }
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      scanValue(item, [...path, String(index)], hits);
    });
    return;
  }

  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, val]) => {
      scanValue(val, [...path, key], hits);
    });
  }
}

export function scanObjectForForbidden(obj: unknown) {
  const hits = new Map<string, Set<string>>();
  scanValue(obj, [], hits);

  const terms = Array.from(hits.keys());
  const fields = Array.from(hits.values()).flatMap((set) => Array.from(set));

  return { terms, fields };
}
