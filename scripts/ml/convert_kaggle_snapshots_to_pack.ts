import fs from "node:fs";
import path from "node:path";

import { TRANSFORMERS, slugToDir } from "./kaggle/transformers";

const DEFAULT_OUT = "ml_artifacts/kaggle_pack_v1.jsonl";

type Args = {
  datasets: string[];
  out: string;
  tags?: string[];
};

function parseArgs(argv: string[]): Args {
  const args: Args = { datasets: [], out: DEFAULT_OUT };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith("--")) continue;
    switch (key) {
      case "--dataset":
        if (value) args.datasets.push(value);
        break;
      case "--datasets":
        if (value) {
          args.datasets.push(
            ...value
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean)
          );
        }
        break;
      case "--out":
        if (value) args.out = value;
        break;
      case "--tags":
        if (value) args.tags = value.split(",").map((item) => item.trim()).filter(Boolean);
        break;
      default:
        break;
    }
  }
  return args;
}

function ensureDir(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const datasets = args.datasets.length
    ? args.datasets
    : TRANSFORMERS.map((entry) => entry.slug);

  const outPath = path.resolve(args.out);
  ensureDir(outPath);

  const lines: string[] = [];
  let total = 0;

  for (const slug of datasets) {
    const entry = TRANSFORMERS.find((item) => item.slug === slug);
    if (!entry) {
      console.warn(`No transformer registered for ${slug}`);
      continue;
    }

    const datasetPath = slugToDir(slug);
    if (!fs.existsSync(datasetPath)) {
      console.warn(`Missing dataset dir: ${datasetPath}`);
      continue;
    }

    const snapshots = entry.transformer(datasetPath);
    for (const snapshot of snapshots) {
      lines.push(
        JSON.stringify({
          id: `${slug.replace(/[\/]/g, "_")}_${total + 1}`,
          source: "kaggle_transform",
          dataset_slug: slug,
          tags: args.tags ?? ["kaggle"],
          input_snapshot: snapshot,
        })
      );
      total += 1;
    }
  }

  fs.writeFileSync(outPath, lines.join("\n") + (lines.length ? "\n" : ""));
  console.log(`Wrote ${total} pack rows to ${outPath}`);
  console.log("Note: snapshots are snapshot_v1; run_dataset_v2 requires --allow_v1 for these.");
}

main().catch((error) => {
  console.error("Kaggle pack conversion failed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
