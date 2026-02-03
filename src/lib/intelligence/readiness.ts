/**
 * Readiness gating - determines if we have enough data to produce business conclusions
 */

export type ReadinessLevel = "blocked" | "partial" | "ready";

export type ReadinessInput = {
  files_uploaded: number;
  quotes_recognized: number;
  invoices_recognized: number;
  invoices_file_uploaded: boolean;
  quotes_file_uploaded: boolean;
};

export type ReadinessReport = {
  level: ReadinessLevel;
  reason?: string;
  diagnose_mode: boolean;
  suppress_inference: boolean;
};

/**
 * Compute readiness for analysis
 *
 * Rules:
 * - If invoices file uploaded BUT invoices_recognized == 0 => "partial" (diagnose mode)
 * - If both quotes and invoices missing => "blocked"
 * - If both quotes and invoices recognized => "ready"
 * - Otherwise => "partial" (limited artifact)
 */
export function computeReadiness(input: ReadinessInput): ReadinessReport {
  // Critical failure: invoices uploaded but none recognized
  if (input.invoices_file_uploaded && input.invoices_recognized === 0) {
    return {
      level: "partial",
      reason: "Invoices file uploaded but no invoices recognized. Check date formats and column headers.",
      diagnose_mode: true,
      suppress_inference: true,
    };
  }

  // Critical failure: quotes uploaded but none recognized
  if (input.quotes_file_uploaded && input.quotes_recognized === 0) {
    return {
      level: "partial",
      reason: "Quotes file uploaded but no quotes recognized. Check date formats and column headers.",
      diagnose_mode: true,
      suppress_inference: false,
    };
  }

  // Blocked: no data at all
  if (input.quotes_recognized === 0 && input.invoices_recognized === 0) {
    return {
      level: "blocked",
      reason: "No quotes or invoices recognized from uploaded files.",
      diagnose_mode: true,
      suppress_inference: true,
    };
  }

  if (input.quotes_recognized > 0 && input.invoices_recognized > 0) {
    return {
      level: "ready",
      diagnose_mode: false,
      suppress_inference: false,
    };
  }

  return {
    level: "partial",
    reason: "Some inputs were recognized, but coverage is incomplete.",
    diagnose_mode: true,
    suppress_inference: false,
  };
}
