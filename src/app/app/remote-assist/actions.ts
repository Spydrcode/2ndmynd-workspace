"use server";

import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import { getStore } from "@/src/lib/intelligence/store";

type RemoteAssistState = {
  error?: string;
  ok?: boolean;
};

export async function createRemoteAssistRequest(
  _: RemoteAssistState,
  formData: FormData
): Promise<RemoteAssistState> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  const actor = user
    ? { id: user.id, email: user.email }
    : { id: "local-dev-user", email: null };

  const tool = String(formData.get("tool") ?? "");
  const notes = String(formData.get("notes") ?? "");
  const calLink = String(formData.get("cal_link") ?? "");
  const websiteUrl = String(formData.get("website_url") ?? "");

  const combinedNotes = websiteUrl
    ? `${notes}\n\nWebsite: ${websiteUrl}`.trim()
    : notes;

  const store = getStore();
  const workspace = await store.ensureWorkspaceForUser(actor.id, actor.email);
  await store.createRemoteAssistRequest({
    workspace_id: workspace.id,
    tool,
    notes: combinedNotes,
    status: "requested",
    cal_link: calLink,
  });

  return { ok: true };
}
