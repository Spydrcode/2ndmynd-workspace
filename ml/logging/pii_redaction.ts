import type { LoggedMessage } from "./log_types";

type RedactionResult = {
  text: string;
  redacted: boolean;
  notes: string[];
};

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE = /(\+?\d{1,2}[\s.-]?)?(\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/g;
const ADDRESS = /\b\d{1,5}\s+([A-Za-z0-9.\-]+\s){1,4}(Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd)\b/gi;
const NAME_HINT = /\b(Mr|Ms|Mrs|Dr|Contact|Name):?\s+[A-Z][a-z]+\s+[A-Z][a-z]+\b/g;

export function redactText(input: string): RedactionResult {
  let text = input;
  const notes: string[] = [];
  const apply = (pattern: RegExp, label: string) => {
    if (pattern.test(text)) {
      text = text.replace(pattern, `[REDACTED_${label}]`);
      notes.push(label);
    }
  };

  apply(EMAIL, "EMAIL");
  apply(PHONE, "PHONE");
  apply(ADDRESS, "ADDRESS");
  apply(NAME_HINT, "NAME");

  return { text, redacted: notes.length > 0, notes };
}

export function redactMessages(messages: LoggedMessage[]): { messages: LoggedMessage[]; redacted: boolean; notes: string[] } {
  let redacted = false;
  const notes: string[] = [];
  const sanitized = messages.map((msg) => {
    const result = redactText(msg.content);
    if (result.redacted) {
      redacted = true;
      notes.push(...result.notes);
    }
    return { ...msg, content: result.text };
  });
  return { messages: sanitized, redacted, notes: Array.from(new Set(notes)) };
}

export function redactJsonStrings(value: unknown): { value: unknown; redacted: boolean; notes: string[] } {
  let redacted = false;
  const notes: string[] = [];

  const walk = (val: unknown): unknown => {
    if (typeof val === "string") {
      const result = redactText(val);
      if (result.redacted) {
        redacted = true;
        notes.push(...result.notes);
      }
      return result.text;
    }
    if (Array.isArray(val)) return val.map(walk);
    if (val && typeof val === "object") {
      const entries = Object.entries(val as Record<string, unknown>);
      const next: Record<string, unknown> = {};
      for (const [k, v] of entries) {
        next[k] = walk(v);
      }
      return next;
    }
    return val;
  };

  return { value: walk(value), redacted, notes: Array.from(new Set(notes)) };
}
