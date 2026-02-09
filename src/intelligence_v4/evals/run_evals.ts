import fs from "node:fs";
import path from "node:path";

import type { DataPackV0 } from "@/src/lib/intelligence/data_pack_v0";
import { discoverSynthPackDirectories, loadSynthPackFromDirectory } from "@/src/intelligence_v4/synth_packs";

import { STAGE_ORDER, type StageName } from "../pipeline/contracts";
import { runPipelineV4 } from "../pipeline/run_pipeline_v4";
import { gradeDecisionArtifact } from "./graders/decision_grader";
import { gradeDoctrine } from "./graders/doctrine_grader";
import { gradeSchema } from "./graders/schema_grader";
import { gradeStageDrift } from "./graders/stage_drift_grader";

type EvalFixture = {
  fixture_id: string;
  input: {
    run_id: string;
    workspace_id: string;
    business_name?: string;
    industry?: string;
    emyth_role?: "technician" | "manager" | "entrepreneur" | "mixed";
    snapshot_window_mode?: "last_90_days" | "last_100_closed_estimates";
    pack: DataPackV0;
  };
};

export type EvalRunSummary = {
  generated_at: string;
  mode: "pipeline" | "stage";
  stage?: StageName;
  report_path?: string;
  totals: {
    fixtures: number;
    passed: number;
    failed: number;
  };
  results: Array<{
    fixture_id: string;
    passed: boolean;
    schema_passed: boolean;
    doctrine_passed: boolean;
    stage_drift_passed: boolean;
    decision_passed: boolean;
    errors: string[];
  }>;
};

function toFileStamp(value = new Date()): string {
  return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function parseArgs(argv: string[]): { mode: "pipeline" | "stage"; stage?: StageName; fixture?: string } {
  const modeFlag = argv.find((arg) => arg.startsWith("--mode="));
  const stageFlag = argv.find((arg) => arg.startsWith("--stage="));
  const fixtureFlag = argv.find((arg) => arg.startsWith("--fixture="));

  const mode = (modeFlag?.split("=")[1] ?? "pipeline") as "pipeline" | "stage";
  const stage = stageFlag?.split("=")[1] as StageName | undefined;
  const fixture = fixtureFlag?.split("=")[1];

  if (mode === "stage" && (!stage || !STAGE_ORDER.includes(stage))) {
    throw new Error("When --mode=stage, --stage must be one of quant_signals|emyth_owner_load|competitive_lens|blue_ocean|synthesis_decision");
  }

  return { mode, stage, fixture };
}

function loadJsonFixtures(): EvalFixture[] {
  const dir = path.resolve(process.cwd(), "src/intelligence_v4/evals/fixtures");
  if (!fs.existsSync(dir)) return [];
  const files = fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b));

  return files.map((file) => {
    const raw = fs.readFileSync(path.join(dir, file), "utf8");
    return JSON.parse(raw) as EvalFixture;
  });
}

async function loadSynthFixtures(): Promise<EvalFixture[]> {
  const root = path.resolve(process.cwd(), "src/intelligence_v4/evals/fixtures_synth");
  const dirs = discoverSynthPackDirectories(root);
  const fixtures: EvalFixture[] = [];

  for (const dir of dirs) {
    try {
      const loaded = await loadSynthPackFromDirectory(dir);
      const fixtureId = `synth_${loaded.manifest.pack_id}`;
      fixtures.push({
        fixture_id: fixtureId,
        input: {
          run_id: fixtureId,
          workspace_id: "eval-fixture",
          business_name: loaded.manifest.business_name ?? `${loaded.manifest.industry} owner-led business`,
          industry: loaded.manifest.industry,
          emyth_role: loaded.manifest.emyth_role ?? "mixed",
          snapshot_window_mode: "last_90_days",
          pack: loaded.pack,
        },
      });
    } catch {
      // Skip malformed synthetic fixtures.
    }
  }

  return fixtures;
}

