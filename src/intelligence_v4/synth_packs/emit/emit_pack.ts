import fs from "node:fs";
import path from "node:path";

import type { GeneratedSynthPack } from "../schemas";
import { toCsv } from "./csv_writer";

export function emitSynthPack(pack: GeneratedSynthPack, outDir: string): {
  dir: string;
  manifest_path: string;
  invoices_path: string;
  estimates_path: string;
  schedule_path?: string;
} {
  fs.mkdirSync(outDir, { recursive: true });

  const manifestPath = path.resolve(outDir, "pack.json");
  const estimatesPath = path.resolve(outDir, "estimates.csv");
  const invoicesPath = path.resolve(outDir, "invoices.csv");
  const schedulePath = path.resolve(outDir, "schedule.csv");

  fs.writeFileSync(manifestPath, JSON.stringify(pack.manifest, null, 2));
  fs.writeFileSync(
    estimatesPath,
    toCsv(pack.csv.estimates, ["EstimateID", "Status", "CreatedAt", "ApprovedAt", "Total"])
  );
  fs.writeFileSync(
    invoicesPath,
    toCsv(pack.csv.invoices, ["InvoiceID", "QuoteID", "Status", "IssuedAt", "PaidAt", "Total"])
  );

  if (pack.csv.schedule && pack.csv.schedule.length > 0) {
    fs.writeFileSync(
      schedulePath,
      toCsv(pack.csv.schedule, ["JobID", "QuoteID", "Status", "StartDate", "StartTime", "EndDate", "EndTime", "Total"])
    );
  } else if (fs.existsSync(schedulePath)) {
    fs.rmSync(schedulePath, { force: true });
  }

  return {
    dir: outDir,
    manifest_path: manifestPath,
    estimates_path: estimatesPath,
    invoices_path: invoicesPath,
    schedule_path: pack.csv.schedule && pack.csv.schedule.length > 0 ? schedulePath : undefined,
  };
}
