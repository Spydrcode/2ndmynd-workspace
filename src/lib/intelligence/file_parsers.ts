import path from "node:path";
import { parse as parseCsv } from "csv-parse/sync";
import ExcelJS from "exceljs";

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

function cellToString(cell: ExcelJS.Cell): string {
  const value = cell.value;
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("result" in value && value.result !== null && value.result !== undefined) {
      return String(value.result);
    }
    return cell.text ?? "";
  }
  return String(value);
}

function buildHeaderNames(headerRow: ExcelJS.Row, columnCount: number) {
  const headers: string[] = [];
  let emptyCount = 0;
  for (let col = 1; col <= columnCount; col++) {
    const raw = headerRow.getCell(col).text?.trim() ?? "";
    if (raw) {
      headers.push(raw);
    } else {
      const name = emptyCount === 0 ? "__EMPTY" : `__EMPTY_${emptyCount}`;
      emptyCount += 1;
      headers.push(name);
    }
  }
  return headers;
}

export async function parseXlsxFile(filename: string, buffer: Buffer): Promise<ParsedFile> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return { filename, rows: [] };
  }

  const columnCount = sheet.columnCount;
  if (!columnCount) {
    return { filename, rows: [] };
  }

  const headerRow = sheet.getRow(1);
  const headers = buildHeaderNames(headerRow, columnCount);
  const normalizedHeaders = headers.map((header) => normalizeHeader(header));
  const rows: Record<string, string>[] = [];

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const normalized: Record<string, string> = {};
    let hasValues = false;

    for (let col = 1; col <= columnCount; col++) {
      const value = cellToString(row.getCell(col));
      if (value !== "") {
        hasValues = true;
      }
      normalized[normalizedHeaders[col - 1]] = value;
    }

    if (hasValues) {
      rows.push(normalized);
    }
  }

  return { filename, rows };
}

export async function parseFile(filename: string, buffer: Buffer): Promise<ParsedFile> {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".csv") return parseCsvFile(filename, buffer);
  if (ext === ".xlsx") return parseXlsxFile(filename, buffer);
  if (ext === ".xls") {
    throw new Error("XLS files are not supported. Please save as .xlsx.");
  }
  throw new Error(`Unsupported file type: ${ext}`);
}
