import { DataPackStats, DataPackV0, DataPackStatus } from "./data_pack_v0";
import { ParsedFile } from "./file_parsers";
import { parseFlexibleTimestampToISO } from "./dates";
import { parseFile } from "./file_parsers";
import { inferFileTypes } from "./file_inference";
import {
  CompanyPack,
  createEmptyCompanyPack,
  computePackReadiness,
  computePackLinks,
  type FileAttempt,
  type QuoteDoc,
  type InvoiceDoc,
  type CalendarEvent,
  type PaymentTxn,
  type ReceiptTxn,
  type CustomerDoc,
} from "./company_pack";

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /(\+?\d{1,2}[\s.-]?)?(\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/g;

function normalizeKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function buildNormalizedRow(row: Record<string, string>) {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    normalized[normalizeKey(key)] = value;
  }
  return normalized;
}

function pickValueFromNormalized(normalizedRow: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    const normalizedKey = normalizeKey(key);
    const value = normalizedRow[normalizedKey];
    if (value !== undefined && value !== "") return value;
  }
  return undefined;
}

function redactText(value: string) {
  return value.replace(EMAIL_RE, "[redacted]").replace(PHONE_RE, "[redacted]");
}

function cleanText(value?: string) {
  if (!value) return undefined;
  return redactText(value.toString().trim());
}

function parseNumber(value?: string) {
  if (!value) return undefined;
  const cleaned = value.toString().replace(/[$,]/g, "").trim();
  if (!cleaned) return undefined;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : undefined;
}

function parseDate(value?: string) {
  if (!value) return undefined;
  return parseFlexibleTimestampToISO(value);
}

function mapStatus(value?: string, type?: "quote" | "invoice" | "job" | "customer"): DataPackStatus | undefined {
  if (!value) return undefined;
  const raw = value.toLowerCase();
  if (type === "quote") {
    if (raw.includes("approved") || raw.includes("accepted") || raw.includes("converted")) return "approved";
    if (raw.includes("sent")) return "sent";
    if (raw.includes("rejected") || raw.includes("declined")) return "rejected";
    if (raw.includes("draft")) return "draft";
  }
  if (type === "invoice") {
    if (raw.includes("unpaid")) return "open";
    if (raw.includes("paid")) return "paid";
    if (raw.includes("overdue")) return "overdue";
    if (raw.includes("void")) return "void";
    if (raw.includes("open") || raw.includes("unpaid")) return "open";
  }
  if (type === "job") {
    if (raw.includes("complete")) return "completed";
    if (raw.includes("schedule")) return "scheduled";
    if (raw.includes("progress")) return "in_progress";
    if (raw.includes("cancel")) return "canceled";
  }
  if (type === "customer") {
    if (raw.includes("active")) return "open";
    if (raw.includes("inactive")) return "other";
  }
  return "other";
}

const DETECTORS = {
  quotes: ["quote", "estimate", "proposal"],
  invoices: ["invoice", "billing"],
  calendar: ["calendar", "event", "startdate", "starttime"],
  jobs: ["job", "appointment", "workorder", "schedule", "startdate", "starttime"],
  customers: ["customer", "client", "account"],
};

function detectCategory(headers: string[]) {
  const normalizedHeaders = headers.map(normalizeKey);
  const headerStr = normalizedHeaders.join(" ");
  const headerSet = new Set(normalizedHeaders);
  const score = (terms: string[]) =>
    terms.reduce((acc, term) => (headerStr.includes(normalizeKey(term)) ? acc + 1 : acc), 0);
  const scores = {
    quotes: score(DETECTORS.quotes),
    invoices: score(DETECTORS.invoices),
    calendar: score(DETECTORS.calendar),
    jobs: score(DETECTORS.jobs),
    customers: score(DETECTORS.customers),
  };

  // Strong disambiguation: invoices often contain "Quote ID" (linkage) which can tie with "quote" detectors.
  // If we see invoice-specific keys, always classify as invoices.
  const invoiceStrongKeys = [
    "invoice#",
    "invoiceid",
    "invoicenumber",
    "balance",
    "paidat",
    "paiddate",
    "amountdue",
    "amountpaid",
  ];
  if (invoiceStrongKeys.map(normalizeKey).some((key) => headerSet.has(key))) {
    return "invoices";
  }

  if (
    scores.calendar > 0 &&
    scores.jobs > 0 &&
    scores.calendar === scores.jobs &&
    (headerStr.includes("startdate") || headerStr.includes("starttime") || headerStr.includes("calendar"))
  ) {
    return "calendar";
  }
  const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [best, bestScore] = entries[0];
  if (bestScore <= 0) return "unknown";
  return best;
}

