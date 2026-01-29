import fs from "node:fs";
import path from "node:path";

import { inferDecisionV2 } from "../../lib/decision/v2/decision_infer_v2";
import { SnapshotV2 } from "../../lib/decision/v2/conclusion_schema_v2";

type Args = { input?: string; model?: string };

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith("--") || value === undefined) continue;
    switch (key) {
      case "--in":
        args.input = value;
        break;
      case "--model":
        args.model = value;
        break;
      default:
        break;
    }
  }
  return args;
}

function decisionStartsWithVerb(decision: string) {
  const first = decision.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  const verbs = [
    "assign",
    "review",
    "call",
    "triage",
    "standardize",
    "freeze",
    "update",
    "tighten",
    "set",
    "prioritize",
    "simplify",
    "require",
    "audit",
    "reduce",
    "pause",
    "focus",
    "schedule",
    "order",
    "follow",
    "text",
    "email",
    "price",
    "compare",
  ];
  return verbs.includes(first);
}

function decisionTimeBoxed(decision: string) {
  const text = decision.toLowerCase();
  return (
    text.includes("within") ||
    text.includes("for the next") ||
    text.includes("today") ||
    text.includes("by end of day") ||
    text.includes("this week") ||
    text.includes("next") ||
    /\b\d+\s*(minutes?|hours?|days?|weeks?)\b/.test(text)
  );
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = path.resolve(args.input ?? "ml_artifacts/patch_queue.jsonl");
  if (!fs.existsSync(inputPath)) {
    console.error(`Missing patch_queue: ${inputPath}`);
    process.exit(1);
  }

  const lines = fs.readFileSync(inputPath, "utf8").split(/\r?\n/).filter(Boolean);
  const candidates = lines
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .filter((item: any) => {
      const checks = Array.isArray(item.checks_failed) ? item.checks_failed : [];
      const allowed = ["decision_verb", "decision_timebox"];
      const onlyDecision = checks.every((c: string) => allowed.includes(c));
      return onlyDecision;
    })
    .slice(0, 2);

  if (candidates.length === 0) {
    console.log("No patch_queue examples with only decision_verb/timebox failures.");
    return;
  }

  (async () => {
    for (const [idx, record] of candidates.entries()) {
      const snapshot = record.snapshot as SnapshotV2;
      const base = await inferDecisionV2(snapshot, {
        model: args.model,
        micro_rewrite_decision: false,
        patch_queue_path: "",
      });
      const rewritten = await inferDecisionV2(snapshot, {
        model: args.model,
        micro_rewrite_decision: true,
        patch_queue_path: "",
      });

      const beforeDecision = base.conclusion.decision;
      const afterDecision = rewritten.conclusion.decision;

      console.log(`Example ${idx + 1}`);
      console.log("before:", beforeDecision);
      console.log("after: ", afterDecision);
      console.log("before verb:", decisionStartsWithVerb(beforeDecision));
      console.log("before timebox:", decisionTimeBoxed(beforeDecision));
      console.log("after verb:", decisionStartsWithVerb(afterDecision));
      console.log("after timebox:", decisionTimeBoxed(afterDecision));
      console.log("---");
    }
  })().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

main();
