import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createHmac } from "node:crypto";
import { createExecutionProposal } from "../src/workflow/phase2.js";
import { getJevStop, issueJevReceipt, verifyJevReceipt } from "../src/workflow/phase2/jev-receipts.js";
import { cleanup, isolateStateDir } from "./helpers.js";

const workspaceId = "abcdef123456";
const otherWorkspace = "987654abcdef";
const input = { executionLineId: "line-a", goal: "Fix handler", scope: { inScope: ["handler"], outOfScope: ["compiler"] },
  approvedBasis: { type: "approved_design" as const, summary: "Approved narrow fix" }, implementationBasis: ["preserve API"], jevRequired: true };
const request = { task: "Fix handler", evidence: ["reproduced"], attempts: ["one failed attempt"] };
const result = { available: true, decision: "proceed" as const };
let stateDir: string;

afterEach(() => { delete process.env.C2C_STATE_DIR; if (stateDir) cleanup(stateDir); });

describe("Jev receipt store", () => {
  it("persists a receipt across reads and rejects workspace, proposal, request, fake ID, and expiry replay", async () => {
    stateDir = isolateStateDir();
    const proposal = createExecutionProposal(input);
    const now = new Date("2026-10-19T12:00:00.000Z");
    const receipt = await issueJevReceipt(workspaceId, proposal, request, result, now);
    expect(receipt).toMatchObject({ workspaceId, executionLineId: "line-a", proposalIdentity: proposal.identity,
      available: true, decision: "proceed", issuer: "c2c-jev-decision-gate" });
    vi.resetModules();
    const { verifyJevReceipt: afterRestart } = await import("../src/workflow/phase2/jev-receipts.js");
    expect(await afterRestart(workspaceId, proposal, receipt.receiptId, request, new Date(now.getTime() + 899_999))).toEqual(receipt);
    expect(await verifyJevReceipt(otherWorkspace, proposal, receipt.receiptId, request, now)).toBeNull();
    await expect(verifyJevReceipt(workspaceId, createExecutionProposal({ ...input, goal: "Other" }), receipt.receiptId, request, now)).rejects.toThrow();
    await expect(verifyJevReceipt(workspaceId, proposal, receipt.receiptId, { ...request, evidence: ["other"] }, now)).rejects.toThrow();
    expect(await verifyJevReceipt(workspaceId, proposal, "a".repeat(48), request, now)).toBeNull();
    expect(await verifyJevReceipt(workspaceId, proposal, receipt.receiptId, request, new Date(now.getTime() + 900_000))).toBeNull();
  });

  it("fails closed on tampered storage and unavailable Jev", async () => {
    stateDir = isolateStateDir();
    const proposal = createExecutionProposal(input);
    await expect(issueJevReceipt(workspaceId, proposal, request, { available: false, error: "offline" })).rejects.toThrow(/Unavailable/);
    const receipt = await issueJevReceipt(workspaceId, proposal, request, result);
    const file = path.join(stateDir, "jev-receipts", workspaceId, `${receipt.receiptId}.json`);
    const envelope = JSON.parse(fs.readFileSync(file, "utf8"));
    envelope.record.decision = "stop";
    fs.writeFileSync(file, JSON.stringify(envelope));
    await expect(verifyJevReceipt(workspaceId, proposal, receipt.receiptId, request)).rejects.toThrow(/Tampered/);
  });

  it("preserves a stop across receipt expiry and blocks later receipts for the line", async () => {
    stateDir = isolateStateDir();
    const proposal = createExecutionProposal(input);
    const stopped = await issueJevReceipt(workspaceId, proposal, request, { available: true, decision: "stop" }, new Date("2026-10-19T12:00:00.000Z"));
    expect((await getJevStop(workspaceId, input.executionLineId))?.receiptId).toBe(stopped.receiptId);
    expect(await verifyJevReceipt(workspaceId, proposal, stopped.receiptId, request, new Date("2026-10-20T12:00:00.000Z"))).toBeNull();
    await expect(issueJevReceipt(workspaceId, proposal, request, result)).rejects.toThrow(/stop marker/);
    const changed = createExecutionProposal({ ...input, goal: "Reworded task" });
    await expect(issueJevReceipt(workspaceId, changed, request, result)).rejects.toThrow(/stop marker/);
  });

  it("blocks the same investigation after only its execution line ID changes while allowing unrelated investigations", async () => {
    stateDir = isolateStateDir();
    const proposal = createExecutionProposal(input);
    const stopped = await issueJevReceipt(workspaceId, proposal, request, { available: true, decision: "stop" });
    const renamed = createExecutionProposal({ ...input, executionLineId: "line-b" });
    await expect(issueJevReceipt(workspaceId, renamed, request, result)).rejects.toThrow(/stop marker/);
    const unrelated = createExecutionProposal({ ...input, executionLineId: "line-c", goal: "Fix unrelated parser" });
    expect(await getJevStop(workspaceId, unrelated.executionLineId)).toBeNull();
    expect((await issueJevReceipt(workspaceId, unrelated, request, result)).decision).toBe("proceed");
  });

  it("keeps legacy line-only stops and fails closed on conflicting or corrupt investigation markers", async () => {
    stateDir = isolateStateDir();
    const folder = path.join(stateDir, "jev-receipts", workspaceId);
    const proposal = createExecutionProposal(input);
    await issueJevReceipt(workspaceId, proposal, request, { available: true, decision: "stop" });
    const investigationFile = fs.readdirSync(folder).find((name) => name.startsWith("stop-investigation-"))!;
    const lineFile = fs.readdirSync(folder).find((name) => name.startsWith("stop-") && !name.startsWith("stop-investigation-"))!;
    const envelope = JSON.parse(fs.readFileSync(path.join(folder, lineFile), "utf8"));
    delete envelope.record.investigationFingerprint;
    envelope.mac = createHmac("sha256", fs.readFileSync(path.join(folder, "issuer.key")))
      .update(JSON.stringify(envelope.record)).digest("hex");
    fs.writeFileSync(path.join(folder, lineFile), JSON.stringify(envelope));
    fs.unlinkSync(path.join(folder, investigationFile));
    expect((await getJevStop(workspaceId, input.executionLineId))?.decision).toBe("stop");
    await expect(issueJevReceipt(workspaceId, proposal, request, result)).rejects.toThrow(/stop marker/);

    const other = createExecutionProposal({ ...input, executionLineId: "line-b", goal: "Fix parser" });
    await issueJevReceipt(workspaceId, other, request, { available: true, decision: "stop" });
    const newStop = createExecutionProposal({ ...input, executionLineId: "line-c", goal: "Fix third handler" });
    await issueJevReceipt(workspaceId, newStop, request, { available: true, decision: "stop" });
    const conflicting = createExecutionProposal({ ...other, executionLineId: "line-c" });
    await expect(getJevStop(workspaceId, conflicting.executionLineId, conflicting)).rejects.toThrow(/Conflicting/);
    await expect(issueJevReceipt(workspaceId, conflicting, request, result)).rejects.toThrow(/Conflicting/);

    const newFingerprintFiles = fs.readdirSync(folder).filter((name) => name.startsWith("stop-investigation-"));
    expect(newFingerprintFiles).toHaveLength(2);
    const corruptedFile = newFingerprintFiles.find((name) => JSON.parse(fs.readFileSync(path.join(folder, name), "utf8")).record.executionLineId === "line-c")!;
    fs.writeFileSync(path.join(folder, corruptedFile), "corrupt");
    const renamed = createExecutionProposal({ ...newStop, executionLineId: "line-d" });
    await expect(issueJevReceipt(workspaceId, renamed, request, result)).rejects.toThrow();
  });
});
