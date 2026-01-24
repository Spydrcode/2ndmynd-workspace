export type BucketLabel = "clean" | "mixed" | "counterexample" | "fallback";

type Meta = {
  fallback_applied?: boolean;
  is_counterexample?: boolean;
  has_counter_pattern?: boolean;
  mixed_signatures?: boolean;
  signature_count?: number;
  counterexample?: boolean;
  mixed?: boolean;
};

export function bucketForMeta(meta?: Meta | null) {
  if (!meta || (meta as { bucket_unknown?: boolean }).bucket_unknown === true) {
    return { bucket: "clean" as BucketLabel, unknown: true };
  }

  const hasSignals =
    meta.fallback_applied !== undefined ||
    meta.is_counterexample !== undefined ||
    meta.has_counter_pattern !== undefined ||
    meta.mixed_signatures !== undefined ||
    meta.signature_count !== undefined ||
    meta.counterexample !== undefined ||
    meta.mixed !== undefined;

  if (meta.fallback_applied === true) {
    return { bucket: "fallback" as BucketLabel, unknown: false };
  }

  if (meta.is_counterexample === true || meta.has_counter_pattern === true || meta.counterexample === true) {
    return { bucket: "counterexample" as BucketLabel, unknown: false };
  }

  if (meta.mixed_signatures === true || (meta.signature_count ?? 0) >= 2 || meta.mixed === true) {
    return { bucket: "mixed" as BucketLabel, unknown: false };
  }

  return { bucket: "clean" as BucketLabel, unknown: !hasSignals };
}
