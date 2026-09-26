import { hasExecutionRecord } from "../execution/records.js";
import { readSession } from "../session/state.js";
import { Workspace } from "../workspace/manager.js";

export interface StopHookInput {
  cwd?: unknown;
  hook_event_name?: unknown;
  stop_hook_active?: unknown;
}

export type StopHookOutput =
  | { continue: false; suppressOutput: true }
  | { continue: false; stopReason: string }
  | { continue: true; decision: "block"; reason: string };

const allowStop = (): StopHookOutput => ({ continue: false, suppressOutput: true });

/**
 * Gate Codex stopping on C2C's existing checkpoint and execution record.
 * This is deliberately read-only: C2C remains the sole owner of lifecycle state.
 */
export function evaluateStopFinalization(input: StopHookInput): StopHookOutput {
  if (input.hook_event_name !== "Stop" || typeof input.cwd !== "string") return allowStop();

  try {
    const workspace = new Workspace(input.cwd);
    const checkpoint = readSession(workspace.id)?.checkpoint;

    // No active C2C checkpoint means this is not a C2C-managed execution.
    if (!checkpoint) return allowStop();
    if (hasExecutionRecord(workspace.id, checkpoint.taskId, checkpoint.iteration)) return allowStop();

    // Codex sets this after a Stop hook has already blocked once in the turn.
    // Halt the turn instead of blocking again: this fails closed without
    // creating an infinite continuation loop.
    if (input.stop_hook_active === true) {
      return {
        continue: false,
        stopReason:
          `C2C finalization failed: no execution record exists for ` +
          `${checkpoint.taskId} iteration ${checkpoint.iteration}.`,
      };
    }

    return {
      continue: true,
      decision: "block",
      reason:
        `C2C finalization is required before stopping. Persist execution metadata for ` +
        `${checkpoint.taskId} iteration ${checkpoint.iteration} through the existing ` +
        "c2c record or c2c exec path, then finish the response.",
    };
  } catch {
    // A malformed/non-workspace hook invocation is not evidence of C2C ownership.
    return allowStop();
  }
}
