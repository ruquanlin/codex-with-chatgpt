import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  ensureSandboxAllowlist,
  C2C_CLI_ENTRY,
  hasStopHook,
  hasUserPromptSubmitHook,
  isStateDirAllowlisted,
  pathsEquivalent,
  toTomlPath,
  upsertStopHook,
  upsertUserPromptSubmitHook,
  upsertWritableRoot,
} from "../src/config/sandbox-allow.js";
import { makeTmpDir, cleanup } from "./helpers.js";

const stopHookCommand = `"${process.execPath.replace(/\\/g, "/")}" "${C2C_CLI_ENTRY.replace(/\\/g, "/")}" hook stop`;
const userPromptSubmitHookCommand = `"${process.execPath.replace(/\\/g, "/")}" "${C2C_CLI_ENTRY.replace(/\\/g, "/")}" hook user-prompt-submit`;

describe("sandbox allowlist", () => {
  it("treats Windows slash variants as the same path", () => {
    expect(pathsEquivalent("C:\\Users\\Ada\\AppData\\Local\\codex-with-chatgpt", "C:/Users/Ada/AppData/Local/codex-with-chatgpt")).toBe(
      true
    );
    expect(pathsEquivalent("C:/Users/Ada/AppData/Local/codex-with-chatgpt/", "c:\\users\\ada\\appdata\\local\\codex-with-chatgpt")).toBe(
      true
    );
    expect(toTomlPath("C:\\Users\\Ada\\AppData\\Local\\codex-with-chatgpt").includes("\\")).toBe(false);
  });

  it("creates the table when config.toml is missing", () => {
    const dir = makeTmpDir("sandbox-missing");
    const stateDir = path.join(dir, "state");
    const configPath = path.join(dir, "config.toml");
    const result = ensureSandboxAllowlist({ configPath, stateDir });
    expect(result.added).toBe(true);
    const text = fs.readFileSync(configPath, "utf8");
    expect(text).toContain("[sandbox_workspace_write]");
    expect(isStateDirAllowlisted(text, stateDir)).toBe(true);
    expect(hasStopHook(text)).toBe(true);
    expect(hasUserPromptSubmitHook(text)).toBe(true);
    cleanup(dir);
  });

  it("installs the Stop hook once without rewriting other hooks", () => {
    const original = [
      "[[hooks.PreToolUse]]",
      'matcher = "Bash"',
      "",
      "[[hooks.PreToolUse.hooks]]",
      'type = "command"',
      'command = "existing-hook"',
      "",
    ].join("\n");
    const once = upsertStopHook(original);
    const twice = upsertStopHook(once);
    expect(once).toContain('command = "existing-hook"');
    expect(once).toContain("[[hooks.Stop]]");
    expect(once).toContain(expectedTomlCommandLine(stopHookCommand));
    expect(readTomlCommandValues(once)).toContain(stopHookCommand);
    expect(once).not.toContain('command = "c2c hook stop"');
    expect(twice).toBe(once);
  });

  it("installs the UserPromptSubmit hook once", () => {
    const once = upsertUserPromptSubmitHook("");
    const twice = upsertUserPromptSubmitHook(once);
    expect(once).toContain("[[hooks.UserPromptSubmit]]");
    expect(once).toContain(expectedTomlCommandLine(userPromptSubmitHookCommand));
    expect(readTomlCommandValues(once)).toContain(userPromptSubmitHookCommand);
    expect(once).not.toContain('command = "c2c hook user-prompt-submit"');
    expect(twice).toBe(once);
  });

  it("migrates legacy bare hook commands in place", () => {
    const legacy = 'command = "c2c hook stop"\ncommand = "c2c hook user-prompt-submit"\n';
    const migrated = upsertUserPromptSubmitHook(upsertStopHook(legacy));
    expect(migrated).not.toContain('command = "c2c hook');
    expect(readTomlCommandValues(migrated)).toEqual([stopHookCommand, userPromptSubmitHookCommand]);
  });

  it("appends the table without rewriting existing Codex settings", () => {
    const original = [
      'model = "gpt-5.6-luna"',
      "",
      "[features]",
      "js_repl = false",
      "",
      '[projects."/Users/ada/app"]',
      'trust_level = "trusted"',
      "",
    ].join("\n");
    const next = upsertWritableRoot(original, "/Users/ada/Library/Application Support/codex-with-chatgpt");
    expect(next).toContain('model = "gpt-5.6-luna"');
    expect(next).toContain("[features]");
    expect(next).toContain('trust_level = "trusted"');
    expect(next).toContain("[sandbox_workspace_write]");
    expect(next).toContain(
      `writable_roots = ["${toTomlPath("/Users/ada/Library/Application Support/codex-with-chatgpt")}"]`
    );
  });

  it("inserts writable_roots into an existing empty table", () => {
    const next = upsertWritableRoot("[sandbox_workspace_write]\n", "/tmp/c2c-state");
    expect(next).toContain(`writable_roots = ["${toTomlPath("/tmp/c2c-state")}"]`);
  });

  it("adds to a single-line array and keeps other roots", () => {
    const next = upsertWritableRoot(
      '[sandbox_workspace_write]\nwritable_roots = ["/already"]\n',
      "/Users/ada/Library/Application Support/codex-with-chatgpt"
    );
    expect(next).toContain(`"${toTomlPath("/already")}"`);
    expect(next).toContain(`"${toTomlPath("/Users/ada/Library/Application Support/codex-with-chatgpt")}"`);
  });

  it("adds to a multiline Windows-style array", () => {
    const next = upsertWritableRoot(
      [
        "[sandbox_workspace_write]",
        "writable_roots = [",
        '  "C:/Users/Ada/other",',
        "]",
        "",
      ].join("\n"),
      "C:\\Users\\Ada\\AppData\\Local\\codex-with-chatgpt"
    );
    expect(next).toContain("C:/Users/Ada/other");
    expect(next).toContain("C:/Users/Ada/AppData/Local/codex-with-chatgpt");
  });

  it("is idempotent when the path is already listed with the other slash style", () => {
    const dir = makeTmpDir("sandbox-idem");
    const configPath = path.join(dir, "config.toml");
    const stateDir = path.join(dir, "state");
    fs.writeFileSync(
      configPath,
      `[sandbox_workspace_write]\nwritable_roots = ["${toTomlPath(stateDir)}"]\n`
    );
    const first = ensureSandboxAllowlist({ configPath, stateDir });
    const second = ensureSandboxAllowlist({ configPath, stateDir });
    expect(first.alreadyAllowed).toBe(true);
    expect(second.added).toBe(false);
    const text = fs.readFileSync(configPath, "utf8");
    expect(text.match(/writable_roots/g)?.length).toBe(1);
    cleanup(dir);
  });
});

function expectedTomlCommandLine(command: string): string {
  return `command = "${command.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function readTomlCommandValues(content: string): string[] {
  return content
    .split("\n")
    .filter((line) => line.trim().startsWith("command = "))
    .map((line) => readTomlBasicString(line.trim(), "command"));
}

function readTomlBasicString(line: string, key: string): string {
  const prefix = `${key} = "`;
  expect(line.startsWith(prefix)).toBe(true);
  let value = "";
  for (let i = prefix.length; i < line.length; i += 1) {
    const char = line[i];
    if (char === "\\") {
      expect(i + 1).toBeLessThan(line.length);
      const next = line[i + 1];
      if (next === "\\" || next === '"') value += next;
      else value += next;
      i += 1;
      continue;
    }
    if (char === '"') {
      expect(line.slice(i)).toBe('"');
      return value;
    }
    value += char;
  }
  throw new Error(`unterminated TOML basic string: ${line}`);
}
