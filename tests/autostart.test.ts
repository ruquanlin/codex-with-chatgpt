import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, makeTmpDir } from "./helpers.js";

const spawnSyncMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, spawnSync: spawnSyncMock };
});

import {
  disableMacAutostart,
  enableMacAutostart,
  launchAgentIdentifier,
  launchAgentPath,
  macAutostartPlist,
  macAutostartStatus,
} from "../src/autostart/macos.js";

const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");

function forceDarwin(): void {
  Object.defineProperty(process, "platform", { value: "darwin" });
}

function restorePlatform(): void {
  if (originalPlatform) Object.defineProperty(process, "platform", originalPlatform);
}

function launchctlOk(stdout = "") {
  return { status: 0, stdout, stderr: "" };
}

describe("macOS autostart", () => {
  afterEach(() => {
    spawnSyncMock.mockReset();
    restorePlatform();
  });

  it("generates a LaunchAgent plist with escaped XML and separate arguments", () => {
    const home = makeTmpDir("autostart-home");
    try {
      const workspace = path.join(home, "Project & Space's <DA>");
      const plist = macAutostartPlist({
        workspaceId: "abc123",
        workspaceRoot: workspace,
        nodePath: "/opt/node & bin/node",
        cliPath: "/Users/me/c2c/bin/c2c.js",
        homeDir: home,
      });

      expect(plist).toContain("<string>com.codex-with-chatgpt.workspace.abc123</string>");
      expect(plist).toContain("<string>/opt/node &amp; bin/node</string>");
      expect(plist).toContain("<string>start</string>");
      expect(plist).toContain("<string>-w</string>");
      expect(plist).toContain("<string>--json</string>");
      expect(plist).toContain("Project &amp; Space&apos;s &lt;DA&gt;");
      expect(plist).not.toContain("sh -c");
    } finally {
      cleanup(home);
    }
  });

  it("enables idempotently for one workspace label and plist path", () => {
    forceDarwin();
    spawnSyncMock.mockReturnValue(launchctlOk("pid = 123\n"));
    const home = makeTmpDir("autostart-home");
    try {
      const config = {
        workspaceId: "workspace-one",
        workspaceRoot: path.join(home, "Workspace One"),
        nodePath: "/usr/local/bin/node",
        cliPath: "/repo/bin/c2c.js",
        homeDir: home,
      };

      const first = enableMacAutostart(config);
      const content = fs.readFileSync(first.path, "utf8");
      const second = enableMacAutostart(config);

      expect(first.path).toBe(second.path);
      expect(first.identifier).toBe("com.codex-with-chatgpt.workspace.workspace-one");
      expect(fs.readFileSync(second.path, "utf8")).toBe(content);
      expect(spawnSyncMock).toHaveBeenCalledWith(
        "launchctl",
        ["bootout", expect.stringMatching(/com\.codex-with-chatgpt\.workspace\.workspace-one$/)],
        { encoding: "utf8" }
      );
      expect(spawnSyncMock).toHaveBeenCalledWith("launchctl", ["bootstrap", expect.stringMatching(/^gui\//), first.path], {
        encoding: "utf8",
      });
      expect(spawnSyncMock).toHaveBeenCalledWith(
        "launchctl",
        ["kickstart", "-k", expect.stringMatching(/com\.codex-with-chatgpt\.workspace\.workspace-one$/)],
        { encoding: "utf8" }
      );
    } finally {
      cleanup(home);
    }
  });

  it("disables by unloading and removing only that workspace LaunchAgent", () => {
    forceDarwin();
    spawnSyncMock.mockReturnValue(launchctlOk());
    const home = makeTmpDir("autostart-home");
    try {
      const config = {
        workspaceId: "workspace-two",
        workspaceRoot: path.join(home, "Workspace Two"),
        nodePath: "/usr/local/bin/node",
        cliPath: "/repo/bin/c2c.js",
        homeDir: home,
      };
      fs.mkdirSync(path.dirname(launchAgentPath(config.workspaceId, home)), { recursive: true });
      fs.writeFileSync(launchAgentPath(config.workspaceId, home), "plist");

      const status = disableMacAutostart(config);

      expect(status.installed).toBe(false);
      expect(fs.existsSync(launchAgentPath(config.workspaceId, home))).toBe(false);
      expect(spawnSyncMock).toHaveBeenCalledWith(
        "launchctl",
        ["bootout", expect.stringMatching(/com\.codex-with-chatgpt\.workspace\.workspace-two$/)],
        { encoding: "utf8" }
      );
    } finally {
      cleanup(home);
    }
  });

  it("keeps workspace LaunchAgents isolated by workspace id", () => {
    const home = makeTmpDir("autostart-home");
    try {
      expect(launchAgentIdentifier("alpha")).not.toBe(launchAgentIdentifier("beta"));
      expect(launchAgentPath("alpha", home)).not.toBe(launchAgentPath("beta", home));
      expect(launchAgentPath("alpha", home)).toContain("com.codex-with-chatgpt.workspace.alpha.plist");
      expect(launchAgentPath("beta", home)).toContain("com.codex-with-chatgpt.workspace.beta.plist");
    } finally {
      cleanup(home);
    }
  });

  it("reports installed, loaded, running, workspace, identifier and path", () => {
    forceDarwin();
    spawnSyncMock.mockReturnValue(launchctlOk("pid = 456\n"));
    const home = makeTmpDir("autostart-home");
    try {
      const config = {
        workspaceId: "workspace-status",
        workspaceRoot: path.join(home, "Workspace Status"),
        nodePath: "/usr/local/bin/node",
        cliPath: "/repo/bin/c2c.js",
        homeDir: home,
      };
      fs.mkdirSync(path.dirname(launchAgentPath(config.workspaceId, home)), { recursive: true });
      fs.writeFileSync(launchAgentPath(config.workspaceId, home), "plist");

      expect(macAutostartStatus(config)).toMatchObject({
        installed: true,
        loaded: true,
        running: true,
        pid: 456,
        workspace: path.resolve(config.workspaceRoot),
        identifier: "com.codex-with-chatgpt.workspace.workspace-status",
        path: launchAgentPath(config.workspaceId, home),
      });
    } finally {
      cleanup(home);
    }
  });
});
