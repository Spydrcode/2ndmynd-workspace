import type { SnapshotV2, VolatilityBand } from "@/lib/decision/v2/conclusion_schema_v2";
import { parseFlexibleTimestamp } from "@/src/lib/intelligence/dates";

import type { BuildLayerFusionArgs, LayerFusionPressurePattern, LayerFusionResult } from "./types";

type QuoteLike = { id?: string; status?: string; created_at?: string; approved_at?: string; total?: number };
type InvoiceLike = {
  id?: string;
  status?: string;
  issued_at?: string;
  paid_at?: string;
  total?: number;
  related_quote_id?: string;
};
type JobLike = { id?: string; status?: string; scheduled_at?: string; completed_at?: string; related_quote_id?: string };
type CustomerLike = { id?: string };

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function median(values: number[]) {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function daysBetween(a: Date, b: Date) {
  const diff = (b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000);
  return diff >= 0 ? diff : 0;
}

function toDate(value?: string) {
  return parseFlexibleTimestamp(value);
}

function inferBandSeverity(band: VolatilityBand | null, mode: "good_when_high" | "bad_when_high") {
  if (!band) return "medium" as const;
  if (mode === "good_when_high") {
    if (band === "very_low" || band === "low") return "high";
    if (band === "medium") return "medium";
    return "low";
  }
  // bad_when_high
  if (band === "very_high" || band === "high") return "high";
  if (band === "medium") return "medium";
  return "low";
}

function getPackViews(companyPack: unknown): {
  quotes: QuoteLike[];
  invoices: InvoiceLike[];
  jobs: JobLike[];
  customers: CustomerLike[];
  hasExplicitQuoteLinks: boolean;
} {
  if (!companyPack || typeof companyPack !== "object") {
    return { quotes: [], invoices: [], jobs: [], customers: [], hasExplicitQuoteLinks: false };
  }
  const record = companyPack as Record<string, unknown>;

  // CompanyPack shape (preferred)
  if (record.version === "company_pack_v1" && record.layers && typeof record.layers === "object") {
    const layers = record.layers as Record<string, unknown>;
    const quotes = (layers.intent_quotes as QuoteLike[]) ?? [];
    const invoices = (layers.billing_invoices as InvoiceLike[]) ?? [];
    const jobs = (layers.schedule_events as JobLike[]) ?? [];
    const customers = (layers.crm_customers as CustomerLike[]) ?? [];
    const hasExplicitQuoteLinks =
      invoices.some((i) => typeof i.related_quote_id === "string" && i.related_quote_id) ||
      jobs.some((j) => typeof j.related_quote_id === "string" && j.related_quote_id);
    return { quotes, invoices, jobs, customers, hasExplicitQuoteLinks };
  }

  // DataPackV0 shape (fallback)
  if (record.version === "data_pack_v0") {
    const quotes = (record.quotes as QuoteLike[]) ?? [];
    const invoices = (record.invoices as InvoiceLike[]) ?? [];
    const jobs = (record.jobs as JobLike[]) ?? [];
    const customers = (record.customers as CustomerLike[]) ?? [];
    const hasExplicitQuoteLinks =
      invoices.some((i) => typeof i.related_quote_id === "string" && i.related_quote_id) ||
      jobs.some((j) => typeof j.related_quote_id === "string" && j.related_quote_id);
    return { quotes, invoices, jobs, customers, hasExplicitQuoteLinks };
  }

  return { quotes: [], invoices: [], jobs: [], customers: [], hasExplicitQuoteLinks: false };
}

function computeConcentration(invoiceTotals: number[]) {
  const totals = invoiceTotals.filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => b - a);
  if (totals.length === 0) return { top10: 0, top25: 0 };
  const sumAll = totals.reduce((a, b) => a + b, 0);
  if (sumAll <= 0) return { top10: 0, top25: 0 };
  const top10n = Math.max(1, Math.ceil(totals.length * 0.1));
  const top25n = Math.max(1, Math.ceil(totals.length * 0.25));
  const top10 = totals.slice(0, top10n).reduce((a, b) => a + b, 0) / sumAll;
  const top25 = totals.slice(0, top25n).reduce((a, b) => a + b, 0) / sumAll;
  return { top10: clamp01(top10), top25: clamp01(top25) };
}

