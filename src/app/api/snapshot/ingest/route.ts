import crypto from "node:crypto";

import { parse } from "csv-parse/sync";
import { NextResponse } from "next/server";

import { safeParseDate, safeParseMoney, normalizeStatus } from "@/lib/snapshot/buckets";
import { InvoiceRecordSchema, QuoteRecordSchema } from "@/lib/snapshot/schema";
import { writeJSON } from "@/lib/snapshot/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEMO_SHAPE_TO_COHORT: Record<string, string> = {
  typical: "local_service_general",
  small_job_heavy: "local_service_high_volume",
  high_concentration: "local_service_project_heavy",
};

function normalizeHeader(raw: string) {
  return (raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCsvToNormalizedRows(csvText: string) {
  const records = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    trim: true,
    relax_column_count: true,
  }) as Array<Record<string, unknown>>;

  return records.map((row) => {
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
      const nk = normalizeHeader(key);
      if (!nk) continue;
      normalized[nk] = String(value ?? "").trim();
    }
    return normalized;
  });
}

function getFirstField(row: Record<string, string>, candidates: string[]) {
  for (const candidate of candidates) {
    const value = row[candidate];
    if (value && value.trim()) return value.trim();
  }
  return null;
}

async function fileToText(value: FormDataEntryValue) {
  if (typeof value === "string") return value;
  const buf = Buffer.from(await value.arrayBuffer());
  return buf.toString("utf8");
}

export async function POST(request: Request) {
  const formData = await request.formData();

  const demoShapeRaw = formData.get("demo_shape_id");
  const demoShapeId = typeof demoShapeRaw === "string" ? demoShapeRaw.trim() : "";
  const mappedCohortId = demoShapeId ? DEMO_SHAPE_TO_COHORT[demoShapeId] : undefined;

  const cohortIdRaw = formData.get("cohort_id");
  const cohortId =
    mappedCohortId ??
    (typeof cohortIdRaw === "string" && cohortIdRaw.trim()
      ? cohortIdRaw.trim()
      : "local_service_general");

  const quotesFile = formData.get("quotes_csv");
  const invoicesFile = formData.get("invoices_csv");

  if (!quotesFile && !invoicesFile) {
    return NextResponse.json(
      {
        ok: false,
        code: "MISSING_INPUT",
        message: "Upload at least one export (quotes or invoices) to generate a snapshot.",
      },
      { status: 400 }
    );
  }

  const runId = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  const quotes = (() => {
    if (!quotesFile) return [];
    const csvTextPromise = fileToText(quotesFile);
    return csvTextPromise.then((csvText) => {
      const rows = parseCsvToNormalizedRows(csvText);
      const parsed = rows
        .map((row, index) => {
          const quoteId =
            getFirstField(row, ["quote id", "quoteid", "estimate id", "estimateid", "id"]) ??
            `quote_${runId}_${index + 1}`;
          const createdAtIso = safeParseDate(
            getFirstField(row, [
              "created at",
              "created",
              "created on",
              "date",
              "quote date",
              "created date",
            ]) ?? ""
          );
          const amount = safeParseMoney(
            getFirstField(row, [
              "total",
              "total amount",
              "amount",
              "quoted amount",
              "price",
              "subtotal",
            ]) ?? ""
          );
          if (!createdAtIso || amount === null) return null;

          const status = normalizeStatus(getFirstField(row, ["status", "state", "quote status"]) ?? "", "quote");
          const approvedAt = safeParseDate(
            getFirstField(row, ["approved at", "approved", "accepted at", "accepted date", "won at"]) ??
              ""
          );

          const candidate = {
            quote_id: quoteId,
            created_at: createdAtIso,
            quoted_amount: amount,
            status,
            approved_at: approvedAt,
          };

          const validated = QuoteRecordSchema.safeParse(candidate);
          return validated.success ? validated.data : null;
        })
        .filter(Boolean);

      return parsed;
    });
  })();

  const invoices = (() => {
    if (!invoicesFile) return [];
    const csvTextPromise = fileToText(invoicesFile);
    return csvTextPromise.then((csvText) => {
      const rows = parseCsvToNormalizedRows(csvText);
      const parsed = rows
        .map((row, index) => {
          const invoiceId =
            getFirstField(row, ["invoice id", "invoiceid", "id"]) ?? `invoice_${runId}_${index + 1}`;
          const createdAtIso = safeParseDate(
            getFirstField(row, [
              "created at",
              "created",
              "created on",
              "date",
              "invoice date",
              "created date",
            ]) ?? ""
          );
          const amount = safeParseMoney(
            getFirstField(row, ["total", "total amount", "amount", "invoice amount", "price", "subtotal"]) ??
              ""
          );
          if (!createdAtIso || amount === null) return null;

          const status = normalizeStatus(
            getFirstField(row, ["status", "state", "invoice status"]) ?? "",
            "invoice"
          );
          const paidAt = safeParseDate(
            getFirstField(row, ["paid at", "paid", "date paid", "payment date"]) ?? ""
          );
          const relatedQuoteId =
            getFirstField(row, ["quote id", "quoteid", "related quote id", "estimate id", "estimateid"]) ??
            null;

          const candidate = {
            invoice_id: invoiceId,
            created_at: createdAtIso,
            invoice_amount: amount,
            status,
            paid_at: paidAt,
            related_quote_id: relatedQuoteId,
          };

          const validated = InvoiceRecordSchema.safeParse(candidate);
          return validated.success ? validated.data : null;
        })
        .filter(Boolean);

      return parsed;
    });
  })();

  const [quotesResolved, invoicesResolved] = await Promise.all([quotes, invoices]);

  await writeJSON(runId, "meta.json", { cohort_id: cohortId, created_at: createdAt });
  await writeJSON(runId, "input.json", { cohort_id: cohortId, quotes: quotesResolved, invoices: invoicesResolved });

  return NextResponse.json({ runId });
}
