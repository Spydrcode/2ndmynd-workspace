import Ajv, { type ValidateFunction } from "ajv";

import type { StageName } from "./contracts";

const ajv = new Ajv({ allErrors: true, strict: true, allowUnionTypes: true });

const bucketValueSchema = {
  type: "string",
  minLength: 2,
  maxLength: 40,
  pattern: "^[a-z0-9_:-]+$",
} as const;

const evidenceRefSchema = {
  type: "string",
  minLength: 8,
  maxLength: 120,
  pattern: "^bucket:[a-z0-9_:-]+$",
} as const;

const industrySchema = {
  anyOf: [
    {
      type: "string",
      enum: [
        "unknown",
        "field_services",
        "hvac",
        "plumbing",
        "electrical",
        "landscaping",
        "cleaning",
        "propane",
        "general_services",
      ],
    },
    { type: "string", minLength: 3, maxLength: 64, pattern: "^[a-z0-9_\\-]+$" },
  ],
} as const;

const baseInputSchema = (stageName: StageName, schemaVersion: string) =>
  ({
    type: "object",
    additionalProperties: false,
    required: [
      "schema_version",
      "stage_name",
      "client_id",
      "run_id",
      "industry",
      "data_limits",
      "evidence_index",
      "context",
    ],
    properties: {
      schema_version: { const: schemaVersion },
      stage_name: { const: stageName },
      client_id: { type: "string", minLength: 1, maxLength: 120 },
      run_id: { type: "string", minLength: 1, maxLength: 120 },
      industry: industrySchema,
      data_limits: {
        type: "object",
        additionalProperties: false,
        required: ["window_start", "window_end", "max_records", "notes"],
        properties: {
          window_start: { type: "string", minLength: 10, maxLength: 40 },
          window_end: { type: "string", minLength: 10, maxLength: 40 },
          max_records: { type: "integer", minimum: 1, maximum: 100000 },
          notes: {
            type: "array",
            items: { type: "string", minLength: 1, maxLength: 200 },
            maxItems: 8,
          },
        },
      },
      evidence_index: {
        type: "object",
        additionalProperties: false,
        required: ["refs"],
        properties: {
          refs: {
            type: "array",
            items: evidenceRefSchema,
            minItems: 1,
            maxItems: 32,
            uniqueItems: true,
          },
        },
      },
      context: { type: "object" },
    },
  }) as const;

const quantSummarySignalSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "label", "value_bucket", "direction", "confidence", "evidence_refs"],
  properties: {
    id: { type: "string", minLength: 1, maxLength: 80 },
    label: { type: "string", minLength: 1, maxLength: 120 },
    value_bucket: bucketValueSchema,
    direction: { type: "string", enum: ["up", "down", "flat", "mixed", "unknown"] },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    evidence_refs: {
      type: "array",
      items: evidenceRefSchema,
      minItems: 1,
      maxItems: 6,
      uniqueItems: true,
    },
  },
} as const;

const quantSummaryPatternSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "description", "confidence", "evidence_refs"],
  properties: {
    id: { type: "string", minLength: 1, maxLength: 80 },
    description: { type: "string", minLength: 8, maxLength: 180 },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    evidence_refs: {
      type: "array",
      items: evidenceRefSchema,
      minItems: 1,
      maxItems: 6,
      uniqueItems: true,
    },
  },
} as const;

const quantSummarySchema = {
  type: "object",
  additionalProperties: false,
  required: ["signals", "patterns", "anomalies"],
  properties: {
    signals: { type: "array", items: quantSummarySignalSchema, minItems: 1, maxItems: 10 },
    patterns: { type: "array", items: quantSummaryPatternSchema, maxItems: 6 },
    anomalies: { type: "array", items: quantSummaryPatternSchema, maxItems: 6 },
  },
} as const;

