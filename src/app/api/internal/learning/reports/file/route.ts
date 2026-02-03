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

export async function GET(request: NextRequest) {
  const guard = isInternalAllowed(request);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.status === 404 ? "Not found" : "Unauthorized" }, { status: guard.status });
  }
  if (request.nextUrl.searchParams.get("internal") !== "1") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const rel = request.nextUrl.searchParams.get("path");
  if (!rel) {
    return NextResponse.json({ error: "path required" }, { status: 400 });
  }

  const root = process.cwd();
  const full = path.resolve(root, rel);
  const allowedRoots = [
    path.join(root, "eval_out"),
    path.join(root, "models"),
    path.join(root, "ml", "evals", "reports"),
  ];

  if (!allowedRoots.some((dir) => full.startsWith(dir))) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  if (!full.endsWith(".md") || !fs.existsSync(full)) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  const content = fs.readFileSync(full, "utf-8");
  return new NextResponse(content, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
    },
  });
}
