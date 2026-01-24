export type SnapshotV1 = {
  snapshot_version: "snapshot_v1";
  pii_scrubbed: true;
  signals: Record<string, string>;
};

export type TransformResult = {
  source_dataset: string;
  snapshot: SnapshotV1;
  meta: Record<string, unknown>;
};
