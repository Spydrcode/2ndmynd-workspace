import { DataPackStats, DataPackV0, DataPackStatus } from "./data_pack_v0";
import { ParsedFile } from "./file_parsers";

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /(\+?\d{1,2}[\s.-]?)?(\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/g;

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
  const cleaned = value.toString().trim();
  if (!cleaned) return undefined;
  const date = new Date(cleaned);
  if (Number.isNaN(date.getTime())) {
    // Common export format: "YYYY-MM-DD HH:MM:SS"
    const isoLike = cleaned.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/)
      ? `${cleaned.replace(" ", "T")}Z`
      : null;
    if (isoLike) {
      const retry = new Date(isoLike);
      return Number.isNaN(retry.getTime()) ? undefined : retry.toISOString();
    }
  }
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
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
  jobs: ["job", "appointment", "workorder"],
  customers: ["customer", "client", "account"],
};

function detectCategory(headers: string[]) {
  const headerStr = headers.join(" ");
  const score = (terms: string[]) =>
    terms.reduce((acc, term) => (headerStr.includes(term) ? acc + 1 : acc), 0);
  const scores = {
    quotes: score(DETECTORS.quotes),
    invoices: score(DETECTORS.invoices),
    jobs: score(DETECTORS.jobs),
    customers: score(DETECTORS.customers),
  };
  const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [best, bestScore] = entries[0];
  if (bestScore <= 0) return "unknown";
  return best;
}

function pickValue(row: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== "") return row[key];
  }
  return undefined;
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
  };

  parsed.forEach((file) => {
    const headers = file.rows[0] ? Object.keys(file.rows[0]) : [];
    const category = detectCategory(headers);
    stats.file_categories = stats.file_categories ?? {};
    stats.file_categories[category] = (stats.file_categories[category] ?? 0) + 1;
    if (category === "unknown") {
      stats.warnings.push(`Could not classify ${file.filename}`);
      return;
    }

    stats.rows += file.rows.length;

    for (const row of file.rows) {
      if (category === "quotes") {
        pack.quotes?.push({
          id: cleanText(pickValue(row, ["quoteid", "estimateid", "proposalid", "number"])),
          status: mapStatus(pickValue(row, ["status", "state"]), "quote"),
          created_at: parseDate(pickValue(row, ["createdat", "created", "date", "issuedat"])),
          approved_at: parseDate(pickValue(row, ["approvedat", "acceptedat", "convertedat"])),
          total: parseNumber(pickValue(row, ["total", "amount", "subtotal", "price"])),
        });
        stats.quotes += 1;
        continue;
      }

      if (category === "invoices") {
        pack.invoices?.push({
          id: cleanText(
            pickValue(row, ["invoiceid", "invoice#", "invoicenumber", "number", "id", "invoice"])
          ),
          status: mapStatus(pickValue(row, ["status", "state"]), "invoice"),
          issued_at: parseDate(
            pickValue(row, [
              "issuedat",
              "issueddate",
              "invoicedate",
              "createdat",
              "createddate",
              "date",
              "dateissued",
            ])
          ),
          paid_at: parseDate(
            pickValue(row, ["paidat", "paiddate", "markedpaiddate", "paymentdate", "closedat"])
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
            ])
          ),
        });
        stats.invoices += 1;
        continue;
      }

      if (category === "jobs") {
        pack.jobs?.push({
          id: cleanText(pickValue(row, ["jobid", "appointmentid", "workorderid", "number"])),
          status: mapStatus(pickValue(row, ["status", "state"]), "job"),
          scheduled_at: parseDate(pickValue(row, ["scheduledat", "start", "date"])),
          completed_at: parseDate(pickValue(row, ["completedat", "end", "closedat"])),
          total: parseNumber(pickValue(row, ["total", "amount", "price"])),
        });
        stats.jobs += 1;
        continue;
      }

      if (category === "customers") {
        pack.customers?.push({
          id: cleanText(pickValue(row, ["customerid", "clientid", "accountid", "id"])),
          name: cleanText(pickValue(row, ["name", "customername", "company"])),
          status: mapStatus(pickValue(row, ["status", "state"]), "customer"),
          created_at: parseDate(pickValue(row, ["createdat", "created", "date"])),
          city: cleanText(pickValue(row, ["city"])),
          state: cleanText(pickValue(row, ["state", "province"])),
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
