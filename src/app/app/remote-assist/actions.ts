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
  const supabase = createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) {
    return { error: "Please log in to request remote assist." };
  }

  const tool = String(formData.get("tool") ?? "");
  const notes = String(formData.get("notes") ?? "");
  const calLink = String(formData.get("cal_link") ?? "");
  const websiteUrl = String(formData.get("website_url") ?? "");

  const combinedNotes = websiteUrl
    ? `${notes}\n\nWebsite: ${websiteUrl}`.trim()
    : notes;

  const store = getStore();
  const workspace = await store.ensureWorkspaceForUser(user.id, user.email);
  await store.createRemoteAssistRequest({
    workspace_id: workspace.id,
    tool,
    notes: combinedNotes,
    status: "requested",
    cal_link: calLink,
  });

  return { ok: true };
}
