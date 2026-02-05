import Ajv from "ajv";

export type DataPackStatus =
  | "draft"
  | "sent"
  | "approved"
  | "rejected"
  | "open"
  | "paid"
  | "void"
  | "overdue"
  | "scheduled"
  | "in_progress"
  | "completed"
  | "canceled"
  | "other";

export type DataPackV0 = {
  version: "data_pack_v0";
  source_tool: string;
  created_at: string;
  customers?: Array<{
    id?: string;
    name?: string;
    status?: DataPackStatus;
    created_at?: string;
    city?: string;
    state?: string;
  }>;
  quotes?: Array<{
    id?: string;
    status?: DataPackStatus;
    created_at?: string;
    approved_at?: string;
    total?: number;
  }>;
  invoices?: Array<{
    id?: string;
    status?: DataPackStatus;
    issued_at?: string;
    paid_at?: string;
    total?: number;
    related_quote_id?: string;
  }>;
  jobs?: Array<{
    id?: string;
    status?: DataPackStatus;
    scheduled_at?: string;
    completed_at?: string;
    total?: number;
    related_quote_id?: string;
  }>;
};

export type DataPackStats = {
  files: number;
  rows: number;
  quotes: number;
  invoices: number;
  jobs: number;
  customers: number;
  warnings: string[];
  file_categories?: Record<string, number>;
  rows_by_type?: Record<string, number>;
  files_attempted?: Array<{
    filename: string;
    type_guess: string;
    status: "success" | "error" | "unknown";
    error?: string;
  }>;
};

const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });

const statusSchema = {
  type: "string",
  enum: [
    "draft",
    "sent",
    "approved",
    "rejected",
    "open",
    "paid",
    "void",
    "overdue",
    "scheduled",
    "in_progress",
    "completed",
    "canceled",
    "other",
  ],
};

const packSchema = {
  type: "object",
  additionalProperties: false,
  required: ["version", "source_tool", "created_at"],
  properties: {
    version: { const: "data_pack_v0" },
    source_tool: { type: "string" },
    created_at: { type: "string" },
    customers: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          status: statusSchema,
          created_at: { type: "string" },
          city: { type: "string" },
          state: { type: "string" },
        },
      },
    },
    quotes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          status: statusSchema,
          created_at: { type: "string" },
          approved_at: { type: "string" },
          total: { type: "number" },
        },
      },
    },
    invoices: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          status: statusSchema,
          issued_at: { type: "string" },
          paid_at: { type: "string" },
          total: { type: "number" },
          related_quote_id: { type: "string" },
        },
      },
    },
    jobs: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          status: statusSchema,
          scheduled_at: { type: "string" },
          completed_at: { type: "string" },
          total: { type: "number" },
          related_quote_id: { type: "string" },
        },
      },
    },
  },
};

const validatePack = ajv.compile(packSchema);

export function validateDataPackV0(pack: DataPackV0) {
  if (!validatePack(pack)) {
    return { ok: false, errors: ajv.errorsText(validatePack.errors).split(", ") };
  }
  return { ok: true, errors: [] };
}
