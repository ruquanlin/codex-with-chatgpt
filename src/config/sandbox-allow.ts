import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { packageRoot } from "./package-root.js";
import { getStateDir } from "./paths.js";

const TABLE = "sandbox_workspace_write";
const KEY = "writable_roots";

export interface SandboxAllowResult {
  added: boolean;
  alreadyAllowed: boolean;
  hookAdded: boolean;
  hookAlreadyInstalled: boolean;
  stateDir: string;
  configPath: string;
}

/**
 * Codex may not inherit the user's PATH when it runs hooks. Resolve the
 * packaged entry point explicitly so hooks work for local and global installs.
 */
export const C2C_CLI_ENTRY = path.resolve(packageRoot(), "bin", "c2c.js");
const hookCommand = (hook: string): string => `${quoteCommandArg(process.execPath)} ${quoteCommandArg(C2C_CLI_ENTRY)} hook ${hook}`;
export const STOP_HOOK_COMMAND = hookCommand("stop");
export const USER_PROMPT_SUBMIT_HOOK_COMMAND = hookCommand("user-prompt-submit");
const LEGACY_STOP_HOOK_COMMAND = "c2c hook stop";
const LEGACY_USER_PROMPT_SUBMIT_HOOK_COMMAND = "c2c hook user-prompt-submit";

export function getCodexHome(): string {
  const fromEnv = process.env.CODEX_HOME?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.join(os.homedir(), ".codex");
}

export function getCodexConfigPath(): string {
  return path.join(getCodexHome(), "config.toml");
}

/** POSIX slashes are valid in TOML and accepted by Codex on Windows. */
export function toTomlPath(p: string): string {
  if (/^[a-zA-Z]:[\\/]/.test(p) || p.startsWith("\\\\")) return p.replace(/\\/g, "/");
  return path.resolve(p).replace(/\\/g, "/");
}

export function pathsEquivalent(a: string, b: string): boolean {
  const left = normalizeCompare(a);
  const right = normalizeCompare(b);
  if (isWindowsStyle(a) || isWindowsStyle(b)) return left.toLowerCase() === right.toLowerCase();
  return left === right;
}

export function listWritableRoots(content: string): string[] {
  const table = findTable(content, TABLE);
  if (!table) return [];
  const assignment = findArrayAssignment(table.body, KEY);
  return assignment ? parseTomlStringArray(assignment.rawArray) : [];
}

export function isStateDirAllowlisted(content: string, stateDir: string): boolean {
  return listWritableRoots(content).some((root) => pathsEquivalent(root, stateDir));
}

/**
 * Idempotently add the C2C state directory to Codex's sandbox writable_roots
 * and install the C2C UserPromptSubmit enrollment and finalization Stop hooks.
 * Works on macOS, Windows, and Linux. Never rewrites unrelated config.
 */
export function ensureSandboxAllowlist(opts?: {
  configPath?: string;
  stateDir?: string;
}): SandboxAllowResult {
  const stateDir = path.resolve(opts?.stateDir ?? getStateDir());
  const configPath = opts?.configPath ?? getCodexConfigPath();
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  fs.mkdirSync(path.dirname(configPath), { recursive: true, mode: 0o700 });

  const previous = fs.existsSync(configPath) ? fs.readFileSync(configPath, "utf8") : "";
  const alreadyAllowed = isStateDirAllowlisted(previous, stateDir);
  const hookAlreadyInstalled = hasStopHook(previous);
  const userPromptHookAlreadyInstalled = hasUserPromptSubmitHook(previous);
  if (alreadyAllowed && hookAlreadyInstalled && userPromptHookAlreadyInstalled) {
    return {
      added: false,
      alreadyAllowed: true,
      hookAdded: false,
      hookAlreadyInstalled: true,
      stateDir,
      configPath,
    };
  }
  const withRoot = upsertWritableRoot(previous, stateDir);
  const next = upsertUserPromptSubmitHook(upsertStopHook(withRoot));
  fs.writeFileSync(configPath, next, { encoding: "utf8", mode: 0o600 });
  try {
    fs.chmodSync(configPath, 0o600);
  } catch {
    // Windows / filesystems without chmod semantics
  }
  return {
    added: !alreadyAllowed,
    alreadyAllowed,
    hookAdded: !hookAlreadyInstalled,
    hookAlreadyInstalled,
    stateDir,
    configPath,
  };
}

