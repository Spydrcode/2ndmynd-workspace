/**
 * POST /api/internal/runs/[run_id]/intent-overrides
 *
 * Persists value-prop overrides (owner confirmations) for a run.
 * Body: { overrides: [{ tag, confirmed }] }
 *
 * DOCTRINE: No judgment language in responses.
 */

import { NextRequest, NextResponse } from "next/server";
import type { IntentOverrides, ValueOverride } from "@/src/lib/types/intent_intake";

// In-memory store for now. Replace with DB persistence when available.
const overrideStore = new Map<string, IntentOverrides>();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ run_id: string }> }
) {
  const { run_id } = await params;

  if (!run_id) {
    return NextResponse.json({ error: "run_id is required" }, { status: 400 });
  }

  let body: { overrides?: Array<{ tag: string; confirmed: boolean }> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.overrides || !Array.isArray(body.overrides)) {
    return NextResponse.json(
      { error: "Body must include overrides array" },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();

  // Merge with existing overrides (last write wins per tag)
  const existing = overrideStore.get(run_id);
  const existingMap = new Map<string, ValueOverride>();

  if (existing) {
    for (const o of existing.overrides) {
      existingMap.set(o.tag, o);
    }
  }

  for (const o of body.overrides) {
    existingMap.set(o.tag, {
      tag: o.tag as ValueOverride["tag"],
      confirmed: o.confirmed,
      recorded_at: now,
    });
  }

  const result: IntentOverrides = {
    run_id,
    overrides: Array.from(existingMap.values()),
    updated_at: now,
  };

  overrideStore.set(run_id, result);

  return NextResponse.json({
    status: "saved",
    run_id,
    overrides_count: result.overrides.length,
    updated_at: now,
  });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ run_id: string }> }
) {
  const { run_id } = await params;

  const existing = overrideStore.get(run_id);

  if (!existing) {
    return NextResponse.json({
      run_id,
      overrides: [],
      updated_at: null,
    });
  }

  return NextResponse.json(existing);
}