export const stageInputQuantV1Schema = {
  ...baseInputSchema("quant_signals", "stage_input_quant_v1"),
  properties: {
    ...baseInputSchema("quant_signals", "stage_input_quant_v1").properties,
    context: {
      type: "object",
      additionalProperties: false,
      required: ["buckets", "derived_counts", "notes"],
      properties: {
        buckets: {
          type: "object",
          additionalProperties: false,
          required: [
            "concentration_bucket",
            "volatility_bucket",
            "seasonality_bucket",
            "decision_latency_bucket",
            "throughput_bucket",
            "capacity_squeeze_bucket",
          ],
          properties: {
            concentration_bucket: bucketValueSchema,
            volatility_bucket: bucketValueSchema,
            seasonality_bucket: bucketValueSchema,
            decision_latency_bucket: bucketValueSchema,
            throughput_bucket: bucketValueSchema,
            capacity_squeeze_bucket: bucketValueSchema,
            lead_source_bucket: bucketValueSchema,
            job_type_mix_bucket: bucketValueSchema,
          },
        },
        derived_counts: {
          type: "object",
          additionalProperties: false,
          required: ["invoice_count_bucket", "estimate_count_bucket"],
          properties: {
            invoice_count_bucket: bucketValueSchema,
            estimate_count_bucket: bucketValueSchema,
            job_count_bucket: bucketValueSchema,
            customer_count_bucket: bucketValueSchema,
          },
        },
        notes: {
          type: "array",
          items: { type: "string", minLength: 1, maxLength: 200 },
          maxItems: 8,
        },
      },
    },
  },
} as const;

export const stageInputEmythV1Schema = {
  ...baseInputSchema("emyth_owner_load", "stage_input_emyth_v1"),
  properties: {
    ...baseInputSchema("emyth_owner_load", "stage_input_emyth_v1").properties,
    context: {
      type: "object",
      additionalProperties: false,
      required: ["quant_summary"],
      properties: {
        quant_summary: quantSummarySchema,
        owner_context: {
          type: "object",
          additionalProperties: false,
          properties: {
            team_size_bucket: bucketValueSchema,
            owner_role_bucket: bucketValueSchema,
            service_mix_bucket: bucketValueSchema,
          },
        },
      },
    },
  },
} as const;

export const stageInputCompetitiveV1Schema = {
  ...baseInputSchema("competitive_lens", "stage_input_competitive_v1"),
  properties: {
    ...baseInputSchema("competitive_lens", "stage_input_competitive_v1").properties,
    context: {
      type: "object",
      additionalProperties: false,
      required: ["quant_summary", "owner_load_summary"],
      properties: {
        quant_summary: quantSummarySchema,
        owner_load_summary: {
          type: "object",
          additionalProperties: false,
          required: ["owner_bottleneck", "pressure_sources", "structural_gaps"],
          properties: {
            owner_bottleneck: { type: "boolean" },
            pressure_sources: {
              type: "array",
              items: { type: "string", minLength: 1, maxLength: 80 },
              maxItems: 8,
            },
            structural_gaps: {
              type: "array",
              items: { type: "string", minLength: 1, maxLength: 120 },
              maxItems: 8,
            },
          },
        },
        market_context: {
          type: "object",
          additionalProperties: false,
          properties: {
            region_bucket: bucketValueSchema,
            primary_services: {
              type: "array",
              items: { type: "string", minLength: 1, maxLength: 80 },
              maxItems: 6,
            },
            competitor_set_refs: {
              type: "array",
              items: { type: "string", minLength: 3, maxLength: 120, pattern: "^set:[a-z0-9_:-]+$" },
              maxItems: 10,
            },
          },
        },
      },
    },
  },
} as const;

export const stageInputBlueOceanV1Schema = {
  ...baseInputSchema("blue_ocean", "stage_input_blue_ocean_v1"),
  properties: {
    ...baseInputSchema("blue_ocean", "stage_input_blue_ocean_v1").properties,
    context: {
      type: "object",
      additionalProperties: false,
      required: ["primary_constraint_candidate", "competitive_pressure_summary"],
      properties: {
        primary_constraint_candidate: { type: "string", minLength: 10, maxLength: 140 },
        capacity_bounds: {
          type: "object",
          additionalProperties: false,
          properties: {
            hours_bucket: bucketValueSchema,
            crew_count_bucket: bucketValueSchema,
            schedule_fill_bucket: bucketValueSchema,
          },
        },
        competitive_pressure_summary: {
          type: "array",
          items: { type: "string", minLength: 6, maxLength: 140 },
          minItems: 1,
          maxItems: 6,
        },
      },
    },
  },
} as const;

