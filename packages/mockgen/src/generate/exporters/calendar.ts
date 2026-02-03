/**
 * Export calendar events to CSV matching pack_normalizer format
 */

import type { CalendarEvent, GeneratedDataset } from "../../types";

export function exportCalendarCSV(dataset: GeneratedDataset): string {
  const { calendar_events } = dataset;
  
  // Headers matching pack_normalizer expectations
  const headers = [
    "Event ID",
    "Job ID",
    "Tech",
    "Start",
    "End",
    "Title",
  ];
  
  const rows = calendar_events.map((event) => {
    return [
      event.id,
      event.job_id,
      event.tech,
      formatDateTime(event.start),
      formatDateTime(event.end),
      event.title,
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
