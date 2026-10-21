import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { startBridge, type Bridge } from "../src/bridge/server.js";
import { createExecutionProposal, type ExecutionProposalInput } from "../src/workflow/phase2.js";
import { issueJevReceipt } from "../src/workflow/phase2/jev-receipts.js";
import { cleanup, isolateStateDir, makeGitRepo, makeTmpDir } from "./helpers.js";

const input: ExecutionProposalInput = {
  executionLineId: "line-stop-status",
  goal: "Repair parser regression",
  scope: { inScope: ["src/parser.ts"], outOfScope: ["unrelated modules"] },
  approvedBasis: { type: "explicit_instruction", summary: "User requested the repair" },
  implementationBasis: ["Current parser implementation"],
  jevRequired: false,
};

let bridge: Bridge | undefined;
let client: Client | undefined;
let workspaceRoot = "";
let stateDir = "";

afterEach(async () => {
  if (client) await client.close();
  if (bridge) await bridge.close();
  if (workspaceRoot) cleanup(workspaceRoot);
  if (stateDir) cleanup(stateDir);
  delete process.env.C2C_STATE_DIR;
  bridge = undefined;
  client = undefined;
  workspaceRoot = "";
  stateDir = "";
});

async function setup(scopes = ["workspace.read"]) {
  stateDir = isolateStateDir();
  workspaceRoot = makeTmpDir("jev-stop-status-ws");
  makeGitRepo(workspaceRoot);
  bridge = await startBridge({ workspaceRoot, port: 0, persistRuntime: false,
    authStoreFile: path.join(makeTmpDir("jev-stop-status-auth"), "store.json") });
  const token = bridge.authStore.issueTokens({ clientId: "stop-status-test", scopes });
  client = new Client({ name: "stop-status-test", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${bridge.localBaseUrl()}/mcp`), {
    requestInit: { headers: { authorization: `Bearer ${token.accessToken}` } },
  }));
  return { workspaceId: bridge.workspace.id, folder: path.join(stateDir, "jev-receipts", bridge.workspace.id.toLowerCase()) };
}

async function query(proposal: unknown) {
  return client!.callTool({ name: "jev_stop_status", arguments: { proposal } });
}

describe("jev_stop_status MCP tool", () => {
  it("reports line and fingerprint stops, while unrelated work is clear", async () => {
    const { workspaceId } = await setup();
    const proposal = createExecutionProposal(input);
    await issueJevReceipt(workspaceId, proposal, { task: proposal.goal }, { available: true, decision: "stop" });
    expect((await query(proposal)).structuredContent).toEqual({ state: "STOPPED" });
    const renamed = createExecutionProposal({ ...input, executionLineId: "different-line" });
    expect((await query(renamed)).structuredContent).toEqual({ state: "STOPPED" });
    const unrelated = createExecutionProposal({ ...input, executionLineId: "unrelated-line", goal: "Fix unrelated renderer" });
    expect((await query(unrelated)).structuredContent).toEqual({ state: "CLEAR" });
  });

  it("rejects malformed proposals and mismatched supplied identity", async () => {
    await setup();
    expect((await query({ ...input, goal: "" })).isError).toBe(true);
    expect((await query({ ...input, unexpected: true })).isError).toBe(true);
    expect((await query({ ...input, identity: "0".repeat(64) })).isError).toBe(true);
  });

  it("requires workspace.read", async () => {
    await setup(["workspace.write"]);
    const denied = await query(input);
    expect(denied.isError).toBe(true);
    expect(JSON.stringify(denied)).toContain("INSUFFICIENT_SCOPE");
  });

  it("fails closed on corrupted Stop storage", async () => {
    const { workspaceId, folder } = await setup();
    const proposal = createExecutionProposal(input);
    const stop = await issueJevReceipt(workspaceId, proposal, { task: proposal.goal }, { available: true, decision: "stop" });
    const file = path.join(folder, `stop-${(await import("node:crypto")).createHash("sha256").update(input.executionLineId).digest("hex")}.json`);
    expect(stop.receiptId).toBeTruthy();
    fs.writeFileSync(file, "{broken");
    const result = await query(proposal);
    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({ type: "text" });
    expect(result.content[0].text).not.toContain(stateDir);
  });

  it("returns CLEAR on a fresh workspace without creating files or issuer.key", async () => {
    const { folder } = await setup();
    const before = fs.existsSync(folder) ? fs.readdirSync(folder) : [];
    const result = await query(input);
    expect(result.structuredContent).toEqual({ state: "CLEAR" });
    expect(fs.existsSync(folder) ? fs.readdirSync(folder) : []).toEqual(before);
    expect(fs.existsSync(path.join(folder, "issuer.key"))).toBe(false);
  });
});
