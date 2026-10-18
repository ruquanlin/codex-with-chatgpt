import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createExecutionProposal, type ExecutionProposalInput } from "../src/workflow/phase2.js";
import { createFailureRecord, type FailureRecord } from "../src/workflow/phase4a/failure.js";
import { FailureRecordConflictError, getFailureByExecutionLine, listRecentFailures, persistFailureRecord } from "../src/workflow/phase4a/store.js";

const workspace = "abcdef123456";
const otherWorkspace = "123456abcdef";
const originalStateDir = process.env.C2C_STATE_DIR;
let stateDir: string;

function record(line: string, createdAt = "2026-10-17T12:00:00.000Z", summary = "Command failed", workspaceId = workspace): FailureRecord {
  const proposal: ExecutionProposalInput = {
    executionLineId: line, goal: "Implement narrow fix", scope: { inScope: ["handler"], outOfScope: ["redesign"] },
    approvedBasis: { type: "approved_design", summary: "Approved design" }, implementationBasis: ["preserve API"], jevRequired: true,
  };
  return createFailureRecord(workspaceId, proposal, {
    executionLineId: line, proposalIdentity: createExecutionProposal(proposal).identity,
    failureType: "EXECUTION_FAILURE", failedAtStage: "EXECUTION", summary,
    evidence: ["exit code 1"], nextRoute: "SYSTEMATIC_DEBUGGING",
  }, new Date(createdAt));
}

function fileFor(workspaceId: string, failureId: string): string {
  return join(stateDir, "failures", workspaceId, `${failureId}.json`);
}