function pickValue(row: Record<string, string>, keys: string[], normalizedRow?: Record<string, string>) {
  return pickValueFromNormalized(normalizedRow ?? buildNormalizedRow(row), keys);
}

export function normalizeExportsToDataPack(parsed: ParsedFile[], sourceTool: string) {
  const pack: DataPackV0 = {
    version: "data_pack_v0",
    source_tool: sourceTool,
    created_at: new Date().toISOString(),
    customers: [],
    quotes: [],
    invoices: [],
    jobs: [],
  };

  const stats: DataPackStats = {
    files: parsed.length,
    rows: 0,
    quotes: 0,
    invoices: 0,
    jobs: 0,
    customers: 0,
    warnings: [],
    file_categories: {},
    rows_by_type: {},
    files_attempted: [],
  };

  parsed.forEach((file) => {
    const rows = file.rows ?? [];
    const headers = rows[0] ? Object.keys(rows[0]) : [];
    const category = detectCategory(headers);
    stats.file_categories = stats.file_categories ?? {};
    stats.file_categories[category] = (stats.file_categories[category] ?? 0) + 1;
    stats.files_attempted = stats.files_attempted ?? [];
    stats.files_attempted.push({
      filename: file.filename,
      type_guess: category,
      status: category === "unknown" ? "unknown" : "success",
    });
    if (category === "unknown") {
      stats.warnings.push(`Could not classify ${file.filename}`);
      return;
    }

    stats.rows += rows.length;

    for (const row of rows) {
      const normalizedRow = buildNormalizedRow(row);
      stats.rows_by_type = stats.rows_by_type ?? {};
      stats.rows_by_type[category] = (stats.rows_by_type[category] ?? 0) + 1;
      if (category === "quotes") {
        pack.quotes?.push({
          id: cleanText(
            pickValue(row, ["quoteid", "estimateid", "proposalid", "number"], normalizedRow)
          ),
          status: mapStatus(pickValue(row, ["status", "state"], normalizedRow), "quote"),
          created_at: parseDate(
            pickValue(row, ["createdat", "created", "date", "issuedat"], normalizedRow)
          ),
          approved_at: parseDate(
            pickValue(row, ["approvedat", "acceptedat", "convertedat"], normalizedRow)
          ),
          total: parseNumber(pickValue(row, ["total", "amount", "subtotal", "price"], normalizedRow)),
        });
        stats.quotes += 1;
        continue;
      }

      if (category === "invoices") {
        pack.invoices?.push({
          id: cleanText(
            pickValue(row, ["invoiceid", "invoice#", "invoicenumber", "number", "id", "invoice"], normalizedRow)
          ),
          related_quote_id: cleanText(
            pickValue(row, ["quoteid", "relatedquoteid", "estimateid"], normalizedRow)
          ),
          status: mapStatus(pickValue(row, ["status", "state"], normalizedRow), "invoice"),
          issued_at: parseDate(
            pickValue(row, [
              "issuedat",
              "issueddate",
              "invoicedate",
              "createdat",
              "createddate",
              "date",
              "dateissued",
            ], normalizedRow)
          ),
          paid_at: parseDate(
            pickValue(row, ["paidat", "paiddate", "markedpaiddate", "paymentdate", "closedat"], normalizedRow)
          ),
          total: parseNumber(
            pickValue(row, [
              "total",
              "total$",
              "totalamount",
              "amount",
              "balance",
              "balance$",
              "pretaxtotal$",
              "subtotal",
              "subtotal$",
            ], normalizedRow)
          ),
        });
        stats.invoices += 1;
        continue;
      }

      if (category === "jobs" || category === "calendar") {
        const startDate = pickValue(row, ["startdate", "scheduleddate", "date"], normalizedRow);
        const startTime = pickValue(row, ["starttime"], normalizedRow);
        const endDate = pickValue(row, ["enddate"], normalizedRow);
        const endTime = pickValue(row, ["endtime"], normalizedRow);
        const scheduled_at = parseFlexibleTimestampToISO(
          startDate && startTime ? `${startDate} ${startTime}` : startDate
        );
        const completed_at = parseFlexibleTimestampToISO(
          endDate && endTime ? `${endDate} ${endTime}` : endDate
        );
        pack.jobs?.push({
          id: cleanText(
            pickValue(
              row,
              ["jobid", "appointmentid", "workorderid", "eventid", "number"],
              normalizedRow
            ) ??
              `row_${stats.jobs + 1}`
          ),
          related_quote_id: cleanText(
            pickValue(row, ["quoteid", "relatedquoteid", "estimateid"], normalizedRow)
          ),
          status: mapStatus(pickValue(row, ["status", "state"], normalizedRow), "job"),
          scheduled_at: scheduled_at ?? parseDate(pickValue(row, ["scheduledat", "start"], normalizedRow)),
          completed_at:
            completed_at ?? parseDate(pickValue(row, ["completedat", "end", "closedat"], normalizedRow)),
          total: parseNumber(pickValue(row, ["total", "amount", "price"], normalizedRow)),
        });
        stats.jobs += 1;
        continue;
      }

      if (category === "customers") {
        pack.customers?.push({
          id: cleanText(pickValue(row, ["customerid", "clientid", "accountid", "id"], normalizedRow)),
          name: cleanText(pickValue(row, ["name", "customername", "company"], normalizedRow)),
          status: mapStatus(pickValue(row, ["status", "state"], normalizedRow), "customer"),
          created_at: parseDate(pickValue(row, ["createdat", "created", "date"], normalizedRow)),
          city: cleanText(pickValue(row, ["city"], normalizedRow)),
          state: cleanText(pickValue(row, ["state", "province"], normalizedRow)),
        });
        stats.customers += 1;
      }
    }
  });

  if (pack.quotes?.length === 0) delete pack.quotes;
  if (pack.invoices?.length === 0) delete pack.invoices;
  if (pack.jobs?.length === 0) delete pack.jobs;
  if (pack.customers?.length === 0) delete pack.customers;

  return { pack, stats };
}

