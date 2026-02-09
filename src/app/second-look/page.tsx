import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import { getStore } from "@/src/lib/intelligence/store";
import {
  SecondLookArtifactV2Schema,
  type SecondLookArtifactV2,
} from "@/src/lib/second_look_v2/contracts/second_look_artifact_v2";

import SecondLookWizard from "./SecondLookWizard";

export const dynamic = "force-dynamic";

type RunOption = {
  run_id: string;
  created_at: string | null;
  status: string | null;
};

function asSecondLookArtifact(input: unknown): SecondLookArtifactV2 | null {
  const parsed = SecondLookArtifactV2Schema.safeParse(input);
  return parsed.success ? parsed.data : null;
}

export default async function SecondLookPage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = props.searchParams ? await props.searchParams : {};
  const queryRunId =
    typeof searchParams?.run_id === "string"
      ? searchParams.run_id
      : Array.isArray(searchParams?.run_id)
        ? searchParams.run_id[0] ?? ""
        : "";

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  const store = getStore();
  const actor = user
    ? { id: user.id, email: user.email }
    : { id: "local-dev-user", email: null };
  const workspace = await store.ensureWorkspaceForUser(actor.id, actor.email);
  const runs = await store.listRuns(workspace.id);

  const runOptions: RunOption[] = runs.map((run) => ({
    run_id: run.run_id,
    created_at: run.created_at ?? null,
    status: run.status ?? null,
  }));

  let initialArtifact: SecondLookArtifactV2 | null = null;
  if (queryRunId) {
    const run = runs.find((item) => item.run_id === queryRunId);
    const results = run?.results_json && typeof run.results_json === "object"
      ? (run.results_json as Record<string, unknown>)
      : null;

    if (results?.second_look_artifact_v2) {
      initialArtifact = asSecondLookArtifact(results.second_look_artifact_v2);
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(900px_circle_at_top,_rgba(15,23,42,0.08),_transparent_58%)] px-4 py-6 sm:px-6">
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Second Look (V2)</h1>
          <p className="text-sm text-muted-foreground">
            Mindset-first intake to generate one finite artifact with two decision paths.
          </p>
        </div>

        <SecondLookWizard
          runOptions={runOptions}
          initialRunId={queryRunId || runOptions[0]?.run_id || ""}
          initialArtifact={initialArtifact}
        />
      </div>
    </div>
  );
}
