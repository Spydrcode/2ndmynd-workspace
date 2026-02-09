import fs from "node:fs";
import path from "node:path";

export type SynthShipManifest = {
  version: "synth_ship_v1";
  generated_at: string;
  status: "completed" | "awaiting_approval" | "candidate_ready" | "failed";
  args: Record<string, unknown>;
  run_ids_index_path: string | null;
  review_pack_path: string | null;
  dataset: {
    path: string;
    row_count: number;
    sha256: string | null;
  };
  fine_tune: {
    attempted: boolean;
    dry_run: boolean;
    run_dir: string | null;
    training_file_path: string | null;
    run_manifest_path: string | null;
    job_id: string | null;
  };
  evals: {
    attempted: boolean;
    passed: boolean | null;
    report_path: string | null;
    totals: { fixtures: number; passed: number; failed: number } | null;
  };
  promotion: {
    attempted: boolean;
    promoted: boolean;
    report_path: string | null;
    model_card_path: string | null;
    old_model_id: string | null;
    new_model_id: string | null;
  };
  pinned_model: {
    before: string | null;
    after: string | null;
  };
  next_action: string;
  logs: Array<{ at: string; level: string; message: string }>;
  errors: string[];
};

export function writeOpsManifest(manifestPath: string, manifest: SynthShipManifest): string {
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return manifestPath;
}