export function buildLayerFusion(args: BuildLayerFusionArgs): LayerFusionResult {
  const now = new Date().toISOString();
  const lookback_days = args.lookbackDays ?? args.snapshot_v2.window.lookback_days ?? 365;

  const view = getPackViews(args.companyPack);
  const quotes = view.quotes;
  const invoices = view.invoices;
  const jobs = view.jobs;
  const customers = view.customers;

  const coverage = {
    intent: quotes.length > 0,
    billing: invoices.length > 0,
    capacity: jobs.length > 0,
    cash: invoices.some((i) => Boolean(i.paid_at)),
    cost: (args.snapshot_v2.input_costs?.length ?? 0) > 0,
    crm: customers.length > 0,
  };

  const warnings: string[] = [];

  const quoteIdSet = new Set(quotes.map((q) => q.id).filter(Boolean) as string[]);
  const invoiceQuoteLinks = invoices
    .map((i) => i.related_quote_id)
    .filter((v): v is string => typeof v === "string" && v.length > 0);
  const jobQuoteLinks = jobs
    .map((j) => j.related_quote_id)
    .filter((v): v is string => typeof v === "string" && v.length > 0);

  const linkage_weak = !view.hasExplicitQuoteLinks;
  if (linkage_weak && (invoices.length > 0 || jobs.length > 0) && quotes.length > 0) {
    warnings.push("Linkage is weak: quote_id fields were not found across layers, so match rates and linked timing are limited.");
  }

  const quote_to_invoice_match_rate =
    invoiceQuoteLinks.length >= 10
      ? clamp01(invoiceQuoteLinks.filter((id) => quoteIdSet.has(id)).length / invoiceQuoteLinks.length)
      : undefined;

  const quote_to_job_match_rate =
    jobQuoteLinks.length >= 10
      ? clamp01(jobQuoteLinks.filter((id) => quoteIdSet.has(id)).length / jobQuoteLinks.length)
      : undefined;

  // Timing medians
  const createdToApproved: number[] = [];
  for (const q of quotes) {
    const created = toDate(q.created_at);
    const approved = toDate(q.approved_at);
    if (!created || !approved) continue;
    createdToApproved.push(daysBetween(created, approved));
  }

  // approved -> scheduled (linked by quote_id)
  const quoteApprovedById = new Map<string, Date>();
  for (const q of quotes) {
    if (!q.id) continue;
    const approved = toDate(q.approved_at);
    if (!approved) continue;
    quoteApprovedById.set(q.id, approved);
  }
  const approvedToScheduled: number[] = [];
  for (const j of jobs) {
    const qid = j.related_quote_id;
    if (!qid) continue;
    const approved = quoteApprovedById.get(qid);
    const scheduled = toDate(j.scheduled_at);
    if (!approved || !scheduled) continue;
    approvedToScheduled.push(daysBetween(approved, scheduled));
  }

  // scheduled -> invoiced (linked by quote_id; earliest scheduled and earliest invoice per quote)
  const firstScheduledByQuote = new Map<string, Date>();
  for (const j of jobs) {
    const qid = j.related_quote_id;
    if (!qid) continue;
    const scheduled = toDate(j.scheduled_at);
    if (!scheduled) continue;
    const cur = firstScheduledByQuote.get(qid);
    if (!cur || scheduled < cur) firstScheduledByQuote.set(qid, scheduled);
  }
  const firstInvoicedByQuote = new Map<string, Date>();
  for (const inv of invoices) {
    const qid = inv.related_quote_id;
    if (!qid) continue;
    const issued = toDate(inv.issued_at);
    if (!issued) continue;
    const cur = firstInvoicedByQuote.get(qid);
    if (!cur || issued < cur) firstInvoicedByQuote.set(qid, issued);
  }
  const scheduledToInvoiced: number[] = [];
  for (const [qid, scheduled] of firstScheduledByQuote.entries()) {
    const issued = firstInvoicedByQuote.get(qid);
    if (!issued) continue;
    scheduledToInvoiced.push(daysBetween(scheduled, issued));
  }

  // invoiced -> paid (invoice-level)
  const invoicedToPaid: number[] = [];
  for (const inv of invoices) {
    const issued = toDate(inv.issued_at);
    const paid = toDate(inv.paid_at);
    if (!issued || !paid) continue;
    invoicedToPaid.push(daysBetween(issued, paid));
  }

  const timing = {
    quote_created_to_approved_p50_days: createdToApproved.length >= 10 ? median(createdToApproved) : undefined,
    approved_to_scheduled_p50_days: approvedToScheduled.length >= 10 ? median(approvedToScheduled) : undefined,
    scheduled_to_invoiced_p50_days: scheduledToInvoiced.length >= 10 ? median(scheduledToInvoiced) : undefined,
    invoiced_to_paid_p50_days: invoicedToPaid.length >= 10 ? median(invoicedToPaid) : undefined,
  };

  // Pressure patterns (deterministic)
  const patterns: LayerFusionPressurePattern[] = [];

  const decisionLagBand = args.snapshot_v2.activity_signals.quotes.decision_lag_band ?? null;
  const volatilityBand = args.snapshot_v2.volatility_band ?? null;
  const quotesCount = args.snapshot_v2.activity_signals.quotes.quotes_count;
  const invoicesCount = args.snapshot_v2.activity_signals.invoices.invoices_count;

  // followup_drift
  {
    const lagSeverity = inferBandSeverity(decisionLagBand as VolatilityBand, "bad_when_high");
    const p50 = timing.quote_created_to_approved_p50_days;
    const p50Flag = typeof p50 === "number" ? (p50 > 14 ? "high" : p50 > 7 ? "medium" : "low") : "low";
    const severity = lagSeverity === "high" || p50Flag === "high" ? "high" : lagSeverity === "medium" || p50Flag === "medium" ? "medium" : "low";
    if (severity !== "low") {
      patterns.push({
        id: "followup_drift",
        severity,
        statement:
          severity === "high"
            ? "Decisions are taking long enough that follow-up can become a quiet second job."
            : "Decision timing is edging up, which can make follow-up feel scattered.",
        evidence: [
          `Quotes in window: ${quotesCount}`,
          `Decision timing band: ${decisionLagBand}`,
          ...(typeof p50 === "number" ? [`Quote created → approved (p50): ~${p50.toFixed(1)} days`] : []),
        ],
      });
    }
  }

  // capacity_pressure (intent + capacity)
  {
    const jobsInWindow = jobs.filter((j) => {
      const d = toDate(j.scheduled_at);
      if (!d) return false;
      const iso = d.toISOString().slice(0, 10);
      return iso >= args.snapshot_v2.window.slice_start && iso <= args.snapshot_v2.window.slice_end;
    }).length;
    const approvals = args.snapshot_v2.activity_signals.quotes.quotes_approved_count;
    const p50 = timing.approved_to_scheduled_p50_days;
    const dense = jobsInWindow >= 30 || (approvals > 0 && jobsInWindow / approvals > 1.2);
    const slow = typeof p50 === "number" ? p50 > 10 : false;
    const severity = dense && slow ? "high" : dense ? "medium" : "low";
    if (severity !== "low") {
      patterns.push({
        id: "capacity_pressure",
        severity,
        statement:
          severity === "high"
            ? "Work is landing into the calendar while timing is stretched, which can create schedule pressure and re-planning loops."
            : "Calendar load is meaningful, and small delays can compound into schedule pressure.",
        evidence: [
          `Scheduled items in window: ${jobsInWindow}`,
          `Approved quotes in window: ${approvals}`,
          ...(typeof p50 === "number" ? [`Approved → scheduled (p50): ~${p50.toFixed(1)} days`] : []),
        ],
      });
    }
  }

  // billing_gap (capacity + billing)
  {
    const jobsCount = jobs.length;
    const ratio = jobsCount > 0 ? invoicesCount / jobsCount : 1;
    const p50 = timing.scheduled_to_invoiced_p50_days;
    const slow = typeof p50 === "number" ? p50 > 10 : false;
    const lowInvoiceCoverage = jobsCount >= 10 && ratio < 0.5;
    const severity = slow || lowInvoiceCoverage ? (slow && lowInvoiceCoverage ? "high" : "medium") : "low";
    if (severity !== "low") {
      patterns.push({
        id: "billing_gap",
        severity,
        statement:
          severity === "high"
            ? "Work is being scheduled, but invoicing is trailing behind, which keeps pressure stuck in the system."
            : "Invoicing looks slightly behind the schedule, which can create avoidable catch-up pressure.",
        evidence: [
          `Scheduled items (total): ${jobsCount}`,
          `Invoices in window: ${invoicesCount}`,
          ...(typeof p50 === "number" ? [`Scheduled → invoiced (p50): ~${p50.toFixed(1)} days`] : []),
        ],
      });
    }
  }

  // collections_drag (billing + cash)
  {
    const p50 = timing.invoiced_to_paid_p50_days;
    if (typeof p50 === "number") {
      const severity = p50 > 45 ? "high" : p50 > 21 ? "medium" : "low";
      if (severity !== "low") {
        patterns.push({
          id: "collections_drag",
          severity,
          statement:
            severity === "high"
              ? "Payments are arriving late enough that collections becomes a steady background load."
              : "Cash timing is stretched, which can quietly add pressure between jobs.",
          evidence: [`Invoiced → paid (p50): ~${p50.toFixed(1)} days`],
        });
      }
    }
  }

  // concentration_risk (billing)
  {
    const totals = invoices.map((i) => i.total ?? 0);
    const conc = computeConcentration(totals);
    const severity = conc.top10 > 0.55 || conc.top25 > 0.75 ? "high" : conc.top10 > 0.45 || conc.top25 > 0.65 ? "medium" : "low";
    if (severity !== "low" && totals.filter((n) => n > 0).length >= 10) {
      patterns.push({
        id: "concentration_risk",
        severity,
        statement:
          severity === "high"
            ? "A small number of invoices carry a lot of the total, which can make the business feel fragile when one job moves."
            : "A few larger invoices are carrying noticeable weight, which can amplify pressure when timing shifts.",
        evidence: [`Top 10% share: ~${conc.top10.toFixed(2)}`, `Top 25% share: ~${conc.top25.toFixed(2)}`],
      });
    }
  }

  // Default: if nothing surfaced but volatility is high, add a gentle anchor
  if (patterns.length === 0 && volatilityBand) {
    const severity = inferBandSeverity(volatilityBand as VolatilityBand, "bad_when_high");
    if (severity !== "low") {
      patterns.push({
        id: "capacity_pressure",
        severity,
        statement:
          severity === "high"
            ? "Daily rhythm swings are sharp enough that planning can feel reactive."
            : "Daily rhythm is a bit uneven, which can add background pressure to planning.",
        evidence: [`Volatility band: ${volatilityBand}`],
      });
    }
  }

  // Sort patterns by severity (high → medium → low), limit to 5
  const severityRank = { high: 3, medium: 2, low: 1 } as const;
  const pressure_patterns = patterns
    .sort((a, b) => severityRank[b.severity] - severityRank[a.severity])
    .slice(0, 5);

  let recommended_focus: LayerFusionResult["recommended_focus"] = "pricing";
  const top = pressure_patterns[0];

  if (args.diagnose_mode) {
    recommended_focus = "data_fix";
  } else if (!top) {
    recommended_focus = linkage_weak ? "data_fix" : "follow_up";
  } else if (top.id === "followup_drift") {
    recommended_focus = "follow_up";
  } else if (top.id === "capacity_pressure") {
    recommended_focus = "scheduling";
  } else if (top.id === "billing_gap") {
    recommended_focus = "invoicing";
  } else if (top.id === "collections_drag") {
    recommended_focus = "collections";
  } else if (top.id === "concentration_risk") {
    recommended_focus = "pricing";
  } else {
    recommended_focus = "data_fix";
  }

  if (args.diagnose_mode) {
    warnings.unshift("Diagnose mode: conclusions are suppressed until inputs are grounded.");
  }

  return {
    computed_at: now,
    lookback_days,
    coverage,
    linkage: {
      linkage_weak,
      quote_to_invoice_match_rate,
      quote_to_job_match_rate,
      job_to_invoice_match_rate: undefined,
    },
    timing,
    pressure_patterns,
    recommended_focus,
    warnings,
    summary: {
      quotes_recognized: quotes.length,
      invoices_recognized: invoices.length,
      calendar_recognized: jobs.length,
    },
  };
}

