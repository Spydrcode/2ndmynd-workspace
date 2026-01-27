import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import {
  SnapshotV2,
  ConclusionV2,
  VolatilityBand,
  SeasonPhase,
  SeasonStrength,
  SeasonPredictability,
} from "./lib/conclusion_schema_v2";
import { PRIMARY_SYSTEM_PROMPT_V2 } from "./lib/decision_layer_v2";

type Args = {
  outTrain: string;
  outValid: string;
  seed: number;
  trainCount: number;
  validCount: number;
};

const DEFAULTS: Args = {
  outTrain: "ml_artifacts/train_decision_v2.jsonl",
  outValid: "ml_artifacts/valid_decision_v2.jsonl",
  seed: 42,
  trainCount: 200,
  validCount: 30,
};

function parseArgs(argv: string[]): Args {
  const args = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith("--") || value === undefined) continue;
    switch (key) {
      case "--out_train":
        args.outTrain = value;
        break;
      case "--out_valid":
        args.outValid = value;
        break;
      case "--seed":
        args.seed = Number(value);
        break;
      case "--train":
        args.trainCount = Number(value);
        break;
      case "--valid":
        args.validCount = Number(value);
        break;
      default:
        break;
    }
  }
  return args;
}

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rng: () => number, min: number, max: number) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function pick<T>(rng: () => number, items: T[]) {
  return items[Math.floor(rng() * items.length)];
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function bandByValue(value: number, thresholds: [number, number, number, number]): VolatilityBand {
  if (value <= thresholds[0]) return "very_low";
  if (value <= thresholds[1]) return "low";
  if (value <= thresholds[2]) return "medium";
  if (value <= thresholds[3]) return "high";
  return "very_high";
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const entries = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`);
  return `{${entries.join(",")}}`;
}

function sha256(text: string) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function literalToString(v: unknown): string {
  if (v === null) return "null";
  if (typeof v === "string") return v;
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  return JSON.stringify(v);
}

function collectLeafPaths(snapshot: SnapshotV2) {
  const items: { path: string; value: unknown }[] = [];
  const walk = (node: any, prefix: string) => {
    if (node === null || node === undefined) return;
    if (typeof node !== "object") {
      items.push({ path: prefix, value: node });
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((child, idx) => walk(child, `${prefix}.${idx}`));
      return;
    }
    for (const key of Object.keys(node)) {
      walk(node[key], `${prefix}.${key}`);
    }
  };
  walk(snapshot, "signals");
  return items.filter((item) => item.value === null || typeof item.value !== "object");
}

function buildEvidence(snapshot: SnapshotV2, preferred: string[], count: number, rng: () => number) {
  const leaf = collectLeafPaths(snapshot);
  const byPath = new Map(leaf.map((item) => [item.path, item.value]));
  const evidence: string[] = [];

  for (const path of preferred) {
    const value = byPath.get(path);
    if (value !== undefined) evidence.push(`${path}=${literalToString(value)}`);
  }

  if (evidence.length < count) {
    const remaining = leaf.filter((item) => !evidence.some((e) => e.startsWith(`${item.path}=`)));
    while (evidence.length < count && remaining.length > 0) {
      const item = remaining.splice(randInt(rng, 0, remaining.length - 1), 1)[0];
      evidence.push(`${item.path}=${literalToString(item.value)}`);
    }
  }

  return evidence.slice(0, count);
}

function seasonFromFactor(
  factor: number,
  delta: number,
  noise: number
): { phase: SeasonPhase; strength: SeasonStrength; predictability: SeasonPredictability } {
  let phase: SeasonPhase = "Active";
  if (factor >= 1.15) phase = "Peak";
  else if (factor <= 0.9) phase = "Lower";
  else if (delta >= 0.02) phase = "Rising";

  const strength: SeasonStrength = factor >= 1.18 || factor <= 0.85 ? "strong" : factor >= 1.08 || factor <= 0.92 ? "moderate" : "weak";
  const predictability: SeasonPredictability = noise < 0.08 ? "high" : noise < 0.18 ? "medium" : "low";

  return { phase, strength, predictability };
}

function buildSeasonContext(season: SnapshotV2["season"]) {
  return `Season phase is ${season.phase} with ${season.strength} strength and ${season.predictability} predictability.`;
}

function createSnapshot(
  rng: () => number,
  monthIndex: number,
  baseQuotes: number,
  approvalRate: number,
  payRate: number,
  amp: number,
  phaseOffset: number,
  historyQuotes: number[],
  inputCostProfile: { name: string; unit: string; base: number; drift: number }[],
  hardCase: string | null
): SnapshotV2 {
  const angle = ((monthIndex + phaseOffset) / 12) * Math.PI * 2;
  const seasonFactor = 1 + amp * Math.sin(angle);
  const noise = (rng() - 0.5) * 0.3;
  const adjusted = Math.max(0, baseQuotes * seasonFactor * (1 + noise));
  let quotesCount = Math.round(adjusted);
  let invoicesCount = Math.round(quotesCount * clamp(approvalRate + (rng() - 0.5) * 0.1, 0.2, 0.95));

  if (hardCase === "no_activity") {
    quotesCount = 0;
    invoicesCount = 0;
  }

  const quotesApproved = Math.round(quotesCount * clamp(approvalRate + (rng() - 0.5) * 0.08, 0.1, 0.98));
  const invoicesPaid = Math.round(invoicesCount * clamp(payRate + (rng() - 0.5) * 0.08, 0.2, 0.98));

  const approvalBand = bandByValue(quotesCount ? quotesApproved / quotesCount : 0, [0.1, 0.3, 0.6, 0.85]);
  const decisionLagDays = clamp(1 + Math.abs(noise) * 15 + randInt(rng, 0, 5), 0, 30);
  const decisionLagBand = bandByValue(decisionLagDays, [1, 3, 7, 14]);

  const quoteSmall = Math.round(quotesCount * (0.3 + (rng() - 0.5) * 0.2));
  const quoteMedium = Math.round(quotesCount * (0.35 + (rng() - 0.5) * 0.2));
  const quoteLarge = Math.max(0, quotesCount - quoteSmall - quoteMedium);

  const invoiceSmall = Math.round(invoicesCount * (0.3 + (rng() - 0.5) * 0.2));
  const invoiceMedium = Math.round(invoicesCount * (0.35 + (rng() - 0.5) * 0.2));
  const invoiceLarge = Math.max(0, invoicesCount - invoiceSmall - invoiceMedium);

  const paymentBands = {
    very_low: Math.round(invoicesCount * clamp(payRate, 0.2, 0.95)),
    low: 0,
    medium: 0,
    high: 0,
    very_high: 0,
  };
  const remaining = Math.max(0, invoicesCount - paymentBands.very_low);
  paymentBands.low = Math.round(remaining * 0.4);
  paymentBands.medium = Math.round(remaining * 0.3);
  paymentBands.high = Math.round(remaining * 0.2);
  paymentBands.very_high = Math.max(0, remaining - paymentBands.low - paymentBands.medium - paymentBands.high);

  const recent = historyQuotes.slice(-3).concat(quotesCount);
  const mean = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : 0;
  const variance =
    recent.length > 1 ? recent.reduce((acc, x) => acc + Math.pow(x - mean, 2), 0) / (recent.length - 1) : 0;
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;
  let volatilityBand = bandByValue(cv, [0.1, 0.25, 0.5, 0.9]);

  if (hardCase === "contradictory") {
    volatilityBand = "very_high";
  }

  if (hardCase === "peak_overdue") {
    paymentBands.high = Math.round(invoicesCount * 0.2);
    paymentBands.very_high = Math.round(invoicesCount * 0.15);
    paymentBands.very_low = Math.max(0, invoicesCount - paymentBands.high - paymentBands.very_high);
    volatilityBand = "high";
  }

  const season = seasonFromFactor(seasonFactor, Math.cos(angle) * amp, Math.abs(noise));

  const inputCosts = inputCostProfile
    .filter(() => rng() < 0.6)
    .slice(0, 3)
    .map((cost) => {
      const drift = cost.drift + (rng() - 0.5) * 0.05;
      const current = cost.base * (1 + drift * (monthIndex / 12));
      let change30 = drift * 100 * (0.3 + rng() * 0.5);
      let change90 = drift * 100 * (0.6 + rng() * 0.6);

      if (hardCase === "input_cost_spike") {
        change30 = 18 + rng() * 12;
        change90 = 22 + rng() * 18;
      }

      return {
        name: cost.name,
        unit: cost.unit,
        current: Number(current.toFixed(2)),
        change_30d_pct: Number(change30.toFixed(1)),
        change_90d_pct: Number(change90.toFixed(1)),
        volatility_band: bandByValue(Math.abs(change30) / 10, [0.5, 1, 1.5, 2.5]),
      };
    });

  const reportDate = new Date(2026, monthIndex % 12, 15);
  const sliceEnd = new Date(reportDate);
  const sliceStart = new Date(reportDate);
  sliceStart.setDate(sliceStart.getDate() - 90);

  return {
    snapshot_version: "snapshot_v2",
    pii_scrubbed: true,
    window: {
      slice_start: sliceStart.toISOString().slice(0, 10),
      slice_end: sliceEnd.toISOString().slice(0, 10),
      report_date: reportDate.toISOString().slice(0, 10),
      lookback_days: 90,
      sample_confidence: quotesCount + invoicesCount >= 50 ? "high" : quotesCount + invoicesCount >= 20 ? "medium" : "low",
    },
    activity_signals: {
      quotes: {
        quotes_count: quotesCount,
        quotes_approved_count: quotesApproved,
        approval_rate_band: approvalBand,
        decision_lag_band: decisionLagBand,
        quote_total_bands: { small: quoteSmall, medium: quoteMedium, large: quoteLarge },
      },
      invoices: {
        invoices_count: invoicesCount,
        invoices_paid_count: invoicesPaid,
        invoice_total_bands: { small: invoiceSmall, medium: invoiceMedium, large: invoiceLarge },
        payment_lag_band_distribution: paymentBands,
      },
    },
    volatility_band: volatilityBand,
    season,
    input_costs: inputCosts,
  };
}

function buildConclusion(snapshot: SnapshotV2, rng: () => number): ConclusionV2 {
  const quotes = snapshot.activity_signals.quotes;
  const invoices = snapshot.activity_signals.invoices;
  const volatility = snapshot.volatility_band;
  const season = snapshot.season;

  let oneSentence = "Activity is stable with balanced quote and invoice flow.";
  let decision = "Review the last five quotes and remove one step that slows approvals.";
  let why = "Approval and payment signals are steady; a small process cleanup can keep momentum.";
  let boundary = "If signals.activity_signals.quotes.quotes_count stays below 5 for 14 days, simplify quoting into a standard package.";
  let confidence: ConclusionV2["confidence"] = snapshot.window.sample_confidence;
  let optionalSteps: string[] = [];

  const approvalRate = quotes.quotes_count ? quotes.quotes_approved_count / quotes.quotes_count : 0;
  const paymentSlow =
    invoices.payment_lag_band_distribution.high + invoices.payment_lag_band_distribution.very_high;

  if (quotes.quotes_count === 0 && invoices.invoices_count === 0) {
    oneSentence = "No recent quotes or invoices; activity is near zero.";
    decision = "Call three recent customers and ask what stopped them from moving forward.";
    why = "With no activity, the next move is to surface the blocking point before making changes.";
    boundary = "If signals.activity_signals.quotes.quotes_count stays at 0 for 14 days, pause custom work and re-open only standard offers.";
    confidence = "low";
    optionalSteps = ["verify lead intake", "refresh contact list"];
  } else if (volatility === "very_high" && approvalRate >= 0.8) {
    oneSentence =
      "You’re closing most quotes fast and getting paid fast, but activity is swinging a lot.";
    decision =
      "For the next two weeks, assign one person to triage older quotes and use three standard price packages to reduce variability.";
    why =
      "Approval and payment are strong while volatility is very high, so stabilize inputs without slowing momentum.";
    boundary =
      "If signals.volatility_band stays very_high for the next 14 days, standardize quoting into 2-3 packages with a price floor until volatility drops to high or below.";
    optionalSteps = ["tag quotes by size", "note the one variable that changed"];
  } else if (paymentSlow > 3 && season.phase === "Peak") {
    oneSentence =
      "Peak season demand is strong, but payment lags are rising and cash pressure is building.";
    decision =
      "Tighten payment terms on new work this week and require deposits on large jobs.";
    why =
      "High activity plus rising payment lag is a short-term cash pressure pattern that needs a near-term guardrail.";
    boundary =
      "If signals.activity_signals.invoices.payment_lag_band_distribution.high + signals.activity_signals.invoices.payment_lag_band_distribution.very_high stays above 3 for 14 days, require deposits on all large jobs.";
    optionalSteps = ["sort jobs by balance", "send two payment reminders"];
  } else if (snapshot.input_costs.some((cost) => cost.change_30d_pct >= 15)) {
    oneSentence =
      "Input costs have jumped while demand is steady, creating near-term margin pressure.";
    decision =
      "Update price floors on any new quotes today to cover the latest cost shift.";
    why =
      "Cost spikes without demand drops are a margin risk; a quick price floor adjustment is the safest stabilizer.";
    boundary =
      "If signals.input_costs.0.change_30d_pct stays above 15 for 14 days, update package pricing and review material substitutions.";
    optionalSteps = ["confirm supplier pricing", "flag cost-sensitive jobs"];
  } else if (season.phase === "Lower") {
    oneSentence =
      "Season phase is lower and activity is softer; focus on a clear, low-friction offer.";
    decision =
      "Set one simple package offer for the next two weeks and respond to every new quote within 24 hours.";
    why =
      "Lower season calls for a simple, fast offer to reduce friction and keep demand moving.";
    boundary =
      "If signals.activity_signals.quotes.quotes_count stays below 10 for 14 days, keep quoting to one package until volume improves.";
    optionalSteps = ["tighten scope wording", "follow up on stale quotes"];
  }

  const evidence = buildEvidence(
    snapshot,
    [
      "signals.activity_signals.quotes.quotes_count",
      "signals.activity_signals.quotes.quotes_approved_count",
      "signals.activity_signals.quotes.approval_rate_band",
      "signals.activity_signals.invoices.invoices_count",
      "signals.activity_signals.invoices.invoices_paid_count",
      "signals.activity_signals.invoices.payment_lag_band_distribution.very_high",
      "signals.volatility_band",
      "signals.season.phase",
    ],
    3 + randInt(rng, 0, 2),
    rng
  );

  return {
    conclusion_version: "conclusion_v2",
    pattern_id: `pattern_${sha256(stableStringify(snapshot)).slice(0, 12)}`,
    one_sentence_pattern: oneSentence,
    decision,
    why_this_now: why,
    boundary,
    confidence,
    evidence_signals: evidence,
    season_context: buildSeasonContext(season),
    optional_next_steps: optionalSteps.length ? optionalSteps.slice(0, 3) : [],
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rng = mulberry32(args.seed);

  const companies = 5;
  const months = 12;
  const variantsPerMonth = 4;
  const snapshots: SnapshotV2[] = [];
  const conclusions: ConclusionV2[] = [];

  const hardCases = ["no_activity", "contradictory", "input_cost_spike", "peak_overdue"];

  for (let c = 0; c < companies; c += 1) {
    const baseQuotes = randInt(rng, 12, 60);
    const approvalRate = clamp(0.4 + rng() * 0.5, 0.2, 0.95);
    const payRate = clamp(0.5 + rng() * 0.4, 0.2, 0.98);
    const amp = clamp(0.15 + rng() * 0.25, 0.05, 0.4);
    const phaseOffset = randInt(rng, 0, 11);
    const historyQuotes: number[] = [];

    const inputCostProfile = [
      { name: "fuel", unit: "index", base: 100, drift: 0.04 + rng() * 0.06 },
      { name: "primary_material", unit: "index", base: 120, drift: 0.03 + rng() * 0.05 },
      { name: "shipping", unit: "index", base: 90, drift: 0.02 + rng() * 0.05 },
      { name: "consumables", unit: "index", base: 80, drift: 0.01 + rng() * 0.04 },
    ];

    for (let m = 0; m < months; m += 1) {
      for (let v = 0; v < variantsPerMonth; v += 1) {
        const hardCase = rng() < 0.08 ? pick(rng, hardCases) : null;
        const snapshot = createSnapshot(
          rng,
          m + v,
          baseQuotes,
          approvalRate,
          payRate,
          amp,
          phaseOffset,
          historyQuotes,
          inputCostProfile,
          hardCase
        );
        historyQuotes.push(snapshot.activity_signals.quotes.quotes_count);
        snapshots.push(snapshot);
        conclusions.push(buildConclusion(snapshot, rng));
      }
    }
  }

  const total = snapshots.length;
  const trainCount = Math.min(args.trainCount, total);
  const validCount = Math.min(args.validCount, total - trainCount);

  const indices = Array.from({ length: total }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i -= 1) {
    const j = randInt(rng, 0, i);
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  const trainIdx = indices.slice(0, trainCount);
  const validIdx = indices.slice(trainCount, trainCount + validCount);

  const toJsonl = (idxs: number[]) =>
    idxs
      .map((idx) =>
        JSON.stringify({
          messages: [
            { role: "system", content: PRIMARY_SYSTEM_PROMPT_V2 },
            { role: "user", content: JSON.stringify(snapshots[idx]) },
            { role: "assistant", content: JSON.stringify(conclusions[idx]) },
          ],
        })
      )
      .join("\n");

  fs.mkdirSync(path.dirname(args.outTrain), { recursive: true });
  fs.writeFileSync(args.outTrain, `${toJsonl(trainIdx)}\n`);
  fs.writeFileSync(args.outValid, `${toJsonl(validIdx)}\n`);

  console.log(`Wrote ${trainIdx.length} training examples to ${args.outTrain}`);
  console.log(`Wrote ${validIdx.length} validation examples to ${args.outValid}`);
}

main().catch((error) => {
  console.error("Unexpected failure.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
