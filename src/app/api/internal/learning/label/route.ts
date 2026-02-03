/**
 * Internal API - Label Training Example
 * 
 * POST /api/internal/learning/label
 * 
 * Allows reviewers to add labels to training examples
 */

import { NextRequest, NextResponse } from "next/server";
import { updateLabels } from "@/src/lib/learning/store_jsonl";

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

export async function POST(request: NextRequest) {
  const guard = isInternalAllowed(request);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.status === 404 ? "Not found" : "Unauthorized" }, { status: guard.status });
  }

  try {
    const body = await request.json();
    const {
      example_id,
      reviewer_score,
      reviewer_notes,
      client_feedback,
      client_feedback_reason,
      mapping_was_wrong,
      outcome_next_step_chosen,
    } = body;

    if (!example_id) {
      return NextResponse.json({ error: "example_id required" }, { status: 400 });
    }

    if (reviewer_score !== undefined) {
      const validScores = [0, 1, 2, 3];
      if (!validScores.includes(reviewer_score)) {
        return NextResponse.json(
          { error: "reviewer_score must be 0, 1, 2, or 3" },
          { status: 400 }
        );
      }
    }

    if (client_feedback !== undefined) {
      const validFeedback = ["up", "down"];
      if (!validFeedback.includes(client_feedback)) {
        return NextResponse.json(
          { error: "client_feedback must be 'up' or 'down'" },
          { status: 400 }
        );
      }
    }

    const labels = {
      reviewer_score,
      reviewer_notes,
      client_feedback,
      client_feedback_reason,
      mapping_was_wrong,
      outcome_next_step_chosen,
    };
    updateLabels(example_id, labels);

    return NextResponse.json({ ok: true });

  } catch (error) {
    console.error("[LEARNING API] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update labels" },
      { status: 500 }
    );
  }
}
