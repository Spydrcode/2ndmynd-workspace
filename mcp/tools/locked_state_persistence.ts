/**
 * Locked Conclusions Persistence Layer
 * 
 * Prevents flip-flopping by persisting prior decisions and enforcing
 * unlock triggers before allowing contradictions.
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { LockedState } from "../../schemas/decision_closure";
import { lockedStateSchema } from "../../schemas/decision_closure";

const RUNS_DIR = path.join(process.cwd(), "runs");

export async function loadLockedState(clientId: string): Promise<LockedState | null> {
  const statePath = path.join(RUNS_DIR, clientId, "locked_state.json");
  
  try {
    const data = await fs.readFile(statePath, "utf-8");
    const parsed = JSON.parse(data);
    const result = lockedStateSchema.safeParse(parsed);
    
    if (result.success) {
      return result.data;
    }
    console.warn(`Invalid locked state for client ${clientId}:`, result.error);
    return null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null; // No state yet
    }
    throw error;
  }
}

export async function saveLockedState(clientId: string, state: LockedState): Promise<void> {
  const clientDir = path.join(RUNS_DIR, clientId);
  await fs.mkdir(clientDir, { recursive: true });
  
  const statePath = path.join(clientDir, "locked_state.json");
  const result = lockedStateSchema.safeParse(state);
  
  if (!result.success) {
    throw new Error(`Invalid locked state: ${result.error.message}`);
  }
  
  await fs.writeFile(statePath, JSON.stringify(state, null, 2), "utf-8");
}

export async function checkFlipFlop(
  clientId: string,
  constraintId: string,
  newPath: "A" | "B"
): Promise<{
  allowed: boolean;
  reason?: string;
  priorLock?: {
    conclusion_id: string;
    chosen_path: string;
    locked_at: string;
    unlock_triggers: string[];
    trigger_fired: boolean;
  };
}> {
  const state = await loadLockedState(clientId);
  
  if (!state) {
    return { allowed: true }; // No prior state, allow any choice
  }
  
  // Find most recent lock for this constraint
  const priorLock = state.locked_conclusions
    .filter((lc) => lc.constraint_id === constraintId)
    .sort((a, b) => b.locked_at.localeCompare(a.locked_at))[0];
  
  if (!priorLock) {
    return { allowed: true }; // No prior lock for this constraint
  }
  
  // Check if trying to flip to different path
  if (priorLock.chosen_path !== newPath) {
    if (!priorLock.trigger_fired) {
      return {
        allowed: false,
        reason: `Prior decision locked: chose Path ${priorLock.chosen_path} on ${priorLock.locked_at}. Cannot flip to Path ${newPath} without trigger conditions firing. Triggers: ${priorLock.unlock_triggers.join(", ")}`,
        priorLock,
      };
    }
  }
  
  return { allowed: true, priorLock };
}

export async function lockConclusion(
  clientId: string,
  constraintId: string,
  chosenPath: "A" | "B",
  unlockTriggers: string[]
): Promise<void> {
  let state = await loadLockedState(clientId);
  
  if (!state) {
    state = {
      client_id: clientId,
      locked_conclusions: [],
      last_updated: new Date().toISOString(),
    };
  }
  
  // Add new lock
  state.locked_conclusions.push({
    conclusion_id: `${constraintId}_${chosenPath}_${Date.now()}`,
    constraint_id: constraintId,
    chosen_path: chosenPath,
    locked_at: new Date().toISOString(),
    unlock_triggers: unlockTriggers,
    trigger_fired: false,
  });
  
  state.last_updated = new Date().toISOString();
  
  await saveLockedState(clientId, state);
}

export async function fireUnlockTrigger(
  clientId: string,
  constraintId: string,
  triggerReason: string
): Promise<void> {
  const state = await loadLockedState(clientId);
  
  if (!state) {
    return; // No state, nothing to unlock
  }
  
  // Find most recent lock for this constraint and mark trigger as fired
  const priorLock = state.locked_conclusions
    .filter((lc) => lc.constraint_id === constraintId)
    .sort((a, b) => b.locked_at.localeCompare(a.locked_at))[0];
  
  if (priorLock) {
    priorLock.trigger_fired = true;
    state.last_updated = new Date().toISOString();
    await saveLockedState(clientId, state);
  }
}
