import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { getStateDir } from "../config/paths.js";
import { readLastEndpoint } from "../config/endpoint.js";
import { readSession } from "../session/state.js";
import { Workspace } from "../workspace/manager.js";

function connected(id: string): boolean {
  const endpoint = readLastEndpoint(id);
  const session = readSession(id);
  return endpoint?.workspaceId === id || Boolean(session && (session.url || session.projectUrl || session.conversationMode));
}

function git(root: string, args: string[]): string {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 2000 }).trim();
}

/** Resolve hook state ownership without changing the file-access workspace. */
export function resolveHookWorkspaceId(cwd: string): string {
  const actual = new Workspace(cwd);
  const bindingFile = path.join(getStateDir(), "worktree-bindings", `${actual.id}.json`);
  if (!fs.existsSync(bindingFile)) return actual.id;

  // An invalid explicit binding is an error, never a reason to infer another owner.
  const binding: unknown = JSON.parse(fs.readFileSync(bindingFile, "utf8"));
  if (!binding || typeof binding !== "object" || Array.isArray(binding)) throw new Error("Invalid worktree binding");
  const { worktreeRoot, workspaceRoot, workspaceId } = binding as Record<string, unknown>;
  if (typeof worktreeRoot !== "string" || typeof workspaceRoot !== "string" || typeof workspaceId !== "string") throw new Error("Invalid worktree binding");
  if (fs.realpathSync.native(worktreeRoot) !== actual.root) throw new Error("Worktree binding root mismatch");
  const owner = new Workspace(workspaceRoot);
  if (owner.id !== workspaceId || !connected(owner.id)) throw new Error("Worktree owner is not connected");
  if (actual.id !== owner.id && connected(actual.id)) throw new Error("Worktree has a conflicting connection");
  const actualCommon = fs.realpathSync.native(git(actual.root, ["rev-parse", "--path-format=absolute", "--git-common-dir"]));
  const ownerCommon = fs.realpathSync.native(git(owner.root, ["rev-parse", "--path-format=absolute", "--git-common-dir"]));
  if (actualCommon !== ownerCommon) throw new Error("Worktree and owner have different repositories");
  const registered = git(actual.root, ["worktree", "list", "--porcelain", "-z"]).split("\0")
    .filter((entry) => entry.startsWith("worktree "))
    .map((entry) => fs.realpathSync.native(entry.slice("worktree ".length)));
  if (!registered.includes(actual.root) || !registered.includes(owner.root)) throw new Error("Worktree or owner is not registered");
  return owner.id;
}
