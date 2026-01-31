import Ajv, { type ValidateFunction } from "ajv";

import * as inferDecisionV2Tool from "./tools/infer_decision_v2";
import * as validateConclusionV2Tool from "./tools/validate_conclusion_v2";
import * as runMockPackV2Tool from "./tools/run_mock_pack_v2";
import * as runPipelineV2Tool from "./tools/run_pipeline_v2";

type ToolHandler = (args: Record<string, unknown>) => Promise<unknown> | unknown;

type ToolDefinition = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
  handler: ToolHandler;
};

const ajv = new Ajv({ allErrors: true, strict: true, allowUnionTypes: true });

const decisionPatchReasonSchema = {
  anyOf: [{ type: "string", enum: ["verb", "timebox", "both"] }, { type: "null" }],
};

const conclusionSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "conclusion_version",
    "pattern_id",
    "one_sentence_pattern",
    "decision",
    "why_this_now",
    "boundary",
    "confidence",
    "evidence_signals",
    "season_context",
    "optional_next_steps",
  ],
  properties: {
    conclusion_version: { const: "conclusion_v2" },
    pattern_id: { type: "string" },
    one_sentence_pattern: { type: "string" },
    decision: { type: "string" },
    why_this_now: { type: "string" },
    boundary: { type: "string" },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    evidence_signals: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 6 },
    season_context: { type: "string" },
    optional_next_steps: {
      type: "array",
      items: { type: "string" },
      minItems: 0,
      maxItems: 3,
    },
  },
};

const snapshotSchema = {
  type: "object",
  required: ["snapshot_version", "season", "window", "activity_signals"],
  additionalProperties: true,
  properties: {
    snapshot_version: { const: "snapshot_v2" },
    season: {
      type: "object",
      required: ["phase"],
      additionalProperties: true,
      properties: {
        phase: { type: "string", enum: ["Rising", "Active", "Peak", "Lower"] },
      },
    },
    window: {
      type: "object",
      required: ["sample_confidence"],
      additionalProperties: true,
      properties: {
        sample_confidence: { type: "string", enum: ["low", "medium", "high"] },
      },
    },
    activity_signals: {
      type: "object",
      required: ["quotes", "invoices"],
      additionalProperties: true,
      properties: {
        quotes: {
          type: "object",
          required: ["quotes_count"],
          additionalProperties: true,
          properties: {
            quotes_count: { type: "number" },
            quotes_approved_count: { type: "number" },
          },
        },
        invoices: {
          type: "object",
          required: ["invoices_count"],
          additionalProperties: true,
          properties: {
            invoices_count: { type: "number" },
            invoices_paid_count: { type: "number" },
          },
        },
      },
    },
  },
};

const inferMetaSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "run_id",
    "model_id",
    "rewrite_used",
    "fallback_used",
    "decision_patch_applied",
    "decision_patch_reason",
  ],
  properties: {
    run_id: { type: "string" },
    model_id: { type: "string" },
    rewrite_used: { type: "boolean" },
    fallback_used: { type: "boolean" },
    decision_patch_applied: { type: "boolean" },
    decision_patch_reason: decisionPatchReasonSchema,
  },
};

const inferDebugSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "primary_ok",
    "schema_errors",
    "grounding_errors",
    "forbidden_terms",
    "season_warnings",
    "decision_before",
    "decision_after",
  ],
  properties: {
    primary_ok: { type: "boolean" },
    schema_errors: { type: "array", items: { type: "string" } },
    grounding_errors: { type: "array", items: { type: "string" } },
    forbidden_terms: { type: "array", items: { type: "string" } },
    season_warnings: { type: "array", items: { type: "string" } },
    decision_before: { anyOf: [{ type: "string" }, { type: "null" }] },
    decision_after: { anyOf: [{ type: "string" }, { type: "null" }] },
  },
};

const inferOutputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["conclusion", "meta"],
  properties: {
    conclusion: conclusionSchema,
    meta: inferMetaSchema,
    debug: inferDebugSchema,
  },
};

const validateOutputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["ok", "errors"],
  properties: {
    ok: { type: "boolean" },
    errors: { type: "array", items: { type: "string" } },
  },
};

const mockPackSummaryItemSchema = {
  type: "object",
  additionalProperties: false,
  required: ["company", "conclusion", "meta"],
  properties: {
    company: { type: "string" },
    conclusion: { anyOf: [conclusionSchema, { type: "null" }] },
    snapshot: snapshotSchema,
    meta: inferMetaSchema,
  },
};

const mockPackOutputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "log_path"],
  properties: {
    summary: { type: "array", items: mockPackSummaryItemSchema },
    log_path: { type: "string" },
    debug_log_path: { type: "string" },
  },
};

const pipelineMetaSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "run_id",
    "input_hash",
    "model_id",
    "source",
    "tags",
    "primary_ok",
    "rewrite_used",
    "fallback_used",
    "decision_patch_applied",
    "decision_patch_reason",
  ],
  properties: {
    run_id: { type: "string" },
    input_hash: { type: "string" },
    model_id: { type: "string" },
    source: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
    primary_ok: { type: "boolean" },
    rewrite_used: { type: "boolean" },
    fallback_used: { type: "boolean" },
    decision_patch_applied: { type: "boolean" },
    decision_patch_reason: decisionPatchReasonSchema,
  },
};

const pipelineArtifactsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["log_path", "validator_failures", "pii_findings", "season_warnings"],
  properties: {
    log_path: { type: "string" },
    validator_failures: { type: "array", items: { type: "string" } },
    pii_findings: { type: "array", items: { type: "string" } },
    season_warnings: { type: "array", items: { type: "string" } },
  },
};

const pipelineRawSnapshotOutputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["conclusion", "meta"],
  properties: {
    conclusion: conclusionSchema,
    meta: {
      type: "object",
      additionalProperties: false,
      required: [
        "run_id",
        "model_id",
        "rewrite_used",
        "fallback_used",
        "decision_patch_applied",
        "decision_patch_reason",
      ],
      properties: {
        run_id: { type: "string" },
        model_id: { type: "string" },
        rewrite_used: { type: "boolean" },
        fallback_used: { type: "boolean" },
        decision_patch_applied: { type: "boolean" },
        decision_patch_reason: decisionPatchReasonSchema,
      },
    },
  },
};

const pipelineJobberOutputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["conclusion", "meta", "artifacts"],
  properties: {
    conclusion: conclusionSchema,
    meta: pipelineMetaSchema,
    artifacts: pipelineArtifactsSchema,
  },
};

const pipelineMockPackOutputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "artifacts"],
  properties: {
    summary: { type: "array", items: mockPackSummaryItemSchema },
    artifacts: {
      type: "object",
      additionalProperties: false,
      required: ["log_path"],
      properties: {
        log_path: { type: "string" },
        debug_log_path: { type: "string" },
      },
    },
  },
};

const pipelineOutputSchema = {
  anyOf: [pipelineRawSnapshotOutputSchema, pipelineJobberOutputSchema, pipelineMockPackOutputSchema],
};

const toolRegistry: ToolDefinition[] = [
  {
    name: inferDecisionV2Tool.tool.name,
    description: inferDecisionV2Tool.tool.description,
    input_schema: inferDecisionV2Tool.tool.inputSchema as Record<string, unknown>,
    output_schema: inferOutputSchema,
    handler: inferDecisionV2Tool.handler as ToolHandler,
  },
  {
    name: validateConclusionV2Tool.tool.name,
    description: validateConclusionV2Tool.tool.description,
    input_schema: validateConclusionV2Tool.tool.inputSchema as Record<string, unknown>,
    output_schema: validateOutputSchema,
    handler: validateConclusionV2Tool.handler as ToolHandler,
  },
  {
    name: runMockPackV2Tool.tool.name,
    description: runMockPackV2Tool.tool.description,
    input_schema: runMockPackV2Tool.tool.inputSchema as Record<string, unknown>,
    output_schema: mockPackOutputSchema,
    handler: runMockPackV2Tool.handler as ToolHandler,
  },
  {
    name: runPipelineV2Tool.tool.name,
    description: runPipelineV2Tool.tool.description,
    input_schema: runPipelineV2Tool.tool.inputSchema as Record<string, unknown>,
    output_schema: pipelineOutputSchema,
    handler: runPipelineV2Tool.handler as ToolHandler,
  },
];

const validators = new Map<
  string,
  { input: ValidateFunction; output: ValidateFunction }
>();

toolRegistry.forEach((tool) => {
  const input = ajv.compile(tool.input_schema);
  const output = ajv.compile(tool.output_schema);
  validators.set(tool.name, { input, output });
});

export function listTools() {
  return toolRegistry.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.input_schema,
  }));
}

export function callTool(name: string, args: Record<string, unknown>) {
  const tool = toolRegistry.find((entry) => entry.name === name);
  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }

  const validator = validators.get(name);
  if (!validator) {
    throw new Error(`Missing validators for tool: ${name}`);
  }

  if (!validator.input(args)) {
    throw new Error(`Invalid tool input for ${name}: ${ajv.errorsText(validator.input.errors)}`);
  }

  const result = tool.handler(args);
  if (result instanceof Promise) {
    return result.then((resolved) => {
      if (!validator.output(resolved)) {
        throw new Error(
          `Invalid tool output for ${name}: ${ajv.errorsText(validator.output.errors)}`
        );
      }
      return resolved;
    });
  }

  if (!validator.output(result)) {
    throw new Error(`Invalid tool output for ${name}: ${ajv.errorsText(validator.output.errors)}`);
  }

  return result;
}

export function compileSchemasSelfTest() {
  toolRegistry.forEach((tool) => {
    ajv.compile(tool.input_schema);
    ajv.compile(tool.output_schema);
  });
}
