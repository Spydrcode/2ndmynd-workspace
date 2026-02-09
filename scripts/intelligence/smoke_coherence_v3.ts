import "dotenv/config";
import { randomUUID } from "node:crypto";

import { handler as computeSignals } from "../../mcp/tools/compute_signals_v2";
import { handler as runPipelineV3 } from "../../mcp/tools/run_pipeline_v3";
import { getStore } from "../../src/lib/intelligence/store";
import type { DataPackV0 } from "../../src/lib/intelligence/data_pack_v0";
import type { SnapshotV2 } from "../../lib/decision/v2/conclusion_schema_v2";
import type { OwnerIntentIntake, IntentOverrides } from "../../src/lib/types/intent_intake";

type AnyObj = Record<string, unknown>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function logStep(title: string) {
  console.log(`\n=== ${title} ===`);
}

function makeSnapshotV2(): SnapshotV2 {
  return {
    snapshot_version: "snapshot_v2",
    pii_scrubbed: true,
    window: {
      slice_start: "2025-11-01",
      slice_end: "2026-01-31",
      report_date: "2026-02-01",
      lookback_days: 90,
      sample_confidence: "high",
      window_type: "last_90_days",
    },
    activity_signals: {
      quotes: {
        quotes_count: 44,
        quotes_approved_count: 19,
        approval_rate_band: "medium",
        decision_lag_band: "high",
        quote_total_bands: { small: 14, medium: 22, large: 8 },
      },
      invoices: {
        invoices_count: 37,
        invoices_paid_count: 30,
        invoice_total_bands: { small: 12, medium: 17, large: 8 },
        payment_lag_band_distribution: {
          very_low: 0.08,
          low: 0.24,
          medium: 0.35,
          high: 0.21,
          very_high: 0.12,
        },
      },
    },
    volatility_band: "high",
    season: {
      phase: "Active",
      strength: "moderate",
      predictability: "medium",
    },
    input_costs: [],
  };
}

function makeOwnerIntentIntake(): OwnerIntentIntake {
  return {
    intake_version: "0.2",
    collected_at: new Date().toISOString(),
    value_prop_tags: ["clarity_communication", "local_trust"],
    priorities_ranked: ["predictability_stability", "customer_experience", "low_stress_owner"],
    non_negotiables: ["protect_reputation"],
    anti_goals: [],
    primary_constraint: "scheduling_chaos",
    success_90d: "A steadier week with fewer dropped handoffs.",
    context_notes: "Smoke run intent fixture.",
  };
}

async function ensureOwnedRunRecord(runId: string, workspaceId: string) {
  const store = getStore();
  const workspace = await store.ensureWorkspaceForUser("local-dev-user", null);
  const existing = await store.getRun(runId);
  if (existing) {
    if (existing.workspace_id !== workspace.id) {
      throw new Error(
        `Run ${runId} exists in a different workspace (${existing.workspace_id}). Use a new SMOKE_RUN_ID.`
      );
    }
    return { store, workspace_id: existing.workspace_id, run_id: existing.run_id };
  }

  const dataPack: DataPackV0 = {
    version: "data_pack_v0",
    source_tool: "smoke",
    created_at: new Date().toISOString(),
    quotes: [
      {
        id: `q_${runId}`,
        status: "approved",
        created_at: "2026-01-05T00:00:00.000Z",
        approved_at: "2026-01-10T00:00:00.000Z",
        total: 1400,
      },
    ],
    invoices: [
      {
        id: `i_${runId}`,
        status: "paid",
        issued_at: "2026-01-12T00:00:00.000Z",
        paid_at: "2026-01-26T00:00:00.000Z",
        total: 1400,
      },
    ],
    jobs: [],
    customers: [],
  };

  const pack = await store.createDataPack({
    workspace_id: workspace.id,
    source_tool: "smoke",
    storage_paths: [],
    normalized_json: dataPack,
    stats_json: { files: 0, rows: 2, quotes: 1, invoices: 1, jobs: 0, customers: 0, warnings: [] },
  });

  await store.createRun({
    run_id: runId,
    workspace_id: workspace.id,
    pack_id: pack.id,
    status: "succeeded",
    mode: "smoke",
    results_json: {},
  });

  return { store, workspace_id: workspace.id, run_id: runId };
}