export const stageInputSynthesisV1Schema = {
  ...baseInputSchema("synthesis_decision", "stage_input_synthesis_v1"),
  properties: {
    ...baseInputSchema("synthesis_decision", "stage_input_synthesis_v1").properties,
    context: {
      type: "object",
      additionalProperties: false,
      required: ["quant_summary", "owner_load_summary", "competitive_summary", "blue_ocean_summary"],
      properties: {
        quant_summary: quantSummarySchema,
        owner_load_summary: {
          type: "object",
          additionalProperties: false,
          required: ["owner_bottleneck", "pressure_sources", "structural_gaps"],
          properties: {
            owner_bottleneck: { type: "boolean" },
            pressure_sources: {
              type: "array",
              items: { type: "string", minLength: 1, maxLength: 80 },
              maxItems: 8,
            },
            structural_gaps: {
              type: "array",
              items: { type: "string", minLength: 1, maxLength: 120 },
              maxItems: 8,
            },
          },
        },
        competitive_summary: {
          type: "object",
          additionalProperties: false,
          required: ["market_pressures", "strengths", "vulnerabilities", "collapsed_view"],
          properties: {
            market_pressures: {
              type: "array",
              items: { type: "string", minLength: 1, maxLength: 140 },
              maxItems: 8,
            },
            strengths: {
              type: "array",
              items: { type: "string", minLength: 1, maxLength: 120 },
              maxItems: 6,
            },
            vulnerabilities: {
              type: "array",
              items: { type: "string", minLength: 1, maxLength: 120 },
              maxItems: 6,
            },
            collapsed_view: { type: "string", minLength: 10, maxLength: 180 },
          },
        },
        blue_ocean_summary: {
          type: "object",
          additionalProperties: false,
          required: ["asymmetric_move_ids", "rejected_moves", "capacity_guardrail"],
          properties: {
            asymmetric_move_ids: {
              type: "array",
              items: { type: "string", minLength: 1, maxLength: 80 },
              maxItems: 8,
            },
            rejected_moves: {
              type: "array",
              items: { type: "string", minLength: 1, maxLength: 140 },
              maxItems: 8,
            },
            capacity_guardrail: { type: "string", minLength: 8, maxLength: 180 },
          },
        },
      },
    },
  },
} as const;

const schemaByStage: Record<StageName, Record<string, unknown>> = {
  quant_signals: stageInputQuantV1Schema,
  emyth_owner_load: stageInputEmythV1Schema,
  competitive_lens: stageInputCompetitiveV1Schema,
  blue_ocean: stageInputBlueOceanV1Schema,
  synthesis_decision: stageInputSynthesisV1Schema,
};

const validators: Record<StageName, ValidateFunction> = {
  quant_signals: ajv.compile(stageInputQuantV1Schema),
  emyth_owner_load: ajv.compile(stageInputEmythV1Schema),
  competitive_lens: ajv.compile(stageInputCompetitiveV1Schema),
  blue_ocean: ajv.compile(stageInputBlueOceanV1Schema),
  synthesis_decision: ajv.compile(stageInputSynthesisV1Schema),
};

export function getStageInputSchema(stageName: StageName): Record<string, unknown> {
  return schemaByStage[stageName];
}

export function validateStageInput<TStage extends StageName>(
  stageName: TStage,
  payload: unknown
): { ok: boolean; errors: string[] } {
  const validator = validators[stageName];
  const valid = validator(payload);
  if (valid) return { ok: true, errors: [] };

  const errors = (validator.errors ?? []).map((error) => {
    const instancePath = error.instancePath || "root";
    return `${instancePath} ${error.message ?? "invalid"}`;
  });

  return { ok: false, errors };
}