export function hasStopHook(content: string): boolean {
  const escaped = tomlHookCommand(STOP_HOOK_COMMAND).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^[ \\t]*command[ \\t]*=[ \\t]*["']${escaped}["'][ \\t]*$`, "m").test(content);
}

export function hasUserPromptSubmitHook(content: string): boolean {
  const escaped = tomlHookCommand(USER_PROMPT_SUBMIT_HOOK_COMMAND).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^[ \\t]*command[ \\t]*=[ \\t]*["']${escaped}["'][ \\t]*$`, "m").test(content);
}

export function upsertUserPromptSubmitHook(content: string): string {
  if (content.includes(`command = "${LEGACY_USER_PROMPT_SUBMIT_HOOK_COMMAND}"`)) {
    return content.replace(
      `command = "${LEGACY_USER_PROMPT_SUBMIT_HOOK_COMMAND}"`,
      `command = "${tomlHookCommand(USER_PROMPT_SUBMIT_HOOK_COMMAND)}"`
    );
  }
  if (hasUserPromptSubmitHook(content)) return content;
  const prefix = content.length === 0 ? "" : content.endsWith("\n") ? content : `${content}\n`;
  return `${prefix}\n[[hooks.UserPromptSubmit]]\n\n[[hooks.UserPromptSubmit.hooks]]\ntype = "command"\ncommand = "${tomlHookCommand(USER_PROMPT_SUBMIT_HOOK_COMMAND)}"\ntimeout = 5\n`;
}

export function upsertStopHook(content: string): string {
  if (content.includes(`command = "${LEGACY_STOP_HOOK_COMMAND}"`)) {
    return content.replace(`command = "${LEGACY_STOP_HOOK_COMMAND}"`, `command = "${tomlHookCommand(STOP_HOOK_COMMAND)}"`);
  }
  if (hasStopHook(content)) return content;
  const prefix = content.length === 0 ? "" : content.endsWith("\n") ? content : `${content}\n`;
  const spacer = prefix.length === 0 || prefix.endsWith("\n\n") ? "" : "\n";
  return (
    `${prefix}${spacer}[[hooks.Stop]]\n` +
    `\n[[hooks.Stop.hooks]]\n` +
    `type = "command"\n` +
    `command = "${tomlHookCommand(STOP_HOOK_COMMAND)}"\n` +
    `timeout = 5\n`
  );
}

export function upsertWritableRoot(content: string, stateDir: string): string {
  const tomlPath = toTomlPath(stateDir);
  if (isStateDirAllowlisted(content, stateDir)) return content;

  const table = findTable(content, TABLE);
  if (!table) {
    const prefix = content.length === 0 ? "" : content.endsWith("\n") ? content : `${content}\n`;
    const spacer = prefix.length === 0 || prefix.endsWith("\n\n") ? "" : "\n";
    return `${prefix}${spacer}[${TABLE}]\n${KEY} = ["${escapeTomlString(tomlPath)}"]\n`;
  }

  const assignment = findArrayAssignment(table.body, KEY);
  if (!assignment) {
    const insertAt = table.start + firstLineLength(table.body);
    const line = `${KEY} = ["${escapeTomlString(tomlPath)}"]\n`;
    return content.slice(0, insertAt) + line + content.slice(insertAt);
  }

  const roots = parseTomlStringArray(assignment.rawArray);
  const nextRoots = [...roots, tomlPath];
  const multiline = assignment.rawArray.includes("\n");
  const rendered = multiline
    ? `[\n${nextRoots.map((root) => `  "${escapeTomlString(toTomlPath(root))}"`).join(",\n")},\n]`
    : `[${nextRoots.map((root) => `"${escapeTomlString(toTomlPath(root))}"`).join(", ")}]`;

  const absStart = table.start + assignment.start;
  const absEnd = table.start + assignment.end;
  return content.slice(0, absStart) + `${KEY} = ${rendered}` + content.slice(absEnd);
}

function normalizeCompare(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/+$/, "");
}

function isWindowsStyle(p: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(p) || p.includes("\\");
}

function escapeTomlString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function quoteCommandArg(value: string): string {
  // Forward slashes are valid on Windows and avoid TOML basic-string escapes.
  return `"${toTomlPath(value).replace(/"/g, '\\"')}"`;
}

function tomlHookCommand(command: string): string {
  return escapeTomlString(command);
}

function findTable(content: string, name: string): { start: number; end: number; body: string } | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`^[ \\t]*\\[${escaped}\\][ \\t]*$`, "m").exec(content);
  if (!match) return null;
  const start = match.index;
  const afterHeader = start + match[0].length;
  const rest = content.slice(afterHeader);
  const next = /^[ \t]*\[[^\]]+\][ \t]*$/m.exec(rest);
  const end = next ? afterHeader + next.index : content.length;
  return { start, end, body: content.slice(start, end) };
}

function findArrayAssignment(
  tableBody: string,
  key: string
): { start: number; end: number; rawArray: string } | null {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`^[ \\t]*${escaped}[ \\t]*=[ \\t]*(\\[[\\s\\S]*?\\])`, "m").exec(tableBody);
  if (!match) return null;
  return {
    start: match.index,
    end: match.index + match[0].length,
    rawArray: match[1],
  };
}

function parseTomlStringArray(src: string): string[] {
  const values: string[] = [];
  const re = /"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(src))) {
    const raw = match[1] ?? match[2] ?? "";
    values.push(raw.replace(/\\(.)/g, "$1"));
  }
  return values;
}

function firstLineLength(text: string): number {
  const newline = text.indexOf("\n");
  return newline === -1 ? text.length : newline + 1;
}
