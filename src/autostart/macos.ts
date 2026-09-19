import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ensureDir } from "../config/paths.js";

const SERVICE_PREFIX = "com.codex-with-chatgpt.workspace";

export interface MacAutostartConfig {
  workspaceId: string;
  workspaceRoot: string;
  nodePath?: string;
  cliPath?: string;
  homeDir?: string;
}

export interface MacAutostartStatus {
  supported: boolean;
  installed: boolean;
  loaded: boolean | null;
  running: boolean | null;
  pid: number | null;
  workspace: string;
  identifier: string;
  path: string;
  reason?: string;
}

function requireMac(): void {
  if (process.platform !== "darwin") {
    throw new Error("autostart is currently supported on macOS only");
  }
}

function safeWorkspaceId(workspaceId: string): string {
  const safe = workspaceId.trim().replace(/[^A-Za-z0-9_-]/g, "-");
  if (!safe) throw new Error("workspace id is required");
  return safe;
}

export function launchAgentIdentifier(workspaceId: string): string {
  return `${SERVICE_PREFIX}.${safeWorkspaceId(workspaceId)}`;
}

export function launchAgentsDir(homeDir = os.homedir()): string {
  return path.join(homeDir, "Library", "LaunchAgents");
}

export function launchAgentPath(workspaceId: string, homeDir = os.homedir()): string {
  return path.join(launchAgentsDir(homeDir), `${launchAgentIdentifier(workspaceId)}.plist`);
}

export function defaultCliPath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..", "..", "bin", "c2c.js");
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function macAutostartPlist(config: MacAutostartConfig): string {
  const identifier = launchAgentIdentifier(config.workspaceId);
  const workspaceRoot = path.resolve(config.workspaceRoot);
  const nodePath = path.resolve(config.nodePath ?? process.execPath);
  const cliPath = path.resolve(config.cliPath ?? defaultCliPath());
  const stateLogDir = path.join(config.homeDir ?? os.homedir(), "Library", "Application Support", "codex-with-chatgpt", "logs");
  const stdout = path.join(stateLogDir, `autostart-${safeWorkspaceId(config.workspaceId)}.out.log`);
  const stderr = path.join(stateLogDir, `autostart-${safeWorkspaceId(config.workspaceId)}.err.log`);
  const args = [nodePath, cliPath, "start", "-w", workspaceRoot, "--json"];
  const argXml = args.map((arg) => `    <string>${xmlEscape(arg)}</string>`).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xmlEscape(identifier)}</string>
  <key>ProgramArguments</key>
  <array>
${argXml}
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${xmlEscape(stdout)}</string>
  <key>StandardErrorPath</key>
  <string>${xmlEscape(stderr)}</string>
  <key>WorkingDirectory</key>
  <string>${xmlEscape(workspaceRoot)}</string>
</dict>
</plist>
`;
}

function launchctlDomain(): string {
  return `gui/${process.getuid?.() ?? os.userInfo().uid}`;
}

function runLaunchctl(args: string[]): { ok: boolean; stdout: string; stderr: string; status: number | null } {
  const result = spawnSync("launchctl", args, { encoding: "utf8" });
  return {
    ok: result.status === 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status,
  };
}

function parsePid(output: string): number | null {
  const match = output.match(/\bpid\s*=\s*(\d+)/);
  if (!match) return null;
  const pid = Number(match[1]);
  return Number.isSafeInteger(pid) ? pid : null;
}

export function macAutostartStatus(config: MacAutostartConfig): MacAutostartStatus {
  requireMac();
  const workspaceRoot = path.resolve(config.workspaceRoot);
  const identifier = launchAgentIdentifier(config.workspaceId);
  const file = launchAgentPath(config.workspaceId, config.homeDir);
  const installed = fs.existsSync(file);
  const printed = runLaunchctl(["print", `${launchctlDomain()}/${identifier}`]);
  const pid = printed.ok ? parsePid(printed.stdout) : null;
  return {
    supported: true,
    installed,
    loaded: installed ? printed.ok : false,
    running: installed ? pid !== null : false,
    pid,
    workspace: workspaceRoot,
    identifier,
    path: file,
    reason: printed.ok ? undefined : (printed.stderr || printed.stdout || undefined)?.trim(),
  };
}

export function enableMacAutostart(config: MacAutostartConfig): MacAutostartStatus {
  requireMac();
  const file = launchAgentPath(config.workspaceId, config.homeDir);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o755 });
  ensureDir(path.join(config.homeDir ?? os.homedir(), "Library", "Application Support", "codex-with-chatgpt", "logs"));
  fs.writeFileSync(file, macAutostartPlist(config), { mode: 0o644 });

  const identifier = launchAgentIdentifier(config.workspaceId);
  const domain = launchctlDomain();
  runLaunchctl(["bootout", `${domain}/${identifier}`]);
  const bootstrapped = runLaunchctl(["bootstrap", domain, file]);
  if (!bootstrapped.ok) {
    throw new Error(`launchctl bootstrap failed: ${(bootstrapped.stderr || bootstrapped.stdout).trim()}`);
  }
  runLaunchctl(["kickstart", "-k", `${domain}/${identifier}`]);
  return macAutostartStatus(config);
}

export function disableMacAutostart(config: MacAutostartConfig): MacAutostartStatus {
  requireMac();
  const file = launchAgentPath(config.workspaceId, config.homeDir);
  runLaunchctl(["bootout", `${launchctlDomain()}/${launchAgentIdentifier(config.workspaceId)}`]);
  fs.rmSync(file, { force: true });
  return macAutostartStatus(config);
}
