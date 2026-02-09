export type RawLeakHit = {
  kind: "email" | "phone" | "address_hint" | "raw_row_hint";
  sample: string;
};

export type RawLeakScanResult = {
  ok: boolean;
  hits: RawLeakHit[];
};

function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") {
    out.push(value);
    return out;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out);
    return out;
  }

  if (value && typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) {
      collectStrings(item, out);
    }
  }

  return out;
}

function sample(value: string): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= 80) return compact;
  return `${compact.slice(0, 77)}...`;
}

export function scanForRawLeaks(payload: unknown): RawLeakScanResult {
  const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
  const phonePattern = /\b(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/;
  const addressPattern = /\b(street|st\.|avenue|ave\.|road|rd\.|suite|ste\.|apt\.|apartment|blvd)\b/i;
  const rawRowPattern = /(?:^|[\s,;])(?:name|customer|address|email|phone)[\s:=]/i;

  const hits: RawLeakHit[] = [];
  const seen = new Set<string>();

  for (const text of collectStrings(payload)) {
    const scanned = text.trim();
    if (scanned.length === 0) continue;

    const add = (kind: RawLeakHit["kind"]) => {
      const key = `${kind}:${scanned}`;
      if (seen.has(key)) return;
      seen.add(key);
      hits.push({ kind, sample: sample(scanned) });
    };

    if (emailPattern.test(scanned)) add("email");
    if (phonePattern.test(scanned)) add("phone");
    if (addressPattern.test(scanned)) add("address_hint");
    if (rawRowPattern.test(scanned)) add("raw_row_hint");
  }

  return {
    ok: hits.length === 0,
    hits,
  };
}

