import fs from "node:fs";
import path from "node:path";

import type { StageName } from "./contracts";

const PROMPT_PATHS: Record<StageName, string> = {
  quant_signals: "src/intelligence_v4/stages/quant_signals/prompt.md",
  emyth_owner_load: "src/intelligence_v4/stages/emyth_owner_load/prompt.md",
  competitive_lens: "src/intelligence_v4/stages/competitive_lens/prompt.md",
  blue_ocean: "src/intelligence_v4/stages/blue_ocean/prompt.md",
  synthesis_decision: "src/intelligence_v4/stages/synthesis_decision/prompt.md",
};

const PROMPT_VERSION = "v1";

export function loadStagePrompt(stageName: StageName): { prompt: string; prompt_version: string } {
  const file = path.resolve(process.cwd(), PROMPT_PATHS[stageName]);
  if (!fs.existsSync(file)) {
    return { prompt: `Stage prompt missing for ${stageName}.`, prompt_version: PROMPT_VERSION };
  }
  return {
    prompt: fs.readFileSync(file, "utf8"),
    prompt_version: PROMPT_VERSION,
  };
}