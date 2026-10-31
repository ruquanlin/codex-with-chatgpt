import { appendExecutionRecord, hasExecutionRecord } from "../execution/records.js";
import { getStateDir } from "../config/paths.js";
import { readLastEndpoint } from "../config/endpoint.js";
import { mergeSession, readSession, writeSession, type SavedSession } from "../session/state.js";
import { Workspace } from "../workspace/manager.js";
import { resolveHookWorkspaceId } from "./workspace-identity.js";
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

function nextIteration(workspace: Pick<Workspace, "id">, session: SavedSession | null): number {
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
    const workspaceId = resolveHookWorkspaceId(input.cwd);
    const previous = readSession(workspaceId);
    const endpoint = readLastEndpoint(workspaceId);

    // A saved chat/project binding or bridge endpoint is the durable indication that C2C is connected.
    if (!endpoint && (!previous || (!previous.url && !previous.projectUrl && !previous.conversationMode))) {
      return { continue: true, suppressOutput: true };
    }

    const active = previous?.checkpoint;
    if (active && !hasExecutionRecord(workspaceId, active.taskId, active.iteration)) {
      try {
        appendExecutionRecord(workspaceId, {
          taskId: active.taskId,
          iteration: active.iteration,
          changedFiles: 0,
          command: "c2c interrupted recovery",
          exitCode: null,
          validationType: "other",
          tests: null,
          exitStatus: "interrupted",
          timestamp: new Date().toISOString(),
          notes:
            "This iteration was interrupted before Stop finalization and produced no successful validation result; " +
            "changedFiles=0 is a schema placeholder and does not mean zero changes were verified.",
        });
      } catch {
        return {
          decision: "block",
          reason:
            `C2C interrupted recovery/finalization failed: could not persist execution record for ` +
            `${active.taskId} iteration ${active.iteration}. The previous checkpoint was preserved.`,
        };
      }
      if (!hasExecutionRecord(workspaceId, active.taskId, active.iteration)) {
        return {
          decision: "block",
          reason:
            `C2C interrupted recovery/finalization failed: no execution record exists for ` +
            `${active.taskId} iteration ${active.iteration}. The previous checkpoint was preserved.`,
        };
      }
    }

    const taskId = previous?.taskId ?? `c2c_${workspaceId.slice(0, 12)}`;
    const iteration = nextIteration({ id: workspaceId }, previous);
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
    writeSession(workspaceId, saved);

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
