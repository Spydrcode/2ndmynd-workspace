/**
 * Export quotes to CSV matching pack_normalizer format
 */

import type { Customer, GeneratedDataset } from "../../types";

export function exportQuotesCSV(dataset: GeneratedDataset): string {
  const { quotes, customers } = dataset;
  
  // Build customer lookup
  const customerMap = new Map<string, Customer>();
  customers.forEach((c) => customerMap.set(c.id, c));
  
  // Headers matching pack_normalizer expectations
  const headers = [
    "Quote ID",
    "Created At",
    "Approved At",
    "Status",
    "Total",
    "Customer Name",
    "Customer Email",
    "Customer Phone",
    "Job Type",
  ];
  
  const rows = quotes.map((quote) => {
    const customer = customerMap.get(quote.customer_id);
    return [
      quote.id,
      formatDateTime(quote.created_at),
      quote.approved_at ? formatDateTime(quote.approved_at) : "",
      quote.status,
      quote.amount_estimate.toFixed(2),
      customer?.name ?? "Unknown",
      customer?.email ?? "",
      customer?.phone ?? "",
      quote.job_type,
    ];
  });
  
  // Convert to CSV
  const csvLines = [headers.join(",")];
  for (const row of rows) {
    csvLines.push(row.map((v) => escapeCSV(v)).join(","));
  }
  
  return csvLines.join("\n");
}

function formatDateTime(isoString: string): string {
  const d = new Date(isoString);
  // Format: YYYY-MM-DD HH:MM:SS
  return d.toISOString().replace("T", " ").substring(0, 19);
}

function escapeCSV(value: string | number): string {
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
