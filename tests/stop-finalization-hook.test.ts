import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { appendExecutionRecord } from "../src/execution/records.js";
import { evaluateStopFinalization } from "../src/hooks/stop-finalization.js";
import { mergeSession, writeSession } from "../src/session/state.js";
import { Workspace } from "../src/workspace/manager.js";
import { cleanup, isolateStateDir, makeTmpDir } from "./helpers.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliEntry = path.join(projectRoot, "src/cli/index.ts");

function withWorkspace(run: (root: string, workspace: Workspace) => void): void {
  const root = makeTmpDir("stop-hook-workspace");
  const stateDir = isolateStateDir();
  try {
    run(root, new Workspace(root));
  } finally {
    cleanup(root);
    cleanup(stateDir);
    delete process.env.C2C_STATE_DIR;
  }
}

function saveCheckpoint(workspace: Workspace): void {
  writeSession(
    workspace.id,
    mergeSession(null, {
      taskId: "c2c_gate",
      iteration: 2,
      checkpoint: {
        protocolState: "EXECUTING",
        waitingFor: "none",
      },
    })
  );
}

describe("C2C Stop hook finalization gate", () => {
  it("allows a non-C2C task to stop", () => {
    withWorkspace((root) => {
      expect(evaluateStopFinalization({ hook_event_name: "Stop", cwd: root, stop_hook_active: false })).toEqual({
        continue: false,
        suppressOutput: true,
      });
      expect(evaluateStopFinalization({ hook_event_name: "Stop", cwd: root, stop_hook_active: true })).toEqual({
        continue: false,
        suppressOutput: true,
      });
    });
  });

  it("blocks an active C2C execution without its matching record", () => {
    withWorkspace((root, workspace) => {
      saveCheckpoint(workspace);
      const result = evaluateStopFinalization({ hook_event_name: "Stop", cwd: root, stop_hook_active: false });
      expect(result).toMatchObject({ continue: true, decision: "block" });
      expect("reason" in result ? result.reason : "").toContain("c2c_gate iteration 2");
    });
  });

  it("allows a finalized C2C execution to stop", () => {
    withWorkspace((root, workspace) => {
      saveCheckpoint(workspace);
      appendExecutionRecord(workspace.id, {
        taskId: "c2c_gate",
        iteration: 2,
        changedFiles: 0,
        tests: null,
        exitStatus: "ok",
        timestamp: new Date().toISOString(),
      });
      expect(evaluateStopFinalization({ hook_event_name: "Stop", cwd: root, stop_hook_active: false })).toEqual({
        continue: false,
        suppressOutput: true,
      });
      expect(evaluateStopFinalization({ hook_event_name: "Stop", cwd: root, stop_hook_active: true })).toEqual({
        continue: false,
        suppressOutput: true,
      });
    });
  });

  it("does not accept another task's execution record as finalization", () => {
    withWorkspace((root, workspace) => {
      saveCheckpoint(workspace);
      appendExecutionRecord(workspace.id, {
        taskId: "c2c_other",
        iteration: 2,
        changedFiles: 0,
        tests: null,
        exitStatus: "ok",
        timestamp: new Date().toISOString(),
      });
      expect(
        evaluateStopFinalization({ hook_event_name: "Stop", cwd: root, stop_hook_active: false })
      ).toMatchObject({ continue: true, decision: "block" });
    });
  });

  it("halts a repeated unfinalized Stop invocation instead of allowing or looping", () => {
    withWorkspace((root, workspace) => {
      saveCheckpoint(workspace);
      const first = evaluateStopFinalization({ hook_event_name: "Stop", cwd: root, stop_hook_active: false });
      const repeated = evaluateStopFinalization({ hook_event_name: "Stop", cwd: root, stop_hook_active: true });

      expect(first).toMatchObject({ continue: true, decision: "block" });
      expect(repeated).toEqual({
        continue: false,
        stopReason: "C2C finalization failed: no execution record exists for c2c_gate iteration 2.",
      });
      expect(repeated).not.toHaveProperty("suppressOutput", true);
    });
  });

  it("exposes repeated-invocation failure through the hook CLI JSON protocol", () => {
    withWorkspace((root, workspace) => {
      saveCheckpoint(workspace);
      const result = spawnSync(process.execPath, ["--import", "tsx", cliEntry, "hook", "stop"], {
        cwd: projectRoot,
        encoding: "utf8",
        env: process.env,
        input: JSON.stringify({ hook_event_name: "Stop", cwd: root, stop_hook_active: true }),
      });
      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({
        continue: false,
        stopReason: "C2C finalization failed: no execution record exists for c2c_gate iteration 2.",
      });
    });
  });
});
