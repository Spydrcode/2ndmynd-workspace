import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

import { describe, expect, it } from "vitest";

import { generateSynthPacks } from "../index";

function digestDir(dir: string): string {
  const files: string[] = [];
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile()) {
        files.push(full);
      }
    }
  }

  files.sort((a, b) => a.localeCompare(b));
  const hasher = crypto.createHash("sha256");
  for (const file of files) {
    hasher.update(path.relative(dir, file));
    hasher.update(fs.readFileSync(file));
  }
  return hasher.digest("hex");
}

describe("synth pack generator", () => {
  it("is deterministic for a fixed seed", () => {
    const rootA = fs.mkdtempSync(path.join(os.tmpdir(), "synth-pack-a-"));
    const rootB = fs.mkdtempSync(path.join(os.tmpdir(), "synth-pack-b-"));

    generateSynthPacks({
      out_dir: rootA,
      industries: ["agency", "saas_micro"],
      packs_per_industry: 1,
      seed: 1234,
      window_days: 90,
      anchor_date: "2026-02-01",
    });

    generateSynthPacks({
      out_dir: rootB,
      industries: ["agency", "saas_micro"],
      packs_per_industry: 1,
      seed: 1234,
      window_days: 90,
      anchor_date: "2026-02-01",
    });

    expect(digestDir(rootA)).toBe(digestDir(rootB));
  });

  it("emits required CSV files and excludes customers.csv", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "synth-pack-files-"));
    const generated = generateSynthPacks({
      out_dir: root,
      industries: ["professional_services"],
      packs_per_industry: 1,
      seed: 777,
      window_days: 90,
      anchor_date: "2026-02-01",
    });

    const packDir = generated[0].out_dir;
    expect(fs.existsSync(path.join(packDir, "pack.json"))).toBe(true);
    expect(fs.existsSync(path.join(packDir, "estimates.csv"))).toBe(true);
    expect(fs.existsSync(path.join(packDir, "invoices.csv"))).toBe(true);
    expect(fs.existsSync(path.join(packDir, "customers.csv"))).toBe(false);
  });

  it("does not emit obvious PII patterns", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "synth-pack-pii-"));
    generateSynthPacks({
      out_dir: root,
      industries: ["ecommerce_ops"],
      packs_per_industry: 1,
      seed: 888,
      window_days: 90,
      anchor_date: "2026-02-01",
    });

    const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
    const phonePattern = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/;

    const files: string[] = [];
    const stack = [root];
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) continue;
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) stack.push(full);
        else if (entry.isFile()) files.push(full);
      }
    }

    for (const file of files) {
      const content = fs.readFileSync(file, "utf8");
      expect(emailPattern.test(content)).toBe(false);
      expect(phonePattern.test(content)).toBe(false);
    }
  });
});
