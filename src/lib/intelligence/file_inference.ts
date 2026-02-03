/**
 * File type inference via deterministic scoring
 * Returns ranked file type guesses with confidence and reasons
 */

export type InferredFileType =
  | "quotes"
  | "invoices"
  | "calendar"
  | "payments"
  | "receipts"
  | "crm_export"
  | "unknown";

export type FileTypeConfidence = "high" | "medium" | "low";

export type FileTypeInference = {
  type: InferredFileType;
  confidence: FileTypeConfidence;
  reasons: string[];
  score: number;
};

export type InferFileTypesInput = {
  filename: string;
  headers_normalized: string[];
  sample_rows?: Array<Record<string, unknown>>;
};

// Header token patterns for each file type
const TYPE_PATTERNS: Record<InferredFileType, { required: string[]; optional: string[]; negative: string[] }> = {
  quotes: {
    required: ["quote", "estimate", "proposal"],
    optional: ["quoteid", "estimateid", "proposalid", "createdat", "approvedat", "total", "status", "sentat"],
    negative: ["invoice", "paid", "payment"],
  },
  invoices: {
    required: ["invoice"],
    optional: ["invoiceid", "invoicenumber", "issuedat", "paidat", "paid", "total", "balance", "status", "duedate"],
    negative: ["quote", "estimate", "proposal"],
  },
  calendar: {
    required: ["startdate", "starttime", "event", "appointment", "schedule"],
    optional: ["enddate", "endtime", "duration", "title", "description", "location"],
    negative: ["invoice", "quote", "payment"],
  },
  payments: {
    required: ["payment", "transaction"],
    optional: ["paymentid", "amount", "paymentdate", "method", "reference", "received"],
    negative: ["quote", "estimate"],
  },
  receipts: {
    required: ["receipt", "expense", "cost", "purchase"],
    optional: ["vendor", "supplier", "amount", "date", "category", "description"],
    negative: ["quote", "invoice", "customer"],
  },
  crm_export: {
    required: ["customer", "client", "contact", "account", "lead"],
    optional: ["name", "email", "phone", "address", "company", "status"],
    negative: ["invoice", "quote", "payment"],
  },
  unknown: {
    required: [],
    optional: [],
    negative: [],
  },
};

// Alternative header matches (synonyms)
const HEADER_SYNONYMS: Record<string, string[]> = {
  quotes: ["quote", "estimate", "proposal", "bid"],
  invoices: ["invoice", "bill", "billing"],
  calendar: ["calendar", "schedule", "event", "appointment", "job", "visit", "workorder"],
  payments: ["payment", "transaction", "receipt"],
  receipts: ["receipt", "expense", "purchase", "cost"],
  crm_export: ["customer", "client", "contact", "account", "lead"],
};

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function scoreType(
  type: InferredFileType,
  headers: string[],
  filename: string
): { score: number; reasons: string[] } {
  const patterns = TYPE_PATTERNS[type];
  if (!patterns) return { score: 0, reasons: [] };

  const headerStr = headers.join(" ");
  const filenameNorm = normalizeHeader(filename);
  const reasons: string[] = [];
  let score = 0;

  // Check filename hints
  const synonyms = HEADER_SYNONYMS[type] ?? [];
  for (const syn of synonyms) {
    if (filenameNorm.includes(syn)) {
      score += 10;
      reasons.push(`Filename contains "${syn}"`);
      break;
    }
  }

  // Check required patterns (any match gives points)
  for (const req of patterns.required) {
    if (headerStr.includes(req)) {
      score += 8;
      reasons.push(`Header contains "${req}"`);
    }
  }

  // Check optional patterns
  for (const opt of patterns.optional) {
    if (headerStr.includes(opt)) {
      score += 3;
      reasons.push(`Header contains "${opt}"`);
    }
  }

  // Negative patterns reduce score
  for (const neg of patterns.negative) {
    if (headerStr.includes(neg)) {
      score -= 5;
      reasons.push(`Header contains conflicting "${neg}"`);
    }
  }

  // Special case: calendar detection with date+time columns
  if (type === "calendar") {
    const hasStartDate = headers.some((h) => h.includes("startdate") || h.includes("start"));
    const hasStartTime = headers.some((h) => h.includes("starttime") || h.includes("time"));
    if (hasStartDate && hasStartTime) {
      score += 15;
      reasons.push("Has both start date and time columns");
    }
    // Jobs with dates often are calendar-like
    if (headers.some((h) => h.includes("job") || h.includes("appointment"))) {
      score += 5;
      reasons.push("Has job/appointment column");
    }
  }

  // Special case: invoices often have "paid" or "balance" columns
  if (type === "invoices") {
    if (headers.some((h) => h.includes("paid") || h.includes("balance"))) {
      score += 5;
      reasons.push("Has payment tracking columns");
    }
  }

  return { score, reasons };
}

function confidenceFromScore(score: number): FileTypeConfidence {
  if (score >= 20) return "high";
  if (score >= 10) return "medium";
  return "low";
}

/**
 * Infer file types from headers and filename
 * Returns top 1-2 candidates with confidence scores
 */
export function inferFileTypes(input: InferFileTypesInput): FileTypeInference[] {
  const headers = input.headers_normalized.map(normalizeHeader);
  const types: InferredFileType[] = ["quotes", "invoices", "calendar", "payments", "receipts", "crm_export"];

  const results: FileTypeInference[] = types
    .map((type) => {
      const { score, reasons } = scoreType(type, headers, input.filename);
      return {
        type,
        confidence: confidenceFromScore(score),
        reasons,
        score,
      };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);

  // Return top 2 if they're close in score, otherwise just top 1
  if (results.length === 0) {
    return [{ type: "unknown", confidence: "low", reasons: ["No matching patterns found"], score: 0 }];
  }

  if (results.length >= 2 && results[1].score >= results[0].score * 0.7) {
    return results.slice(0, 2);
  }

  return results.slice(0, 1);
}

/**
 * Get the best single file type inference
 */
export function inferBestFileType(input: InferFileTypesInput): InferredFileType {
  const inferences = inferFileTypes(input);
  return inferences[0]?.type ?? "unknown";
}
