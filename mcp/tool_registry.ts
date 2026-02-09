import Ajv, { type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";

import * as inferDecisionV2Tool from "./tools/infer_decision_v2";
import * as validateConclusionV2Tool from "./tools/validate_conclusion_v2";
import * as runMockPackV2Tool from "./tools/run_mock_pack_v2";
import * as runPipelineV2Tool from "./tools/run_pipeline_v2";

// Decision Closure v3 tools
import * as captureIntentV1Tool from "./tools/capture_intent_v1";
import * as computeSignalsV2Tool from "./tools/compute_signals_v2";
import * as recordCommitmentV1Tool from "./tools/record_commitment_v1";
import * as reviewOutcomesV1Tool from "./tools/review_outcomes_v1";
import * as validateDoctrineV1Tool from "./tools/validate_doctrine_v1";
import * as runPipelineV3Tool from "./tools/run_pipeline_v3";

type ToolHandler = (args: Record<string, unknown>) => Promise<unknown> | unknown;

type ToolDefinition = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
  handler: ToolHandler;
};

const ajv = new Ajv({ allErrors: true, strict: true, allowUnionTypes: true });
addFormats(ajv);

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

// ============================================================================
// Decision Closure v3 Output Schemas
// ============================================================================

const ownerIntentProfileOutputSchema = {
  type: "object",
  required: ["profile", "contradictions", "valid"],
  properties: {
    profile: { type: "object" },
    contradictions: { type: "array", items: { type: "object" } },
    valid: { type: "boolean" },
  },
};

const computedSignalsOutputSchema = {
  type: "object",
  required: [
    "seasonality_pattern",
    "volatility_band",
    "approval_lag_signal",
    "payment_lag_signal",
    "concentration_signals",
    "capacity_signals",
    "owner_dependency",
    "business_type_hypothesis",
    "confidence",
  ],
  properties: {
    seasonality_pattern: { type: "string" },
    seasonality_evidence: { type: "string" },
    volatility_band: { type: "string" },
    volatility_evidence: { type: "string" },
    approval_lag_signal: { type: "string" },
    payment_lag_signal: { type: "string" },
    concentration_signals: { type: "array" },
    capacity_signals: { type: "array" },
    owner_dependency: { type: "array" },
    business_type_hypothesis: { type: "string" },
    confidence: { type: "string" },
    missing_data_flags: { type: "array" },
  },
};

const commitmentRecordOutputSchema = {
  type: "object",
  required: ["commitment_gate", "end_cleanly"],
  properties: {
    commitment_gate: { type: "object" },
    action_plan: { type: "object" },
    accountability: { type: "object" },
    end_cleanly: { type: "boolean" },
  },
};

const outcomeReviewOutputSchema = {
  type: "object",
  required: [
    "review_version",
    "review_date",
    "days_since_commitment",
    "implementation_status",
    "strategy_assessment",
    "expected_signals_comparison",
    "pressure_change",
    "pivot_recommendation",
    "reasoning",
  ],
  properties: {
    review_version: { type: "string" },
    review_date: { type: "string" },
    days_since_commitment: { type: "number" },
    implementation_status: { type: "string" },
    strategy_assessment: { type: "string" },
    expected_signals_comparison: { type: "array" },
    pressure_change: { type: "string" },
    pivot_recommendation: { type: "string" },
    reasoning: { type: "string" },
  },
};

const doctrineValidationOutputSchema = {
  type: "object",
  required: ["valid", "doctrine_checks", "errors"],
  properties: {
    valid: { type: "boolean" },
    doctrine_checks: { type: "object" },
    errors: { type: "array", items: { type: "string" } },
  },
};

const pipelineV3OutputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["artifact", "summary", "coherence_snapshot", "presented_coherence_v1", "coherence_drift", "intent_overrides"],
  properties: {
    artifact: { type: "object" },
    summary: { type: "string" },
    end_cleanly: { type: "boolean" },
    coherence_snapshot: { anyOf: [{ type: "object" }, { type: "null" }] },
    presented_coherence_v1: { anyOf: [{ type: "object" }, { type: "null" }] },
    coherence_drift: { anyOf: [{ type: "object" }, { type: "null" }] },
    intent_overrides: { anyOf: [{ type: "object" }, { type: "null" }] },
    coherence: { type: "object" },
    drift: { type: "object" },
  },
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
  // Decision Closure v3 tools
  {
    name: captureIntentV1Tool.tool.name,
    description: captureIntentV1Tool.tool.description,
    input_schema: captureIntentV1Tool.tool.inputSchema as Record<string, unknown>,
    output_schema: ownerIntentProfileOutputSchema,
    handler: captureIntentV1Tool.handler as ToolHandler,
  },
  {
    name: computeSignalsV2Tool.tool.name,
    description: computeSignalsV2Tool.tool.description,
    input_schema: computeSignalsV2Tool.tool.inputSchema as Record<string, unknown>,
    output_schema: computedSignalsOutputSchema,
    handler: computeSignalsV2Tool.handler as ToolHandler,
  },
  {
    name: recordCommitmentV1Tool.tool.name,
    description: recordCommitmentV1Tool.tool.description,
    input_schema: recordCommitmentV1Tool.tool.inputSchema as Record<string, unknown>,
    output_schema: commitmentRecordOutputSchema,
    handler: recordCommitmentV1Tool.handler as ToolHandler,
  },
  {
    name: reviewOutcomesV1Tool.tool.name,
    description: reviewOutcomesV1Tool.tool.description,
    input_schema: reviewOutcomesV1Tool.tool.inputSchema as Record<string, unknown>,
    output_schema: outcomeReviewOutputSchema,
    handler: reviewOutcomesV1Tool.handler as ToolHandler,
  },
  {
    name: validateDoctrineV1Tool.tool.name,
    description: validateDoctrineV1Tool.tool.description,
    input_schema: validateDoctrineV1Tool.tool.inputSchema as Record<string, unknown>,
    output_schema: doctrineValidationOutputSchema,
    handler: validateDoctrineV1Tool.handler as ToolHandler,
  },
  {
    name: runPipelineV3Tool.tool.name,
    description: runPipelineV3Tool.tool.description,
    input_schema: runPipelineV3Tool.tool.inputSchema as Record<string, unknown>,
    output_schema: pipelineV3OutputSchema,
    handler: runPipelineV3Tool.handler as ToolHandler,
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
