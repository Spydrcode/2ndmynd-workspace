export function redact(s: string): string {
  return s
    .replace(/sk-[^\s]*/g, "<REDACTED>")
    .replace(/sb_secret_[^\s]*/g, "<REDACTED>")
    .replace(/service_role[^\s]*/gi, "<REDACTED>");
}