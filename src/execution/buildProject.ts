import type { Workspace } from "../workspace/manager.js";
import { runPackageScript, type PackageScriptResult } from "./runPackageScript.js";

export type BuildProjectResult = PackageScriptResult;

export async function buildProject(workspace: Workspace): Promise<BuildProjectResult> {
  return runPackageScript(workspace, { scriptName: "build", taskId: "mcp_build_project" });
}
