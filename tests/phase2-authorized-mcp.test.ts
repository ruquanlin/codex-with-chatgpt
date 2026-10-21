import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { startBridge, type Bridge } from "../src/bridge/server.js";
import { createExecutionProposal } from "../src/workflow/phase2.js";
import { briefDigest, readHandoffProof } from "../src/workflow/phase2/handoff-proof.js";
import { issueJevReceipt } from "../src/workflow/phase2/jev-receipts.js";
import { cleanup, isolateStateDir, makeGitRepo, makeTmpDir } from "./helpers.js";

let bridge: Bridge, client: Client, root: string, stateDir: string;

function body(result: { content?: unknown }): Record<string, unknown> {
  return JSON.parse((result.content as { text: string }[])[0].text) as Record<string, unknown>;
}
function proposal(line: string, jevRequired = true) {
  return {
    executionLineId: line, goal: "Connect verified Jev to Phase 2",
    scope: { inScope: ["Phase 2 handler"], outOfScope: ["Phase 3"] },
    approvedBasis: { type: "approved_design" as const, summary: "Receipt integration" },
    implementationBasis: ["preserve fail-closed behavior"], jevRequired,
  };
}
const details = {
  knownFacts: ["Server issues signed receipts"], mustChange: ["Verify receipt before brief"],
  mustNotChange: ["Compiler"], acceptanceCriteria: ["Both Phase 2 endpoints agree"],
  validationExpectation: ["Focused MCP test"], riskNotes: ["Authorization sensitive"],
  persistence: { mode: "ephemeral" as const },
};
async function transition(p: ReturnType<typeof proposal>, boundJevResult?: unknown) {
  return body(await client.callTool({ name: "phase2_transition", arguments: { proposal: p, boundJevResult } }));
}
async function brief(p: ReturnType<typeof proposal>, boundJevResult?: unknown) {
  return body(await client.callTool({ name: "phase2_execution_brief", arguments: { proposal: p, boundJevResult, details } }));
}
async function issue(p: ReturnType<typeof proposal>): Promise<string> {
  return (await issueJevReceipt(bridge.workspace.id, createExecutionProposal(p),
    { task: p.goal, evidence: ["fresh observed integration"], attempts: [] }, { available: true, decision: "proceed" })).receiptId;
}
beforeEach(async () => {
  stateDir = isolateStateDir();
  root = makeTmpDir("phase2-auth-mcp");
  makeGitRepo(root);
  process.env.TYPESAFE_API_KEY = "test-key";
  bridge = await startBridge({ workspaceRoot: root, port: 0, persistRuntime: false });
  const token = bridge.authStore.issueTokens({
    clientId: "phase2-auth-test", scopes: ["workspace.read", "workspace.write"],
  });
  client = new Client({ name: "phase2-auth-test", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${bridge.localBaseUrl()}/mcp`), {
    requestInit: { headers: { authorization: `Bearer ${token.accessToken}` } },
  }));
});
afterEach(async () => {
  await client?.close();
  await bridge?.close();
  vi.useRealTimers();
  delete process.env.TYPESAFE_API_KEY;
  delete process.env.C2C_STATE_DIR;
  if (root) cleanup(root);
  if (stateDir) cleanup(stateDir);
});

describe("Phase 2 receipt authorization and handoff proof", () => {
  it("compiles only a current, untampered Phase 2 proof for this workspace", async () => {
    const p = proposal("phase3-real-proof"), receiptId = await issue(p);
    const created = await brief(p, { receiptId });
    expect(created).toMatchObject({ state: "READY_FOR_EXECUTION", created: true });
    const approved = created.brief as Parameters<typeof readHandoffProof>[1];
    const compile = async (input: unknown) => body(await client.callTool({ name: "phase3_compile_execution", arguments: { brief: input } }));
    expect(await compile({ ...approved, goal: "Unproved caller-created brief" })).toMatchObject({ status: "REJECTED_INSUFFICIENT_BRIEF" });
    expect(await compile(approved)).toMatchObject({ status: "READY", package: { prompt: expect.any(String) } });
    const changed = await compile({ ...approved, mustChange: ["Change a different boundary"] });
    expect(changed).toMatchObject({ status: "REJECTED_INSUFFICIENT_BRIEF" });
    expect(changed).not.toHaveProperty("package");

    const otherRoot = makeTmpDir("phase3-other-workspace");
    makeGitRepo(otherRoot);
    const otherBridge = await startBridge({ workspaceRoot: otherRoot, port: 0, persistRuntime: false });
    const otherToken = otherBridge.authStore.issueTokens({ clientId: "phase3-other", scopes: ["workspace.read"] });
    const otherClient = new Client({ name: "phase3-other", version: "1.0.0" });
    try {
      await otherClient.connect(new StreamableHTTPClientTransport(new URL(`${otherBridge.localBaseUrl()}/mcp`), {
        requestInit: { headers: { authorization: `Bearer ${otherToken.accessToken}` } },
      }));
      const wrongWorkspace = body(await otherClient.callTool({ name: "phase3_compile_execution", arguments: { brief: approved } }));
      expect(wrongWorkspace).toMatchObject({ status: "REJECTED_INSUFFICIENT_BRIEF" });
      expect(wrongWorkspace).not.toHaveProperty("package");
    } finally {
      await otherClient.close();
      await otherBridge.close();
      cleanup(otherRoot);
    }

    const file = path.join(stateDir, "handoff-proofs", bridge.workspace.id, `${briefDigest(approved)}.json`);
    const original = fs.readFileSync(file, "utf8");
    fs.writeFileSync(file, original.replace('"issuer":"c2c-phase2-handoff"', '"issuer":"forged"'));
    const tampered = await compile(approved);
    expect(tampered).toMatchObject({ status: "REJECTED_INSUFFICIENT_BRIEF" });
    expect(tampered).not.toHaveProperty("package");
    fs.writeFileSync(file, original);

    const proof = await readHandoffProof(bridge.workspace.id, approved);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(Date.parse(proof!.expiresAt) + 1));
    const expired = await compile(approved);
    expect(expired).toMatchObject({ status: "REJECTED_INSUFFICIENT_BRIEF" });
    expect(expired).not.toHaveProperty("package");
  });
  it("rejects a proven Brief after a Jev stop on its execution line", async () => {
    const p = proposal("phase3-stopped-proof"), receiptId = await issue(p);
    const created = await brief(p, { receiptId });
    expect(created).toMatchObject({ state: "READY_FOR_EXECUTION", created: true });
    await issueJevReceipt(bridge.workspace.id, createExecutionProposal(p),
      { task: p.goal, evidence: ["fresh observed integration"], attempts: [] }, { available: true, decision: "stop" });
    const result = body(await client.callTool({ name: "phase3_compile_execution", arguments: { brief: created.brief } }));
    expect(result).toMatchObject({ status: "REJECTED_INSUFFICIENT_BRIEF" });
    expect(result).not.toHaveProperty("package");
  });
  it("rejects caller false and forged proceed at both entry points", async () => {
    const p = proposal("auth-forged", false);
    const fake = { proposalIdentity: createExecutionProposal(p).identity, result: { available: true, decision: "proceed" } };
    for (const bound of [undefined, fake, { receiptId: "a".repeat(48) }]) {
      expect((await transition(p, bound)).state).toBe("EXECUTION_PROPOSED");
      expect(await brief(p, bound)).toMatchObject({ state: "EXECUTION_PROPOSED", created: false });
    }
  });

  it("only the genuine proposal-bound receipt creates a brief and local proof", async () => {
    const p = proposal("auth-real-proceed"), receiptId = await issue(p);
    const authorized = { receiptId };
    expect((await transition(p, authorized)).state).toBe("READY_FOR_EXECUTION");
    const created = await brief(p, authorized);
    expect(created).toMatchObject({ state: "READY_FOR_EXECUTION", created: true });
    const stored = await readHandoffProof(bridge.workspace.id, created.brief as Parameters<typeof readHandoffProof>[1]);
    expect(stored).toMatchObject({
      workspaceId: bridge.workspace.id, proposalIdentity: createExecutionProposal(p).identity,
      jevReceiptId: receiptId,
    });
    expect(await readHandoffProof("abcdef123456", created.brief as Parameters<typeof readHandoffProof>[1])).toBeNull();
    expect(await readHandoffProof(bridge.workspace.id, created.brief as Parameters<typeof readHandoffProof>[1],
      new Date(Date.parse(stored!.expiresAt) + 1))).toBeNull();
    expect(await brief(p, authorized)).toMatchObject({ state: "READY_FOR_EXECUTION", created: true });
    const changed = { ...p, goal: "Change unrelated scope" };
    const changedResult = await client.callTool({ name: "phase2_transition", arguments: { proposal: changed, boundJevResult: authorized } });
    expect(changedResult.isError).toBe(true);
  });

  it.each([
    ["reframe", "REFRAME_REQUIRED"],
    ["stop", "STOPPED"],
  ] as const)("does not create a brief after an actual %s", async (decision, state) => {
    const p = proposal(`auth-${decision}`);
    const receiptId = (await issueJevReceipt(bridge.workspace.id, createExecutionProposal(p),
      { task: p.goal, evidence: ["fresh observed integration"], attempts: [] }, { available: true, decision })).receiptId;
    const authorized = { receiptId };
    expect((await transition(p, authorized)).state).toBe(state);
    expect(await brief(p, authorized)).toMatchObject({ state, created: false });
    if (decision === "stop") expect((await transition(p)).state).toBe("STOPPED");
  });
});
