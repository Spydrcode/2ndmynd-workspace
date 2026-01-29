import {
  ConclusionV2,
  SnapshotV2,
  validateConclusionV2,
  validateEvidenceSignalsAgainstSnapshotV2,
} from "../../lib/decision/v2/conclusion_schema_v2";

export const tool = {
  name: "decision.validate_v2",
  description: "Validate a conclusion_v2 object against schema and evidence grounding.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["snapshot", "conclusion"],
    properties: {
      snapshot: { type: "object" },
      conclusion: { type: "object" },
    },
  },
} as const;

export type ValidateConclusionV2Args = {
  snapshot: SnapshotV2;
  conclusion: ConclusionV2;
};

export function handler(args: ValidateConclusionV2Args) {
  const schema = validateConclusionV2(args.conclusion);
  const grounding = validateEvidenceSignalsAgainstSnapshotV2(
    args.snapshot,
    args.conclusion.evidence_signals
  );
  return {
    ok: schema.ok && grounding.ok,
    errors: [...schema.errors, ...grounding.errors],
  };
}
