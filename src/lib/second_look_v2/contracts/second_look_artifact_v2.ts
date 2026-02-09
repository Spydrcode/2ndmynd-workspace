import Ajv from "ajv";
import { z } from "zod";

import {
  OWNER_VALUE_ENUM,
  OwnerValueEnumSchema,
  type OwnerValueEnum,
  SNAPSHOT_WINDOW_MODES,
} from "./second_look_intake_v2";

export const SECOND_LOOK_LENSES = [
  "emyth",
  "porter",
  "blue_ocean",
  "constructive",
  "safety_risk",
  "customer_comms",
] as const;

export const INSTALL_EXECUTORS = ["owner", "team", "2ndmynd"] as const;

export type SecondLookLens = (typeof SECOND_LOOK_LENSES)[number];

export const EvidenceBucketSchema = z
  .object({
    bucket_id: z.string().min(1),
    label: z.string().min(1),
    summary: z.string().min(1),
    signal_count: z.number().int().min(0).optional(),
  })
  .strict();

export type EvidenceBucket = z.infer<typeof EvidenceBucketSchema>;

export const InstallSpecSchema = z
  .object({
    install_id: z.string().min(1),
    what: z.string().min(1),
    why: z.string().min(1),
    owner_time_minutes: z.number().int().min(0),
    executor: z.enum(INSTALL_EXECUTORS),
    done_when: z.string().min(1),
  })
  .strict();

export type InstallSpec = z.infer<typeof InstallSpecSchema>;

export const ModuleOutputSchema = z
  .object({
    module_id: z.string().min(1),
    title: z.string().min(1),
    narrative: z.string().min(1),
    bullets: z.array(z.string().min(1)).max(6).optional(),
    installs: z.array(InstallSpecSchema).max(4).optional(),
    evidence_buckets: z.array(EvidenceBucketSchema).max(5).optional(),
  })
  .strict();

export type ModuleOutput = z.infer<typeof ModuleOutputSchema>;

export const DecisionPathSchema = z
  .object({
    label: z.string().min(1),
    thesis: z.string().min(1),
    why: z.string().min(1),
    tradeoffs: z.array(z.string().min(1)).max(4),
    installs: z.array(InstallSpecSchema).max(7),
  })
  .strict();

export type DecisionPath = z.infer<typeof DecisionPathSchema>;

const SnapshotWindowSchema = z
  .object({
    mode: z.enum(SNAPSHOT_WINDOW_MODES),
  })
  .strict();

export const SecondLookArtifactV2Schema = z
  .object({
    meta: z
      .object({
        business_name: z.string().min(1),
        generated_at: z.string().datetime(),
        snapshot_window: SnapshotWindowSchema,
        confidence: z.enum(["low", "medium", "high"]),
        confidence_reason: z.string().min(1),
      })
      .strict(),
    north_star: z
      .object({
        values_top3: z.array(OwnerValueEnumSchema).min(1).max(3),
        non_negotiables_summary: z.string().min(1),
        wants_less_of_summary: z.string().min(1),
      })
      .strict(),
    primary_constraint: z
      .object({
        statement: z.string().min(1),
        why_this: z.string().min(1),
        evidence_buckets: z.array(EvidenceBucketSchema).max(6),
      })
      .strict(),
    lenses_included: z.array(z.enum(SECOND_LOOK_LENSES)).min(1).max(6),
    modules: z.array(ModuleOutputSchema).min(1).max(6),
    decision_paths: z
      .object({
        path_A: DecisionPathSchema,
        path_B: DecisionPathSchema,
        neither: z
          .object({
            copy: z.string().min(1),
          })
          .strict(),
      })
      .strict(),
    plan: z
      .object({
        actions_7_days: z.array(InstallSpecSchema).max(7),
        actions_30_days: z.array(InstallSpecSchema).max(7),
        boundaries: z.array(z.string().min(1)).max(3),
      })
      .strict(),
    support_options: z
      .object({
        self_implement: z.string().min(1),
        ongoing_help: z.string().min(1),
      })
      .strict(),
    talk_track_90s: z.string().min(1),
    appendix: z
      .object({
        evidence_tables: z.array(z.unknown()).optional(),
        notes: z.array(z.string().min(1)).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type SecondLookArtifactV2 = z.infer<typeof SecondLookArtifactV2Schema>;

const evidenceBucketJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["bucket_id", "label", "summary"],
  properties: {
    bucket_id: { type: "string", minLength: 1 },
    label: { type: "string", minLength: 1 },
    summary: { type: "string", minLength: 1 },
    signal_count: { type: "integer", minimum: 0 },
  },
} as const;

const installSpecJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["install_id", "what", "why", "owner_time_minutes", "executor", "done_when"],
  properties: {
    install_id: { type: "string", minLength: 1 },
    what: { type: "string", minLength: 1 },
    why: { type: "string", minLength: 1 },
    owner_time_minutes: { type: "integer", minimum: 0 },
    executor: { type: "string", enum: [...INSTALL_EXECUTORS] },
    done_when: { type: "string", minLength: 1 },
  },
} as const;

const moduleOutputJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["module_id", "title", "narrative"],
  properties: {
    module_id: { type: "string", minLength: 1 },
    title: { type: "string", minLength: 1 },
    narrative: { type: "string", minLength: 1 },
    bullets: { type: "array", maxItems: 6, items: { type: "string", minLength: 1 } },
    installs: { type: "array", maxItems: 4, items: installSpecJsonSchema },
    evidence_buckets: { type: "array", maxItems: 5, items: evidenceBucketJsonSchema },
  },
} as const;

const decisionPathJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["label", "thesis", "why", "tradeoffs", "installs"],
  properties: {
    label: { type: "string", minLength: 1 },
    thesis: { type: "string", minLength: 1 },
    why: { type: "string", minLength: 1 },
    tradeoffs: { type: "array", maxItems: 4, items: { type: "string", minLength: 1 } },
    installs: { type: "array", maxItems: 7, items: installSpecJsonSchema },
  },
} as const;

