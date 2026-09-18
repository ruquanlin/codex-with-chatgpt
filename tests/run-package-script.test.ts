import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Workspace } from "../src/workspace/manager.js";
import { runPackageScript } from "../src/execution/runPackageScript.js";
import { listExecutionOutputs, readExecutionOutput } from "../src/execution/output.js";
import { readExecutionRecords } from "../src/execution/records.js";
import { cleanup, isolateStateDir, makeTmpDir, write } from "./helpers.js";

let root: string;

function writePackage(scripts: Record<string, string>): Workspace {
  write(root, "package.json", JSON.stringify({ name: "script-behavior", scripts }));
  return new Workspace(root);
}

beforeEach(() => {
  isolateStateDir();
  root = makeTmpDir("run-package-script");
});

afterEach(() => {
  cleanup(root);
});

describe("runPackageScript", () => {
  it("throws before execution when the configured script is missing", async () => {
    const workspace = writePackage({ test: "node -e \"console.log('ok')\"" });

    await expect(runPackageScript(workspace, { scriptName: "lint", taskId: "missing" })).rejects.toThrow(
      "No configured lint command"
    );
    expect(readExecutionRecords(workspace.id)).toEqual([]);
    expect(listExecutionOutputs(workspace.id)).toEqual([]);
  });

  it("returns failure details and records output for a non-zero script", async () => {
    const workspace = writePackage({
      test: "node -e \"console.error('lint failed'); process.exit(7)\"",
    });

    const result = await runPackageScript(workspace, { scriptName: "test", taskId: "failure_case" });

    expect(result.passed).toBe(false);
    expect(result.exitCode).toBe(7);
    expect(result.stderr).toContain("lint failed");

    const records = readExecutionRecords(workspace.id);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      taskId: "failure_case",
      tests: "failed",
      exitStatus: "failed",
      outputAvailable: true,
    });
    const outputId = records[0].outputId;
    expect(outputId).toBeTypeOf("number");
    const output = readExecutionOutput(workspace.id, outputId!);
    expect(output.ok).toBe(true);
    if (output.ok) {
      expect(output.text).toContain("lint failed");
      expect(output.stderr).toContain("lint failed");
      expect(output.meta.exitCode).toBe(7);
      expect(output.meta.validationType).toBe("test");
    }
  });

  it("times out long-running scripts and records a failed execution", async () => {
    const workspace = writePackage({
      test: "node -e \"setInterval(() => {}, 1000)\"",
    });

    const result = await runPackageScript(workspace, {
      scriptName: "test",
      taskId: "timeout_case",
      timeoutMs: 100,
    });

    expect(result.passed).toBe(false);
    expect(result.exitCode).toBe(124);
    const records = readExecutionRecords(workspace.id);
    expect(records[0]).toMatchObject({
      taskId: "timeout_case",
      tests: "timed out",
      exitStatus: "failed",
    });
  });

  it("truncates large stdout and stderr while keeping the truncation marker", async () => {
    const workspace = writePackage({
      test:
        "node -e \"process.stdout.write('o'.repeat(5000)); process.stderr.write('e'.repeat(5000));\"",
    });

    const result = await runPackageScript(workspace, {
      scriptName: "test",
      taskId: "truncate_case",
      maxOutputBytes: 512,
    });

    expect(result.passed).toBe(true);
    expect(Buffer.byteLength(result.stdout, "utf8")).toBeLessThanOrEqual(512);
    expect(Buffer.byteLength(result.stderr, "utf8")).toBeLessThanOrEqual(512);
    expect(result.stdout).toContain("...[truncated]");
    expect(result.stderr).toContain("...[truncated]");
  });
});
