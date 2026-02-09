import type { StageName } from "../pipeline/contracts";
import { loadPolicyConfig } from "../pipeline/guards";
import { loadStagePrompt } from "../pipeline/prompt_loader";

function stripMarkdown(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/\r/g, "")
    .replace(/\n{2,}/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

export function getStageSystemPrompt(stage: StageName): string {
  const { prompt } = loadStagePrompt(stage);
  const policy = loadPolicyConfig();
  const normalized = stripMarkdown(prompt);
  const forbidden = policy.forbidden_vocabulary.join(", ");

  return [
    `Stage: ${stage}`,
    normalized,
    "Output requirements:",
    "1) Return JSON only with no extra keys.",
    "2) Match the stage output schema exactly.",
    "3) Keep all evidence refs bucket-based IDs only.",
    "4) Never include raw rows, customer identifiers, contact details, or line items.",
    `5) Forbidden owner-facing terms: ${forbidden}.`,
  ].join("\n");
}

