"use client";

import { useRouter } from "next/navigation";
import { CoherenceView } from "./CoherenceView";
import type { PresentedCoherenceArtifact } from "@/src/lib/present/present_coherence";

type CoherencePanelClientProps = {
  run_id: string;
  artifact: PresentedCoherenceArtifact;
  isDev?: boolean;
};

export function CoherencePanelClient({ run_id, artifact, isDev = false }: CoherencePanelClientProps) {
  const router = useRouter();

  async function onConfirmValue(tag: string, confirmed: boolean) {
    try {
      await fetch(`/api/internal/runs/${run_id}/intent-overrides`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ overrides: [{ tag, confirmed }] }),
      });
    } catch {
      return;
    }
    router.refresh();
  }

  return <CoherenceView artifact={artifact} isDev={isDev} onConfirmValue={onConfirmValue} />;
}
