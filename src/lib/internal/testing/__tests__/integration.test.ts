/**
 * Integration test for internal testing system
 * 
 * Run with: npm test src/lib/internal/testing/__tests__/integration.test.ts
 */

import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Internal Testing - Integration", () => {
  const mockRunsDir = path.join(process.cwd(), "mock_runs");
  const jobsDir = path.join(mockRunsDir, "_jobs");

  beforeAll(() => {
    // Ensure directories exist
    fs.mkdirSync(jobsDir, { recursive: true });
  });

  it("should have mockgen package available", () => {
    const mockgenPath = path.join(process.cwd(), "packages", "mockgen", "package.json");
    expect(fs.existsSync(mockgenPath)).toBe(true);
    
    const pkg = JSON.parse(fs.readFileSync(mockgenPath, "utf-8"));
    expect(pkg.name).toBe("@2ndmynd/mockgen");
  });

  it("should have mock_runs directory structure", () => {
    expect(fs.existsSync(mockRunsDir)).toBe(true);
    expect(fs.existsSync(jobsDir)).toBe(true);
  });

  it("should be able to import mockgen modules", async () => {
    // Test dynamic import
    const { getIndustryTemplate } = await import("../../../../../packages/mockgen/src/industries");
    
    const hvac = getIndustryTemplate("hvac");
    expect(hvac).toBeTruthy();
    expect(hvac.key).toBe("hvac");
    expect(hvac.displayName).toContain("HVAC");
  });

  it("should validate environment setup", () => {
    // Check for required scripts in package.json
    const pkgPath = path.join(process.cwd(), "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    
    expect(pkg.dependencies).toHaveProperty("nanoid");
  });
});
