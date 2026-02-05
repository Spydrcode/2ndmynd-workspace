import { NextRequest, NextResponse } from "next/server";
import { spawnSync } from "child_process";
import { checkInternalGuard } from "@/src/lib/internal/internal_guard";

interface RuntimeReport {
  ok: boolean;
  node: {
    version: string;
    tsx: boolean;
    vitest: boolean;
    next: boolean;
  };
  python: {
    exists: boolean;
    version?: string;
    sklearn: boolean;
    numpy: boolean;
    pandas: boolean;
    matplotlib: boolean;
  };
  env: {
    ALLOW_INTERNAL_TESTING: boolean;
    INTERNAL_TESTING_TOKEN_set: boolean;
    LEARNING_CAPTURE: boolean;
    LEARNING_INFERENCE: boolean;
    LEARNING_VECTOR_BACKEND?: string;
    RAG_ENABLED: boolean;
  };
  warnings: string[];
}

function checkCommand(command: string, args: string[] = ["--version"]): boolean {
  try {
    const result = spawnSync(command, args, {
      encoding: "utf8",
      shell: true,
      timeout: 5000,
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

function getPythonVersion(): string | undefined {
  // Try python first
  let result = spawnSync("python", ["--version"], {
    encoding: "utf8",
    shell: true,
    timeout: 5000,
  });
  
  if (result.status === 0) {
    return result.stdout.trim() || result.stderr.trim();
  }
  
  // Try py on Windows
  result = spawnSync("py", ["--version"], {
    encoding: "utf8",
    shell: true,
    timeout: 5000,
  });
  
  if (result.status === 0) {
    return result.stdout.trim() || result.stderr.trim();
  }
  
  return undefined;
}

function checkPythonPackages(): { sklearn: boolean; numpy: boolean; pandas: boolean; matplotlib: boolean } {
  const result = spawnSync(
    "python",
    ["-c", "import sklearn, numpy, pandas, matplotlib; print('ok')"],
    {
      encoding: "utf8",
      shell: true,
      timeout: 5000,
    }
  );
  
  if (result.status !== 0) {
    // Try py on Windows
    const pyResult = spawnSync(
      "py",
      ["-c", "import sklearn, numpy, pandas, matplotlib; print('ok')"],
      {
        encoding: "utf8",
        shell: true,
        timeout: 5000,
      }
    );
    
    if (pyResult.status === 0) {
      return { sklearn: true, numpy: true, pandas: true, matplotlib: true };
    }
    
    // Try individual imports
    const packages = { sklearn: false, numpy: false, pandas: false, matplotlib: false };
    for (const pkg of ["sklearn", "numpy", "pandas", "matplotlib"]) {
      const pkgResult = spawnSync("python", ["-c", `import ${pkg}`], {
        encoding: "utf8",
        shell: true,
        timeout: 5000,
      });
      packages[pkg as keyof typeof packages] = pkgResult.status === 0;
    }
    return packages;
  }
  
  return { sklearn: true, numpy: true, pandas: true, matplotlib: true };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Internal guard check
  const guard = checkInternalGuard(request);
  if (!guard.allowed) {
    return NextResponse.json({ error: guard.errorMessage }, { status: guard.status });
  }
  
  // Gather runtime info
  const warnings: string[] = [];
  
  // Node.js checks
  const nodeVersion = process.version;
  const hasTsx = checkCommand("npx", ["--yes", "tsx", "-v"]);
  const hasVitest = checkCommand("npx", ["--yes", "vitest", "--version"]);
  const hasNext = checkCommand("npx", ["--yes", "next", "--version"]);
  
  if (!hasTsx) warnings.push("tsx not found - run: npm install");
  if (!hasVitest) warnings.push("vitest not found - run: npm install");
  if (!hasNext) warnings.push("next not found - run: npm install");
  
  // Python checks
  const pythonVersion = getPythonVersion();
  const pythonExists = !!pythonVersion;
  
  let pythonPackages = { sklearn: false, numpy: false, pandas: false, matplotlib: false };
  if (pythonExists) {
    pythonPackages = checkPythonPackages();
    
    if (!pythonPackages.sklearn) warnings.push("scikit-learn not found - run: pip install scikit-learn");
    if (!pythonPackages.numpy) warnings.push("numpy not found - run: pip install numpy");
    if (!pythonPackages.pandas) warnings.push("pandas not found - run: pip install pandas");
    if (!pythonPackages.matplotlib) warnings.push("matplotlib not found - run: pip install matplotlib");
  } else {
    warnings.push("Python not found - learning features will be degraded");
  }
  
  // Environment checks
  const env = {
    ALLOW_INTERNAL_TESTING: allowInternalTesting,
    INTERNAL_TESTING_TOKEN_set: !!internalToken,
    LEARNING_CAPTURE: process.env.LEARNING_CAPTURE === "true",
    LEARNING_INFERENCE: process.env.LEARNING_INFERENCE === "true",
    LEARNING_VECTOR_BACKEND: process.env.LEARNING_VECTOR_BACKEND,
    RAG_ENABLED: process.env.RAG_ENABLED === "true",
  };
  
  const report: RuntimeReport = {
    ok: warnings.length === 0,
    node: {
      version: nodeVersion,
      tsx: hasTsx,
      vitest: hasVitest,
      next: hasNext,
    },
    python: {
      exists: pythonExists,
      version: pythonVersion,
      ...pythonPackages,
    },
    env,
    warnings,
  };
  
  return NextResponse.json(report);
}
