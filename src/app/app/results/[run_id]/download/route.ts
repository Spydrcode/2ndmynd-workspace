import { NextResponse } from "next/server";

import { getStore } from "@/src/lib/intelligence/store";

export async function GET(_: Request, { params }: { params: { run_id: string } }) {
  const store = getStore();
  const run = await store.getRun(params.run_id);
  if (!run) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const payload = {
    run_id: run.run_id,
    status: run.status,
    website_url: run.website_url,
    results: run.results_json,
    business_profile: run.business_profile_json,
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename=2ndmynd-${run.run_id}.json`,
    },
  });
}
