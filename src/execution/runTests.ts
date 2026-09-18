import type { Workspace } from "../workspace/manager.js";
import { runPackageScript, type PackageScriptResult } from "./runPackageScript.js";

export type RunTestsResult = PackageScriptResult;

export async function runTests(workspace: Workspace): Promise<RunTestsResult> {
  return runPackageScript(workspace, { scriptName: "test", taskId: "mcp_run_tests" });
}
