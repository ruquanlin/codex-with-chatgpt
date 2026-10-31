import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveHookWorkspaceId } from "../src/hooks/workspace-identity.js";
import { writeLastEndpoint } from "../src/config/endpoint.js";
import { Workspace } from "../src/workspace/manager.js";
import { cleanup, isolateStateDir, makeGitRepo, makeGitWorktree, makeTmpDir } from "./helpers.js";

describe("explicit worktree workspace identity", () => {
  it("uses the validated owner and refuses ambiguous or invalid bindings", () => {
    const root = makeTmpDir("identity-main");
    const owner = makeTmpDir("identity-owner");
    const child = makeTmpDir("identity-child");
    const unrelated = makeTmpDir("identity-unrelated");
    const state = isolateStateDir();
    try {
      makeGitRepo(root); makeGitWorktree(root, owner); makeGitWorktree(root, child); makeGitRepo(unrelated);
      const main = new Workspace(root); const connected = new Workspace(owner); const actual = new Workspace(child);
      for (const workspace of [main, connected]) writeLastEndpoint({ workspaceId: workspace.id, port: 1234, publicUrl: null, mcpUrl: null });
      expect(resolveHookWorkspaceId(child)).toBe(actual.id);
      const dir = path.join(state, "worktree-bindings"); fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `${actual.id}.json`);
      const bind = (workspaceRoot: string, workspaceId: string) => fs.writeFileSync(file, JSON.stringify({ worktreeRoot: child, workspaceRoot, workspaceId }));
      bind(owner, connected.id);
      expect(resolveHookWorkspaceId(child)).toBe(connected.id);
      expect(actual.resolve("hello.txt").abs).toContain(child);
      expect(() => actual.resolve("../outside")).toThrow();
      bind(owner, main.id); expect(() => resolveHookWorkspaceId(child)).toThrow();
      bind(unrelated, new Workspace(unrelated).id); expect(() => resolveHookWorkspaceId(child)).toThrow();
      bind(owner, connected.id);
      writeLastEndpoint({ workspaceId: actual.id, port: 1234, publicUrl: null, mcpUrl: null });
      expect(() => resolveHookWorkspaceId(child)).toThrow(/conflicting/);
      fs.unlinkSync(path.join(state, "endpoints", `${actual.id}.json`));
      fs.unlinkSync(path.join(state, "endpoints", `${connected.id}.json`));
      expect(() => resolveHookWorkspaceId(child)).toThrow(/not connected/);
      fs.writeFileSync(file, "{"); expect(() => resolveHookWorkspaceId(child)).toThrow();
    } finally { for (const dir of [root, owner, child, unrelated, state]) cleanup(dir); delete process.env.C2C_STATE_DIR; }
  });
});