describe("Phase 4A immutable failure store", () => {
  beforeEach(async () => {
    stateDir = await mkdtemp(join(tmpdir(), "c2c-phase4a-store-"));
    process.env.C2C_STATE_DIR = stateDir;
  });
  afterEach(async () => {
    if (originalStateDir === undefined) delete process.env.C2C_STATE_DIR;
    else process.env.C2C_STATE_DIR = originalStateDir;
    await rm(stateDir, { recursive: true, force: true });
  });

  it("persists a complete owner-only canonical file and reads it again", async () => {
    const input = record("line-1");
    expect(await persistFailureRecord(workspace, input)).toEqual(input);
    expect(JSON.parse(await readFile(fileFor(workspace, input.failureId), "utf8"))).toEqual(input);
    expect(await getFailureByExecutionLine(workspace, "line-1")).toEqual(input);
    expect(await readdir(join(stateDir, "failures", workspace))).toEqual([`${input.failureId}.json`]);
    if (process.platform !== "win32") expect((await stat(fileFor(workspace, input.failureId))).mode & 0o777).toBe(0o600);
  });

  it("returns null for an absent line without creating a record", async () => {
    expect(await getFailureByExecutionLine(workspace, "missing")).toBeNull();
    expect(await listRecentFailures(workspace)).toEqual([]);
  });

  it("returns the original timestamp for an identical duplicate", async () => {
    const first = record("line-1", "2026-10-17T10:00:00.000Z");
    const duplicate = record("line-1", "2026-10-17T11:00:00.000Z");
    await persistFailureRecord(workspace, first);
    expect(await persistFailureRecord(workspace, duplicate)).toEqual(first);
    expect(await readFile(fileFor(workspace, first.failureId), "utf8")).toContain(first.createdAt);
  });

  it("rejects a conflicting duplicate without changing the winner", async () => {
    const first = record("line-1");
    await persistFailureRecord(workspace, first);
    await expect(persistFailureRecord(workspace, record("line-1", first.createdAt, "Different failure"))).rejects.toBeInstanceOf(FailureRecordConflictError);
    expect(await getFailureByExecutionLine(workspace, "line-1")).toEqual(first);
  });

  it("publishes exactly one record for concurrent identical requests", async () => {
    const first = record("line-1", "2026-10-17T10:00:00.000Z");
    const second = record("line-1", "2026-10-17T11:00:00.000Z");
    const results = await Promise.all([persistFailureRecord(workspace, first), persistFailureRecord(workspace, second)]);
    expect(results[0]).toEqual(results[1]);
    expect(await readdir(join(stateDir, "failures", workspace))).toEqual([`${first.failureId}.json`]);
  });

  it("gives concurrent conflicting requests one winner and one conflict", async () => {
    const first = record("line-1", "2026-10-17T10:00:00.000Z", "First failure");
    const second = record("line-1", "2026-10-17T11:00:00.000Z", "Second failure");
    const results = await Promise.allSettled([persistFailureRecord(workspace, first), persistFailureRecord(workspace, second)]);
    const winners = results.filter((result): result is PromiseFulfilledResult<FailureRecord> => result.status === "fulfilled");
    const losers = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(losers[0].reason).toBeInstanceOf(FailureRecordConflictError);
    expect(await getFailureByExecutionLine(workspace, "line-1")).toEqual(winners[0].value);
    expect(await readdir(join(stateDir, "failures", workspace))).toEqual([`${first.failureId}.json`]);
  });

  it("keeps identical execution-line names separate by workspace", async () => {
    const first = record("line-1");
    const second = record("line-1", "2026-10-17T13:00:00.000Z", "Other workspace", otherWorkspace);
    await persistFailureRecord(workspace, first);
    await persistFailureRecord(otherWorkspace, second);
    expect(await getFailureByExecutionLine(workspace, "line-1")).toEqual(first);
    expect(await getFailureByExecutionLine(otherWorkspace, "line-1")).toEqual(second);
    expect(await listRecentFailures(workspace)).toEqual([first]);
  });

  it("orders newest first with a deterministic failure-ID tie break and bounded limits", async () => {
    const inputs = Array.from({ length: 52 }, (_, index) => record(`line-${index}`, index < 2 ? "2026-10-17T12:00:00.000Z" : new Date(Date.UTC(2026, 9, 17, 11, 59, 58 - Math.floor((index - 2) / 2))).toISOString()));
    await Promise.all(inputs.map((input) => persistFailureRecord(workspace, input)));
    const expected = [...inputs].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.failureId.localeCompare(b.failureId));
    expect(await listRecentFailures(workspace, 2)).toEqual(expected.slice(0, 2));
    expect(await listRecentFailures(workspace)).toEqual(expected.slice(0, 10));
    expect(await listRecentFailures(workspace, 50)).toEqual(expected.slice(0, 50));
  });

  it.each([0, -1, 1.5, 51, NaN, Infinity])("rejects invalid limit %s", async (limit) => {
    await expect(listRecentFailures(workspace, limit)).rejects.toThrow();
  });

  it("rejects invalid workspace, record ID, and canonical record contents before writing", async () => {
    const valid = record("line-1");
    await expect(persistFailureRecord("../bad", valid)).rejects.toThrow();
    await expect(getFailureByExecutionLine("../bad", "line-1")).rejects.toThrow();
    await expect(listRecentFailures("../bad")).rejects.toThrow();
    await expect(persistFailureRecord(workspace, { ...valid, failureId: "../bad" })).rejects.toThrow();
    await expect(persistFailureRecord(workspace, { ...valid, summary: " " })).rejects.toThrow();
    await expect(persistFailureRecord(workspace, { ...valid, createdAt: "yesterday" })).rejects.toThrow();
    await expect(persistFailureRecord(workspace, { ...valid, extra: true } as FailureRecord)).rejects.toThrow();
    expect(await listRecentFailures(workspace)).toEqual([]);
  });

  it("fails closed on corrupted existing JSON and invalid canonical records", async () => {
    const valid = record("line-1");
    const target = fileFor(workspace, valid.failureId);
    const { mkdir } = await import("node:fs/promises");
    await mkdir(join(stateDir, "failures", workspace), { recursive: true });
    await writeFile(target, "{broken");
    await expect(getFailureByExecutionLine(workspace, "line-1")).rejects.toThrow();
    await expect(persistFailureRecord(workspace, valid)).rejects.toThrow();
    await expect(listRecentFailures(workspace)).rejects.toThrow();
    await writeFile(target, JSON.stringify({ ...valid, failureId: "0".repeat(64) }));
    await expect(getFailureByExecutionLine(workspace, "line-1")).rejects.toThrow();
    await expect(persistFailureRecord(workspace, valid)).rejects.toThrow();
  });
});
