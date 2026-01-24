import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

type Args = {
  dataset?: string;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith("--")) continue;
    switch (key) {
      case "--slug":
        if (value) args.dataset = value;
        break;
      case "--dataset":
        if (value) args.dataset = value;
        break;
      default:
        break;
    }
  }
  return args;
}

function copyDir(src: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

export function downloadDataset(slug: string) {
  const python = "python";
  const script = `
import kagglehub
path = kagglehub.dataset_download("${slug}")
print(path)
`;

  const result = spawnSync(python, ["-c", script], { encoding: "utf8" });
  if (result.error) {
    console.warn("kaggle download skipped: python not available.");
    return null;
  }
  if (result.status !== 0) {
    console.warn("kaggle download skipped: kagglehub unavailable or download failed.");
    console.warn(result.stderr.trim());
    return null;
  }

  const downloadedPath = result.stdout.trim();
  if (!downloadedPath) {
    console.warn("kaggle download skipped: no output path returned.");
    return null;
  }

  console.log(`Downloaded Kaggle dataset ${slug} to ${downloadedPath}`);
  return downloadedPath;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.dataset) {
    console.error("Missing --dataset <dataset-slug>.");
    process.exit(1);
  }

  const downloadedPath = downloadDataset(args.dataset);
  if (!downloadedPath) {
    process.exit(0);
  }

  const outDir = path.resolve("seed", "kaggle", args.dataset);
  try {
    copyDir(downloadedPath, outDir);
    console.log(`Copied dataset to ${outDir}`);
  } catch (error) {
    console.warn("Copy failed; dataset remains in Kaggle cache.");
    console.warn(error instanceof Error ? error.message : String(error));
  }
}

main();
