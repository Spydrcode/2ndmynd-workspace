import * as fs from "fs";
import * as path from "path";
import type { ModelEntry } from "../logging/log_types";
import { assertValid, validateModelEntry } from "../schemas/validators";

export type ModelRegistry = {
  champion_model_id: string | null;
  candidate_model_id: string | null;
  history: ModelEntry[];
};

const registryPath = path.join(process.cwd(), "ml", "registry", "model_registry.json");

export function loadRegistry(): ModelRegistry {
  const raw = fs.readFileSync(registryPath, "utf-8");
  return JSON.parse(raw) as ModelRegistry;
}

export function saveRegistry(registry: ModelRegistry): void {
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));
}

export function setChampion(model_id: string): void {
  const registry = loadRegistry();
  registry.champion_model_id = model_id;
  saveRegistry(registry);
}

export function setCandidate(model_id: string | null): void {
  const registry = loadRegistry();
  registry.candidate_model_id = model_id;
  saveRegistry(registry);
}

export function addHistoryEntry(entry: ModelEntry): void {
  assertValid(validateModelEntry, entry, "ModelEntry");
  const registry = loadRegistry();
  registry.history.push(entry);
  saveRegistry(registry);
}
