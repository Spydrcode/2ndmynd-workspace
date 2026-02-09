import { SeededRng } from "../rng";
import type {
  EstimateCsvRow,
  GeneratedSynthPack,
  InvoiceCsvRow,
  ScheduleCsvRow,
  SynthIndustry,
} from "../schemas";

export type IndustryProfile = {
  industry: SynthIndustry;
  business_name: string;
  emyth_role: "technician" | "manager" | "entrepreneur" | "mixed";
  notes: string[];
  expected_patterns: string[];
  estimate_count: [number, number];
  base_estimate_total: [number, number];
  approval_lag_days: [number, number];
  invoice_delay_days: [number, number];
  payment_delay_days: [number, number];
  overdue_rate: number;
  seasonality_peak_months: number[];
  concentration_strength: "low" | "medium" | "high";
  include_schedule: boolean;
  schedule_pressure: "low" | "medium" | "high";
};

type BuildProfilePackParams = {
  pack_id: string;
  seed: number;
  window_days: number;
  anchor_date: string;
  profile: IndustryProfile;
};

function toIsoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toIsoDateTime(date: Date): string {
  return date.toISOString().slice(0, 19) + "Z";
}

function shiftDays(base: Date, days: number): Date {
  const next = new Date(base);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function clampDate(value: Date, min: Date, max: Date): Date {
  if (value.getTime() < min.getTime()) return new Date(min);
  if (value.getTime() > max.getTime()) return new Date(max);
  return value;
}

function pickWeightedDay(rng: SeededRng, start: Date, end: Date, peakMonths: number[]): Date {
  const totalDays = Math.max(1, Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)));
  const samples = 6;
  let best = start;
  let bestScore = -1;

  for (let i = 0; i < samples; i += 1) {
    const offset = rng.int(0, totalDays);
    const candidate = shiftDays(start, offset);
    const month = candidate.getUTCMonth() + 1;
    const peakBoost = peakMonths.includes(month) ? 0.4 : 0;
    const score = rng.nextFloat() + peakBoost;
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
}

function concentrationMultiplier(index: number, total: number, strength: "low" | "medium" | "high"): number {
  const ratio = total <= 1 ? 1 : index / (total - 1);
  if (strength === "low") return 1 - ratio * 0.1;
  if (strength === "medium") return 1.2 - ratio * 0.35;
  return 1.5 - ratio * 0.7;
}

function toMoney(value: number): string {
  return value.toFixed(2);
}

function scheduleDensity(profile: IndustryProfile): number {
  if (!profile.include_schedule) return 0;
  if (profile.schedule_pressure === "high") return 0.9;
  if (profile.schedule_pressure === "medium") return 0.65;
  return 0.4;
}

export function buildPackFromProfile(params: BuildProfilePackParams): GeneratedSynthPack {
  const rng = new SeededRng(params.seed);
  const end = new Date(`${params.anchor_date}T00:00:00.000Z`);
  const start = shiftDays(end, -(Math.max(7, params.window_days) - 1));
  const estimateCount = rng.int(params.profile.estimate_count[0], params.profile.estimate_count[1]);

  const estimates: EstimateCsvRow[] = [];
  const invoices: InvoiceCsvRow[] = [];
  const schedule: ScheduleCsvRow[] = [];

  for (let i = 0; i < estimateCount; i += 1) {
    const estimateDate = pickWeightedDay(rng, start, end, params.profile.seasonality_peak_months);
    const lag = rng.int(params.profile.approval_lag_days[0], params.profile.approval_lag_days[1]);
    const approvedDate = clampDate(shiftDays(estimateDate, lag), estimateDate, end);

    const baseline = rng.int(params.profile.base_estimate_total[0], params.profile.base_estimate_total[1]);
    const concentration = concentrationMultiplier(i, estimateCount, params.profile.concentration_strength);
    const total = Math.max(75, baseline * concentration);

    const approvedChance = 0.58;
    const sentChance = 0.28;
    const status = rng.nextFloat() < approvedChance ? "approved" : rng.nextFloat() < sentChance ? "sent" : "rejected";

    const estimateId = `EST_${params.profile.industry.toUpperCase().slice(0, 4)}_${String(i + 1).padStart(4, "0")}`;

    estimates.push({
      EstimateID: estimateId,
      Status: status,
      CreatedAt: toIsoDateTime(estimateDate),
      ApprovedAt: status === "approved" ? toIsoDateTime(approvedDate) : "",
      Total: toMoney(total),
    });

    if (status !== "approved") continue;

    const invoiceDelay = rng.int(params.profile.invoice_delay_days[0], params.profile.invoice_delay_days[1]);
    const issuedAt = clampDate(shiftDays(approvedDate, invoiceDelay), approvedDate, end);

    const overdue = rng.chance(params.profile.overdue_rate);
    const isPaid = !overdue && rng.chance(0.82);
    const paymentDelay = rng.int(params.profile.payment_delay_days[0], params.profile.payment_delay_days[1]);
    const paidAt = isPaid ? clampDate(shiftDays(issuedAt, paymentDelay), issuedAt, end) : null;

    invoices.push({
      InvoiceID: `INV_${params.profile.industry.toUpperCase().slice(0, 4)}_${String(invoices.length + 1).padStart(4, "0")}`,
      QuoteID: estimateId,
      Status: isPaid ? "paid" : overdue ? "overdue" : "open",
      IssuedAt: toIsoDateTime(issuedAt),
      PaidAt: paidAt ? toIsoDateTime(paidAt) : "",
      Total: toMoney(total * (0.92 + rng.nextFloat() * 0.14)),
    });

    if (!params.profile.include_schedule || !rng.chance(scheduleDensity(params.profile))) {
      continue;
    }

    const startHour = rng.int(7, 16);
    const durationHours = rng.int(1, 4);
    const startDate = issuedAt;
    const endDate = shiftDays(startDate, rng.chance(0.12) ? 1 : 0);

    schedule.push({
      JobID: `JOB_${params.profile.industry.toUpperCase().slice(0, 4)}_${String(schedule.length + 1).padStart(4, "0")}`,
      QuoteID: estimateId,
      Status: rng.chance(0.76) ? "completed" : rng.chance(0.6) ? "scheduled" : "in_progress",
      StartDate: toIsoDay(startDate),
      StartTime: `${String(startHour).padStart(2, "0")}:00`,
      EndDate: toIsoDay(endDate),
      EndTime: `${String(Math.min(22, startHour + durationHours)).padStart(2, "0")}:00`,
      Total: toMoney(total),
    });
  }

  return {
    manifest: {
      pack_id: params.pack_id,
      industry: params.profile.industry,
      seed: params.seed,
      window_start: toIsoDay(start),
      window_end: toIsoDay(end),
      notes: params.profile.notes,
      expected_patterns: params.profile.expected_patterns,
      emyth_role: params.profile.emyth_role,
      business_name: params.profile.business_name,
    },
    csv: {
      estimates,
      invoices,
      schedule: schedule.length > 0 ? schedule : undefined,
    },
  };
}
