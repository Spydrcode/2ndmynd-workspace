import { scanObjectForForbidden } from "./lib/forbidden";

type RewriteResult = {
  rewritten: unknown;
  changed: boolean;
  terms_before: string[];
  terms_after: string[];
};

const REPLACEMENTS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /performance tracking/gi, replacement: "ongoing measurement" },
  { pattern: /dashboard/gi, replacement: "summary view" },
  { pattern: /kpi/gi, replacement: "signal" },
  { pattern: /analytics/gi, replacement: "patterns" },
  { pattern: /monitoring/gi, replacement: "watching" },
  { pattern: /monitor/gi, replacement: "watch" },
  { pattern: /\bbi\b/gi, replacement: "business tools" },
  { pattern: /reporting/gi, replacement: "summary" },
];

function rewriteString(value: string) {
  let updated = value;
  let changed = false;

  for (const { pattern, replacement } of REPLACEMENTS) {
    const next = updated.replace(pattern, replacement);
    if (next !== updated) {
      updated = next;
      changed = true;
    }
  }

  return { value: updated, changed };
}

function rewriteValue(value: unknown): { value: unknown; changed: boolean } {
  if (typeof value === "string") {
    return rewriteString(value);
  }

  if (Array.isArray(value)) {
    let changed = false;
    const rewritten = value.map((item) => {
      const next = rewriteValue(item);
      if (next.changed) changed = true;
      return next.value;
    });
    return { value: rewritten, changed };
  }

  if (value && typeof value === "object") {
    let changed = false;
    const rewritten: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      const next = rewriteValue(val);
      if (next.changed) changed = true;
      rewritten[key] = next.value;
    }
    return { value: rewritten, changed };
  }

  return { value, changed: false };
}

export function rewriteConclusion(obj: unknown): RewriteResult {
  const termsBefore = scanObjectForForbidden(obj).terms;
  const rewrittenResult = rewriteValue(obj);
  const termsAfter = scanObjectForForbidden(rewrittenResult.value).terms;

  return {
    rewritten: rewrittenResult.value,
    changed: rewrittenResult.changed,
    terms_before: termsBefore,
    terms_after: termsAfter,
  };
}
