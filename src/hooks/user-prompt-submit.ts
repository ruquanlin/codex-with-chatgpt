import { hasExecutionRecord } from "../execution/records.js";
import { getStateDir } from "../config/paths.js";
import { readLastEndpoint } from "../config/endpoint.js";
import { mergeSession, readSession, writeSession, type SavedSession } from "../session/state.js";
import { Workspace } from "../workspace/manager.js";
import fs from "node:fs";
import path from "node:path";

export interface UserPromptSubmitInput {
  hook_event_name?: unknown;
  cwd?: unknown;
  turn_id?: unknown;
  prompt?: unknown;
}

export type UserPromptSubmitOutput =
  | { continue: true; suppressOutput: true }
  | { decision: "block"; reason: string }
  | {
      continue: true;
      suppressOutput: true;
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit";
        additionalContext: string;
      };
    };

function nextIteration(workspace: Workspace, session: SavedSession | null): number {
  let next = (session?.iteration ?? session?.checkpoint?.iteration ?? -1) + 1;
  const file = path.join(getStateDir(), "executions", `${workspace.id}.jsonl`);
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      try {
        const iteration = (JSON.parse(line) as { iteration?: unknown }).iteration;
        if (typeof iteration === "number" && Number.isInteger(iteration)) next = Math.max(next, iteration + 1);
      } catch {
        // Ignore malformed legacy records.
      }
    }
  }
  return Math.max(0, next);
}

export function enrollUserPrompt(input: UserPromptSubmitInput): UserPromptSubmitOutput {
  if (input.hook_event_name !== "UserPromptSubmit" || typeof input.cwd !== "string") {
    return { continue: true, suppressOutput: true };
  }
  try {
    const workspace = new Workspace(input.cwd);
    const previous = readSession(workspace.id);
    const endpoint = readLastEndpoint(workspace.id);

    // A saved chat/project binding or bridge endpoint is the durable indication that C2C is connected.
    if (!endpoint && (!previous || (!previous.url && !previous.projectUrl && !previous.conversationMode))) {
      return { continue: true, suppressOutput: true };
    }

    const active = previous?.checkpoint;
    if (active && !hasExecutionRecord(workspace.id, active.taskId, active.iteration)) {
      return {
        decision: "block",
        reason:
          `Previous C2C-managed task ${active.taskId} iteration ${active.iteration} has no execution record. ` +
          "Finalize it before starting another Codex task.",
      };
    }

    const taskId = previous?.taskId ?? `c2c_${workspace.id.slice(0, 12)}`;
    const iteration = nextIteration(workspace, previous);
    const saved = mergeSession(previous, {
      taskId,
      iteration,
      lastState: "EXECUTING",
      checkpoint: {
        taskId,
        iteration,
        protocolState: "EXECUTING",
        waitingFor: "none",
        originalGoal: typeof input.prompt === "string" ? input.prompt : undefined,
        nextExpectedStep: "persist matching execution record before completion",
      },
    });
    writeSession(workspace.id, saved);

    return {
      continue: true,
      suppressOutput: true,
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext:
          `C2C-managed task enrolled as ${taskId} iteration ${iteration}. ` +
          `Before reporting EXECUTED or stopping, ensure the matching execution record ` +
          `(taskId=${taskId}, iteration=${iteration}) is persisted by automatic Stop finalization.`,
      },
    };
  } catch {
    return {
      decision: "block",
      reason: "C2C task entry failed; managed checkpoint was not persisted.",
    };
  }
}
