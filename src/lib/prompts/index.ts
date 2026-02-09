/**
 * Prompts Module
 *
 * LEGACY prompt exports for the pre-v4 stack.
 * v4 stage prompts live under src/intelligence_v4/stages/<stage>/prompt.md.
 */

export {
  buildDecisionSnapshotPrompt,
  extractPromptWithoutRag,
  type DecisionSnapshotPromptInput,
} from "./decision_snapshot_prompt";
