import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { readBuffer, readJSON, writeBuffer } from "@/lib/snapshot/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function buildBaseUrl(request: NextRequest) {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host");
  const protocol = forwardedProto ?? "http";
  if (host) return `${protocol}://${host}`;
  return "http://localhost:3000";
}

export async function GET(request: NextRequest, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params;

  try {
    const cached = await readBuffer(runId, "artifact.pdf");
    return new NextResponse(cached, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename=\"snapshot-${runId}.pdf\"`,
      },
    });
  } catch {
    // cache miss
  }

  try {
    await readJSON(runId, "artifact.json");
  } catch {
    return NextResponse.json(
      { ok: false, code: "NOT_FOUND", message: "Snapshot artifact not found." },
      { status: 404 }
    );
  }

  let chromium: typeof import("playwright").chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    return NextResponse.json(
      {
        ok: false,
        code: "PLAYWRIGHT_NOT_AVAILABLE",
        message:
          "PDF export is scaffolded but Playwright is not available in this environment. Try again after installing browsers (npm run pw:install).",
      },
      { status: 500 }
    );
  }

  const baseUrl = buildBaseUrl(request);
  const targetUrl = `${baseUrl}/app/snapshot/result/${runId}?print=1`;

  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    await page.goto(targetUrl, { waitUntil: "networkidle" });
    await page.emulateMedia({ media: "print" });

    const pdf = await page.pdf({
      format: "Letter",
      printBackground: true,
      margin: { top: "0.6in", bottom: "0.6in", left: "0.6in", right: "0.6in" },
    });

    const pdfBuffer = Buffer.from(pdf);
    await writeBuffer(runId, "artifact.pdf", pdfBuffer);

    return new NextResponse(pdfBuffer, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename=\"snapshot-${runId}.pdf\"`,
      },
    });
  } finally {
    await browser.close();
  }
}
