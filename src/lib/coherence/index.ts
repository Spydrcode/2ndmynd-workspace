/**
 * Coherence Engine Orchestrator
 *
 * Wire: IntentIntake + ComputedSignals + Snapshot → CoherenceSnapshot
 *
 * This is the single entry point for consumers.
 */

import { buildOwnerIntentModel, type IntentIntake } from "./build_owner_intent";
import { buildRealitySignals } from "./build_reality_signals";
import { generateCoherenceTensions } from "./generate_tensions";
import { generateDecisionPaths } from "./generate_paths";
import { computeValuePropAlignment } from "./value_alignment";
import { computeDataCoverage, computeValueVisibilityImpact } from "./data_coverage";
import type { CoherenceSnapshot } from "../types/coherence_engine";
import type { ComputedSignals } from "../../../mcp/tools/compute_signals_v2";
import type { SnapshotV2 } from "../../../lib/decision/v2/conclusion_schema_v2";

export type CoherenceEngineInput = {
  run_id: string;
  intake: IntentIntake;
  computedSignals: ComputedSignals;
  snapshot: SnapshotV2;
};

export function runCoherenceEngine(input: CoherenceEngineInput): CoherenceSnapshot {
  const { run_id, intake, computedSignals, snapshot } = input;

  // S1: Build intent + signals
  const intent = buildOwnerIntentModel(intake);
  const signals = buildRealitySignals({ computedSignals, snapshot });

  // S1.5: Compute value-prop alignment (reuses intent.value_confidence if present)
  const value_prop_alignment = computeValuePropAlignment({
    intent,
    reality_signals: signals.signals,
  });

  // S2: Generate tensions (with alignment context)
  const tensions = generateCoherenceTensions(intent, signals, value_prop_alignment);

  // S3: Generate decision paths
  const paths = generateDecisionPaths(intent, signals, tensions);

  // S4: Data coverage + visibility impact
  const data_coverage = computeDataCoverage({ snapshot, signals });
  const value_visibility = computeValueVisibilityImpact(value_prop_alignment, data_coverage);

  // Overall confidence
  const intentConf = intent.confidence === "high" ? 2 : intent.confidence === "med" ? 1 : 0;
  const signalDataQuality = signals.missing_data.length === 0 ? 2 : signals.missing_data.length <= 2 ? 1 : 0;
  const overallScore = Math.round((intentConf + signalDataQuality) / 2);
  const overallConfidence = overallScore >= 2 ? "high" : overallScore >= 1 ? "med" : "low";

  return {
    version: "coherence_v1",
    run_id,
    created_at: new Date().toISOString(),
    intent,
    signals,
    value_prop_alignment,
    tensions,
    paths,
    data_coverage,
    value_visibility,
    end_state: {
      state: "awaiting_commitment",
      timestamp: new Date().toISOString(),
    },
    confidence: {
      level: overallConfidence,
      reason:
        overallConfidence === "high"
          ? "Intent was clearly stated and data quality is strong."
          : overallConfidence === "med"
            ? "Some ambiguity in intent or limited data availability."
            : "Intent was unclear or significant data gaps exist.",
    },
  };
}

export { type IntentIntake } from "./build_owner_intent";
export { runCoherenceEngineV3, type CoherenceEngineInputV3 } from "./index_v3";