async function postOverridesHTTP(baseUrl: string, runId: string, payload: IntentOverrides): Promise<AnyObj> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/internal/runs/${runId}/intent-overrides`;
  const body = {
    overrides: payload.overrides.map((item) => ({
      tag: item.tag,
      confirmed: item.confirmed,
    })),
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  assert(res.ok, `POST overrides failed (${res.status}): ${text}`);
  return text ? (JSON.parse(text) as AnyObj) : {};
}

async function getOverridesHTTP(baseUrl: string, runId: string): Promise<AnyObj> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/internal/runs/${runId}/intent-overrides`;
  const res = await fetch(url, { method: "GET" });
  const text = await res.text();
  assert(res.ok, `GET overrides failed (${res.status}): ${text}`);
  return text ? (JSON.parse(text) as AnyObj) : {};
}

async function postOverridesDirect(runId: string, payload: IntentOverrides): Promise<AnyObj> {
  const route = await import("../../src/app/api/internal/runs/[run_id]/intent-overrides/route");
  assert(typeof route.POST === "function", "route.ts does not export POST(req, ctx).");

  const body = {
    overrides: payload.overrides.map((item) => ({
      tag: item.tag,
      confirmed: item.confirmed,
    })),
  };
  const req = new Request(`http://smoke.local/api/internal/runs/${runId}/intent-overrides`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  const ctx = { params: Promise.resolve({ run_id: runId }) };
  const res = await route.POST(req as never, ctx as never);
  const text = await res.text();
  assert(res.ok, `Direct POST overrides failed (${res.status}): ${text}`);
  return text ? (JSON.parse(text) as AnyObj) : {};
}

async function getOverridesDirect(runId: string): Promise<AnyObj> {
  const route = await import("../../src/app/api/internal/runs/[run_id]/intent-overrides/route");
  assert(typeof route.GET === "function", "route.ts does not export GET(req, ctx).");
  const req = new Request(`http://smoke.local/api/internal/runs/${runId}/intent-overrides`, {
    method: "GET",
  });
  const ctx = { params: Promise.resolve({ run_id: runId }) };
  const res = await route.GET(req as never, ctx as never);
  const text = await res.text();
  assert(res.ok, `Direct GET overrides failed (${res.status}): ${text}`);
  return text ? (JSON.parse(text) as AnyObj) : {};
}

async function main() {
  const runId = process.env.SMOKE_RUN_ID ?? randomUUID();
  const clientId = process.env.SMOKE_CLIENT_ID ?? "smoke-client";
  const workspaceId = process.env.SMOKE_WORKSPACE_ID ?? "smoke-workspace";
  const baseUrl = process.env.SMOKE_BASE_URL;

  const snapshot = makeSnapshotV2();
  const owner_intent_intake = makeOwnerIntentIntake();
  const targetTag = owner_intent_intake.value_prop_tags[0] ?? "clarity_communication";
  const overridesPayload: IntentOverrides = {
    run_id: runId,
    updated_at: new Date().toISOString(),
    overrides: [
      {
        tag: targetTag,
        confirmed: false,
        recorded_at: new Date().toISOString(),
      },
    ],
  };

  logStep("0) Ensure owned run record exists for overrides API");
  const owned = await ensureOwnedRunRecord(runId, workspaceId);
  assert(owned.run_id === runId, "Could not prepare run record.");

  logStep("1) Initial run (pipeline.run_v3, mode=initial)");
  const initialOut = await runPipelineV3({
    mode: "initial",
    run_id: runId,
    client_id: clientId,
    snapshot,
    owner_intent_intake,
  });

  assert(initialOut, "pipeline.run_v3 returned null/undefined");
  assert(
    initialOut.presented_coherence_v1,
    "Missing presented_coherence_v1 after initial run (expected coherence mainline)."
  );
  console.log("OK: presented_coherence_v1 present");

  logStep("2) POST intent overrides + verify persistence");
  if (baseUrl) {
    await postOverridesHTTP(baseUrl, runId, overridesPayload);
    const got = await getOverridesHTTP(baseUrl, runId);
    assert(got.intent_overrides, "GET overrides did not return intent_overrides.");
  } else {
    await postOverridesDirect(runId, overridesPayload);
    const got = await getOverridesDirect(runId);
    assert(got.intent_overrides, "Direct GET overrides did not return intent_overrides.");
  }
  console.log("OK: overrides POSTed + persisted");

  logStep("3) Rerun with persisted overrides auto-loaded");
  const rerunOut = await runPipelineV3({
    mode: "initial",
    run_id: runId,
    client_id: clientId,
    snapshot,
    owner_intent_intake,
  });

  assert(rerunOut.presented_coherence_v1, "Missing presented_coherence_v1 after rerun.");
  assert(rerunOut.intent_overrides, "Missing intent_overrides after POST + rerun.");
  console.log("OK: intent_overrides present after rerun");

  logStep("4) Monthly review (drift required)");
  const previousSignals = await computeSignals({
    snapshot,
    include_concentration: true,
  });
  const monthlySnapshot = {
    ...snapshot,
    activity_signals: {
      ...snapshot.activity_signals,
      quotes: {
        ...snapshot.activity_signals.quotes,
        quotes_count: snapshot.activity_signals.quotes.quotes_count + 8,
        decision_lag_band: "medium" as const,
      },
      invoices: {
        ...snapshot.activity_signals.invoices,
        invoices_count: snapshot.activity_signals.invoices.invoices_count + 6,
        invoices_paid_count: snapshot.activity_signals.invoices.invoices_paid_count + 7,
      },
    },
  } satisfies SnapshotV2;

  const monthlyOut = await runPipelineV3({
    mode: "monthly_review",
    run_id: runId,
    client_id: clientId,
    snapshot: monthlySnapshot,
    owner_intent_intake,
    prior_coherence_snapshot: rerunOut.coherence_snapshot ?? undefined,
    prior_artifact: rerunOut.artifact,
    commitment_details: {
      commitment_plan: {
        plan_version: "commitment_v1",
        chosen_path: "A",
        time_box_days: 90,
        minimal_actions: [{ action: "Run one scheduling block weekly", deadline_days: 7, responsible: "owner" }],
        explicit_non_actions: ["No extra service-area expansion this cycle"],
        created_at: new Date().toISOString(),
      },
      accountability_spec: {
        spec_version: "accountability_v1",
        re_evaluation_triggers: [
          { trigger: "Monthly review", check_frequency_days: 30, trigger_fired: false },
        ],
        failure_conditions: ["No reduction in scheduling pressure"],
        success_metrics: [{ metric: "Decision lag band", target: "From high to medium/low" }],
        created_at: new Date().toISOString(),
      },
      previous_signals: previousSignals,
    },
  });

  assert(monthlyOut.presented_coherence_v1, "Missing presented_coherence_v1 after monthly review.");
  const drift =
    monthlyOut.coherence_drift ??
    monthlyOut.coherence_snapshot?.review?.drift;
  assert(drift, "Missing coherence_drift after monthly review.");
  console.log("OK: coherence_drift present after monthly review");

  logStep("PASS smoke:coherence:v3");
  console.log(JSON.stringify({ run_id: runId, client_id: clientId, workspace_id: workspaceId }, null, 2));
}

main().catch((err) => {
  console.error("\nFAIL smoke:coherence:v3");
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
