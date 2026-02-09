import type { DataPackV0 } from "@/src/lib/intelligence/data_pack_v0";

import type { StageArtifactMap, StageName } from "./contracts";
import {
  STAGE_INPUT_SCHEMA_VERSION,
  type QuantSummaryPatternV1,
  type QuantSummarySignalV1,
  type StageInputBlueOceanV1,
  type StageInputByStage,
  type StageInputCompetitiveV1,
  type StageInputDataLimitsV1,
  type StageInputEmythV1,
  type StageInputQuantSummaryV1,
  type StageInputQuantV1,
  type StageInputSynthesisV1,
} from "./input_contracts";
import { prepareQuantInputs, type QuantPreparedInputs } from "../stages/quant_signals/prepare_inputs";

export type SnapshotWindowModeV4 = "last_90_days" | "last_100_closed_estimates";

export type PipelineRunInputV4 = {
  run_id: string;
  workspace_id: string;
  pack: DataPackV0;
  business_name?: string;
  industry?: string;
  emyth_role?: "technician" | "manager" | "entrepreneur" | "mixed";
  snapshot_window_mode?: SnapshotWindowModeV4;
};

export type RuntimeState = {
  input: PipelineRunInputV4;
  quant_inputs?: QuantPreparedInputs;
  artifacts: Partial<StageArtifactMap>;
};

export type QuantStageContext = {
  mode: SnapshotWindowModeV4;
  pack: DataPackV0;
};

export type OwnerLoadStageContext = {
  business_name: string;
  industry: string;
  emyth_role: "technician" | "manager" | "entrepreneur" | "mixed";
  quant_signals: StageArtifactMap["quant_signals"];
};

export type CompetitiveLensStageContext = {
  business_name: string;
  industry: string;
  quant_signals: StageArtifactMap["quant_signals"];
  owner_load: StageArtifactMap["emyth_owner_load"];
};

export type BlueOceanStageContext = {
  business_name: string;
  quant_signals: StageArtifactMap["quant_signals"];
  owner_load: StageArtifactMap["emyth_owner_load"];
  competitive: StageArtifactMap["competitive_lens"];
};

export type SynthesisStageContext = {
  business_name: string;
  quant_signals: StageArtifactMap["quant_signals"];
  owner_load: StageArtifactMap["emyth_owner_load"];
  competitive: StageArtifactMap["competitive_lens"];
  blue_ocean: StageArtifactMap["blue_ocean"];
};

export function createRuntimeState(input: PipelineRunInputV4): RuntimeState {
  return {
    input,
    artifacts: {},
  };
}

