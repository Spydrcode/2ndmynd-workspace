import fs from "node:fs";
import path from "node:path";

type TargetOutput = {
  conclusion_version: "conclusion_v1";
  pattern_id: string | null;
  one_sentence_pattern: string;
  decision: string;
  boundary: string;
  why_this_now: string;
  confidence: "low" | "medium" | "high";
  forbidden_language_check?: { passed: boolean; notes: string };
};

type ReviewEntry = {
  id: string;
  input_snapshot: any;
  target_output?: TargetOutput;
};

type Args = {
  input: string;
  output: string;
  dryRun: boolean;
};

const DEFAULTS: Args = {
  input: "./ml_review/drafts.json",
  output: "./ml_review/drafts.json",
  dryRun: false,
};

const FORBIDDEN = [
  "dashboard",
  "kpi",
  "analytics",
  "monitor",
  "monitoring",
  "bi",
  "performance tracking",
  "reporting",
];

function parseArgs(argv: string[]): Args {
  const args = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith("--")) continue;

    switch (key) {
      case "--in":
        if (value) args.input = value;
        break;
      case "--out":
        if (value) args.output = value;
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      default:
        break;
    }
  }
  return args;
}

function hasForbidden(text: string): string | null {
  const lower = text.toLowerCase();
  for (const term of FORBIDDEN) {
    if (lower.includes(term)) return term;
  }
  return null;
}

function isEmpty(value: string | null | undefined) {
  return !value || value.trim() === "";
}

function fillFromRules(entry: ReviewEntry): TargetOutput {
  const target = {
    conclusion_version: "conclusion_v1",
    pattern_id: null,
    one_sentence_pattern: "",
    decision: "",
    boundary: "",
    why_this_now: "",
    confidence: "low",
    ...(entry.target_output ?? {}),
  } as TargetOutput;

  const quotes = entry.input_snapshot?.signals?.quotes ?? {};
  const invoices = entry.input_snapshot?.signals?.invoices ?? {};
  const volatility = entry.input_snapshot?.signals?.volatility_band;

  const needsFill =
    isEmpty(target.decision) ||
    isEmpty(target.boundary) ||
    isEmpty(target.why_this_now);

  if (!needsFill) return target;

  const approvalBand = quotes.approval_rate_band;
  const decisionLagBand = quotes.decision_lag_band;
  const largeQuotes = Number(quotes?.quote_total_bands?.large ?? 0);
  const smallQuotes = Number(quotes?.quote_total_bands?.small ?? 0);
  const lag30Plus = invoices?.payment_lag_band?.["30_plus_days"];

  if (
    ["very_low", "low"].includes(approvalBand) &&
    ["high", "very_high"].includes(decisionLagBand)
  ) {
    return {
      ...target,
      pattern_id: target.pattern_id || "decision_drag_followup_load",
      one_sentence_pattern:
        target.one_sentence_pattern ||
        "A lot of your time is getting spent chasing answers after quotes go out.",
      decision:
        target.decision ||
        "Decide that quotes won’t stay open-ended after they’ve been sent.",
      boundary:
        target.boundary ||
        "Every quote includes a simple decision window (e.g., 7 days) and one scheduled follow-up; after that, it closes unless they reopen it intentionally.",
      why_this_now:
        target.why_this_now ||
        "It reduces the lingering follow-up load that keeps you mentally tethered to unfinished work.",
      confidence: target.confidence || "medium",
    };
  }

  if (
    ["high", "very_high"].includes(volatility) &&
    largeQuotes >= 3
  ) {
    return {
      ...target,
      pattern_id: target.pattern_id || "late_scope_decision",
      one_sentence_pattern:
        target.one_sentence_pattern ||
        "The bigger jobs are creating pressure because the real definition is happening after the yes.",
      decision:
        target.decision ||
        "Decide to stop scheduling work while the scope is still moving.",
      boundary:
        target.boundary ||
        "If the job can’t be described in one scope sentence and one price anchor, it becomes a paid scoping step before any work is scheduled.",
      why_this_now:
        target.why_this_now ||
        "This prevents mid-job negotiation from spilling into the calendar and pulling you back into every decision.",
      confidence: target.confidence || "medium",
    };
  }

  if (["high", "very_high"].includes(lag30Plus)) {
    return {
      ...target,
      pattern_id: target.pattern_id || "slow_cash_after_done",
      one_sentence_pattern:
        target.one_sentence_pattern ||
        "Work is closing, but payment timing is stretching the weight of each job.",
      decision:
        target.decision ||
        "Decide that completion isn’t the finish line—collection is.",
      boundary:
        target.boundary ||
        "Invoices are sent immediately at completion, with a predefined, non-personal follow-up cadence once they pass the expected window.",
      why_this_now:
        target.why_this_now ||
        "It reduces the low-grade stress of carrying finished work longer than it should stay open.",
      confidence: target.confidence || "low",
    };
  }

  if (
    smallQuotes >= 10 &&
    ["medium", "high", "very_high"].includes(volatility)
  ) {
    return {
      ...target,
      pattern_id: target.pattern_id || "too_many_small_commitments",
      one_sentence_pattern:
        target.one_sentence_pattern ||
        "The calendar is getting filled by smaller commitments that fragment the week.",
      decision:
        target.decision ||
        "Decide that the schedule won’t be built one small yes at a time.",
      boundary:
        target.boundary ||
        "Set a weekly cap for small work blocks and reserve fixed slots for higher-clarity work; anything else rolls to the next window.",
      why_this_now:
        target.why_this_now ||
        "It reduces context switching and keeps the week from being shaped by interruptions.",
      confidence: target.confidence || "low",
    };
  }

  return {
    ...target,
    pattern_id: target.pattern_id || "calendar_is_choosing_work",
    one_sentence_pattern:
      target.one_sentence_pattern ||
      "Availability is quietly choosing the work, which keeps you carrying too many decisions.",
    decision:
      target.decision ||
      "Decide to protect the week from last-minute reshaping.",
    boundary:
      target.boundary ||
      "Only schedule work into predefined windows; anything outside that window becomes a deliberate exception, not the default.",
    why_this_now:
      target.why_this_now ||
      "It gives you a simple boundary that lowers decision pressure without needing more tools.",
    confidence: target.confidence || "low",
  };
}

