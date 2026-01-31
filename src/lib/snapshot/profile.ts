import { bucketDecisionLag, bucketMoney } from "./buckets";
import type { CompanyProfile, InvoiceRecord, QuoteRecord } from "./schema";
import { DECISION_LAG_BUCKETS, MONEY_BUCKETS } from "./schema";

function initDistribution<T extends string>(keys: readonly T[]) {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>;
}

function normalizeToProportions<T extends string>(keys: readonly T[], counts: Record<T, number>) {
  const total = keys.reduce((sum, key) => sum + (counts[key] ?? 0), 0);
  if (total <= 0) {
    return Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>;
  }
  return Object.fromEntries(keys.map((key) => [key, (counts[key] ?? 0) / total])) as Record<
    T,
    number
  >;
}

function safeSharesFromAmounts(amounts: number[]) {
  const cleaned = amounts.map((n) => Math.max(0, Math.abs(n))).filter((n) => n > 0);
  const n = cleaned.length;
  if (n === 0) {
    return { top_10_percent_jobs_share: 0, top_25_percent_jobs_share: 0 };
  }

  const sorted = [...cleaned].sort((a, b) => b - a);
  const total = sorted.reduce((sum, v) => sum + v, 0);
  if (total <= 0) {
    return { top_10_percent_jobs_share: 0, top_25_percent_jobs_share: 0 };
  }

  const top10Count = Math.ceil(n * 0.1);
  const top25Count = Math.ceil(n * 0.25);
  const sumTop = (count: number) => sorted.slice(0, count).reduce((sum, v) => sum + v, 0);

  return {
    top_10_percent_jobs_share: sumTop(top10Count) / total,
    top_25_percent_jobs_share: sumTop(top25Count) / total,
  };
}

export function computeCompanyProfile(params: {
  runId: string;
  quotes: QuoteRecord[];
  invoices: InvoiceRecord[];
}): CompanyProfile {
  const computedAt = new Date().toISOString();
  const notes: string[] = [];

  const moneyAmounts =
    params.invoices.length > 0
      ? params.invoices.map((invoice) => invoice.invoice_amount)
      : params.quotes.map((quote) => quote.quoted_amount);

  const moneyCounts = initDistribution(MONEY_BUCKETS);
  for (const amount of moneyAmounts) {
    const bucket = bucketMoney(Math.abs(amount));
    moneyCounts[bucket] += 1;
  }
  const jobValueDistribution = normalizeToProportions(MONEY_BUCKETS, moneyCounts);

  const decisionCounts = initDistribution(DECISION_LAG_BUCKETS);
  if (params.quotes.length === 0) {
    for (const key of DECISION_LAG_BUCKETS) decisionCounts[key] = 0;
  } else {
    for (const quote of params.quotes) {
      if (quote.status === "approved" && quote.approved_at) {
        const bucket = bucketDecisionLag(quote.created_at, quote.approved_at);
        decisionCounts[bucket] += 1;
      } else {
        decisionCounts.unknown += 1;
      }
    }
  }
  const decisionLagDistribution = normalizeToProportions(DECISION_LAG_BUCKETS, decisionCounts);

  const revenueConcentration = safeSharesFromAmounts(moneyAmounts);

  const quoteTotal = params.quotes.length;
  let quoteToInvoiceFlow = { approved: 0, stalled: 0, dropped: 0 };
  if (quoteTotal === 0) {
    notes.push("No quotes were provided, so quote flow and decision lag are limited.");
  } else {
    const approved = params.quotes.filter((q) => q.status === "approved").length;
    const dropped = params.quotes.filter((q) => q.status === "rejected").length;
    const stalled = quoteTotal - approved - dropped;
    quoteToInvoiceFlow = {
      approved: approved / quoteTotal,
      stalled: stalled / quoteTotal,
      dropped: dropped / quoteTotal,
    };
  }

  return {
    run_id: params.runId,
    computed_at: computedAt,
    sample_size: { quotes: params.quotes.length, invoices: params.invoices.length },
    job_value_distribution: jobValueDistribution,
    decision_lag_distribution: decisionLagDistribution,
    revenue_concentration: revenueConcentration,
    quote_to_invoice_flow: quoteToInvoiceFlow,
    notes: notes.length > 0 ? notes : undefined,
  };
}

