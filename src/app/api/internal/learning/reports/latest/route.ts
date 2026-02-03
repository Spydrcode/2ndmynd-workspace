import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";

function isInternalAllowed(request: NextRequest): { ok: boolean; status: number } {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_INTERNAL_TESTING !== "true") {
    return { ok: false, status: 404 };
  }
  if (process.env.NODE_ENV !== "production") return { ok: true, status: 200 };
  const token = request.headers.get("x-2ndmynd-internal");
  if (!token || token !== process.env.INTERNAL_TESTING_TOKEN) {
    return { ok: false, status: 401 };
  }
  return { ok: true, status: 200 };
}

type ReportMeta = {
  path: string;
  url: string;
  model_name?: string;
  updated_at?: string;
};

function walk(dir: string, maxDepth = 3, depth = 0): string[] {
  if (!fs.existsSync(dir) || depth > maxDepth) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(full, maxDepth, depth + 1));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(full);
    }
  }
  return files;
}

function inferModelName(filePath: string) {
  const parts = filePath.split(path.sep);
  const modelsIndex = parts.lastIndexOf("models");
  if (modelsIndex >= 0 && parts.length > modelsIndex + 1) {
    return parts[modelsIndex + 1];
  }
  return undefined;
}

export async function GET(request: NextRequest) {
  const guard = isInternalAllowed(request);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.status === 404 ? "Not found" : "Unauthorized" }, { status: guard.status });
  }
  if (request.nextUrl.searchParams.get("internal") !== "1") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const root = process.cwd();
  const roots = [
    path.join(root, "eval_out"),
    path.join(root, "models"),
    path.join(root, "ml", "evals", "reports"),
  ];

  const files = roots.flatMap((dir) => walk(dir));
  const reports: ReportMeta[] = files
    .map((filePath) => {
      const stat = fs.statSync(filePath);
      const relative = path.relative(root, filePath);
      return {
        path: relative,
        url: `/api/internal/learning/reports/file?path=${encodeURIComponent(relative)}&internal=1`,
        model_name: inferModelName(filePath),
        updated_at: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => (a.updated_at && b.updated_at ? b.updated_at.localeCompare(a.updated_at) : 0))
    .slice(0, 10);

  return NextResponse.json({ ok: true, reports });
}