function toCountBucket(count: number): string {
  if (count <= 0) return "none";
  if (count <= 5) return "very_low";
  if (count <= 15) return "low";
  if (count <= 40) return "medium";
  return "high";
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 3))}...`;
}

function resolveIndustry(input: PipelineRunInputV4): string {
  const normalized = input.industry?.trim().toLowerCase();
  return normalized && normalized.length > 0 ? normalized.replace(/\s+/g, "_") : "unknown";
}

function resolveClientId(input: PipelineRunInputV4): string {
  return input.workspace_id;
}

function resolveServiceMixBucket(pack: DataPackV0): string {
  const quotes = pack.quotes?.length ?? 0;
  const invoices = pack.invoices?.length ?? 0;
  const jobs = pack.jobs?.length ?? 0;
  const total = quotes + invoices + jobs;
  if (total === 0) return "unknown";

  const highest = Math.max(quotes, invoices, jobs);
  if (highest / total < 0.45) return "balanced";
  if (highest === quotes) return "quotes_heavy";
  if (highest === invoices) return "invoices_heavy";
  return "jobs_heavy";
}

function resolveTeamSizeBucket(pack: DataPackV0): string {
  const customers = pack.customers?.length ?? 0;
  if (customers <= 0) return "unknown";
  if (customers <= 10) return "small";
  if (customers <= 40) return "medium";
  return "large";
}

function toInputDataLimitsFromPrepared(prepared: QuantPreparedInputs): StageInputDataLimitsV1 {
  return {
    window_start: prepared.window.start_date,
    window_end: prepared.window.end_date,
    max_records: prepared.data_limits.row_limit_applied,
    notes: prepared.data_limits.notes.slice(0, 8),
  };
}

function toInputDataLimitsFromQuant(quant: StageArtifactMap["quant_signals"]): StageInputDataLimitsV1 {
  return {
    window_start: quant.window.start_date,
    window_end: quant.window.end_date,
    max_records: quant.data_limits.row_limit_applied,
    notes: quant.data_limits.notes.slice(0, 8),
  };
}

function toQuantSummary(quant: StageArtifactMap["quant_signals"]): StageInputQuantSummaryV1 {
  const signals: QuantSummarySignalV1[] = quant.signals.slice(0, 10).map((signal) => ({
    id: signal.id,
    label: signal.label,
    value_bucket: signal.value_bucket,
    direction: signal.direction,
    confidence: signal.confidence,
    evidence_refs: signal.evidence_refs.slice(0, 6),
  }));

  const patterns: QuantSummaryPatternV1[] = quant.patterns.slice(0, 6).map((pattern) => ({
    id: pattern.id,
    description: truncate(pattern.description, 180),
    confidence: pattern.confidence,
    evidence_refs: pattern.evidence_refs.slice(0, 6),
  }));

  const anomalies: QuantSummaryPatternV1[] = quant.anomalies.slice(0, 6).map((pattern) => ({
    id: pattern.id,
    description: truncate(pattern.description, 180),
    confidence: pattern.confidence,
    evidence_refs: pattern.evidence_refs.slice(0, 6),
  }));

  return { signals, patterns, anomalies };
}

function toOwnerLoadSummary(ownerLoad: StageArtifactMap["emyth_owner_load"]): {
  owner_bottleneck: boolean;
  pressure_sources: string[];
  structural_gaps: string[];
} {
  return {
    owner_bottleneck: ownerLoad.owner_load_drivers.length > 0,
    pressure_sources: ownerLoad.owner_load_drivers.slice(0, 6).map((driver) => driver.id),
    structural_gaps: ownerLoad.owner_load_drivers.slice(0, 6).map((driver) => truncate(driver.summary, 120)),
  };
}

export function buildStageContext(stageName: "quant_signals", state: RuntimeState): QuantStageContext;
export function buildStageContext(stageName: "emyth_owner_load", state: RuntimeState): OwnerLoadStageContext;
export function buildStageContext(stageName: "competitive_lens", state: RuntimeState): CompetitiveLensStageContext;
export function buildStageContext(stageName: "blue_ocean", state: RuntimeState): BlueOceanStageContext;
export function buildStageContext(stageName: "synthesis_decision", state: RuntimeState): SynthesisStageContext;
export function buildStageContext(
  stageName: StageName,
  state: RuntimeState
):
  | QuantStageContext
  | OwnerLoadStageContext
  | CompetitiveLensStageContext
  | BlueOceanStageContext
  | SynthesisStageContext;
export function buildStageContext(stageName: StageName, state: RuntimeState) {
  const business_name = state.input.business_name ?? "Owner-led business";
  const industry = state.input.industry ?? "field_services";
  const emyth_role = state.input.emyth_role ?? "mixed";

  if (stageName === "quant_signals") {
    return {
      mode: state.input.snapshot_window_mode ?? "last_90_days",
      pack: state.input.pack,
    } satisfies QuantStageContext;
  }

  if (stageName === "emyth_owner_load") {
    if (!state.artifacts.quant_signals) {
      throw new Error("quant_signals artifact missing for emyth_owner_load stage");
    }
    return {
      business_name,
      industry,
      emyth_role,
      quant_signals: state.artifacts.quant_signals,
    } satisfies OwnerLoadStageContext;
  }

  if (stageName === "competitive_lens") {
    if (!state.artifacts.quant_signals || !state.artifacts.emyth_owner_load) {
      throw new Error("required artifacts missing for competitive_lens stage");
    }
    return {
      business_name,
      industry,
      quant_signals: state.artifacts.quant_signals,
      owner_load: state.artifacts.emyth_owner_load,
    } satisfies CompetitiveLensStageContext;
  }

  if (stageName === "blue_ocean") {
    if (!state.artifacts.quant_signals || !state.artifacts.emyth_owner_load || !state.artifacts.competitive_lens) {
      throw new Error("required artifacts missing for blue_ocean stage");
    }
    return {
      business_name,
      quant_signals: state.artifacts.quant_signals,
      owner_load: state.artifacts.emyth_owner_load,
      competitive: state.artifacts.competitive_lens,
    } satisfies BlueOceanStageContext;
  }

  if (!state.artifacts.quant_signals || !state.artifacts.emyth_owner_load || !state.artifacts.competitive_lens || !state.artifacts.blue_ocean) {
    throw new Error("required artifacts missing for synthesis_decision stage");
  }

  return {
    business_name,
    quant_signals: state.artifacts.quant_signals,
    owner_load: state.artifacts.emyth_owner_load,
    competitive: state.artifacts.competitive_lens,
    blue_ocean: state.artifacts.blue_ocean,
  } satisfies SynthesisStageContext;
}

export function buildStageInput(stageName: "quant_signals", state: RuntimeState): StageInputQuantV1;
export function buildStageInput(stageName: "emyth_owner_load", state: RuntimeState): StageInputEmythV1;
export function buildStageInput(stageName: "competitive_lens", state: RuntimeState): StageInputCompetitiveV1;
export function buildStageInput(stageName: "blue_ocean", state: RuntimeState): StageInputBlueOceanV1;
export function buildStageInput(stageName: "synthesis_decision", state: RuntimeState): StageInputSynthesisV1;
export function buildStageInput(stageName: StageName, state: RuntimeState): StageInputByStage[StageName];
export function buildStageInput(stageName: StageName, state: RuntimeState): StageInputByStage[StageName] {
  const client_id = resolveClientId(state.input);
  const run_id = state.input.run_id;
  const industry = resolveIndustry(state.input);

  if (stageName === "quant_signals") {
    const prepared =
      state.quant_inputs ??
      prepareQuantInputs({
        pack: state.input.pack,
        mode: state.input.snapshot_window_mode ?? "last_90_days",
      });
    state.quant_inputs = prepared;

    const lookup = new Map(prepared.buckets.map((item) => [item.id, item.value_bucket]));
    const totalThroughput =
      (state.input.pack.quotes?.length ?? 0) +
      (state.input.pack.invoices?.length ?? 0) +
      (state.input.pack.jobs?.length ?? 0);

    const payload: StageInputQuantV1 = {
      schema_version: STAGE_INPUT_SCHEMA_VERSION.quant_signals,
      stage_name: "quant_signals",
      client_id,
      run_id,
      industry,
      data_limits: toInputDataLimitsFromPrepared(prepared),
      evidence_index: {
        refs: prepared.buckets.map((bucket) => bucket.evidence_ref).slice(0, 32),
      },
      context: {
        buckets: {
          concentration_bucket: lookup.get("revenue_concentration_top5") ?? "unknown",
          volatility_bucket: lookup.get("volatility") ?? "unknown",
          seasonality_bucket: lookup.get("seasonality") ?? "unknown",
          decision_latency_bucket: lookup.get("decision_latency") ?? "unknown",
          throughput_bucket: toCountBucket(totalThroughput),
          capacity_squeeze_bucket: lookup.get("capacity_squeeze_proxy") ?? "unknown",
          lead_source_bucket: lookup.get("lead_source") ?? "unknown",
          job_type_mix_bucket: resolveServiceMixBucket(state.input.pack),
        },
        derived_counts: {
          invoice_count_bucket: toCountBucket(state.input.pack.invoices?.length ?? 0),
          estimate_count_bucket: toCountBucket(state.input.pack.quotes?.length ?? 0),
          job_count_bucket: toCountBucket(state.input.pack.jobs?.length ?? 0),
          customer_count_bucket: toCountBucket(state.input.pack.customers?.length ?? 0),
        },
        notes: prepared.data_limits.notes.slice(0, 8),
      },
    };

    return payload;
  }

  if (stageName === "emyth_owner_load") {
    if (!state.artifacts.quant_signals) {
      throw new Error("quant_signals artifact missing for emyth_owner_load stage input");
    }

    const payload: StageInputEmythV1 = {
      schema_version: STAGE_INPUT_SCHEMA_VERSION.emyth_owner_load,
      stage_name: "emyth_owner_load",
      client_id,
      run_id,
      industry,
      data_limits: toInputDataLimitsFromQuant(state.artifacts.quant_signals),
      evidence_index: {
        refs: state.artifacts.quant_signals.evidence_refs.slice(0, 32),
      },
      context: {
        quant_summary: toQuantSummary(state.artifacts.quant_signals),
        owner_context: {
          team_size_bucket: resolveTeamSizeBucket(state.input.pack),
          owner_role_bucket: state.input.emyth_role ?? "unknown",
          service_mix_bucket: resolveServiceMixBucket(state.input.pack),
        },
      },
    };

    return payload;
  }

  if (stageName === "competitive_lens") {
    if (!state.artifacts.quant_signals || !state.artifacts.emyth_owner_load) {
      throw new Error("required artifacts missing for competitive_lens stage input");
    }

    const payload: StageInputCompetitiveV1 = {
      schema_version: STAGE_INPUT_SCHEMA_VERSION.competitive_lens,
      stage_name: "competitive_lens",
      client_id,
      run_id,
      industry,
      data_limits: toInputDataLimitsFromQuant(state.artifacts.quant_signals),
      evidence_index: {
        refs: [...new Set([...state.artifacts.quant_signals.evidence_refs, ...state.artifacts.emyth_owner_load.evidence_refs])].slice(
          0,
          32
        ),
      },
      context: {
        quant_summary: toQuantSummary(state.artifacts.quant_signals),
        owner_load_summary: toOwnerLoadSummary(state.artifacts.emyth_owner_load),
        market_context: {
          region_bucket: "unknown",
          primary_services: [industry].slice(0, 3),
          competitor_set_refs: [],
        },
      },
    };

    return payload;
  }

  if (stageName === "blue_ocean") {
    if (!state.artifacts.quant_signals || !state.artifacts.emyth_owner_load || !state.artifacts.competitive_lens) {
      throw new Error("required artifacts missing for blue_ocean stage input");
    }

    const scheduleFillBucket =
      state.artifacts.quant_signals.signals.find((signal) => signal.id === "capacity_squeeze_proxy")
        ?.value_bucket ?? "unknown";

    const payload: StageInputBlueOceanV1 = {
      schema_version: STAGE_INPUT_SCHEMA_VERSION.blue_ocean,
      stage_name: "blue_ocean",
      client_id,
      run_id,
      industry,
      data_limits: toInputDataLimitsFromQuant(state.artifacts.quant_signals),
      evidence_index: {
        refs: [
          ...new Set([
            ...state.artifacts.quant_signals.evidence_refs,
            ...state.artifacts.emyth_owner_load.evidence_refs,
            ...state.artifacts.competitive_lens.evidence_refs,
          ]),
        ].slice(0, 32),
      },
      context: {
        primary_constraint_candidate: truncate(state.artifacts.emyth_owner_load.bottleneck_diagnosis, 140),
        capacity_bounds: {
          hours_bucket: "unknown",
          crew_count_bucket: "unknown",
          schedule_fill_bucket: scheduleFillBucket,
        },
        competitive_pressure_summary: state.artifacts.competitive_lens.market_pressures
          .slice(0, 6)
          .map((pressure) => truncate(pressure.pressure, 140)),
      },
    };

    return payload;
  }

  if (!state.artifacts.quant_signals || !state.artifacts.emyth_owner_load || !state.artifacts.competitive_lens || !state.artifacts.blue_ocean) {
    throw new Error("required artifacts missing for synthesis_decision stage input");
  }

  const payload: StageInputSynthesisV1 = {
    schema_version: STAGE_INPUT_SCHEMA_VERSION.synthesis_decision,
    stage_name: "synthesis_decision",
    client_id,
    run_id,
    industry,
    data_limits: toInputDataLimitsFromQuant(state.artifacts.quant_signals),
    evidence_index: {
      refs: [
        ...new Set([
          ...state.artifacts.quant_signals.evidence_refs,
          ...state.artifacts.emyth_owner_load.evidence_refs,
          ...state.artifacts.competitive_lens.evidence_refs,
          ...state.artifacts.blue_ocean.evidence_refs,
        ]),
      ].slice(0, 32),
    },
    context: {
      quant_summary: toQuantSummary(state.artifacts.quant_signals),
      owner_load_summary: toOwnerLoadSummary(state.artifacts.emyth_owner_load),
      competitive_summary: {
        market_pressures: state.artifacts.competitive_lens.market_pressures
          .slice(0, 8)
          .map((pressure) => truncate(pressure.pressure, 140)),
        strengths: state.artifacts.competitive_lens.strengths.slice(0, 6).map((value) => truncate(value, 120)),
        vulnerabilities: state.artifacts.competitive_lens.vulnerabilities
          .slice(0, 6)
          .map((value) => truncate(value, 120)),
        collapsed_view: truncate(state.artifacts.competitive_lens.collapsed_view, 180),
      },
      blue_ocean_summary: {
        asymmetric_move_ids: state.artifacts.blue_ocean.asymmetric_moves.slice(0, 8).map((move) => move.id),
        rejected_moves: state.artifacts.blue_ocean.rejected_load_increasing_moves
          .slice(0, 8)
          .map((move) => truncate(move, 140)),
        capacity_guardrail: truncate(state.artifacts.blue_ocean.capacity_guardrail_statement, 180),
      },
    },
  };

  return payload;
}
