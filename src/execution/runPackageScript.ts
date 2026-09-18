import { spawn } from "node:child_process";
import path from "node:path";
import { readJsonIfExists } from "../config/paths.js";
import type { Workspace } from "../workspace/manager.js";
import { appendExecutionRecord, latestExecutionRecord } from "./records.js";
import { saveExecutionOutput } from "./output.js";

export const DEFAULT_MAX_STREAM_BYTES = 1024 * 1024;
export const DEFAULT_SCRIPT_TIMEOUT_MS = 120_000;
const TRUNCATED_MARKER = "\n...[truncated]";

export interface PackageScriptResult {
  passed: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface PackageJson {
  scripts?: Record<string, unknown>;
  packageManager?: unknown;
}

function configuredScriptCommand(
  workspace: Workspace,
  scriptName: string
): { command: string; args: string[]; display: string } {
  const pkg = readJsonIfExists<PackageJson>(path.join(workspace.root, "package.json"));
  const script = pkg?.scripts?.[scriptName];
  if (typeof script !== "string" || script.trim() === "") {
    throw new Error(`No configured ${scriptName} command found in package.json scripts.${scriptName}.`);
  }

  const detected = workspace.detectProject().packageManager;
  const declared = typeof pkg?.packageManager === "string" ? pkg.packageManager.split("@")[0] : null;
  const manager = detected ?? declared ?? "npm";
  return { command: manager, args: ["run", scriptName], display: `${manager} run ${scriptName}` };
}

function trimToMaxBytes(text: string, maxBytes: number): string {
  let trimmed = text;
  while (Buffer.byteLength(trimmed, "utf8") > maxBytes && trimmed.length > 0) {
    trimmed = trimmed.slice(0, Math.floor(trimmed.length * 0.9));
  }
  return trimmed;
}

function appendChunk(current: string, chunk: Buffer, maxBytes: number): string {
  if (current.endsWith(TRUNCATED_MARKER)) return current;
  const next = current + chunk.toString("utf8");
  if (Buffer.byteLength(next, "utf8") <= maxBytes) return next;
  const markerBytes = Buffer.byteLength(TRUNCATED_MARKER, "utf8");
  return `${trimToMaxBytes(next, Math.max(0, maxBytes - markerBytes))}${TRUNCATED_MARKER}`;
}

function summarize(result: PackageScriptResult): string {
  if (result.passed) return "passed";
  return result.exitCode === 124 ? "timed out" : "failed";
}

export async function runPackageScript(
  workspace: Workspace,
  options: { scriptName: string; taskId: string; timeoutMs?: number; maxOutputBytes?: number }
): Promise<PackageScriptResult> {
  const { command, args, display } = configuredScriptCommand(workspace, options.scriptName);
  const timeoutMs = Math.max(1, Math.floor(options.timeoutMs ?? DEFAULT_SCRIPT_TIMEOUT_MS));
  const maxOutputBytes = Math.max(128, Math.floor(options.maxOutputBytes ?? DEFAULT_MAX_STREAM_BYTES));
  let stdout = "";
  let stderr = "";
  let timedOut = false;

  const exitCode = await new Promise<number>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: workspace.root,
      env: { ...process.env },
      shell: false,
      windowsHide: true,
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout = appendChunk(stdout, chunk, maxOutputBytes);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = appendChunk(stderr, chunk, maxOutputBytes);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve(timedOut ? 124 : (code ?? 1));
    });
  });

  const result: PackageScriptResult = {
    passed: exitCode === 0,
    exitCode,
    stdout,
    stderr,
  };
  const validationType =
    options.scriptName === "test" || options.scriptName === "lint" || options.scriptName === "build" || options.scriptName === "typecheck"
      ? options.scriptName
      : "other";
  const latest = latestExecutionRecord(workspace.id);
  const iteration = (latest?.iteration ?? 0) + 1;
  const output = saveExecutionOutput(workspace.id, {
    command: display,
    stdout,
    stderr,
    exitCode,
    taskId: options.taskId,
    iteration,
    validationType,
  });
  appendExecutionRecord(workspace.id, {
    taskId: options.taskId,
    iteration,
    changedFiles: 0,
    command: display,
    exitCode,
    validationType,
    tests: summarize(result),
    exitStatus: result.passed ? "ok" : "failed",
    timestamp: new Date().toISOString(),
    outputId: output.id,
    outputAvailable: output.allowed,
  });

  return result;
}