export async function normalizeUploadBuffersToDataPack(
  files: Array<{ filename: string; buffer: Buffer }>,
  sourceTool: string
) {
  const attempted: NonNullable<DataPackStats["files_attempted"]> = [];
  const parsed: ParsedFile[] = [];

  for (const file of files) {
    try {
      parsed.push(await parseFile(file.filename, file.buffer));
    } catch (error) {
      attempted.push({
        filename: file.filename,
        type_guess: "unknown",
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const { pack, stats } = normalizeExportsToDataPack(parsed, sourceTool);
  stats.files_attempted = [...(stats.files_attempted ?? []), ...attempted];
  stats.files = files.length;
  stats.warnings = [
    ...(stats.warnings ?? []),
    ...attempted.map((entry) => `Could not parse ${entry.filename}: ${entry.error ?? "unknown error"}`),
  ];

  return { pack, stats };
}

// -----------------------------------------------------------------------------
// NEW: CompanyPack normalization (layered, multi-file, no short-circuit)
// -----------------------------------------------------------------------------

function mapRowToQuote(
  row: Record<string, string>,
  sourceFile: string,
  normalizedRow?: Record<string, string>
): QuoteDoc {
  const normalized = normalizedRow ?? buildNormalizedRow(row);
  return {
    id: cleanText(pickValue(row, ["quoteid", "estimateid", "proposalid", "number"], normalized)),
    status: mapStatus(pickValue(row, ["status", "state"], normalized), "quote"),
    created_at: parseDate(pickValue(row, ["createdat", "created", "date", "issuedat"], normalized)),
    approved_at: parseDate(pickValue(row, ["approvedat", "acceptedat", "convertedat"], normalized)),
    total: parseNumber(pickValue(row, ["total", "amount", "subtotal", "price"], normalized)),
    source_file: sourceFile,
  };
}

function mapRowToInvoice(
  row: Record<string, string>,
  sourceFile: string,
  normalizedRow?: Record<string, string>
): InvoiceDoc {
  const normalized = normalizedRow ?? buildNormalizedRow(row);
  return {
    id: cleanText(
      pickValue(row, ["invoiceid", "invoice#", "invoicenumber", "number", "id", "invoice"], normalized)
    ),
    related_quote_id: cleanText(pickValue(row, ["quoteid", "relatedquoteid", "estimateid"], normalized)),
    status: mapStatus(pickValue(row, ["status", "state"], normalized), "invoice"),
    issued_at: parseDate(
      pickValue(row, [
        "issuedat",
        "issueddate",
        "invoicedate",
        "createdat",
        "createddate",
        "date",
        "dateissued",
      ], normalized)
    ),
    paid_at: parseDate(pickValue(row, ["paidat", "paiddate", "markedpaiddate", "paymentdate", "closedat"], normalized)),
    total: parseNumber(
      pickValue(row, [
        "total",
        "total$",
        "totalamount",
        "amount",
        "balance",
        "balance$",
        "pretaxtotal$",
        "subtotal",
        "subtotal$",
      ], normalized)
    ),
    source_file: sourceFile,
  };
}

function mapRowToCalendarEvent(
  row: Record<string, string>,
  sourceFile: string,
  normalizedRow?: Record<string, string>
): CalendarEvent {
  const normalized = normalizedRow ?? buildNormalizedRow(row);
  const startDate = pickValue(row, ["startdate", "scheduleddate", "date"], normalized);
  const startTime = pickValue(row, ["starttime"], normalized);
  const endDate = pickValue(row, ["enddate"], normalized);
  const endTime = pickValue(row, ["endtime"], normalized);
  const scheduled_at = parseFlexibleTimestampToISO(
    startDate && startTime ? `${startDate} ${startTime}` : startDate
  );
  const completed_at = parseFlexibleTimestampToISO(
    endDate && endTime ? `${endDate} ${endTime}` : endDate
  );

  return {
    id: cleanText(
      pickValue(row, ["jobid", "appointmentid", "workorderid", "eventid", "number"], normalized) ?? undefined
    ),
    related_quote_id: cleanText(pickValue(row, ["quoteid", "relatedquoteid", "estimateid"], normalized)),
    status: mapStatus(pickValue(row, ["status", "state"], normalized), "job"),
    scheduled_at: scheduled_at ?? parseDate(pickValue(row, ["scheduledat", "start"], normalized)),
    completed_at: completed_at ?? parseDate(pickValue(row, ["completedat", "end", "closedat"], normalized)),
    title: cleanText(pickValue(row, ["title", "description", "name", "subject"], normalized)),
    source_file: sourceFile,
  };
}

function mapRowToPayment(
  row: Record<string, string>,
  sourceFile: string,
  normalizedRow?: Record<string, string>
): PaymentTxn {
  const normalized = normalizedRow ?? buildNormalizedRow(row);
  return {
    id: cleanText(pickValue(row, ["paymentid", "transactionid", "id", "reference"], normalized)),
    invoice_id: cleanText(pickValue(row, ["invoiceid", "invoice"], normalized)),
    amount: parseNumber(pickValue(row, ["amount", "total", "paid"], normalized)),
    payment_date: parseDate(pickValue(row, ["paymentdate", "date", "paidat", "received"], normalized)),
    method: cleanText(pickValue(row, ["method", "paymentmethod", "type"], normalized)),
    source_file: sourceFile,
  };
}

function mapRowToReceipt(
  row: Record<string, string>,
  sourceFile: string,
  normalizedRow?: Record<string, string>
): ReceiptTxn {
  const normalized = normalizedRow ?? buildNormalizedRow(row);
  return {
    id: cleanText(pickValue(row, ["receiptid", "expenseid", "id"], normalized)),
    vendor: cleanText(pickValue(row, ["vendor", "supplier", "merchant", "payee"], normalized)),
    amount: parseNumber(pickValue(row, ["amount", "total", "cost"], normalized)),
    date: parseDate(pickValue(row, ["date", "expensedate", "purchasedate"], normalized)),
    category: cleanText(pickValue(row, ["category", "type", "expensetype"], normalized)),
    source_file: sourceFile,
  };
}

function mapRowToCustomer(
  row: Record<string, string>,
  sourceFile: string,
  normalizedRow?: Record<string, string>
): CustomerDoc {
  const normalized = normalizedRow ?? buildNormalizedRow(row);
  return {
    id: cleanText(pickValue(row, ["customerid", "clientid", "accountid", "id"], normalized)),
    name: cleanText(pickValue(row, ["name", "customername", "company"], normalized)),
    status: mapStatus(pickValue(row, ["status", "state"], normalized), "customer"),
    created_at: parseDate(pickValue(row, ["createdat", "created", "date"], normalized)),
    city: cleanText(pickValue(row, ["city"], normalized)),
    state: cleanText(pickValue(row, ["state", "province"], normalized)),
    source_file: sourceFile,
  };
}

/**
 * Normalize multiple uploaded files into a CompanyPack with layered structure.
 * NEVER short-circuits: processes ALL files even if some fail.
 */
export async function normalizeToCompanyPack(
  files: Array<{ filename: string; buffer: Buffer }>,
  sourceTool: string
): Promise<CompanyPack> {
  const pack = createEmptyCompanyPack(sourceTool);

  // Track which types had files uploaded
  const filesUploadedByType = { invoices: false, quotes: false };

  // Process ALL files - no early returns
  for (const file of files) {
    const attempt: FileAttempt = {
      filename: file.filename,
      size: file.buffer.length,
      detected_types: [],
      status: "error",
      rows_parsed: 0,
    };

    try {
      // Parse the file
      const parsed = await parseFile(file.filename, file.buffer);
      const headers = parsed.rows[0] ? Object.keys(parsed.rows[0]) : [];
      const headersNormalized = headers.map(normalizeKey);

      // Infer file types
      const inferences = inferFileTypes({
        filename: file.filename,
        headers_normalized: headersNormalized,
      });

      attempt.detected_types = inferences.map((i) => ({
        type: i.type,
        confidence: i.confidence,
      }));

      const primaryType = inferences[0]?.type ?? "unknown";
      attempt.status = primaryType !== "unknown" ? "success" : "partial";

      // Track file type uploads
      if (primaryType === "invoices") filesUploadedByType.invoices = true;
      if (primaryType === "quotes") filesUploadedByType.quotes = true;

      // Map rows to appropriate layer
      let rowsParsed = 0;
      let dateOk = 0;
      let dateFail = 0;

      for (const row of parsed.rows) {
        rowsParsed++;
        const normalizedRow = buildNormalizedRow(row);

        if (primaryType === "quotes") {
          const doc = mapRowToQuote(row, file.filename, normalizedRow);
          pack.layers.intent_quotes = pack.layers.intent_quotes ?? [];
          pack.layers.intent_quotes.push(doc);
          if (doc.created_at) dateOk++;
          else dateFail++;
        } else if (primaryType === "invoices") {
          const doc = mapRowToInvoice(row, file.filename, normalizedRow);
          pack.layers.billing_invoices = pack.layers.billing_invoices ?? [];
          pack.layers.billing_invoices.push(doc);
          if (doc.issued_at) dateOk++;
          else dateFail++;
        } else if (primaryType === "calendar") {
          const doc = mapRowToCalendarEvent(row, file.filename, normalizedRow);
          pack.layers.schedule_events = pack.layers.schedule_events ?? [];
          pack.layers.schedule_events.push(doc);
          if (doc.scheduled_at) dateOk++;
          else dateFail++;
        } else if (primaryType === "payments") {
          const doc = mapRowToPayment(row, file.filename, normalizedRow);
          pack.layers.cash_payments = pack.layers.cash_payments ?? [];
          pack.layers.cash_payments.push(doc);
          if (doc.payment_date) dateOk++;
          else dateFail++;
        } else if (primaryType === "receipts") {
          const doc = mapRowToReceipt(row, file.filename, normalizedRow);
          pack.layers.cost_receipts = pack.layers.cost_receipts ?? [];
          pack.layers.cost_receipts.push(doc);
          if (doc.date) dateOk++;
          else dateFail++;
        } else if (primaryType === "crm_export") {
          const doc = mapRowToCustomer(row, file.filename, normalizedRow);
          pack.layers.crm_customers = pack.layers.crm_customers ?? [];
          pack.layers.crm_customers.push(doc);
          if (doc.created_at) dateOk++;
          else dateFail++;
        } else {
          // Unknown - store in unknown_tables
          pack.layers.unknown_tables = pack.layers.unknown_tables ?? [];
          const existing = pack.layers.unknown_tables.find((t) => t.filename === file.filename);
          if (!existing) {
            pack.layers.unknown_tables.push({
              filename: file.filename,
              headers,
              row_count: parsed.rows.length,
            });
          }
          break; // Only need to record once for unknown
        }
      }

      attempt.rows_parsed = rowsParsed;

      // Update recognition counts
      const typeKey = primaryType === "crm_export" ? "crm" : primaryType;
      if (typeKey in pack.recognition_summary.by_type) {
        const counts = pack.recognition_summary.by_type[typeKey as keyof typeof pack.recognition_summary.by_type];
        counts.files_seen += 1;
        counts.rows_total += parsed.rows.length;
        counts.rows_parsed += rowsParsed;
        counts.date_parse_success += dateOk;
        counts.date_parse_fail += dateFail;
      }
    } catch (error) {
      attempt.status = "error";
      attempt.error = error instanceof Error ? error.message : String(error);
      pack.recognition_summary.warnings.push(
        `Failed to parse ${file.filename}: ${attempt.error}`
      );
    }

    pack.files_attempted.push(attempt);
  }

  // Compute link matches
  pack.links = computePackLinks(pack);

  // Compute readiness
  pack.recognition_summary.readiness = computePackReadiness(pack, filesUploadedByType);

  return pack;
}

/**
 * Convert CompanyPack to DataPackV0 for backward compatibility
 */
export function companyPackToDataPack(companyPack: CompanyPack): { pack: DataPackV0; stats: DataPackStats } {
  const pack: DataPackV0 = {
    version: "data_pack_v0",
    source_tool: companyPack.source_tool,
    created_at: companyPack.created_at,
    quotes: (companyPack.layers.intent_quotes ?? []).map((q) => ({
      id: q.id,
      status: q.status,
      created_at: q.created_at,
      approved_at: q.approved_at,
      total: q.total,
    })),
    invoices: (companyPack.layers.billing_invoices ?? []).map((inv) => ({
      id: inv.id,
      related_quote_id: inv.related_quote_id,
      status: inv.status,
      issued_at: inv.issued_at,
      paid_at: inv.paid_at,
      total: inv.total,
    })),
    jobs: (companyPack.layers.schedule_events ?? []).map((evt) => ({
      id: evt.id,
      related_quote_id: evt.related_quote_id,
      status: evt.status,
      scheduled_at: evt.scheduled_at,
      completed_at: evt.completed_at,
      total: undefined,
    })),
    customers: (companyPack.layers.crm_customers ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      created_at: c.created_at,
      city: c.city,
      state: c.state,
    })),
  };

  // Remove empty arrays
  if (pack.quotes?.length === 0) delete pack.quotes;
  if (pack.invoices?.length === 0) delete pack.invoices;
  if (pack.jobs?.length === 0) delete pack.jobs;
  if (pack.customers?.length === 0) delete pack.customers;

  const stats: DataPackStats = {
    files: companyPack.files_attempted.length,
    rows: companyPack.files_attempted.reduce((sum, f) => sum + (f.rows_parsed ?? 0), 0),
    quotes: companyPack.layers.intent_quotes?.length ?? 0,
    invoices: companyPack.layers.billing_invoices?.length ?? 0,
    jobs: companyPack.layers.schedule_events?.length ?? 0,
    customers: companyPack.layers.crm_customers?.length ?? 0,
    warnings: companyPack.recognition_summary.warnings,
    file_categories: {
      quotes: companyPack.recognition_summary.by_type.quotes.files_seen,
      invoices: companyPack.recognition_summary.by_type.invoices.files_seen,
      calendar: companyPack.recognition_summary.by_type.calendar.files_seen,
      payments: companyPack.recognition_summary.by_type.payments.files_seen,
      receipts: companyPack.recognition_summary.by_type.receipts.files_seen,
      crm_export: companyPack.recognition_summary.by_type.crm.files_seen,
      unknown: companyPack.recognition_summary.by_type.unknown.files_seen,
    },
    files_attempted: companyPack.files_attempted.map((f) => ({
      filename: f.filename,
      type_guess: f.detected_types[0]?.type ?? "unknown",
      status: f.status === "error" ? "error" : "success",
      error: f.error,
    })),
  };

  return { pack, stats };
}

