import { describe, it, expect } from "vitest";
import {
  createManifest,
  markStepStart,
  markStepSuccess,
  markStepSkipped,
  markStepError,
  finalizeManifest,
  createInputFingerprint,
} from "../src/lib/intelligence/run_manifest";

describe("run_manifest", () => {
  it("creates manifest with all steps in pending state", () => {
    const manifest = createManifest("test-run-1", "workspace-1", "mock", "lock-1");

    expect(manifest.run_id).toBe("test-run-1");
    expect(manifest.workspace_id).toBe("workspace-1");
    expect(manifest.mode).toBe("mock");
    expect(manifest.lock_id).toBe("lock-1");
    expect(manifest.steps).toHaveLength(6);
    expect(manifest.steps.every((s) => s.status === "pending")).toBe(true);
  });

  it("marks step as running with start time", () => {
    let manifest = createManifest("test-run-1", "workspace-1", "mock");
    manifest = markStepStart(manifest, "build_snapshot_v2", "fingerprint-123");

    const step = manifest.steps.find((s) => s.step_name === "build_snapshot_v2");
    expect(step?.status).toBe("running");
    expect(step?.started_at).toBeDefined();
    expect(step?.input_fingerprint).toBe("fingerprint-123");
  });

  it("marks step as succeeded with output refs", () => {
    let manifest = createManifest("test-run-1", "workspace-1", "mock");
    manifest = markStepStart(manifest, "build_snapshot_v2");
    manifest = markStepSuccess(manifest, "build_snapshot_v2", ["output-1", "output-2"], "test note");

    const step = manifest.steps.find((s) => s.step_name === "build_snapshot_v2");
    expect(step?.status).toBe("succeeded");
    expect(step?.finished_at).toBeDefined();
    expect(step?.output_refs).toEqual(["output-1", "output-2"]);
    expect(step?.notes).toBe("test note");
  });

  it("marks step as skipped with reason", () => {
    let manifest = createManifest("test-run-1", "workspace-1", "mock");
    manifest = markStepSkipped(manifest, "infer_decision_v2", "Incomplete inputs");

    const step = manifest.steps.find((s) => s.step_name === "infer_decision_v2");
    expect(step?.status).toBe("skipped");
    expect(step?.finished_at).toBeDefined();
    expect(step?.notes).toBe("Incomplete inputs");
  });

  it("marks step as failed with error message", () => {
    let manifest = createManifest("test-run-1", "workspace-1", "mock");
    manifest = markStepStart(manifest, "build_business_profile");
    manifest = markStepError(manifest, "build_business_profile", "Network timeout");

    const step = manifest.steps.find((s) => s.step_name === "build_business_profile");
    expect(step?.status).toBe("failed");
    expect(step?.finished_at).toBeDefined();
    expect(step?.error_message).toBe("Network timeout");
  });

  it("records steps in order", () => {
    let manifest = createManifest("test-run-1", "workspace-1", "mock");
    manifest = markStepStart(manifest, "parse_normalize_pack");
    manifest = markStepSuccess(manifest, "parse_normalize_pack");
    manifest = markStepStart(manifest, "build_business_profile");
    manifest = markStepSuccess(manifest, "build_business_profile");

    const parseStep = manifest.steps.find((s) => s.step_name === "parse_normalize_pack");
    const profileStep = manifest.steps.find((s) => s.step_name === "build_business_profile");

    expect(parseStep?.status).toBe("succeeded");
    expect(profileStep?.status).toBe("succeeded");
  });

  it("handles skipped steps when gating occurs", () => {
    let manifest = createManifest("test-run-1", "workspace-1", "mock");
    manifest = markStepSuccess(manifest, "build_snapshot_v2");
    manifest = markStepSkipped(manifest, "infer_decision_v2", "Blocking warnings");
    manifest = markStepSkipped(manifest, "validate_conclusion_v2", "Inference was skipped");

    const inferStep = manifest.steps.find((s) => s.step_name === "infer_decision_v2");
    const validateStep = manifest.steps.find((s) => s.step_name === "validate_conclusion_v2");

    expect(inferStep?.status).toBe("skipped");
    expect(validateStep?.status).toBe("skipped");
  });

  it("finalizes manifest with timestamp", () => {
    let manifest = createManifest("test-run-1", "workspace-1", "mock");
    manifest = finalizeManifest(manifest);

    expect(manifest.finalized_at).toBeDefined();
  });

  it("creates stable fingerprints from aggregate metadata", () => {
    const fp1 = createInputFingerprint({
      file_names: ["invoices.csv", "quotes.csv"],
      row_counts: { invoices: 100, quotes: 50 },
      date_range: { start: "2024-01-01", end: "2024-12-31" },
    });

    const fp2 = createInputFingerprint({
      file_names: ["quotes.csv", "invoices.csv"], // different order
      row_counts: { invoices: 100, quotes: 50 },
      date_range: { start: "2024-01-01", end: "2024-12-31" },
    });

    expect(fp1).toBe(fp2); // Same data, same fingerprint

    const fp3 = createInputFingerprint({
      file_names: ["invoices.csv", "quotes.csv"],
      row_counts: { invoices: 101, quotes: 50 }, // different count
      date_range: { start: "2024-01-01", end: "2024-12-31" },
    });

    expect(fp1).not.toBe(fp3); // Different data, different fingerprint
  });
});
