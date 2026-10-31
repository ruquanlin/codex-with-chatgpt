import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { enrollUserPrompt } from "../src/hooks/user-prompt-submit.js";
import { writeLastEndpoint } from "../src/config/endpoint.js";
import { appendExecutionRecord } from "../src/execution/records.js";
import { readExecutionRecords } from "../src/execution/records.js";
import { mergeSession, readSession, writeSession } from "../src/session/state.js";
import { Workspace } from "../src/workspace/manager.js";
import { cleanup, isolateStateDir, makeGitRepo, makeGitWorktree, makeTmpDir } from "./helpers.js";

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

  it("enrolls a registered Git worktree under its explicitly bound workspace ID", () => {
    const root = makeTmpDir("prompt-hook-main-git");
    const worktree = makeTmpDir("prompt-hook-git-worktree");
    const state = isolateStateDir();
    try {
      makeGitRepo(root);
      makeGitWorktree(root, worktree);
      const main = new Workspace(root);
      const worktreeWorkspace = new Workspace(worktree);
      expect(main.id).not.toBe(worktreeWorkspace.id);
      writeLastEndpoint({ workspaceId: main.id, port: 17666, publicUrl: null, mcpUrl: null });
      fs.mkdirSync(path.join(state, "worktree-bindings"), { recursive: true });
      fs.writeFileSync(path.join(state, "worktree-bindings", `${worktreeWorkspace.id}.json`), JSON.stringify({ worktreeRoot: worktree, workspaceRoot: root, workspaceId: main.id }));

      const result = enrollUserPrompt({ hook_event_name: "UserPromptSubmit", cwd: worktree, prompt: "verify worktree enrollment" });

      expect(result).toMatchObject({ continue: true, hookSpecificOutput: { hookEventName: "UserPromptSubmit" } });
      expect(readSession(main.id)?.checkpoint).toMatchObject({ taskId: `c2c_${main.id}`, iteration: 0 });
      expect(readSession(worktreeWorkspace.id)).toBeNull();
      expect(worktreeWorkspace.resolve("hello.txt").abs).toContain(worktree);
      expect(() => worktreeWorkspace.resolve("../outside")).toThrow();
    } finally {
      cleanup(root);
      cleanup(worktree);
      cleanup(state);
      delete process.env.C2C_STATE_DIR;
    }
  });

  it("does not inherit a connection in an unregistered directory", () => {
    const root = makeTmpDir("prompt-hook-unregistered-main");
    const unrelated = makeTmpDir("prompt-hook-unregistered-child");
    const state = isolateStateDir();
    try {
      makeGitRepo(root);
      const main = new Workspace(root);
      writeLastEndpoint({ workspaceId: main.id, port: 17666, publicUrl: null, mcpUrl: null });

      expect(enrollUserPrompt({ hook_event_name: "UserPromptSubmit", cwd: unrelated, prompt: "must not enroll" })).toEqual({ continue: true, suppressOutput: true });
      expect(readSession(main.id)).toBeNull();
    } finally {
      cleanup(root);
      cleanup(unrelated);
      cleanup(state);
      delete process.env.C2C_STATE_DIR;
    }
  });

  it("recovers a missing record as interrupted and starts the next iteration", () => {
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

      const result = enrollUserPrompt({ hook_event_name: "UserPromptSubmit", cwd: root, prompt: "next" });

      expect(result).toMatchObject({ continue: true });
      expect(readExecutionRecords(workspace.id)).toEqual([
        expect.objectContaining({
          taskId: "c2c_old",
          iteration: 1,
          command: "c2c interrupted recovery",
          validationType: "other",
          tests: null,
          exitStatus: "interrupted",
          exitCode: null,
          changedFiles: 0,
          notes: expect.stringMatching(/interrupted before Stop finalization.*no successful validation result.*does not mean zero changes were verified/),
        }),
      ]);
      expect(readSession(workspace.id)?.checkpoint).toMatchObject({ taskId: "c2c_old", iteration: 2 });

      // A repeated hook call sees the recovery record and advances normally without duplicating it.
      expect(enrollUserPrompt({ hook_event_name: "UserPromptSubmit", cwd: root, prompt: "again" })).toMatchObject({ continue: true });
      expect(readExecutionRecords(workspace.id).filter((record) => record.taskId === "c2c_old" && record.iteration === 1)).toHaveLength(1);
      expect(readSession(workspace.id)?.checkpoint).toMatchObject({ taskId: "c2c_old", iteration: 3 });
    } finally {
      cleanup(root);
      cleanup(state);
      delete process.env.C2C_STATE_DIR;
    }
  });

  it("blocks on recovery persistence failure and preserves the previous checkpoint", async () => {
    const root = makeTmpDir("prompt-hook-recovery-failure");
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
          checkpoint: { taskId: "c2c_old", iteration: 1, protocolState: "EXECUTING", waitingFor: "none" },
        })
      );
      const records = await import("../src/execution/records.js");
      const appendSpy = (await import("vitest")).vi.spyOn(records, "appendExecutionRecord").mockImplementation(() => {
        throw new Error("disk full");
      });
      const result = enrollUserPrompt({ hook_event_name: "UserPromptSubmit", cwd: root, prompt: "next" });
      expect(result).toMatchObject({ decision: "block", reason: expect.stringMatching(/interrupted recovery\/finalization failed/i) });
      expect(readSession(workspace.id)?.checkpoint).toMatchObject({ taskId: "c2c_old", iteration: 1 });
      expect(readExecutionRecords(workspace.id)).toEqual([]);
      appendSpy.mockRestore();
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
