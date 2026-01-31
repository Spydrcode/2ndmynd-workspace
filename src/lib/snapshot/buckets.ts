import type {
  CashLagBucket,
  DecisionLagBucket,
  InvoiceStatus,
  QuoteStatus,
  MoneyBucket,
} from "./schema";

export function bucketMoney(amount: number): MoneyBucket {
  const value = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  if (value < 250) return "micro";
  if (value < 750) return "small";
  if (value < 2500) return "medium";
  if (value < 7500) return "large";
  return "jumbo";
}

export function daysBetween(a: Date, b: Date) {
  const msPerDay = 86_400_000;
  const diff = Math.floor((b.getTime() - a.getTime()) / msPerDay);
  return Math.max(0, diff);
}

function safeDateFromIso(raw: string) {
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function bucketDecisionLag(
  createdAtISO: string,
  approvedAtISO?: string | null
): DecisionLagBucket {
  if (!approvedAtISO) return "unknown";
  const createdAt = safeDateFromIso(createdAtISO);
  const approvedAt = safeDateFromIso(approvedAtISO);
  if (!createdAt || !approvedAt) return "unknown";

  const days = daysBetween(createdAt, approvedAt);
  if (days === 0) return "same_day";
  if (days <= 3) return "1_3_days";
  if (days <= 7) return "4_7_days";
  if (days <= 14) return "8_14_days";
  if (days <= 30) return "15_30_days";
  return "over_30_days";
}

export function bucketCashLag(
  createdAtISO: string,
  paidAtISO?: string | null
): CashLagBucket {
  // Reserved for future cash-lag analysis (not used in v1 snapshot).
  if (!paidAtISO) return "unknown";
  const createdAt = safeDateFromIso(createdAtISO);
  const paidAt = safeDateFromIso(paidAtISO);
  if (!createdAt || !paidAt) return "unknown";

  const days = daysBetween(createdAt, paidAt);
  if (days === 0) return "same_day";
  if (days <= 7) return "1_7_days";
  if (days <= 21) return "8_21_days";
  if (days <= 45) return "22_45_days";
  return "over_45_days";
}

export function safeParseMoney(raw: string) {
  const trimmed = raw?.trim?.() ?? "";
  if (!trimmed) return null;

  let negative = false;
  let valuePart = trimmed;
  if (valuePart.startsWith("(") && valuePart.endsWith(")")) {
    negative = true;
    valuePart = valuePart.slice(1, -1);
  }

  valuePart = valuePart.replace(/\$/g, "").replace(/,/g, "").replace(/\s+/g, "");
  if (!valuePart) return null;

  const value = Number(valuePart);
  if (!Number.isFinite(value)) return null;
  if (negative) return -Math.abs(value);
  return value;
}

export function safeParseDate(raw: string) {
  const trimmed = raw?.trim?.() ?? "";
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString();
}

function normalizeToken(raw: string) {
  return (raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_\-]/g, " ")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ");
}

export function normalizeStatus(raw: string, kind: "quote" | "invoice") {
  const token = normalizeToken(raw);
  if (!token) return "unknown";

  if (kind === "quote") {
    if (["approved", "accepted", "won"].includes(token)) return "approved" satisfies QuoteStatus;
    if (["rejected", "declined", "lost"].includes(token)) return "rejected" satisfies QuoteStatus;
    if (["draft"].includes(token)) return "draft" satisfies QuoteStatus;
    if (["sent", "pending", "open"].includes(token)) return "sent" satisfies QuoteStatus;
    return "unknown" satisfies QuoteStatus;
  }

  if (["paid", "closed"].includes(token)) return "paid" satisfies InvoiceStatus;
  if (["overdue", "past due", "pastdue"].includes(token)) return "overdue" satisfies InvoiceStatus;
  if (["void", "voided", "cancelled", "canceled"].includes(token)) return "void" satisfies InvoiceStatus;
  if (["sent", "open", "issued"].includes(token)) return "sent" satisfies InvoiceStatus;
  return "unknown" satisfies InvoiceStatus;
}
