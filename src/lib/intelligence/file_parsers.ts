import path from "node:path";
import { parse as parseCsv } from "csv-parse/sync";
import * as XLSX from "xlsx";

export type ParsedFile = {
  filename: string;
  rows: Record<string, string>[];
};

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[\s_\-()/]+/g, "").trim();
}

export function parseCsvFile(filename: string, buffer: Buffer): ParsedFile {
  const text = buffer.toString("utf8");
  const records = parseCsv(text, { columns: true, skip_empty_lines: true }) as Record<string, string>[];
  return {
    filename,
    rows: records.map((row) => {
      const normalized: Record<string, string> = {};
      for (const key of Object.keys(row)) {
        normalized[normalizeHeader(key)] = row[key];
      }
      return normalized;
    }),
  };
}

export function parseXlsxFile(filename: string, buffer: Buffer): ParsedFile {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    return { filename, rows: [] };
  }
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  return {
    filename,
    rows: json.map((row) => {
      const normalized: Record<string, string> = {};
      for (const [key, value] of Object.entries(row)) {
        normalized[normalizeHeader(key)] = value === null ? "" : String(value);
      }
      return normalized;
    }),
  };
}

export function parseFile(filename: string, buffer: Buffer): ParsedFile {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".csv") return parseCsvFile(filename, buffer);
  if (ext === ".xlsx" || ext === ".xls") return parseXlsxFile(filename, buffer);
  throw new Error(`Unsupported file type: ${ext}`);
}