function validateTarget(target: TargetOutput): string[] {
  const errors: string[] = [];
  if (isEmpty(target.decision)) errors.push("decision is required");
  if (isEmpty(target.boundary)) errors.push("boundary is required");
  if (isEmpty(target.why_this_now)) errors.push("why_this_now is required");

  const haystack = `${target.decision} ${target.boundary} ${target.why_this_now}`;
  const forbidden = hasForbidden(haystack);
  if (forbidden) errors.push(`forbidden term: ${forbidden}`);

  return errors;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const inputPath = path.resolve(args.input);
  if (!fs.existsSync(inputPath)) {
    console.error(`Missing file: ${inputPath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(inputPath, "utf8");
  const entries = JSON.parse(raw) as ReviewEntry[];

  if (!Array.isArray(entries)) {
    console.error("Invalid JSON format: expected an array.");
    process.exit(1);
  }

  let filled = 0;
  const invalid: string[] = [];

  const nextEntries = entries.map((entry) => {
    const before = {
      conclusion_version: "conclusion_v1",
      pattern_id: null,
      one_sentence_pattern: "",
      decision: "",
      boundary: "",
      why_this_now: "",
      confidence: "low",
      ...(entry.target_output ?? {}),
    } as TargetOutput;

    const filledTarget = fillFromRules({ ...entry, target_output: before });

    if (
      isEmpty(before.decision) ||
      isEmpty(before.boundary) ||
      isEmpty(before.why_this_now)
    ) {
      filled += 1;
    }

    const errors = validateTarget(filledTarget);
    if (errors.length > 0) {
      invalid.push(`${entry.id}: ${errors.join(", ")}`);
    }

    return { ...entry, target_output: filledTarget };
  });

  if (invalid.length > 0) {
    console.error(invalid.join("\n"));
    process.exit(1);
  }

  if (!args.dryRun) {
    const outputPath = path.resolve(args.output);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(nextEntries, null, 2));
  }

  console.log(`filled ${filled} entries`);
  console.log(path.resolve(args.output));
}

main().catch((error) => {
  console.error("Unexpected failure.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
