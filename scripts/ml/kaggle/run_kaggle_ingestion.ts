import fs from "node:fs";
import path from "node:path";

import { downloadDataset } from "./download_kaggle_dataset";
import { TRANSFORMERS, slugToDir, slugToOutput } from "./transformers";

type Args = {
  datasets: string[];
};

const DEFAULT_DATASETS = TRANSFORMERS.map((entry) => entry.slug);

function parseArgs(argv: string[]): Args {
  const args: Args = { datasets: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith("--")) continue;
    if (key === "--datasets" && value) {
      args.datasets = value.split(",").map((item) => item.trim()).filter(Boolean);
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const datasets = args.datasets.length > 0 ? args.datasets : DEFAULT_DATASETS;

  const supported = new Map(TRANSFORMERS.map((entry) => [entry.slug, entry.transformer]));

  for (const slug of datasets) {
    const transformer = supported.get(slug);
    if (!transformer) {
      console.warn(`No transformer registered for ${slug}. Skipping.`);
      continue;
    }

    const downloadedPath = downloadDataset(slug);
    if (!downloadedPath) {
      console.warn(`Download skipped for ${slug}.`);
      continue;
    }

    const targetDir = path.resolve(slugToDir(slug));
    try {
      fs.mkdirSync(targetDir, { recursive: true });
    } catch (error) {
      console.warn(`Failed to create target dir for ${slug}: ${targetDir}`);
      console.warn(error instanceof Error ? error.message : String(error));
    }

    try {
      for (const entry of fs.readdirSync(downloadedPath, { withFileTypes: true })) {
        const srcPath = path.join(downloadedPath, entry.name);
        const destPath = path.join(targetDir, entry.name);
        if (entry.isDirectory()) {
          fs.cpSync(srcPath, destPath, { recursive: true });
        } else {
          fs.copyFileSync(srcPath, destPath);
        }
      }
    } catch (error) {
      console.warn(`Copy failed for ${slug}.`);
      console.warn(error instanceof Error ? error.message : String(error));
    }

    const datasetPath = targetDir;
    const snapshots = transformer(datasetPath);
    if (snapshots.length === 0) {
      console.warn(`Transformer produced no snapshots for ${slug}.`);
      continue;
    }

    const outputPath = path.resolve(slugToOutput(slug));
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(snapshots, null, 2));
    console.log(`wrote ${snapshots.length} snapshots to ${outputPath}`);
  }
}

main();
