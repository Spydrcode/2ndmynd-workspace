import { NextRequest, NextResponse } from "next/server";
import { listExamples } from "@/lib/learning/store_jsonl";
import type { TrainingExampleV1 } from "@/lib/learning/types";
import { buildVectorDoc } from "@/lib/learning/vector_index/build_vector_doc";
import { embedSummary, querySimilar } from "@/lib/learning/vector_index/index_client";

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

function buildExampleFromFeatures(features: TrainingExampleV1["features"]): TrainingExampleV1 {
  return {
    id: "query",
    created_at: new Date().toISOString(),
    run_id: "query",
    source: (features.source as TrainingExampleV1["source"]) ?? "mock",
    industry_key: (features.industry_key as TrainingExampleV1["industry_key"]) ?? "unknown",
    feature_schema: "signals_v1",
    pipeline_version: "query",
    features,
    targets: {
      pressure_keys: [],
      boundary_class: "unknown",
    },
  };
}

export async function POST(request: NextRequest) {
  const guard = isInternalAllowed(request);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.status === 404 ? "Not found" : "Unauthorized" }, { status: guard.status });
  }

  try {
    const body = await request.json();
    const topK = body?.topK ?? 5;
    let example: TrainingExampleV1 | null = null;

    if (body?.run_id) {
      const matches = await listExamples({ run_id: body.run_id });
      if (matches.length === 0) {
        return NextResponse.json({ error: "run_id not found" }, { status: 404 });
      }
      example = matches.sort((a, b) => (a.created_at > b.created_at ? 1 : -1))[matches.length - 1];
    } else if (body?.features) {
      example = buildExampleFromFeatures(body.features);
    } else {
      return NextResponse.json({ error: "run_id or features required" }, { status: 400 });
    }

    const doc = buildVectorDoc(example);
    const embedding = await embedSummary(doc.summary, doc.embedding_model);
    const results = await querySimilar({ summary: doc.summary, embedding, topK });
    const filtered = results.filter((item) => item.run_id !== example?.run_id);

    return NextResponse.json({ ok: true, results: filtered });
  } catch (error) {
    console.error("[LEARNING API] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to find similar examples" },
      { status: 500 }
    );
  }
}
