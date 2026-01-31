import { NextResponse } from "next/server";

import { loadBaseline } from "@/lib/snapshot/baseline";
import { loadCalibrationDefaults } from "@/lib/snapshot/calibration";
import { COHORTS } from "@/lib/snapshot/cohorts";
import { compareToBaseline } from "@/lib/snapshot/deviation";
import { compareToHealthyEnvelope, loadHealthyEnvelope } from "@/lib/snapshot/healthy";
import { generateNarrative } from "@/lib/snapshot/insight_engine";
import { computeCompanyProfile } from "@/lib/snapshot/profile";
import { InvoiceRecordSchema, QuoteRecordSchema } from "@/lib/snapshot/schema";
import { buildArtifact } from "@/lib/snapshot/text";
import { deleteFile, readJSON, runExists, writeJSON } from "@/lib/snapshot/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { runId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, code: "INVALID_INPUT", message: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const runId = typeof body.runId === "string" ? body.runId.trim() : "";
  if (!runId) {
    return NextResponse.json(
      { ok: false, code: "INVALID_INPUT", message: "Missing runId." },
      { status: 400 }
    );
  }

  if (!(await runExists(runId))) {
    return NextResponse.json(
      { ok: false, code: "NOT_FOUND", message: "Snapshot run not found." },
      { status: 404 }
    );
  }

  let input: { cohort_id?: string; quotes?: unknown; invoices?: unknown } | null = null;
  try {
    input = await readJSON(runId, "input.json");
  } catch {
    // If input.json is gone, assume this run was already computed.
    return NextResponse.json({ runId, resultUrl: `/app/snapshot/result/${runId}` });
  }

  const cohortId =
    typeof input?.cohort_id === "string" && input.cohort_id.trim()
      ? input.cohort_id.trim()
      : "local_service_general";

  const quotesCandidate = Array.isArray(input?.quotes) ? input.quotes : [];
  const invoicesCandidate = Array.isArray(input?.invoices) ? input.invoices : [];

  const quotesParsed = QuoteRecordSchema.array().safeParse(quotesCandidate);
  const invoicesParsed = InvoiceRecordSchema.array().safeParse(invoicesCandidate);

  const quotes = quotesParsed.success ? quotesParsed.data : [];
  const invoices = invoicesParsed.success ? invoicesParsed.data : [];

  if (quotes.length === 0 && invoices.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        code: "EMPTY_INPUT",
        message:
          "No usable rows were found in your exports. Try re-exporting quotes/invoices and generate a fresh snapshot.",
      },
      { status: 400 }
    );
  }

  const companyProfile = computeCompanyProfile({
    runId,
    quotes,
    invoices,
  });

  const config = COHORTS[cohortId];
  if (!config) {
    return NextResponse.json(
      {
        ok: false,
        code: "UNKNOWN_COHORT",
        message: "Unknown cohort configuration. This run cannot be computed.",
      },
      { status: 400 }
    );
  }

  const [baseline, envelope, calibration] = await Promise.all([
    loadBaseline(config.baseline_id),
    loadHealthyEnvelope(config.envelope_id),
    loadCalibrationDefaults(config.calibration_id ?? "defaults_v1"),
  ]);

  const deviation = compareToBaseline(companyProfile, baseline, calibration.recommended_delta_thresholds);
  const healthComparison = compareToHealthyEnvelope(companyProfile, envelope);

  const narrative = generateNarrative({
    company: companyProfile,
    baseline,
    envelope,
    deviation,
    health: healthComparison,
  });

  const deviationWithNarrative = {
    ...deviation,
    deviation_notes: narrative.insights,
    recommended_decision: narrative.recommended_decision,
  };

  const artifact = buildArtifact({
    company: companyProfile,
    baseline,
    deviation: deviationWithNarrative,
    envelope,
    health: healthComparison,
    narrative,
  });

  await writeJSON(runId, "companyProfile.json", companyProfile);
  await writeJSON(runId, "deviationSummary.json", deviationWithNarrative);
  await writeJSON(runId, "healthComparison.json", healthComparison);
  await writeJSON(runId, "artifact.json", artifact);

  await deleteFile(runId, "input.json");

  return NextResponse.json({ runId, resultUrl: `/app/snapshot/result/${runId}` });
}