async function loadFixtures(fixtureFilter?: string): Promise<EvalFixture[]> {
  const loaded = [...loadJsonFixtures(), ...(await loadSynthFixtures())];
  if (!fixtureFilter) return loaded;
  return loaded.filter((fixture) => fixture.fixture_id === fixtureFilter);
}

export async function runEvals(params?: {
  mode?: "pipeline" | "stage";
  stage?: StageName;
  fixture?: string;
}): Promise<EvalRunSummary> {
  const mode = params?.mode ?? "pipeline";
  const stage = params?.stage;
  const fixtures = await loadFixtures(params?.fixture);

  const summary: EvalRunSummary = {
    generated_at: new Date().toISOString(),
    mode,
    stage,
    totals: {
      fixtures: fixtures.length,
      passed: 0,
      failed: 0,
    },
    results: [],
  };

  for (const fixture of fixtures) {
    const pipelineResult = await runPipelineV4({
      ...fixture.input,
      run_id: `${fixture.input.run_id}-${Date.now()}`,
    });

    const errors: string[] = [];

    if (!pipelineResult.ok) {
      summary.results.push({
        fixture_id: fixture.fixture_id,
        passed: false,
        schema_passed: false,
        doctrine_passed: false,
        stage_drift_passed: false,
        decision_passed: false,
        errors: [pipelineResult.error.reason],
      });
      summary.totals.failed += 1;
      continue;
    }

    const artifacts = pipelineResult.stage_artifacts;
    const schema = gradeSchema(artifacts);
    const doctrine = gradeDoctrine(artifacts);
    const drift = gradeStageDrift(artifacts);
    const decision = gradeDecisionArtifact(pipelineResult.presented_decision_v1);

    if (!schema.passed) {
      for (const [stageName, result] of Object.entries(schema.by_stage)) {
        if (!result.ok) {
          errors.push(`${stageName}: ${result.errors.join("; ")}`);
        }
      }
    }

    if (!doctrine.passed) {
      errors.push(...doctrine.failures.map((failure) => `${failure.stage}: ${failure.message}`));
    }

    if (!drift.passed) {
      errors.push(...drift.failures.map((failure) => `${failure.stage}: ${failure.message}`));
    }

    if (!decision.passed) {
      errors.push(...decision.errors);
    }

    if (mode === "stage" && stage) {
      const stageSchema = schema.by_stage[stage];
      if (!stageSchema.ok) {
        errors.push(`target_stage_schema_failed:${stage}`);
      }
    }

    const passed = errors.length === 0;
    summary.results.push({
      fixture_id: fixture.fixture_id,
      passed,
      schema_passed: schema.passed,
      doctrine_passed: doctrine.passed,
      stage_drift_passed: drift.passed,
      decision_passed: decision.passed,
      errors,
    });

    if (passed) {
      summary.totals.passed += 1;
    } else {
      summary.totals.failed += 1;
    }
  }

  const reportDir = path.resolve(process.cwd(), "evals");
  fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, `report_${toFileStamp()}.json`);
  summary.report_path = reportPath;
  fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2));

  const tmpOutPath = path.resolve(process.cwd(), "tmp", "intelligence_v4", "eval_summary.json");
  fs.mkdirSync(path.dirname(tmpOutPath), { recursive: true });
  fs.writeFileSync(tmpOutPath, JSON.stringify(summary, null, 2));

  return summary;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const summary = await runEvals(args);

  for (const result of summary.results) {
    const status = result.passed ? "PASS" : "FAIL";
    console.log(`[${status}] ${result.fixture_id}`);
    if (!result.passed) {
      for (const error of result.errors) {
        console.log(`  - ${error}`);
      }
    }
  }

  console.log("\nEval Summary:");
  console.log(JSON.stringify(summary.totals, null, 2));

  if (summary.totals.failed > 0) {
    process.exit(1);
  }
}

if (process.argv[1]?.includes("run_evals.ts")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
  });
}
