import fs from "fs";
import readline from "readline";

interface Message {
  role: string;
  content: string;
}

interface Parsed {
  messages: Message[];
}

interface Offender {
  line: number;
  term: string;
  field_path: string;
  before_excerpt: string;
}

const forbiddenTerms = [
  { term: "performance tracking", replacement: "ongoing measurement" },
  { term: "dashboard", replacement: "summary view" },
  { term: "kpi", replacement: "signal" },
  { term: "analytics", replacement: "patterns" },
  { term: "monitoring", replacement: "watching" },
  { term: "monitor", replacement: "watch" },
  { term: "bi", replacement: "business tools", wordBoundary: true },
  { term: "reporting", replacement: "summary" },
];

function getArg(flag: string, def?: string): string {
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1];
  return def ?? "";
}

const inFile = getArg("--in", "./ml_artifacts/train_v1.jsonl");
const outFile = getArg("--out", "./ml_artifacts/train_v1_clean.jsonl");
const reportFile = getArg("--report", "./ml_artifacts/train_v1_clean_report.md");
const failOnFind = process.argv.includes("--fail-on-find");

function* walk(obj: unknown, path: string[] = []): Generator<{ path: string[]; value: string }> {
  if (typeof obj === "string") {
    yield { path, value: obj };
  } else if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      yield* walk(obj[i], [...path, String(i)]);
    }
  } else if (typeof obj === "object" && obj !== null) {
    for (const k of Object.keys(obj)) {
      yield* walk((obj as Record<string, unknown>)[k], [...path, k]);
    }
  }
}

function scanForbidden(str: string): { term: string; match: string }[] {
  const found: { term: string; match: string }[] = [];
  for (const t of forbiddenTerms) {
    let re: RegExp;
    if (t.wordBoundary) {
      re = new RegExp(`\\b${t.term}\\b`, "i");
    } else {
      re = new RegExp(t.term, "i");
    }
    const m = str.match(re);
    if (m) found.push({ term: t.term, match: m[0] });
  }
  return found;
}

function applyReplacements(str: string): { result: string; replaced: { term: string; count: number }[] } {
  let result = str;
  const replaced: { term: string; count: number }[] = [];
  for (const t of forbiddenTerms) {
    let re: RegExp;
    if (t.wordBoundary) {
      re = new RegExp(`\\b${t.term}\\b`, "gi");
    } else {
      re = new RegExp(t.term, "gi");
    }
    let count = 0;
    result = result.replace(re, () => {
      count++;
      return t.replacement;
    });
    if (count > 0) replaced.push({ term: t.term, count });
  }
  return { result, replaced };
}

async function main() {
  const rl = readline.createInterface({
    input: fs.createReadStream(inFile),
    crlfDelay: Infinity,
  });
  const out: string[] = [];
  const offenders: Offender[] = [];
  let assistantJsonParseFailures = 0;
  let linesWithForbidden = 0;
  const replacementsApplied: Record<string, number> = {};
  let lineNum = 0;

  for await (const line of rl) {
    lineNum++;
    let parsed: Parsed;
    try {
      parsed = JSON.parse(line) as Parsed;
    } catch {
      out.push(line);
      continue;
    }
    const assistantMsg = parsed.messages.find(m => m.role === "assistant") ?? null;
    if (!assistantMsg || typeof assistantMsg.content !== "string") {
      out.push(line);
      continue;
    }
    let contentObj: unknown;
    try {
      contentObj = JSON.parse(assistantMsg.content as string);
    } catch {
      assistantJsonParseFailures++;
      offenders.push({
        line: lineNum,
        term: "JSON_PARSE_FAIL",
        field_path: "assistant.content",
        before_excerpt: (assistantMsg.content as string).slice(0, 120),
      });
      out.push(line);
      continue;
    }
    const foundTerms: string[] = [];
    const localOffenders: Offender[] = [];
    const localReplacements: Record<string, number> = {};
    // Scan and clean
    for (const { path: p, value } of walk(contentObj)) {
      const found = scanForbidden(value);
      if (found.length > 0) {
        foundTerms.push(...found.map(f => f.term));
        localOffenders.push({
          line: lineNum,
          term: found.map(f => f.term).join(", "),
          field_path: p.join("."),
          before_excerpt: value.slice(0, 120),
        });
        // Clean
        const { result, replaced } = applyReplacements(value);
        let ref: Record<string, unknown> = contentObj as Record<string, unknown>;
        for (let i = 0; i < p.length - 1; i++) {
          ref = ref[p[i]] as Record<string, unknown>;
        }
        ref[p[p.length - 1]] = result;
        for (const r of replaced) {
          localReplacements[r.term] = (localReplacements[r.term] || 0) + r.count;
        }
      }
    }
    // Re-scan to ensure clean
    for (const { value, path: p } of walk(contentObj)) {
      if (scanForbidden(value).length > 0) {
        localOffenders.push({
          line: lineNum,
          term: scanForbidden(value).map(f => f.term).join(", "),
          field_path: p.join("."),
          before_excerpt: value.slice(0, 120),
        });
      }
    }
    if (localOffenders.length > 0) {
      linesWithForbidden++;
      offenders.push(...localOffenders);
    }
    for (const k in localReplacements) {
      replacementsApplied[k] = (replacementsApplied[k] || 0) + localReplacements[k];
    }
    // Write cleaned line
    const newAssistantMsg: Message = { ...assistantMsg, content: JSON.stringify(contentObj) };
    const newMessages = parsed.messages.map(m =>
      m.role === "assistant" ? newAssistantMsg : m
    );
    out.push(JSON.stringify({ ...parsed, messages: newMessages }));
  }

  // Write outputs
  if (failOnFind && offenders.length > 0) {
    await fs.promises.writeFile(reportFile, makeReport(lineNum, assistantJsonParseFailures, linesWithForbidden, offenders, replacementsApplied));
    process.exit(1);
  }
  await fs.promises.writeFile(outFile, out.join("\n"));
  await fs.promises.writeFile(reportFile, makeReport(lineNum, assistantJsonParseFailures, linesWithForbidden, offenders, replacementsApplied));
  // If any forbidden terms remain after cleaning, exit non-zero
  if (offenders.some(o => o.term !== "JSON_PARSE_FAIL")) {
    process.exit(2);
  }
}

function makeReport(totalLines: number, parseFails: number, linesWithForbidden: number, offenders: Offender[], replacements: Record<string, number>): string {
  let md = `# JSONL Scan & Clean Report\n\n`;
  md += `**Total lines:** ${totalLines}\n\n`;
  md += `**Assistant JSON parse failures:** ${parseFails}\n\n`;
  md += `**Lines with forbidden terms:** ${linesWithForbidden}\n\n`;
  md += `## Offending Lines\n`;
  if (offenders.length === 0) {
    md += `None found.\n`;
  } else {
    md += `| Line | Term(s) | Field Path | Excerpt |\n|---|---|---|---|\n`;
    for (const o of offenders) {
      md += `| ${o.line} | ${o.term} | ${o.field_path} | ${o.before_excerpt.replace(/\|/g, " ").replace(/\n/g, " ")} |\n`;
    }
  }
  md += `\n## Replacements Applied\n`;
  for (const k of Object.keys(replacements)) {
    md += `- ${k}: ${replacements[k]}\n`;
  }
  return md;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
