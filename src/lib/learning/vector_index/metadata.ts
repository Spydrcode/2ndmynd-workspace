export type VectorMetadataValue = string | number | boolean | null | string[];
export type VectorMetadata = Record<string, VectorMetadataValue>;

export const METADATA_ALLOWLIST = new Set([
  "source",
  "industry_key",
  "window_rule",
  "mapping_confidence_level",
  "pressure_keys",
  "boundary_class",
  "run_id",
  "created_at",
  "embedding_model",
  "embedding_dim",
]);

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isAllowedValue(value: unknown): value is VectorMetadataValue {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null ||
    isStringArray(value)
  );
}

export function sanitizeMetadata(metadata: Record<string, unknown>): {
  clean: VectorMetadata;
  removedKeys: string[];
} {
  const clean: VectorMetadata = {};
  const removedKeys: string[] = [];

  for (const [key, value] of Object.entries(metadata)) {
    if (!METADATA_ALLOWLIST.has(key)) {
      removedKeys.push(key);
      continue;
    }
    if (!isAllowedValue(value)) {
      removedKeys.push(key);
      continue;
    }
    clean[key] = value;
  }

  return { clean, removedKeys };
}
