import { describe, expect, it } from "vitest";
import { enrollUserPrompt } from "../src/hooks/user-prompt-submit.js";
import { writeLastEndpoint } from "../src/config/endpoint.js";
import { appendExecutionRecord } from "../src/execution/records.js";
import { mergeSession, readSession, writeSession } from "../src/session/state.js";
import { Workspace } from "../src/workspace/manager.js";
import { cleanup, isolateStateDir, makeTmpDir } from "./helpers.js";

describe("C2C UserPromptSubmit hook", () => {
  it("enrolls a connected workspace and injects the matching record requirement", () => {
    const root = makeTmpDir("prompt-hook-connected");
    const state = isolateStateDir();
    try {
      const workspace = new Workspace(root);
      writeSession(workspace.id, mergeSession(null, { url: "https://chatgpt.com/c/c2c", conversationMode: "long-chat" }));
      const result = enrollUserPrompt({ hook_event_name: "UserPromptSubmit", cwd: root, prompt: "fix it" });

      expect(result).toMatchObject({ continue: true });
      const context = "hookSpecificOutput" in result ? result.hookSpecificOutput.additionalContext : "";
      expect(context).toMatch(/matching execution record \(taskId=c2c_[^,]+, iteration=0\) is persisted by automatic Stop finalization/);
      expect(context).not.toContain("c2c record");
      expect(context).not.toContain("c2c exec");
      expect(readSession(workspace.id)?.checkpoint).toMatchObject({
        protocolState: "EXECUTING",
        iteration: 0,
      });
    } finally {
      cleanup(root);
      cleanup(state);
      delete process.env.C2C_STATE_DIR;
    }
  });

  it("enrolls an endpoint-connected workspace even when no session exists", () => {
    const root = makeTmpDir("prompt-hook-endpoint-only");
    const state = isolateStateDir();
    try {
      const workspace = new Workspace(root);
      writeLastEndpoint({
        workspaceId: workspace.id,
        port: 17666,
        publicUrl: "https://example.trycloudflare.com",
        mcpUrl: "https://example.trycloudflare.com/mcp",
      });

      const result = enrollUserPrompt({ hook_event_name: "UserPromptSubmit", cwd: root, prompt: "fix endpoint case" });

      expect(result).toMatchObject({ continue: true });
      expect(readSession(workspace.id)?.checkpoint).toMatchObject({
        taskId: `c2c_${workspace.id.slice(0, 12)}`,
        iteration: 0,
        protocolState: "EXECUTING",
      });
    } finally {
      cleanup(root);
      cleanup(state);
      delete process.env.C2C_STATE_DIR;
    }
  });

  it("blocks a new managed prompt while the previous task lacks a record", () => {
    const root = makeTmpDir("prompt-hook-blocked");
    const state = isolateStateDir();
    try {
      const workspace = new Workspace(root);
      writeSession(
        workspace.id,
        mergeSession(null, {
          url: "https://chatgpt.com/c/c2c",
          conversationMode: "long-chat",
          taskId: "c2c_old",
          iteration: 1,
          checkpoint: {
            taskId: "c2c_old",
            iteration: 1,
            protocolState: "EXECUTING",
            waitingFor: "none",
          },
        })
      );

      expect(enrollUserPrompt({ hook_event_name: "UserPromptSubmit", cwd: root, prompt: "next" })).toMatchObject({
        decision: "block",
      });
    } finally {
      cleanup(root);
      cleanup(state);
      delete process.env.C2C_STATE_DIR;
    }
  });

  it("allows the next prompt after the previous record exists", () => {
    const root = makeTmpDir("prompt-hook-next");
    const state = isolateStateDir();
    try {
      const workspace = new Workspace(root);
      writeSession(
        workspace.id,
        mergeSession(null, {
          url: "https://chatgpt.com/c/c2c",
          conversationMode: "long-chat",
          taskId: "c2c_old",
          iteration: 1,
          checkpoint: {
            taskId: "c2c_old",
            iteration: 1,
            protocolState: "EXECUTING",
            waitingFor: "none",
          },
        })
      );
      appendExecutionRecord(workspace.id, {
        taskId: "c2c_old",
        iteration: 1,
        changedFiles: 0,
        tests: null,
        exitStatus: "ok",
        timestamp: new Date().toISOString(),
      });

      const result = enrollUserPrompt({ hook_event_name: "UserPromptSubmit", cwd: root, prompt: "next" });
      expect(result).toMatchObject({ continue: true });
      expect(readSession(workspace.id)?.checkpoint?.iteration).toBeGreaterThan(1);
    } finally {
      cleanup(root);
      cleanup(state);
      delete process.env.C2C_STATE_DIR;
    }
  });

  it("leaves a non-C2C workspace unchanged", () => {
    const root = makeTmpDir("prompt-hook-unconnected");
    const state = isolateStateDir();
    try {
      const result = enrollUserPrompt({ hook_event_name: "UserPromptSubmit", cwd: root, prompt: "hello" });
      expect(result).toEqual({ continue: true, suppressOutput: true });
      expect(readSession(new Workspace(root).id)).toBeNull();
    } finally {
      cleanup(root);
      cleanup(state);
      delete process.env.C2C_STATE_DIR;
    }
  });
});
