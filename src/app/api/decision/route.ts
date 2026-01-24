import { NextResponse } from "next/server";

import { getDecisionConclusion } from "@/lib/decisionModel";

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;
const rateLimit = new Map<string, RateLimitEntry>();

function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? "unknown";
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

function checkRateLimit(request: Request) {
  if (process.env.NODE_ENV === "production") return null;

  const ip = getClientIp(request);
  const now = Date.now();
  const entry = rateLimit.get(ip);
  if (!entry || entry.resetAt <= now) {
    rateLimit.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return null;
  }

  entry.count += 1;
  if (entry.count > RATE_LIMIT_MAX) {
    return {
      ok: false,
      code: "RATE_LIMIT",
      message: "Try again in a bit.",
    };
  }

  return null;
}

export async function POST(request: Request) {
  const rateLimitError = checkRateLimit(request);
  if (rateLimitError) {
    return NextResponse.json(rateLimitError, { status: 429 });
  }

  let payload: { input_snapshot?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, code: "INVALID_INPUT", message: "Invalid JSON body." },
      { status: 400 }
    );
  }

  if (!payload || typeof payload !== "object" || payload.input_snapshot === undefined) {
    return NextResponse.json(
      { ok: false, code: "INVALID_INPUT", message: "Missing input_snapshot." },
      { status: 400 }
    );
  }

  const result = await getDecisionConclusion(payload.input_snapshot);
  if (!result.ok) {
    if (result.code === "NO_ACTIVE_MODEL") {
      return NextResponse.json(
        {
          ok: false,
          code: result.code,
          message: `${result.message} See /api/decision/diag for details.`,
        },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { ok: false, code: result.code, message: result.message },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    model: result.model,
    conclusion: result.conclusion,
  });
}
