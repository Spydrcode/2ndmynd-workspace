import Ajv, { type ValidateFunction } from "ajv";

export const INTELLIGENCE_V4_VERSION = "intelligence_v4" as const;

export const STAGE_ORDER = [
  "quant_signals",
  "emyth_owner_load",
  "competitive_lens",
  "blue_ocean",
  "synthesis_decision",
] as const;

export type StageName = (typeof STAGE_ORDER)[number];
export type StageConfidence = "low" | "medium" | "high";

export type DataLimitsV1 = {
  window_mode: "last_90_days" | "last_100_closed_estimates" | "custom";
  row_limit_applied: number;
  saw_quotes: boolean;
  saw_invoices: boolean;
  saw_jobs: boolean;
  saw_customers: boolean;
  notes: string[];
};

export type StageArtifactBase<TStage extends StageName, TSchema extends string> = {
  schema_version: TSchema;
  stage_name: TStage;
  model_id: string;
  prompt_version: string;
  confidence: StageConfidence;
  evidence_refs: string[];
  data_limits: DataLimitsV1;
};

export type QuantSignalV1 = {
  id: string;
  label: string;
  value_bucket: string;
  direction: "up" | "down" | "flat" | "mixed" | "unknown";
  confidence: StageConfidence;
  evidence_refs: string[];
};

export type QuantPatternV1 = {
  id: string;
  description: string;
  confidence: StageConfidence;
  evidence_refs: string[];
};

export type QuantSignalsV1 = StageArtifactBase<"quant_signals", "quant_signals_v1"> & {
  window: { start_date: string; end_date: string };
  data_quality: {
    coverage_bucket: "insufficient" | "partial" | "strong";
    missingness_bucket: "low" | "medium" | "high";
    notes: string[];
  };
  signals: QuantSignalV1[];
  patterns: QuantPatternV1[];
  anomalies: QuantPatternV1[];
};

export type OwnerLoadV1 = StageArtifactBase<"emyth_owner_load", "owner_load_v1"> & {
  bottleneck_diagnosis: string;
  why_it_feels_heavy: string;
  owner_load_drivers: Array<{
    id: string;
    summary: string;
    confidence: StageConfidence;
    evidence_refs: string[];
  }>;
  relief_without_expansion: string[];
  prohibitions_checked: {
    no_tools_prescribed: boolean;
    no_hiring_prescribed: boolean;
    no_scaling_prescribed: boolean;
  };
};

export type CompetitiveLensV1 = StageArtifactBase<"competitive_lens", "competitive_lens_v1"> & {
  market_pressures: Array<{
    id: string;
    pressure: string;
    confidence: StageConfidence;
    evidence_refs: string[];
  }>;
  strengths: string[];
  vulnerabilities: string[];
  collapsed_view: string;
};

export type BlueOceanV1 = StageArtifactBase<"blue_ocean", "blue_ocean_v1"> & {
  capacity_guardrail_statement: string;
  asymmetric_moves: Array<{
    id: string;
    move: string;
    why_now: string;
    capacity_check: string;
    confidence: StageConfidence;
    evidence_refs: string[];
  }>;
  rejected_load_increasing_moves: string[];
};

export type DecisionPathV1 = {
  title: string;
  who_it_fits: string;
  tradeoffs: string[];
  first_steps: string[];
  risks: string[];
  guardrails: string[];
};

export type DecisionArtifactV1 = StageArtifactBase<"synthesis_decision", "decision_artifact_v1"> & {
  primary_constraint: string;
  why_it_feels_heavy: string;
  paths: {
    A: DecisionPathV1;
    B: DecisionPathV1;
    C: DecisionPathV1;
  };
  recommended_path: "A" | "B" | "C";
  first_30_days: string[];
  owner_choice_prompt: string;
  language_checks: {
    forbidden_terms_found: string[];
    passed: boolean;
  };
};

export type StageArtifactMap = {
  quant_signals: QuantSignalsV1;
  emyth_owner_load: OwnerLoadV1;
  competitive_lens: CompetitiveLensV1;
  blue_ocean: BlueOceanV1;
  synthesis_decision: DecisionArtifactV1;
};

