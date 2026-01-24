import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type SupabaseClientAny = ReturnType<typeof createClient<any>>;

function ensureDevAccess(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return { ok: false, status: 404, message: "Not found." };
  }
  if (!process.env.DEV_ADMIN_TOKEN) {
    return {
      ok: false,
      status: 400,
      message: "Missing DEV_ADMIN_TOKEN env var.",
    };
  }
  const token = request.headers.get("x-dev-admin-token");
  if (!token || token !== process.env.DEV_ADMIN_TOKEN) {
    return { ok: false, status: 401, message: "Unauthorized." };
  }
  return { ok: true, status: 200, message: "" };
}

export async function POST(request: Request) {
  const access = ensureDevAccess(request);
  if (!access.ok) {
    return NextResponse.json(
      { ok: false, code: "UNAUTHORIZED", message: access.message },
      { status: access.status }
    );
  }

  let payload: { model_id?: string };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, code: "INVALID_INPUT", message: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const modelId = payload?.model_id?.trim();
  if (!modelId) {
    return NextResponse.json(
      { ok: false, code: "INVALID_INPUT", message: "model_id is required." },
      { status: 400 }
    );
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { ok: false, code: "OPENAI_ERROR", message: "missing Supabase env vars" },
      { status: 400 }
    );
  }

  const supabase = createClient<any>(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { error } = await supabase
    .schema("ml")
    .from("model_registry")
    .upsert(
      {
        name: "decision_model",
        model_id: modelId,
        status: "active",
        notes: "dev endpoint",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "name" }
    );

  if (error) {
    return NextResponse.json(
      { ok: false, code: "MODEL_OUTPUT_INVALID", message: error.message },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, model_id: modelId });
}
