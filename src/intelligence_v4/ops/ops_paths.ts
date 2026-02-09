import path from "node:path";

export function toFileStamp(value = new Date()): string {
  return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function toDateStamp(value = new Date()): string {
  return value.toISOString().slice(0, 10);
}

export function resolveSynthShipRoot(): string {
  return path.resolve(process.cwd(), "train", "ops", "synth_ship");
}

export function resolveSynthShipDir(stamp: string): string {
  return path.resolve(resolveSynthShipRoot(), stamp);
}

export function resolveRunIdsPath(shipDir: string): string {
  return path.resolve(shipDir, "run_ids.json");
}

export function resolveOpsManifestPath(shipDir: string): string {
  return path.resolve(shipDir, "ops_manifest.json");
}

export function resolveCandidatePromotionReportPath(shipDir: string): string {
  return path.resolve(shipDir, "candidate_promotion_report.json");
}

export function resolveReviewPackPath(dateStamp = toDateStamp()): string {
  return path.resolve(process.cwd(), "train", "curation", "review_packs", `review_pack_${dateStamp}.json`);
}

export function resolveDatasetsDir(): string {
  return path.resolve(process.cwd(), "train", "datasets");
}

export function resolveSynthesisDatasetPath(): string {
  return path.resolve(resolveDatasetsDir(), "stage_synthesis.jsonl");
}

export function resolveFineTuneRunsDir(): string {
  return path.resolve(process.cwd(), "train", "finetune_runs", "synthesis_decision");
}

export function resolveEvalsDir(): string {
  return path.resolve(process.cwd(), "evals");
}

export function resolveModelConfigPath(): string {
  return path.resolve(process.cwd(), "config", "intelligence_v4.models.json");
}
