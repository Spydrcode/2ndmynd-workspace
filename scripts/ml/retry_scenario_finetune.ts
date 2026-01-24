import fs from "node:fs";
import path from "node:path";

import { exportDatasetToJsonl } from "./export_dataset_to_jsonl";

require("dotenv").config();

async function main() {
  const datasetName = "scenario_train_v1";
  const outputPath = "./ml_artifacts/scenario_train_v1.jsonl";

  console.log(`Re-exporting dataset ${datasetName} to ${outputPath}`);
  await exportDatasetToJsonl({ name: datasetName, out: outputPath });

  console.log("Starting new finetune job...");
  // Run the finetune command
  const { spawn } = require("child_process");
  const child = spawn("npm", ["run", "ml:finetune:scenario"], { stdio: "inherit" });
  child.on("close", (code: number) => {
    process.exit(code);
  });
}

main().catch((error) => {
  console.error("Retry failed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});