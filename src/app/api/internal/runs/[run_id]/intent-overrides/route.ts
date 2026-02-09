/**
 * POST /api/internal/runs/[run_id]/intent-overrides
 *
 * Persists value-prop overrides (owner confirmations) for a run.
 * Body: { overrides: [{ tag, confirmed }] }
 *
 * DOCTRINE: No judgment language in responses.
 */

import { NextRequest, NextResponse } from "next/server";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import intentOverridesSchema from "@/schemas/intent_overrides.schema.json";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import { getStore } from "@/src/lib/intelligence/store";
import type { IntentOverrides, ValueOverride } from "@/src/lib/types/intent_intake";

const ajv = new Ajv({ allErrors: true, strict: true });
addFormats(ajv);
const validateIntentOverridesBody = ajv.compile(intentOverridesSchema as Record<string, unknown>);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function readStoredOverrides(runId: string, resultsJson: unknown): IntentOverrides | null {
  const record = asRecord(resultsJson);
  const raw = record.intent_overrides;
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as IntentOverrides;
  if (!Array.isArray(candidate.overrides)) return null;
  return {
    run_id: candidate.run_id || runId,
    overrides: candidate.overrides
      .filter((item) => item && typeof item.tag === "string" && typeof item.confirmed === "boolean")
      .slice(0, 10)
      .map((item) => ({
        tag: item.tag,
        confirmed: item.confirmed,
        recorded_at:
          typeof item.recorded_at === "string" && item.recorded_at.length > 0
            ? item.recorded_at
            : new Date().toISOString(),
      })),
    updated_at:
      typeof candidate.updated_at === "string" && candidate.updated_at.length > 0
        ? candidate.updated_at
        : new Date().toISOString(),
  };
}

async function getOwnedRunOrResponse(runId: string): Promise<
  | {
      store: ReturnType<typeof getStore>;
      run: Awaited<ReturnType<ReturnType<typeof getStore>["getRun"]>>;
    }
  | NextResponse
> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  const actor = user
    ? { id: user.id, email: user.email }
    : { id: "local-dev-user", email: null };

  const store = getStore();
  const workspace = await store.ensureWorkspaceForUser(actor.id, actor.email);
  const run = await store.getRun(runId);
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  if (run.workspace_id !== workspace.id) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  return { store, run };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ run_id: string }> }
) {
  const { run_id } = await params;

  if (!run_id) {
    return NextResponse.json({ error: "run_id is required" }, { status: 400 });
  }

  const ownedRun = await getOwnedRunOrResponse(run_id);
  if (ownedRun instanceof NextResponse) {
    return ownedRun;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!validateIntentOverridesBody(body)) {
    return NextResponse.json(
      { error: "Invalid intent overrides payload" },
      { status: 400 }
    );
  }

  const parsedBody = body as { overrides: Array<{ tag: string; confirmed: boolean }> };
  const now = new Date().toISOString();

  // Merge with existing overrides (last write wins per tag)
  const existing = readStoredOverrides(run_id, ownedRun.run?.results_json ?? null);
  const existingMap = new Map<string, ValueOverride>();

  if (existing) {
    for (const o of existing.overrides) {
      existingMap.set(o.tag, o);
    }
  }

  for (const o of parsedBody.overrides) {
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

  const existingResults = asRecord(ownedRun.run?.results_json ?? null);
  await ownedRun.store.updateRun(run_id, {
    results_json: {
      ...existingResults,
      intent_overrides: result,
    },
  });

  return NextResponse.json({
    status: "saved",
    run_id,
    intent_overrides: result,
    updated_at: now,
  });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ run_id: string }> }
) {
  const { run_id } = await params;
  if (!run_id) {
    return NextResponse.json({ error: "run_id is required" }, { status: 400 });
  }

  const ownedRun = await getOwnedRunOrResponse(run_id);
  if (ownedRun instanceof NextResponse) {
    return ownedRun;
  }

  const existing = readStoredOverrides(run_id, ownedRun.run?.results_json ?? null);
  if (!existing) {
    return NextResponse.json({
      run_id,
      intent_overrides: null,
    });
  }

  return NextResponse.json({ run_id, intent_overrides: existing });
}
