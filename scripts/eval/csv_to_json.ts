import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";

function parseArgs() {
  const argv = process.argv.slice(2);
  const inIndex = argv.indexOf("--in");
  const outIndex = argv.indexOf("--out");
  const input = inIndex >= 0 ? argv[inIndex + 1] : argv[0];
  const out = outIndex >= 0 ? argv[outIndex + 1] : "tmp/out.json";
  if (!input) {
    console.error("Usage: tsx csv_to_json.ts --in file.csv --out out.json");
    process.exit(1);
  }
  return { input, out };
}

function readCsv(file: string) {
  const raw = fs.readFileSync(path.resolve(file), "utf8");
  const rows = parse(raw, { columns: true, skip_empty_lines: true, relax_column_count: true, trim: true }) as Record<string,string>[];
  return rows;
}

async function main() {
  const { input, out } = parseArgs();
  if (!fs.existsSync(input)) {
    console.error("Input not found:", input);
    process.exit(1);
  }
  const rows = readCsv(input);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(rows, null, 2));
  console.log(`Wrote ${out} (${rows.length} rows)`);
}

main().catch(e=>{ console.error(e instanceof Error?e.message:String(e)); process.exit(1); });
