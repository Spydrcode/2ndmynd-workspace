import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { SnapshotV2 } from "../../lib/decision/v2/conclusion_schema_v2";

type Args = {
  input: string;
  out: string;
  source?: string;
  tags?: string[];
};

const DEFAULTS: Args = {
  input: "ml_artifacts/valid_decision_v2.jsonl",
  out: "ml_artifacts/decision_v2_pack.jsonl",
  source: "synthetic_v2",
};

function parseArgs(argv: string[]): Args {
  const args: Args = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith("--")) continue;
    switch (key) {
      case "--in":
        if (value) args.input = value;
        break;
      case "--out":
        if (value) args.out = value;
        break;
      case "--source":
        if (value) args.source = value;
        break;
      case "--tags":
        if (value) args.tags = value.split(",").map((t) => t.trim()).filter(Boolean);
        break;
      default:
        break;
    }
  }
  return args;
}

function extractSnapshot(line: string): SnapshotV2 | null {
  try {
    const obj = JSON.parse(line);
    const user = obj?.messages?.find((m: any) => m.role === "user");
    if (!user?.content) return null;
    const snapshot = JSON.parse(user.content);
    if (snapshot?.snapshot_version === "snapshot_v2") return snapshot as SnapshotV2;
  } catch {
    return null;
  }
  return null;
}

function ensureDir(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function sha256(text: string) {
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = path.resolve(args.input);
  if (!fs.existsSync(inputPath)) {
    console.error(`Missing input: ${inputPath}`);
    process.exit(1);
  }

  const lines = fs.readFileSync(inputPath, "utf8").split(/\r?\n/).filter(Boolean);
  const outPath = path.resolve(args.out);
  ensureDir(outPath);

  let written = 0;
  const out: string[] = [];
  for (const line of lines) {
    const snapshot = extractSnapshot(line);
    if (!snapshot) continue;
    const id = `snap_${sha256(JSON.stringify(snapshot))}`;
    out.push(
      JSON.stringify({
        id,
        source: args.source ?? "synthetic_v2",
        tags: args.tags ?? ["synthetic"],
        input_snapshot: snapshot,
      })
    );
    written += 1;
  }

  fs.writeFileSync(outPath, out.join("\n") + (out.length ? "\n" : ""));
  console.log(`Wrote ${written} pack rows to ${outPath}`);
}

main().catch((error) => {
  console.error("Decision v2 JSONL conversion failed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
