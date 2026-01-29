import { NextResponse } from "next/server";

import { getDecisionConclusion } from "@/lib/decisionModel";
import { inferDecisionV2 } from "@/lib/decision/v2/decision_infer_v2";

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

function isSnapshotV2(input: unknown) {
  if (!input || typeof input !== "object") return false;
  const candidate = input as {
    snapshot_version?: unknown;
    activity_signals?: unknown;
    season?: unknown;
    volatility_band?: unknown;
  };
  if (candidate.snapshot_version !== "snapshot_v2") return false;
  if (!candidate.activity_signals || typeof candidate.activity_signals !== "object") return false;
  if (!candidate.season || typeof candidate.season !== "object") return false;
  return typeof candidate.volatility_band === "string";
}

export async function POST(request: Request) {
  const rateLimitError = checkRateLimit(request);
  if (rateLimitError) {
    return NextResponse.json(rateLimitError, { status: 429 });
  }

  let payload: {
    input_snapshot?: unknown;
    model?: string;
    micro_rewrite_decision?: boolean;
  };
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

  if (isSnapshotV2(payload.input_snapshot)) {
    try {
      const result = await inferDecisionV2(payload.input_snapshot, {
        model: payload.model,
        micro_rewrite_decision: payload.micro_rewrite_decision,
        patch_queue_path: process.env.PATCH_QUEUE_PATH ?? "ml_artifacts/patch_queue.jsonl",
      });

      return NextResponse.json({
        ok: true,
        model: result.model_id,
        conclusion: result.conclusion,
        meta: {
          primary_ok: result.primary_ok,
          rewrite_used: result.rewrite_used,
          fallback_used: result.fallback_used,
          micro_rewrite_attempted: result.micro_rewrite_attempted,
          micro_rewrite_applied: result.micro_rewrite_applied,
          micro_rewrite_failed: result.micro_rewrite_failed,
          micro_rewrite_reason: result.micro_rewrite_reason,
          decision_before: result.decision_before,
          decision_after: result.decision_after,
          decision_after_checks: result.decision_after_checks,
          schema_errors: result.schema_errors,
          grounding_errors: result.grounding_errors,
          forbidden_terms: result.forbidden_terms,
          season_warnings: result.season_warnings,
        },
      });
    } catch (error) {
      return NextResponse.json(
        {
          ok: false,
          code: "INFER_V2_ERROR",
          message: error instanceof Error ? error.message : "v2 inference failed",
        },
        { status: 400 }
      );
    }
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
