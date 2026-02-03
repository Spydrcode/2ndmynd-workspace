/**
 * Export invoices to CSV matching pack_normalizer format
 */

import type { InvoiceItem, Job, Quote, Customer, GeneratedDataset } from "../../types";

export function exportInvoicesCSV(dataset: GeneratedDataset): string {
  const { invoices, invoice_items, jobs, quotes, customers } = dataset;
  
  // Build lookups
  const itemsByInvoice = new Map<string, InvoiceItem[]>();
  invoice_items.forEach((item) => {
    if (!itemsByInvoice.has(item.invoice_id)) {
      itemsByInvoice.set(item.invoice_id, []);
    }
    itemsByInvoice.get(item.invoice_id)!.push(item);
  });
  
  const jobMap = new Map<string, Job>();
  jobs.forEach((j) => jobMap.set(j.id, j));
  
  const quoteMap = new Map<string, Quote>();
  quotes.forEach((q) => quoteMap.set(q.id, q));
  
  const customerMap = new Map<string, Customer>();
  customers.forEach((c) => customerMap.set(c.id, c));
  
  // Headers matching pack_normalizer expectations
  const headers = [
    "Invoice ID",
    "Quote ID",
    "Job ID",
    "Issued At",
    "Due At",
    "Paid At",
    "Status",
    "Subtotal",
    "Tax",
    "Total",
    "Customer Name",
    "Customer Email",
    "Line Items",
  ];
  
  const rows = invoices.map((invoice) => {
    const job = jobMap.get(invoice.job_id);
    const quote = job ? quoteMap.get(job.quote_id) : undefined;
    const customer = quote ? customerMap.get(quote.customer_id) : undefined;
    
    const items = itemsByInvoice.get(invoice.id) ?? [];
    const lineItemsStr = items
      .map((item) => `${item.name} (${item.qty} @ $${item.unit_price})`)
      .join("; ");
    
    return [
      invoice.id,
      invoice.quote_id,
      invoice.job_id,
      formatDateTime(invoice.issued_at),
      formatDateTime(invoice.due_at),
      invoice.paid_at ? formatDateTime(invoice.paid_at) : "",
      invoice.status,
      invoice.subtotal.toFixed(2),
      invoice.tax.toFixed(2),
      invoice.total.toFixed(2),
      customer?.name ?? "Unknown",
      customer?.email ?? "",
      lineItemsStr,
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
  return d.toISOString().replace("T", " ").substring(0, 19);
}

function escapeCSV(value: string | number): string {
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
