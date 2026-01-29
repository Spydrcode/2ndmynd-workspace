import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type SupabaseClientAny = ReturnType<typeof createClient<unknown>>;

async function getRegistryModel(supabase: SupabaseClientAny) {
  const { data, error } = await supabase
    .schema("ml")
    .from("model_registry")
    .select("model_id")
    .eq("name", "decision_model")
    .eq("status", "active")
    .maybeSingle();

  if (error) return { found: false, model_id: null };
  return { found: Boolean(data?.model_id), model_id: data?.model_id ?? null };
}

async function getLatestRunModel(supabase: SupabaseClientAny) {
  const { data, error } = await supabase
    .schema("ml")
    .from("runs")
    .select("result_model")
    .eq("run_type", "finetune")
    .eq("run_status", "succeeded")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { latest_succeeded_found: false, result_model: null };
  return {
    latest_succeeded_found: Boolean(data?.result_model),
    result_model: data?.result_model ?? null,
  };
}

export async function GET() {
  const env = {
    SUPABASE_URL: process.env.SUPABASE_URL ?? null,
    DECISION_MODEL_ID_set: Boolean(process.env.DECISION_MODEL_ID),
    SUPABASE_SERVICE_ROLE_KEY_set: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  };

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({
      env,
      registry: { found: false, model_id: null },
      runs: { latest_succeeded_found: false, result_model: null },
      error: "missing Supabase env vars",
    });
  }

  const supabase = createClient<unknown>(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const [registry, runs] = await Promise.all([
    getRegistryModel(supabase),
    getLatestRunModel(supabase),
  ]);

  return NextResponse.json({ env, registry, runs });
}
