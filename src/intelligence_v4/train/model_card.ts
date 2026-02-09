import fs from "node:fs";
import path from "node:path";

import type { StageName } from "../pipeline/contracts";

type DatasetRow = {
  created_at?: string;
  industry?: string;
  approved?: boolean;
};

export type ModelCardStatus = "candidate" | "pinned" | "deprecated";

export type BuildModelCardInput = {
  stage: StageName;
  model_id: string;
  base_model: string;
  dataset_path: string;
  run_manifest_path?: string;
  notes?: string;
  promotion_status?: ModelCardStatus;
  promotion_report_path?: string;
  eval_summary_path?: string;
  eval_passed?: boolean;
};

export type BuildModelCardResult = {
  file_path: string;
  markdown: string;
};

function sanitizeForPath(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]+/g, "_");
}

function readJsonFile<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

function loadDatasetRows(datasetPath: string): DatasetRow[] {
  if (!fs.existsSync(datasetPath)) return [];
  const lines = fs
    .readFileSync(datasetPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const rows: DatasetRow[] = [];
  for (const line of lines) {
    try {
      rows.push(JSON.parse(line) as DatasetRow);
    } catch {
      // Skip malformed JSONL rows.
    }
  }
  return rows;
}

function summarizeDataset(rows: DatasetRow[]) {
  const total_rows = rows.length;
  const approved_rows = rows.filter((row) => row.approved === true).length;

  const industries = new Map<string, number>();
  for (const row of rows) {
    const industry = typeof row.industry === "string" && row.industry.trim().length > 0 ? row.industry.trim() : "unknown";
    industries.set(industry, (industries.get(industry) ?? 0) + 1);
  }

  const created = rows
    .map((row) => row.created_at)
    .filter((value): value is string => typeof value === "string")
    .map((value) => new Date(value))
    .filter((value) => !Number.isNaN(value.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());

  const date_window =
    created.length > 0
      ? {
          start: created[0].toISOString(),
          end: created[created.length - 1].toISOString(),
        }
      : null;

  const industry_summary = [...industries.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([industry, count]) => `${industry}: ${count}`)
    .join(", ");

  return {
    total_rows,
    approved_rows,
    industry_summary: industry_summary || "none",
    date_window,
  };
}

function readTemplateOrDefault(): string {
  const templatePath = path.resolve(
    process.cwd(),
    "src",
    "intelligence_v4",
    "train",
    "promotion",
    "model_card.template.md"
  );

  if (fs.existsSync(templatePath)) {
    return fs.readFileSync(templatePath, "utf8");
  }

  return [
    "# Model Card",
    "",
    "## Stage",
    "",
    "## Purpose",
    "",
    "## Dataset Stats",
    "",
    "## Doctrine and Guardrails",
    "",
    "## Evals",
    "",
    "## Known Limitations",
    "",
    "## Promotion Status",
    "",
  ].join("\n");
}

function buildMarkdown(input: BuildModelCardInput): string {
  const datasetPath = path.resolve(input.dataset_path);
  const rows = summarizeDataset(loadDatasetRows(datasetPath));
  const manifest = input.run_manifest_path ? readJsonFile<Record<string, unknown>>(path.resolve(input.run_manifest_path)) : null;
  const status = input.promotion_status ?? "candidate";
  const evalLine = input.eval_summary_path
    ? `pass (${path.resolve(input.eval_summary_path)})`
    : input.eval_passed === false
      ? "fail"
      : input.eval_passed === true
        ? "pass"
        : "unknown";

  const template = readTemplateOrDefault();

  const body = [
    `# Model Card - ${input.model_id}`,
    "",
    "## Stage",
    `- Stage name: ${input.stage}`,
    `- Model ID: ${input.model_id}`,
    `- Base model: ${input.base_model}`,
    "",
    "## Purpose",
    `- Stage job: ${input.stage} artifact generation in the v4 sequential pipeline.`,
    "- Boundaries: JSON-only output, schema-first validation, doctrine-safe language, bucketed evidence refs only.",
    "",
    "## Schema Versions",
    `- Input schema: ${(manifest?.input_schema_version as string) ?? "see stage input contract"}`,
    `- Output schema: ${(manifest?.output_schema_version as string) ?? "see stage output contract"}`,
    "",
    "## Dataset Stats",
    `- Dataset path: ${datasetPath}`,
    `- Total rows: ${rows.total_rows}`,
    `- Approved rows: ${rows.approved_rows}`,
    `- Industries: ${rows.industry_summary}`,
    `- Date window: ${rows.date_window ? `${rows.date_window.start} to ${rows.date_window.end}` : "unknown"}`,
    "",
    "## Doctrine + Guardrails",
    "- Forbidden owner-facing terms are blocked (dashboard/KPI/analytics/monitoring/BI/scorecard/leaderboard).",
    "- Raw data exposure checks run before training generation.",
    "- additionalProperties:false contracts are enforced for input/output surfaces.",
    "",
    "## Evals",
    `- Status: ${evalLine}`,
    "",
    "## Known Limitations",
    "- Performance depends on dataset quality and stage-specific approvals.",
    "- Industry-specific behavior is limited by available approved examples.",
    "",
    "## Promotion Status",
    `- Status: ${status}`,
    `- Promotion report: ${input.promotion_report_path ?? "none"}`,
    `- Run manifest: ${input.run_manifest_path ? path.resolve(input.run_manifest_path) : "none"}`,
    `- Notes: ${input.notes?.trim() || ""}`,
    "",
  ].join("\n");

  return `${template.trim()}\n\n---\n\n${body}`;
}

export function writeModelCard(input: BuildModelCardInput): BuildModelCardResult {
  const markdown = buildMarkdown(input);
  const outDir = path.resolve(process.cwd(), "train", "model_cards", input.stage);
  fs.mkdirSync(outDir, { recursive: true });

  const filePath = path.join(outDir, `${sanitizeForPath(input.model_id)}.md`);
  fs.writeFileSync(filePath, markdown);

  return {
    file_path: filePath,
    markdown,
  };
}
