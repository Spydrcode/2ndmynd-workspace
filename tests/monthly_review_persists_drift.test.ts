import { describe, it, expect } from "vitest";

import { handler as runPipelineV3 } from "../mcp/tools/run_pipeline_v3";
import { handler as computeSignals } from "../mcp/tools/compute_signals_v2";
import { TEST_OWNER_INTENT_INTAKE, TEST_SNAPSHOT_V2, withAdjustedSnapshot } from "./helpers/pipeline_v3_fixtures";

describe("monthly review drift persistence", () => {
  it("stores drift on both top-level field and snapshot.review.drift", async () => {
    const initial = await runPipelineV3({
      mode: "initial",
      client_id: "monthly-client-1",
      run_id: "monthly-run-initial",
      snapshot: TEST_SNAPSHOT_V2,
      owner_intent_intake: TEST_OWNER_INTENT_INTAKE,
    });

    const previousSignals = await computeSignals({
      snapshot: TEST_SNAPSHOT_V2,
      include_concentration: true,
    });

    const currentSnapshot = withAdjustedSnapshot({
      quotes: {
        ...TEST_SNAPSHOT_V2.activity_signals.quotes,
        quotes_count: 64,
        quotes_approved_count: 24,
        decision_lag_band: "medium",
      },
      invoices: {
        ...TEST_SNAPSHOT_V2.activity_signals.invoices,
        invoices_count: 45,
        invoices_paid_count: 39,
      },
    });

    const monthly = await runPipelineV3({
      mode: "monthly_review",
      client_id: "monthly-client-1",
      run_id: "monthly-run-review",
      snapshot: currentSnapshot,
      owner_intent_intake: TEST_OWNER_INTENT_INTAKE,
      prior_coherence_snapshot: initial.coherence_snapshot ?? undefined,
      prior_artifact: initial.artifact,
      commitment_details: {
        commitment_plan: {
          plan_version: "commitment_v1",
          chosen_path: "A",
          time_box_days: 90,
          minimal_actions: [
            { action: "Set one scheduling block", deadline_days: 7, responsible: "owner" },
          ],
          explicit_non_actions: ["No extra service area expansion this month"],
          created_at: new Date().toISOString(),
        },
        accountability_spec: {
          spec_version: "accountability_v1",
          re_evaluation_triggers: [
            { trigger: "Monthly review", check_frequency_days: 30, trigger_fired: false },
          ],
          failure_conditions: ["No scheduling improvement visible"],
          success_metrics: [{ metric: "Decision lag", target: "Lower lag band" }],
          created_at: new Date().toISOString(),
        },
        previous_signals: previousSignals,
      },
    });

    expect(monthly.coherence_drift).toBeTruthy();
    expect(monthly.coherence_snapshot?.review?.drift).toBeTruthy();
    expect(monthly.presented_coherence_v1?.drift_section).toBeTruthy();
  });
});