const ajv = new Ajv({ allErrors: true, strict: true, allowUnionTypes: true });

const evidenceRefSchema = {
  type: "string",
  minLength: 8,
  maxLength: 120,
  pattern: "^bucket:[a-z0-9_:-]+$",
} as const;

const dataLimitsSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "window_mode",
    "row_limit_applied",
    "saw_quotes",
    "saw_invoices",
    "saw_jobs",
    "saw_customers",
    "notes",
  ],
  properties: {
    window_mode: { type: "string", enum: ["last_90_days", "last_100_closed_estimates", "custom"] },
    row_limit_applied: { type: "integer", minimum: 0, maximum: 100000 },
    saw_quotes: { type: "boolean" },
    saw_invoices: { type: "boolean" },
    saw_jobs: { type: "boolean" },
    saw_customers: { type: "boolean" },
    notes: {
      type: "array",
      items: { type: "string", minLength: 1, maxLength: 200 },
      maxItems: 8,
    },
  },
} as const;

function buildBaseStageSchema(stageName: StageName, schemaVersion: string) {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "schema_version",
      "stage_name",
      "model_id",
      "prompt_version",
      "confidence",
      "evidence_refs",
      "data_limits",
    ],
    properties: {
      schema_version: { const: schemaVersion },
      stage_name: { const: stageName },
      model_id: { type: "string", minLength: 1, maxLength: 200 },
      prompt_version: { type: "string", minLength: 1, maxLength: 40 },
      confidence: { type: "string", enum: ["low", "medium", "high"] },
      evidence_refs: {
        type: "array",
        items: evidenceRefSchema,
        minItems: 1,
        maxItems: 24,
        uniqueItems: true,
      },
      data_limits: dataLimitsSchema,
    },
  } as const;
}

const quantSignalSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "label", "value_bucket", "direction", "confidence", "evidence_refs"],
  properties: {
    id: { type: "string", minLength: 1, maxLength: 80 },
    label: { type: "string", minLength: 1, maxLength: 120 },
    value_bucket: { type: "string", minLength: 1, maxLength: 80 },
    direction: { type: "string", enum: ["up", "down", "flat", "mixed", "unknown"] },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    evidence_refs: { type: "array", items: evidenceRefSchema, minItems: 1, maxItems: 8, uniqueItems: true },
  },
} as const;

const quantPatternSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "description", "confidence", "evidence_refs"],
  properties: {
    id: { type: "string", minLength: 1, maxLength: 80 },
    description: { type: "string", minLength: 8, maxLength: 240 },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    evidence_refs: { type: "array", items: evidenceRefSchema, minItems: 1, maxItems: 8, uniqueItems: true },
  },
} as const;

export const quantSignalsV1Schema = {
  ...buildBaseStageSchema("quant_signals", "quant_signals_v1"),
  required: [
    ...buildBaseStageSchema("quant_signals", "quant_signals_v1").required,
    "window",
    "data_quality",
    "signals",
    "patterns",
    "anomalies",
  ],
  properties: {
    ...buildBaseStageSchema("quant_signals", "quant_signals_v1").properties,
    window: {
      type: "object",
      additionalProperties: false,
      required: ["start_date", "end_date"],
      properties: {
        start_date: { type: "string", minLength: 8, maxLength: 40 },
        end_date: { type: "string", minLength: 8, maxLength: 40 },
      },
    },
    data_quality: {
      type: "object",
      additionalProperties: false,
      required: ["coverage_bucket", "missingness_bucket", "notes"],
      properties: {
        coverage_bucket: { type: "string", enum: ["insufficient", "partial", "strong"] },
        missingness_bucket: { type: "string", enum: ["low", "medium", "high"] },
        notes: { type: "array", items: { type: "string", minLength: 1, maxLength: 200 }, maxItems: 8 },
      },
    },
    signals: { type: "array", items: quantSignalSchema, minItems: 3, maxItems: 16 },
    patterns: { type: "array", items: quantPatternSchema, minItems: 1, maxItems: 8 },
    anomalies: { type: "array", items: quantPatternSchema, maxItems: 6 },
  },
} as const;

