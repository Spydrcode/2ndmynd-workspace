import Ajv from "ajv";
import { z } from "zod";

export const OWNER_VALUE_ENUM = [
  "safety_compliance",
  "customer_communication",
  "reliability_ontime",
  "reputation_reviews",
  "team_stability",
  "cash_stability",
  "growth",
  "quality_craftsmanship",
  "speed",
  "simplicity",
  "premium_positioning",
  "community_relationships",
] as const;

export const PRESSURE_SOURCE_ENUM = [
  "customers_expectations",
  "scheduling_dispatch",
  "quality_callbacks",
  "team_hiring_training",
  "sales_followup",
  "vendors_inventory",
  "compliance_risk",
  "owner_interruptions",
  "tools_message_overload",
  "cash_timing",
] as const;

export const EMYTH_ROLE_SPLITS = ["technician", "manager", "entrepreneur", "mixed"] as const;

export const SNAPSHOT_WINDOW_MODES = ["last_90_days", "last_100_closed_estimates"] as const;

export const OwnerValueEnumSchema = z.enum(OWNER_VALUE_ENUM);
export type OwnerValueEnum = z.infer<typeof OwnerValueEnumSchema>;

export const PressureSourceEnumSchema = z.enum(PRESSURE_SOURCE_ENUM);
export type PressureSourceEnum = z.infer<typeof PressureSourceEnumSchema>;

const SnapshotWindowSchema = z
  .object({
    mode: z.enum(SNAPSHOT_WINDOW_MODES),
  })
  .strict();

function hasNoDuplicates(values: string[]) {
  return new Set(values).size === values.length;
}

export const SecondLookIntakeV2Schema = z
  .object({
    business_name: z.string().min(1).max(160),
    website_url: z.string().min(1).max(2048).optional(),
    google_business_url: z.string().min(1).max(2048).optional(),
    snapshot_window: SnapshotWindowSchema,
    owner_values_top3: z
      .array(OwnerValueEnumSchema)
      .min(1)
      .max(3)
      .refine(hasNoDuplicates, "owner_values_top3 must not contain duplicates"),
    pressure_sources_top2: z
      .array(PressureSourceEnumSchema)
      .min(1)
      .max(2)
      .refine(hasNoDuplicates, "pressure_sources_top2 must not contain duplicates"),
    emyth_role_split: z.enum(EMYTH_ROLE_SPLITS),
    voice_note_1_text: z.string().min(1).max(3000).optional(),
    voice_note_2_text: z.string().min(1).max(3000).optional(),
    optional_tags: z.array(z.string().min(1).max(64)).max(20).optional(),
    consent_flags: z
      .object({
        data_ok: z.boolean(),
      })
      .strict(),
  })
  .strict();

export type SecondLookIntakeV2 = z.infer<typeof SecondLookIntakeV2Schema>;

export const secondLookIntakeV2JsonSchema = {
  $id: "second_look_intake_v2",
  type: "object",
  additionalProperties: false,
  required: [
    "business_name",
    "snapshot_window",
    "owner_values_top3",
    "pressure_sources_top2",
    "emyth_role_split",
    "consent_flags",
  ],
  properties: {
    business_name: { type: "string", minLength: 1, maxLength: 160 },
    website_url: { type: "string", minLength: 1, maxLength: 2048 },
    google_business_url: { type: "string", minLength: 1, maxLength: 2048 },
    snapshot_window: {
      type: "object",
      additionalProperties: false,
      required: ["mode"],
      properties: {
        mode: { type: "string", enum: [...SNAPSHOT_WINDOW_MODES] },
      },
    },
    owner_values_top3: {
      type: "array",
      minItems: 1,
      maxItems: 3,
      uniqueItems: true,
      items: { type: "string", enum: [...OWNER_VALUE_ENUM] },
    },
    pressure_sources_top2: {
      type: "array",
      minItems: 1,
      maxItems: 2,
      uniqueItems: true,
      items: { type: "string", enum: [...PRESSURE_SOURCE_ENUM] },
    },
    emyth_role_split: { type: "string", enum: [...EMYTH_ROLE_SPLITS] },
    voice_note_1_text: { type: "string", minLength: 1, maxLength: 3000 },
    voice_note_2_text: { type: "string", minLength: 1, maxLength: 3000 },
    optional_tags: {
      type: "array",
      maxItems: 20,
      items: { type: "string", minLength: 1, maxLength: 64 },
    },
    consent_flags: {
      type: "object",
      additionalProperties: false,
      required: ["data_ok"],
      properties: {
        data_ok: { type: "boolean" },
      },
    },
  },
} as const;

const ajv = new Ajv({ allErrors: true, strict: true, allowUnionTypes: true });
const validateIntakeSchema = ajv.compile(secondLookIntakeV2JsonSchema);

export function validateSecondLookIntakeV2(input: unknown): { ok: boolean; errors: string[] } {
  const zodResult = SecondLookIntakeV2Schema.safeParse(input);
  const ajvOk = validateIntakeSchema(input);

  const errors: string[] = [];
  if (!zodResult.success) {
    errors.push(...zodResult.error.issues.map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`));
  }
  if (!ajvOk) {
    errors.push(...(validateIntakeSchema.errors ?? []).map((err) => `${err.instancePath || "root"} ${err.message ?? "invalid"}`));
  }

  return { ok: errors.length === 0, errors };
}

export function parseSecondLookIntakeV2(input: unknown): SecondLookIntakeV2 {
  return SecondLookIntakeV2Schema.parse(input);
}
