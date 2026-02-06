/**
 * SYSTEM 0: Owner Intent Capture Tool
 * 
 * Captures and validates owner intent profile.
 * Detects contradictions (e.g., "want growth" + "no risk" + "no change").
 */

import { ownerIntentProfileSchema, type OwnerIntentProfile } from "../../schemas/decision_closure";

export const tool = {
  name: "intent.capture_v1",
  description: "Capture and validate owner intent profile for decision closure. Detects contradictions.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["primary_priority", "risk_appetite", "change_appetite", "time_horizon"],
    properties: {
      primary_priority: {
        type: "string",
        enum: ["stability", "profit", "growth", "time_relief", "predictability"],
        description: "The ONE primary priority (not multiple)",
      },
      risk_appetite: {
        type: "string",
        enum: ["low", "medium", "high"],
      },
      change_appetite: {
        type: "string",
        enum: ["incremental", "structural"],
      },
      non_negotiables: {
        type: "array",
        items: { type: "string" },
        maxItems: 5,
        description: "Hard constraints (e.g., 'no hiring', 'no price increases')",
      },
      time_horizon: {
        type: "string",
        enum: ["30_days", "90_days", "180_days", "365_days"],
      },
    },
  },
} as const;

export type CaptureIntentV1Args = {
  primary_priority: "stability" | "profit" | "growth" | "time_relief" | "predictability";
  risk_appetite: "low" | "medium" | "high";
  change_appetite: "incremental" | "structural";
  non_negotiables?: string[];
  time_horizon: "30_days" | "90_days" | "180_days" | "365_days";
};

type Contradiction = {
  detected: boolean;
  message: string;
  severity: "warning" | "error";
};

export async function handler(args: CaptureIntentV1Args): Promise<{
  profile: OwnerIntentProfile;
  contradictions: Contradiction[];
  valid: boolean;
}> {
  const profile: OwnerIntentProfile = {
    profile_version: "intent_v1",
    primary_priority: args.primary_priority,
    risk_appetite: args.risk_appetite,
    change_appetite: args.change_appetite,
    non_negotiables: args.non_negotiables ?? [],
    time_horizon: args.time_horizon,
    captured_at: new Date().toISOString(),
  };

  // Validate schema
  const validationResult = ownerIntentProfileSchema.safeParse(profile);
  if (!validationResult.success) {
    throw new Error(`Invalid intent profile: ${validationResult.error.message}`);
  }

  // Detect contradictions
  const contradictions: Contradiction[] = [];

  // Growth + low risk + incremental change
  if (args.primary_priority === "growth" && args.risk_appetite === "low" && args.change_appetite === "incremental") {
    contradictions.push({
      detected: true,
      message: "Growth priority conflicts with low risk + incremental change. Growth requires risk-taking.",
      severity: "error",
    });
  }

  // Stability + high risk
  if (args.primary_priority === "stability" && args.risk_appetite === "high") {
    contradictions.push({
      detected: true,
      message: "Stability priority conflicts with high risk appetite.",
      severity: "error",
    });
  }

  // Structural change + 30 day horizon
  if (args.change_appetite === "structural" && args.time_horizon === "30_days") {
    contradictions.push({
      detected: true,
      message: "Structural change cannot be completed in 30 days.",
      severity: "error",
    });
  }

  // Time relief + no hiring constraint
  const noHiringConstraint = args.non_negotiables?.some(
    (c) => c.toLowerCase().includes("no hiring") || c.toLowerCase().includes("no team")
  );
  if (args.primary_priority === "time_relief" && noHiringConstraint) {
    contradictions.push({
      detected: true,
      message: "Time relief priority conflicts with 'no hiring' constraint. Time relief often requires delegation.",
      severity: "warning",
    });
  }

  // Check for conflicting non-negotiables
  const lowerNonNeg = args.non_negotiables?.map((c) => c.toLowerCase()) ?? [];
  if (lowerNonNeg.includes("no price changes") && lowerNonNeg.includes("increase profit")) {
    contradictions.push({
      detected: true,
      message: "Non-negotiables conflict: 'no price changes' + 'increase profit' hard to achieve together.",
      severity: "warning",
    });
  }

  const hasErrors = contradictions.some((c) => c.severity === "error");

  return {
    profile,
    contradictions,
    valid: !hasErrors,
  };
}
