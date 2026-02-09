import fs from "node:fs";
import path from "node:path";

import type { StageName } from "./contracts";

export type RolloutConfig = {
  strategy: "pinned" | "canary";
  canary_percent: number;
};

export type FallbackConfig = {
  enabled: boolean;
  model_id?: string;
};

export type StageModelConfig = {
  model_id: string;
  temperature: number;
  max_tokens: number;
  schema_version: string;
  prompt_version: string;
  rollout: RolloutConfig;
  fallback: FallbackConfig;
};

export type IntelligenceV4ModelConfig = {
  version: string;
  stages: Record<StageName, StageModelConfig>;
  industry_overrides?: Record<string, Partial<Record<StageName, Partial<StageModelConfig>>>>;
};

const DEFAULT_STAGE_CONFIG: StageModelConfig = {
  model_id: "deterministic:core-v1",
  temperature: 0,
  max_tokens: 1200,
  schema_version: "v1",
  prompt_version: "v1",
  rollout: { strategy: "pinned", canary_percent: 0 },
  fallback: { enabled: false },
};

let cachedConfig: IntelligenceV4ModelConfig | null = null;

function coerceStageConfig(value: Partial<StageModelConfig> | undefined): StageModelConfig {
  return {
    model_id: value?.model_id ?? DEFAULT_STAGE_CONFIG.model_id,
    temperature: value?.temperature ?? DEFAULT_STAGE_CONFIG.temperature,
    max_tokens: value?.max_tokens ?? DEFAULT_STAGE_CONFIG.max_tokens,
    schema_version: value?.schema_version ?? DEFAULT_STAGE_CONFIG.schema_version,
    prompt_version: value?.prompt_version ?? DEFAULT_STAGE_CONFIG.prompt_version,
    rollout: {
      strategy: value?.rollout?.strategy ?? DEFAULT_STAGE_CONFIG.rollout.strategy,
      canary_percent: value?.rollout?.canary_percent ?? DEFAULT_STAGE_CONFIG.rollout.canary_percent,
    },
    fallback: {
      enabled: value?.fallback?.enabled ?? DEFAULT_STAGE_CONFIG.fallback.enabled,
      model_id: value?.fallback?.model_id ?? DEFAULT_STAGE_CONFIG.fallback.model_id,
    },
  };
}

function defaultConfig(): IntelligenceV4ModelConfig {
  return {
    version: "intelligence_v4.models/1",
    stages: {
      quant_signals: coerceStageConfig({ schema_version: "quant_signals_v1" }),
      emyth_owner_load: coerceStageConfig({ schema_version: "owner_load_v1" }),
      competitive_lens: coerceStageConfig({ schema_version: "competitive_lens_v1" }),
      blue_ocean: coerceStageConfig({ schema_version: "blue_ocean_v1" }),
      synthesis_decision: coerceStageConfig({ schema_version: "decision_artifact_v1" }),
    },
    industry_overrides: {},
  };
}

export function loadModelConfig(): IntelligenceV4ModelConfig {
  if (cachedConfig) return cachedConfig;

  const configPath = path.resolve(process.cwd(), "config", "intelligence_v4.models.json");
  if (!fs.existsSync(configPath)) {
    cachedConfig = defaultConfig();
    return cachedConfig;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf8")) as Partial<IntelligenceV4ModelConfig>;
    const defaults = defaultConfig();
    cachedConfig = {
      version: parsed.version ?? defaults.version,
      stages: {
        quant_signals: coerceStageConfig(parsed.stages?.quant_signals),
        emyth_owner_load: coerceStageConfig(parsed.stages?.emyth_owner_load),
        competitive_lens: coerceStageConfig(parsed.stages?.competitive_lens),
        blue_ocean: coerceStageConfig(parsed.stages?.blue_ocean),
        synthesis_decision: coerceStageConfig(parsed.stages?.synthesis_decision),
      },
      industry_overrides: parsed.industry_overrides ?? {},
    };
    return cachedConfig;
  } catch {
    cachedConfig = defaultConfig();
    return cachedConfig;
  }
}

function applyOverride(base: StageModelConfig, override?: Partial<StageModelConfig>): StageModelConfig {
  if (!override) return base;
  return {
    ...base,
    ...override,
    rollout: {
      strategy: override.rollout?.strategy ?? base.rollout.strategy,
      canary_percent: override.rollout?.canary_percent ?? base.rollout.canary_percent,
    },
    fallback: {
      enabled: override.fallback?.enabled ?? base.fallback.enabled,
      model_id: override.fallback?.model_id ?? base.fallback.model_id,
    },
  };
}

export function getStageModelConfig(params: {
  stage_name: StageName;
  industry?: string | null;
}): StageModelConfig {
  const config = loadModelConfig();
  const base = config.stages[params.stage_name];

  if (!params.industry) {
    return base;
  }

  const override = config.industry_overrides?.[params.industry]?.[params.stage_name];
  return applyOverride(base, override);
}