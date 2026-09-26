import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { cleanup, isolateStateDir, makeTmpDir } from "./helpers.js";
import { readSession } from "../src/session/state.js";
import { Workspace } from "../src/workspace/manager.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliEntry = path.join(projectRoot, "src/cli/index.ts");

function runCli(root: string, args: string[], input?: string, withWorkspace = true) {
  const command = withWorkspace ? [...args, "--workspace", root] : args;
  return spawnSync(process.execPath, ["--import", "tsx", cliEntry, ...command], {
    cwd: projectRoot,
    encoding: "utf8",
    env: { ...process.env, C2C_STATE_DIR: process.env.C2C_STATE_DIR },
    input,
  });
}

describe("C2C finalization E2E", () => {
  it("blocks EXECUTED and Stop until the matching execution record is persisted", () => {
    const root = makeTmpDir("c2c-finalization-e2e");
    const stateDir = isolateStateDir();
    try {
      const entered = runCli(root, ["session", "set", "--task", "c2c_e2e", "--iteration", "7"]);
      expect(entered.status).toBe(0);
      expect(readSession(new Workspace(root).id)?.checkpoint).toMatchObject({ taskId: "c2c_e2e", iteration: 7 });

      const executedBeforeRecord = runCli(root, [
        "session",
        "set",
        "--task",
        "c2c_e2e",
        "--iteration",
        "7",
        "--state",
        "EXECUTED",
        "--protocol-state",
        "EXECUTED_LOCAL",
      ]);
      expect(executedBeforeRecord.status).toBe(1);
      expect(`${executedBeforeRecord.stdout}${executedBeforeRecord.stderr}`).toContain(
        "before c2c record has persisted"
      );

      const stopBeforeRecord = runCli(
        root,
        ["hook", "stop"],
        JSON.stringify({ hook_event_name: "Stop", cwd: root, stop_hook_active: false }),
        false
      );
      expect(stopBeforeRecord.status).toBe(0);
      expect(JSON.parse(stopBeforeRecord.stdout)).toEqual({ continue: false, suppressOutput: true });

      const recorded = runCli(root, [
        "record",
        "--task",
        "c2c_e2e",
        "--iteration",
        "7",
        "--changed-files",
        "0",
        "--exit-status",
        "ok",
      ]);
      expect(recorded.status).toBe(0);

      const executedAfterRecord = runCli(root, [
        "session",
        "set",
        "--task",
        "c2c_e2e",
        "--iteration",
        "7",
        "--state",
        "EXECUTED",
        "--protocol-state",
        "EXECUTED_LOCAL",
      ]);
      expect(executedAfterRecord.status).toBe(0);

      const stopAfterRecord = runCli(
        root,
        ["hook", "stop"],
        JSON.stringify({ hook_event_name: "Stop", cwd: root, stop_hook_active: false }),
        false
      );
      expect(stopAfterRecord.status).toBe(0);
      expect(JSON.parse(stopAfterRecord.stdout)).toEqual({ continue: false, suppressOutput: true });
    } finally {
      cleanup(root);
      cleanup(stateDir);
      delete process.env.C2C_STATE_DIR;
    }
  });
});
