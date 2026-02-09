function escapeCell(value: string): string {
  if (value.includes(",") || value.includes("\n") || value.includes("\"")) {
    return `"${value.replace(/\"/g, '""')}"`;
  }
  return value;
}

export function toCsv<T extends Record<string, string>>(rows: T[], columns: Array<keyof T>): string {
  const header = columns.join(",");
  const body = rows.map((row) => columns.map((column) => escapeCell(String(row[column] ?? ""))).join(","));
  return [header, ...body].join("\n") + "\n";
}
