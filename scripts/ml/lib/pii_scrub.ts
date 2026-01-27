import crypto from "node:crypto";

type ScrubResult = {
  scrubbed: unknown;
  findings: string[];
};

const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_REGEX = /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/;
const ADDRESS_REGEX =
  /\b\d{1,5}\s+[A-Za-z0-9.\-]+\s+(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Way|Wy|Circle|Cir|Parkway|Pkwy)\b/i;

const PII_KEY_REGEX = /(name|email|phone|address|street|city|zip|postal|contact)/i;

function hashValue(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function scrubString(value: string): { value: string; hit: boolean } {
  if (EMAIL_REGEX.test(value)) return { value: "<redacted_email>", hit: true };
  if (PHONE_REGEX.test(value)) return { value: "<redacted_phone>", hit: true };
  if (ADDRESS_REGEX.test(value)) return { value: "<redacted_address>", hit: true };
  return { value, hit: false };
}

export function scrubPII(input: unknown): ScrubResult {
  const findings: string[] = [];

  const scrub = (value: unknown, path: string[]): unknown => {
    if (typeof value === "string") {
      const { value: next, hit } = scrubString(value);
      if (hit) findings.push(path.join("."));
      return next;
    }

    if (Array.isArray(value)) {
      return value.map((item, idx) => scrub(item, [...path, String(idx)]));
    }

    if (value && typeof value === "object") {
      const obj = value as Record<string, unknown>;
      const next: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(obj)) {
        if (PII_KEY_REGEX.test(key)) {
          if (typeof val === "string" && val.trim().length > 0) {
            findings.push([...path, key].join("."));
            next[key] = `pii_hash_${hashValue(val)}`;
          } else {
            next[key] = "<redacted>";
          }
          continue;
        }
        next[key] = scrub(val, [...path, key]);
      }
      return next;
    }

    return value;
  };

  return { scrubbed: scrub(input, []), findings };
}

export function assertNoPII(input: unknown) {
  const hits: string[] = [];
  const scan = (value: unknown, path: string[]) => {
    if (typeof value === "string") {
      if (EMAIL_REGEX.test(value) || PHONE_REGEX.test(value) || ADDRESS_REGEX.test(value)) {
        hits.push(path.join("."));
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, idx) => scan(item, [...path, String(idx)]));
      return;
    }
    if (value && typeof value === "object") {
      Object.entries(value as Record<string, unknown>).forEach(([key, val]) =>
        scan(val, [...path, key])
      );
    }
  };
  scan(input, []);
  if (hits.length > 0) {
    throw new Error(`PII scrub failed. Remaining matches at: ${hits.join(", ")}`);
  }
}
