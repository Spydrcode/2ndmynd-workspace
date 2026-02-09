import "dotenv/config";

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { getStore } from "../../src/lib/intelligence/store";
import { loadPolicyConfig } from "../../src/intelligence_v4/pipeline/guards";
import { runPipelineV4 } from "../../src/intelligence_v4/pipeline/run_pipeline_v4";

type Fixture = {
  fixture_id: string;
  input: {
    run_id: string;
    workspace_id: string;
    business_name: string;
    industry: string;
    emyth_role: "technician" | "manager" | "entrepreneur" | "mixed";
    snapshot_window_mode: "last_90_days" | "last_100_closed_estimates";
    pack: {
      version: "data_pack_v0";
      source_tool: string;
      created_at: string;
      quotes?: Array<Record<string, unknown>>;
      invoices?: Array<Record<string, unknown>>;
      jobs?: Array<Record<string, unknown>>;
      customers?: Array<Record<string, unknown>>;
    };
  };
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function ensureRunForPersistence(params: {
  run_id: string;
  workspace_id: string;
  pack: Fixture["input"]["pack"];
}) {
  const store = getStore();
  const workspace = await store.ensureWorkspaceForUser("intelligence-v4-smoke", "smoke@local.test");

  const dataPack = await store.createDataPack({
    workspace_id: workspace.id,
    source_tool: "smoke_v4",
    storage_paths: [],
    normalized_json: params.pack,
    stats_json: {
      files: 0,
      rows:
        (params.pack.quotes?.length ?? 0) +
        (params.pack.invoices?.length ?? 0) +
        (params.pack.jobs?.length ?? 0) +
        (params.pack.customers?.length ?? 0),
      quotes: params.pack.quotes?.length ?? 0,
      invoices: params.pack.invoices?.length ?? 0,
      jobs: params.pack.jobs?.length ?? 0,
      customers: params.pack.customers?.length ?? 0,
      warnings: [],
    },
  });

  await store.createRun({
    run_id: params.run_id,
    workspace_id: workspace.id,
    pack_id: dataPack.id,
    status: "running",
    mode: "intelligence_v4_smoke",
    results_json: {},
  });

  return workspace.id;
}

async function main() {
  const fixturePath = path.resolve(
    process.cwd(),
    "src/intelligence_v4/evals/fixtures/propane_safety_pressure.json"
  );
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8")) as Fixture;

  const run_id = `smoke-v4-${crypto.randomUUID()}`;
  const workspace_id = await ensureRunForPersistence({
    run_id,
    workspace_id: fixture.input.workspace_id,
    pack: fixture.input.pack,
  });

  const result = await runPipelineV4({
    ...fixture.input,
    run_id,
    workspace_id,
  });

  assert(result.ok, `Pipeline failed: ${result.ok ? "unknown" : result.error.reason}`);

  const decision = result.presented_decision_v1;
  const pathKeys = Object.keys(decision.paths).sort();
  assert(pathKeys.join(",") === "A,B,C", "Decision artifact must include exactly paths A, B, C.");
  assert(["A", "B", "C"].includes(decision.recommended_path), "recommended_path must be A|B|C.");
  assert(decision.first_30_days.length >= 5 && decision.first_30_days.length <= 9, "first_30_days must contain 5-9 actions.");

  const policy = loadPolicyConfig();
  const fullText = JSON.stringify(decision).toLowerCase();
  for (const token of policy.forbidden_vocabulary) {
    const pattern = token.includes(" ")
      ? new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
      : new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    assert(!pattern.test(fullText), `Forbidden vocabulary detected: ${token}`);
  }

  assert(!/check daily|check weekly/i.test(fullText), "Infinite-feed language detected.");

  console.log("PASS smoke:intelligence:v4");
  console.log(JSON.stringify(decision, null, 2));
}

main().catch((error) => {
  console.error("FAIL smoke:intelligence:v4");
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});