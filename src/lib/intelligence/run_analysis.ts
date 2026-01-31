import { callTool } from "@/mcp/tool_registry";
import { hashInput } from "@/lib/decision/v2/run_context";
import { RunLogger } from "@/lib/intelligence/run_logger";

import { DataPackV0 } from "./data_pack_v0";
import { buildSnapshotFromPack } from "./snapshot_from_pack";
import { buildBusinessProfile, BusinessProfile } from "./web_profile";

export type AnalysisResult = {
  run_id: string;
  input_hash: string;
  snapshot: unknown;
  conclusion: unknown;
  validation: { ok: boolean; errors: string[] };
  business_profile: BusinessProfile;
};

export async function runAnalysisFromPack(params: {
  run_id: string;
  pack: DataPackV0;
  website_url?: string | null;
}) {
  const logger = new RunLogger(params.run_id);
  logger.logEvent("upload_received", { run_id: params.run_id });

  const input_hash = hashInput(params.pack);
  logger.logEvent("pack_normalized", { input_hash });

  logger.logEvent("web_profile_start", { website_url: params.website_url ?? null });
  let business_profile: BusinessProfile;
  try {
    business_profile = await buildBusinessProfile(params.website_url);
    logger.logEvent("web_profile_end", { domain: business_profile.domain, found_contact: business_profile.found_contact });
  } catch (error) {
    business_profile = {
      name_guess: null,
      summary: "We could not fetch the website. Continue with the latest snapshot.",
      services: [],
      location_mentions: [],
      industry_bucket: "other",
      domain: params.website_url ? new URL(params.website_url).hostname : null,
      found_contact: false,
    };
    logger.logEvent("web_profile_end", { error: RunLogger.serializeError(error) });
  }

  const snapshot = buildSnapshotFromPack(params.pack);

  logger.logEvent("pipeline_start", { run_id: params.run_id });
  const pipelineResult = await callTool("pipeline.run_v2", {
    mode: "raw_snapshot",
    payload: { snapshot, run_id: params.run_id },
  });
  logger.logEvent("pipeline_end", { run_id: params.run_id });

  const conclusion = (pipelineResult as { conclusion?: unknown }).conclusion;
  logger.logEvent("validate_start", { run_id: params.run_id });
  const validationResult = (await callTool("decision.validate_v2", {
    snapshot,
    conclusion,
  })) as { ok: boolean; errors: string[] };
  logger.logEvent("validate_end", { ok: validationResult.ok });

  logger.logEvent("run_complete", { ok: validationResult.ok });

  return {
    run_id: params.run_id,
    input_hash,
    snapshot,
    conclusion,
    validation: validationResult,
    business_profile,
  } satisfies AnalysisResult;
}
