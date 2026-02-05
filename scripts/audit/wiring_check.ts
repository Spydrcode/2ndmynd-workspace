#!/usr/bin/env tsx
/**
 * Wiring Check: Critical Test Suite Runner
 * 
 * Runs the core tests that verify the system's wiring:
 * - MCP tool registry contract
 * - RAG safety invariants
 * - E2E mock run pipeline
 * - E2E learning capture/train/infer
 * 
 * Outputs a summary table and writes results to runs/audit/wiring_check.json
 */

import { spawnSync } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

interface TestResult {
  name: string;
  command: string;
  status: "PASS" | "FAIL" | "SKIP";
  exitCode: number | null;
  stdout: string;
  stderr: string;
  duration: number;
  error?: string;
}

interface WiringCheckReport {
  timestamp: string;
  passed: number;
  failed: number;
  skipped: number;
  results: TestResult[];
  warnings: string[];
  dependencies: {
    vitest: boolean;
    python: boolean;
    node: string;
  };
}

const TESTS = [
  {
    name: "MCP Tool Registry Contract",
    command: "npx",
    args: ["vitest", "run", "mcp/__tests__/tool_registry.test.ts"],
    requirePython: false,
  },
  {
    name: "RAG Safety Invariants",
    command: "npx",
    args: ["vitest", "run", "src/lib/rag/__tests__/integration.test.ts"],
    requirePython: false,
  },
  {
    name: "E2E Mock Run Pipeline",
    command: "npx",
    args: ["vitest", "run", "src/lib/intelligence/__tests__/run_analysis.test.ts"],
    requirePython: false,
  },
  {
    name: "E2E Learning Smoke Test",
    command: "npx",
    args: ["vitest", "run", "src/lib/learning/__tests__/build_training_example_v1.test.ts"],
    requirePython: true,
  },
];

