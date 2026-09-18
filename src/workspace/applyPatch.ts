import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Workspace } from "./manager.js";
import { runGit } from "./git.js";

const MAX_PATCH_BYTES = 1024 * 1024;

export interface ApplyPatchResult {
  checked: true;
  applied: boolean;
}

function gitError(action: string, stderr: string, stdout: string, code: number | null): Error {
  const details = stderr.trim() || stdout.trim() || `git exited with code ${code ?? "unknown"}`;
  return new Error(`${action} failed: ${details}`);
}

export function applyPatch(
  workspace: Workspace,
  options: {
    patch: string;
    dryRun?: boolean;
  }
): ApplyPatchResult {
  if (Buffer.byteLength(options.patch, "utf8") > MAX_PATCH_BYTES) {
    throw new Error(`Patch exceeds the maximum size of ${MAX_PATCH_BYTES} bytes.`);
  }

  const dryRun = options.dryRun ?? false;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "c2c-apply-patch-"));
  const tempFile = path.join(tempDir, "patch.diff");

  try {
    fs.writeFileSync(tempFile, options.patch, "utf8");

    const check = runGit(workspace.root, ["apply", "--check", "--whitespace=nowarn", tempFile]);
    if (!check.ok) {
      throw gitError("git apply --check", check.stderr, check.stdout, check.code);
    }

    if (dryRun) {
      return { checked: true, applied: false };
    }

    const apply = runGit(workspace.root, ["apply", "--whitespace=nowarn", tempFile]);
    if (!apply.ok) {
      throw gitError("git apply", apply.stderr, apply.stdout, apply.code);
    }

    return { checked: true, applied: true };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