export const secondLookArtifactV2JsonSchema = {
  $id: "second_look_artifact_v2",
  type: "object",
  additionalProperties: false,
  required: [
    "meta",
    "north_star",
    "primary_constraint",
    "lenses_included",
    "modules",
    "decision_paths",
    "plan",
    "support_options",
    "talk_track_90s",
  ],
  properties: {
    meta: {
      type: "object",
      additionalProperties: false,
      required: ["business_name", "generated_at", "snapshot_window", "confidence", "confidence_reason"],
      properties: {
        business_name: { type: "string", minLength: 1 },
        generated_at: { type: "string", minLength: 1 },
        snapshot_window: {
          type: "object",
          additionalProperties: false,
          required: ["mode"],
          properties: {
            mode: { type: "string", enum: [...SNAPSHOT_WINDOW_MODES] },
          },
        },
        confidence: { type: "string", enum: ["low", "medium", "high"] },
        confidence_reason: { type: "string", minLength: 1 },
      },
    },
    north_star: {
      type: "object",
      additionalProperties: false,
      required: ["values_top3", "non_negotiables_summary", "wants_less_of_summary"],
      properties: {
        values_top3: {
          type: "array",
          minItems: 1,
          maxItems: 3,
          items: { type: "string", enum: [...OWNER_VALUE_ENUM] },
        },
        non_negotiables_summary: { type: "string", minLength: 1 },
        wants_less_of_summary: { type: "string", minLength: 1 },
      },
    },
    primary_constraint: {
      type: "object",
      additionalProperties: false,
      required: ["statement", "why_this", "evidence_buckets"],
      properties: {
        statement: { type: "string", minLength: 1 },
        why_this: { type: "string", minLength: 1 },
        evidence_buckets: { type: "array", maxItems: 6, items: evidenceBucketJsonSchema },
      },
    },
    lenses_included: {
      type: "array",
      minItems: 1,
      maxItems: 6,
      items: { type: "string", enum: [...SECOND_LOOK_LENSES] },
    },
    modules: {
      type: "array",
      minItems: 1,
      maxItems: 6,
      items: moduleOutputJsonSchema,
    },
    decision_paths: {
      type: "object",
      additionalProperties: false,
      required: ["path_A", "path_B", "neither"],
      properties: {
        path_A: decisionPathJsonSchema,
        path_B: decisionPathJsonSchema,
        neither: {
          type: "object",
          additionalProperties: false,
          required: ["copy"],
          properties: {
            copy: { type: "string", minLength: 1 },
          },
        },
      },
    },
    plan: {
      type: "object",
      additionalProperties: false,
      required: ["actions_7_days", "actions_30_days", "boundaries"],
      properties: {
        actions_7_days: { type: "array", maxItems: 7, items: installSpecJsonSchema },
        actions_30_days: { type: "array", maxItems: 7, items: installSpecJsonSchema },
        boundaries: { type: "array", maxItems: 3, items: { type: "string", minLength: 1 } },
      },
    },
    support_options: {
      type: "object",
      additionalProperties: false,
      required: ["self_implement", "ongoing_help"],
      properties: {
        self_implement: { type: "string", minLength: 1 },
        ongoing_help: { type: "string", minLength: 1 },
      },
    },
    talk_track_90s: { type: "string", minLength: 1 },
    appendix: {
      type: "object",
      additionalProperties: false,
      properties: {
        evidence_tables: { type: "array", items: true },
        notes: { type: "array", items: { type: "string", minLength: 1 } },
      },
    },
  },
} as const;

const ajv = new Ajv({ allErrors: true, strict: true, allowUnionTypes: true });
const validateArtifactSchema = ajv.compile(secondLookArtifactV2JsonSchema);

export function validateSecondLookArtifactV2(input: unknown): { ok: boolean; errors: string[] } {
  const zodResult = SecondLookArtifactV2Schema.safeParse(input);
  const ajvOk = validateArtifactSchema(input);

  const errors: string[] = [];
  if (!zodResult.success) {
    errors.push(...zodResult.error.issues.map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`));
  }
  if (!ajvOk) {
    errors.push(...(validateArtifactSchema.errors ?? []).map((err) => `${err.instancePath || "root"} ${err.message ?? "invalid"}`));
  }

  return { ok: errors.length === 0, errors };
}

export function parseSecondLookArtifactV2(input: unknown): SecondLookArtifactV2 {
  return SecondLookArtifactV2Schema.parse(input);
}

export function uniqueLensesFromModules(modules: Array<{ lens: SecondLookLens }>): SecondLookLens[] {
  const seen = new Set<SecondLookLens>();
  for (const moduleDef of modules) {
    seen.add(moduleDef.lens);
  }
  return Array.from(seen.values());
}

export function pickTopValues(values: OwnerValueEnum[]): OwnerValueEnum[] {
  return values.slice(0, 3);
}
