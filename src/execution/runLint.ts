import type { Workspace } from "../workspace/manager.js";
import { runPackageScript, type PackageScriptResult } from "./runPackageScript.js";

export type RunLintResult = PackageScriptResult;

export async function runLint(workspace: Workspace): Promise<RunLintResult> {
  return runPackageScript(workspace, { scriptName: "lint", taskId: "mcp_run_lint" });
}