function checkDependency(command: string): boolean {
  try {
    const result = spawnSync(command, ["--version"], {
      encoding: "utf8",
      shell: true,
      timeout: 5000,
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

function checkPython(): boolean {
  // Try python first, then py (Windows)
  let result = spawnSync("python", ["--version"], {
    encoding: "utf8",
    shell: true,
    timeout: 5000,
  });
  
  if (result.status !== 0) {
    result = spawnSync("py", ["--version"], {
      encoding: "utf8",
      shell: true,
      timeout: 5000,
    });
  }
  
  return result.status === 0;
}

function runTest(test: typeof TESTS[0], hasPython: boolean): TestResult {
  const startTime = Date.now();
  
  // Skip Python tests if Python not available and not required
  if (test.requirePython && !hasPython) {
    const requirePythonWiring = process.env.REQUIRE_PYTHON_WIRING === "1";
    
    if (requirePythonWiring) {
      return {
        name: test.name,
        command: `${test.command} ${test.args.join(" ")}`,
        status: "FAIL",
        exitCode: null,
        stdout: "",
        stderr: "Python required but not found",
        duration: Date.now() - startTime,
        error: "REQUIRE_PYTHON_WIRING=1 but Python not available",
      };
    }
    
    return {
      name: test.name,
      command: `${test.command} ${test.args.join(" ")}`,
      status: "SKIP",
      exitCode: null,
      stdout: "",
      stderr: "Python not available (optional)",
      duration: Date.now() - startTime,
    };
  }
  
  console.log(`\n▶ Running: ${test.name}...`);
  
  const result = spawnSync(test.command, test.args, {
    encoding: "utf8",
    shell: true,
    timeout: 120000, // 2 minutes
  });
  
  const duration = Date.now() - startTime;
  const status = result.status === 0 ? "PASS" : "FAIL";
  
  return {
    name: test.name,
    command: `${test.command} ${test.args.join(" ")}`,
    status,
    exitCode: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    duration,
    error: result.error ? result.error.message : undefined,
  };
}

function printSummaryTable(results: TestResult[]): void {
  console.log("\n");
  console.log("═".repeat(80));
  console.log("  WIRING CHECK SUMMARY");
  console.log("═".repeat(80));
  console.log("");
  
  const maxNameLength = Math.max(...results.map(r => r.name.length));
  
  console.log(`${"TEST".padEnd(maxNameLength + 2)} STATUS   DURATION`);
  console.log("─".repeat(80));
  
  for (const result of results) {
    const statusIcon = result.status === "PASS" ? "✅" : result.status === "FAIL" ? "❌" : "⊘";
    const statusText = result.status.padEnd(7);
    const durationText = `${(result.duration / 1000).toFixed(2)}s`;
    
    console.log(`${result.name.padEnd(maxNameLength + 2)} ${statusIcon} ${statusText} ${durationText}`);
    
    if (result.status === "FAIL" && result.stderr) {
      const errorPreview = result.stderr.split("\n").slice(0, 3).join("\n");
      console.log(`  └─ ${errorPreview.replace(/\n/g, "\n     ")}`);
    }
  }
  
  console.log("─".repeat(80));
  
  const passed = results.filter(r => r.status === "PASS").length;
  const failed = results.filter(r => r.status === "FAIL").length;
  const skipped = results.filter(r => r.status === "SKIP").length;
  
  console.log(`  TOTAL: ${results.length}  |  PASS: ${passed}  |  FAIL: ${failed}  |  SKIP: ${skipped}`);
  console.log("═".repeat(80));
  console.log("");
}

async function main(): Promise<void> {
  console.log("🔌 2ndmynd Wiring Check");
  console.log("─".repeat(80));
  
  // Check dependencies
  console.log("\n📦 Checking dependencies...");
  
  const hasVitest = checkDependency("npx vitest");
  const hasPython = checkPython();
  const nodeVersion = process.version;
  
  console.log(`  Node:   ${nodeVersion} ✅`);
  console.log(`  vitest: ${hasVitest ? "✅" : "❌"}`);
  console.log(`  Python: ${hasPython ? "✅" : "⊘ (optional)"}`);
  
  const warnings: string[] = [];
  
  if (!hasVitest) {
    console.log("\n❌ vitest not found. Run: npm install");
    process.exit(1);
  }
  
  if (!hasPython) {
    warnings.push("Python not found. Learning tests will be skipped.");
    console.log("\n⚠️  Python not found. Learning tests will be skipped.");
    console.log("    To install Python:");
    console.log("      - Windows: Download from python.org or run: winget install Python.Python.3.11");
    console.log("      - macOS: brew install python");
    console.log("      - Linux: sudo apt install python3");
    console.log("    Then install dependencies:");
    console.log("      python -m venv .venv");
    console.log("      .venv/Scripts/activate  # Windows");
    console.log("      source .venv/bin/activate  # macOS/Linux");
    console.log("      pip install scikit-learn numpy pandas matplotlib");
    
    const requirePythonWiring = process.env.REQUIRE_PYTHON_WIRING === "1";
    if (requirePythonWiring) {
      console.log("\n❌ REQUIRE_PYTHON_WIRING=1 but Python not available");
      process.exit(1);
    }
  }
  
  // Run tests
  const results: TestResult[] = [];
  
  for (const test of TESTS) {
    const result = runTest(test, hasPython);
    results.push(result);
  }
  
  // Print summary
  printSummaryTable(results);
  
  // Generate report
  const report: WiringCheckReport = {
    timestamp: new Date().toISOString(),
    passed: results.filter(r => r.status === "PASS").length,
    failed: results.filter(r => r.status === "FAIL").length,
    skipped: results.filter(r => r.status === "SKIP").length,
    results,
    warnings,
    dependencies: {
      vitest: hasVitest,
      python: hasPython,
      node: nodeVersion,
    },
  };
  
  // Write report
  const outputDir = join(process.cwd(), "runs", "audit");
  mkdirSync(outputDir, { recursive: true });
  
  const outputPath = join(outputDir, "wiring_check.json");
  writeFileSync(outputPath, JSON.stringify(report, null, 2));
  
  console.log(`📄 Report written to: ${outputPath}`);
  
  // Exit with appropriate code
  if (report.failed > 0) {
    console.log("\n❌ Wiring check FAILED");
    process.exit(1);
  } else if (report.passed === 0) {
    console.log("\n⚠️  No tests passed");
    process.exit(1);
  } else {
    console.log("\n✅ Wiring check PASSED");
    process.exit(0);
  }
}

main().catch((error) => {
  console.error("\n❌ Wiring check crashed:");
  console.error(error);
  process.exit(1);
});