export const ownerLoadV1Schema = {
  ...buildBaseStageSchema("emyth_owner_load", "owner_load_v1"),
  required: [
    ...buildBaseStageSchema("emyth_owner_load", "owner_load_v1").required,
    "bottleneck_diagnosis",
    "why_it_feels_heavy",
    "owner_load_drivers",
    "relief_without_expansion",
    "prohibitions_checked",
  ],
  properties: {
    ...buildBaseStageSchema("emyth_owner_load", "owner_load_v1").properties,
    bottleneck_diagnosis: { type: "string", minLength: 12, maxLength: 220 },
    why_it_feels_heavy: { type: "string", minLength: 20, maxLength: 260 },
    owner_load_drivers: {
      type: "array",
      minItems: 1,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "summary", "confidence", "evidence_refs"],
        properties: {
          id: { type: "string", minLength: 1, maxLength: 80 },
          summary: { type: "string", minLength: 10, maxLength: 180 },
          confidence: { type: "string", enum: ["low", "medium", "high"] },
          evidence_refs: { type: "array", items: evidenceRefSchema, minItems: 1, maxItems: 6 },
        },
      },
    },
    relief_without_expansion: {
      type: "array",
      minItems: 2,
      maxItems: 6,
      items: { type: "string", minLength: 8, maxLength: 180 },
    },
    prohibitions_checked: {
      type: "object",
      additionalProperties: false,
      required: ["no_tools_prescribed", "no_hiring_prescribed", "no_scaling_prescribed"],
      properties: {
        no_tools_prescribed: { type: "boolean" },
        no_hiring_prescribed: { type: "boolean" },
        no_scaling_prescribed: { type: "boolean" },
      },
    },
  },
} as const;

export const competitiveLensV1Schema = {
  ...buildBaseStageSchema("competitive_lens", "competitive_lens_v1"),
  required: [
    ...buildBaseStageSchema("competitive_lens", "competitive_lens_v1").required,
    "market_pressures",
    "strengths",
    "vulnerabilities",
    "collapsed_view",
  ],
  properties: {
    ...buildBaseStageSchema("competitive_lens", "competitive_lens_v1").properties,
    market_pressures: {
      type: "array",
      minItems: 1,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "pressure", "confidence", "evidence_refs"],
        properties: {
          id: { type: "string", minLength: 1, maxLength: 80 },
          pressure: { type: "string", minLength: 12, maxLength: 180 },
          confidence: { type: "string", enum: ["low", "medium", "high"] },
          evidence_refs: { type: "array", items: evidenceRefSchema, minItems: 1, maxItems: 6 },
        },
      },
    },
    strengths: { type: "array", minItems: 2, maxItems: 6, items: { type: "string", minLength: 5, maxLength: 150 } },
    vulnerabilities: {
      type: "array",
      minItems: 2,
      maxItems: 6,
      items: { type: "string", minLength: 8, maxLength: 180 },
    },
    collapsed_view: { type: "string", minLength: 16, maxLength: 260 },
  },
} as const;

export const blueOceanV1Schema = {
  ...buildBaseStageSchema("blue_ocean", "blue_ocean_v1"),
  required: [
    ...buildBaseStageSchema("blue_ocean", "blue_ocean_v1").required,
    "capacity_guardrail_statement",
    "asymmetric_moves",
    "rejected_load_increasing_moves",
  ],
  properties: {
    ...buildBaseStageSchema("blue_ocean", "blue_ocean_v1").properties,
    capacity_guardrail_statement: { type: "string", minLength: 12, maxLength: 200 },
    asymmetric_moves: {
      type: "array",
      minItems: 2,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "move", "why_now", "capacity_check", "confidence", "evidence_refs"],
        properties: {
          id: { type: "string", minLength: 1, maxLength: 80 },
          move: { type: "string", minLength: 10, maxLength: 180 },
          why_now: { type: "string", minLength: 10, maxLength: 180 },
          capacity_check: { type: "string", minLength: 10, maxLength: 180 },
          confidence: { type: "string", enum: ["low", "medium", "high"] },
          evidence_refs: { type: "array", items: evidenceRefSchema, minItems: 1, maxItems: 6 },
        },
      },
    },
    rejected_load_increasing_moves: {
      type: "array",
      minItems: 1,
      maxItems: 6,
      items: { type: "string", minLength: 10, maxLength: 180 },
    },
  },
} as const;

const decisionPathSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "who_it_fits", "tradeoffs", "first_steps", "risks", "guardrails"],
  properties: {
    title: { type: "string", minLength: 4, maxLength: 90 },
    who_it_fits: { type: "string", minLength: 10, maxLength: 180 },
    tradeoffs: { type: "array", minItems: 2, maxItems: 5, items: { type: "string", minLength: 8, maxLength: 160 } },
    first_steps: { type: "array", minItems: 3, maxItems: 5, items: { type: "string", minLength: 8, maxLength: 160 } },
    risks: { type: "array", minItems: 2, maxItems: 5, items: { type: "string", minLength: 8, maxLength: 160 } },
    guardrails: { type: "array", minItems: 2, maxItems: 5, items: { type: "string", minLength: 8, maxLength: 160 } },
  },
} as const;

export const decisionArtifactV1Schema = {
  ...buildBaseStageSchema("synthesis_decision", "decision_artifact_v1"),
  required: [
    ...buildBaseStageSchema("synthesis_decision", "decision_artifact_v1").required,
    "primary_constraint",
    "why_it_feels_heavy",
    "paths",
    "recommended_path",
    "first_30_days",
    "owner_choice_prompt",
    "language_checks",
  ],
  properties: {
    ...buildBaseStageSchema("synthesis_decision", "decision_artifact_v1").properties,
    primary_constraint: { type: "string", minLength: 12, maxLength: 200 },
    why_it_feels_heavy: { type: "string", minLength: 20, maxLength: 80 },
    paths: {
      type: "object",
      additionalProperties: false,
      required: ["A", "B", "C"],
      properties: {
        A: decisionPathSchema,
        B: decisionPathSchema,
        C: decisionPathSchema,
      },
    },
    recommended_path: { type: "string", enum: ["A", "B", "C"] },
    first_30_days: {
      type: "array",
      minItems: 5,
      maxItems: 9,
      items: { type: "string", minLength: 8, maxLength: 180 },
    },
    owner_choice_prompt: { type: "string", minLength: 8, maxLength: 140 },
    language_checks: {
      type: "object",
      additionalProperties: false,
      required: ["forbidden_terms_found", "passed"],
      properties: {
        forbidden_terms_found: {
          type: "array",
          items: { type: "string", minLength: 2, maxLength: 64 },
          maxItems: 20,
        },
        passed: { type: "boolean" },
      },
    },
  },
} as const;

const schemaByStage: Record<StageName, Record<string, unknown>> = {
  quant_signals: quantSignalsV1Schema,
  emyth_owner_load: ownerLoadV1Schema,
  competitive_lens: competitiveLensV1Schema,
  blue_ocean: blueOceanV1Schema,
  synthesis_decision: decisionArtifactV1Schema,
};

const validators: Record<StageName, ValidateFunction> = {
  quant_signals: ajv.compile(quantSignalsV1Schema),
  emyth_owner_load: ajv.compile(ownerLoadV1Schema),
  competitive_lens: ajv.compile(competitiveLensV1Schema),
  blue_ocean: ajv.compile(blueOceanV1Schema),
  synthesis_decision: ajv.compile(decisionArtifactV1Schema),
};

export function getStageSchema(stageName: StageName): Record<string, unknown> {
  return schemaByStage[stageName];
}

export function validateStageArtifact<TStage extends StageName>(
  stageName: TStage,
  payload: unknown
): { ok: boolean; errors: string[] } {
  const validator = validators[stageName];
  const valid = validator(payload);
  if (valid) {
    return { ok: true, errors: [] };
  }

  const errors = (validator.errors ?? []).map((error) => {
    const instancePath = error.instancePath || "root";
    return `${instancePath} ${error.message ?? "invalid"}`;
  });

  return { ok: false, errors };
}

export function isStageName(value: string): value is StageName {
  return STAGE_ORDER.includes(value as StageName);
}
