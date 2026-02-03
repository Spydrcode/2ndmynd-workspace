import fs from "node:fs";
import path from "node:path";
import minimist from "minimist";
import type { TrainExample } from "../logging/log_types";
import { assertValid, validateTrainExample } from "../schemas/validators";

type Stats = {
  total: number;
  bySplit: Record<string, number>;
  byTag: Record<string, number>;
};

function readJsonl(filePath: string): TrainExample[] {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, "utf-8").split(/\r?\n/).filter((line) => line.trim().length > 0);
  return lines.map((line) => JSON.parse(line) as TrainExample);
}

function writeJsonl(filePath: string, items: TrainExample[]) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const content = items.map((item) => JSON.stringify(item)).join("\n") + (items.length > 0 ? "\n" : "");
  fs.writeFileSync(filePath, content);
}

function buildStats(items: TrainExample[]): Stats {
  const bySplit: Record<string, number> = {};
  const byTag: Record<string, number> = {};
  for (const item of items) {
    bySplit[item.split] = (bySplit[item.split] ?? 0) + 1;
    for (const tag of item.tags) {
      byTag[tag] = (byTag[tag] ?? 0) + 1;
    }
  }
  return { total: items.length, bySplit, byTag };
}

function seededRandom(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function splitHoldout(
  items: TrainExample[],
  ratio: number,
  seed: number
): { train: TrainExample[]; holdout: TrainExample[] } {
  const rand = seededRandom(seed);
  const shuffled = [...items].sort(() => rand() - 0.5);
  const holdoutCount = Math.max(1, Math.floor(shuffled.length * ratio));
  return {
    holdout: shuffled.slice(0, holdoutCount),
    train: shuffled.slice(holdoutCount),
  };
}

async function run() {
  const args = minimist(process.argv.slice(2));
  const goldPath = args.gold ?? path.join(process.cwd(), "ml", "datasets", "gold", "gold.jsonl");
  const growthPath = args.growth ?? path.join(process.cwd(), "ml", "datasets", "growth", "growth.jsonl");
  const trainOut = args.train_out ?? path.join(process.cwd(), "ml", "finetune", "train.jsonl");
  const holdoutOut = args.holdout_out ?? path.join(process.cwd(), "ml", "finetune", "eval_holdout.jsonl");
  const holdoutRatio = Number(args.holdout_ratio ?? "0.1");
  const seed = Number(args.seed ?? "42");
  const force = args.force === true;

  const gold = readJsonl(goldPath);
  const growth = readJsonl(growthPath);
  const combined = [...gold, ...growth];

  for (const item of combined) {
    assertValid(validateTrainExample, item, "TrainExample");
  }

  let holdoutExisting: TrainExample[] = [];
  if (fs.existsSync(holdoutOut) && !force) {
    holdoutExisting = readJsonl(holdoutOut);
  }

  const holdoutIds = new Set(holdoutExisting.map((item) => item.id));
  const remaining = combined.filter((item) => !holdoutIds.has(item.id));

  let holdout = holdoutExisting;
  let train = remaining;
  if (holdoutExisting.length === 0 || force) {
    const split = splitHoldout(remaining, holdoutRatio, seed);
    holdout = split.holdout;
    train = split.train;
  }

  writeJsonl(trainOut, train);
  writeJsonl(holdoutOut, holdout);

  const trainStats = buildStats(train);
  const holdoutStats = buildStats(holdout);
  console.log(
    JSON.stringify(
      {
        train_out: trainOut,
        holdout_out: holdoutOut,
        train_stats: trainStats,
        holdout_stats: holdoutStats,
      },
      null,
      2
    )
  );
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
