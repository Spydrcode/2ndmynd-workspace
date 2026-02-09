import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

describe("results page confirm wiring", () => {
  it("wires an onConfirmValue handler into CoherenceView through the client panel", () => {
    const panelPath = path.resolve("src/app/app/results/[run_id]/CoherencePanelClient.tsx");
    const pagePath = path.resolve("src/app/app/results/[run_id]/page.tsx");

    const panelSource = fs.readFileSync(panelPath, "utf8");
    const pageSource = fs.readFileSync(pagePath, "utf8");

    expect(panelSource).toMatch(/onConfirmValue=\{onConfirmValue\}/);
    expect(panelSource).toMatch(/fetch\(`\/api\/internal\/runs\/\$\{run_id\}\/intent-overrides`/);
    expect(pageSource).toMatch(/<CoherencePanelClient/);
  });
});
