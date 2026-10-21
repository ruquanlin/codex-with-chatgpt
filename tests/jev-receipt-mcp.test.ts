import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import fs from "node:fs";
import { startBridge, type Bridge } from "../src/bridge/server.js";
import { createExecutionProposal } from "../src/workflow/phase2.js";
import { issueJevReceipt, getJevStop } from "../src/workflow/phase2/jev-receipts.js";
import { cleanup, isolateStateDir, makeGitRepo, makeTmpDir } from "./helpers.js";

const originalFetch = globalThis.fetch;
const proposal = { executionLineId: "receipt-mcp-line", goal: "Fix handler", scope: { inScope: ["handler"], outOfScope: ["compiler"] },
  approvedBasis: { type: "approved_design" as const, summary: "Approved fix" }, implementationBasis: ["preserve API"], jevRequired: true };
const request = { task: "Fix handler", evidence: ["reproduced"], attempts: ["attempt one"] };
let bridge: Bridge | undefined;
let client: Client | undefined;
let root: string | undefined;
let stateDir: string | undefined;

function body(result: { content?: unknown }): Record<string, unknown> {
  return JSON.parse((result.content as { text: string }[])[0].text) as Record<string, unknown>;
}

async function start(): Promise<void> {
  stateDir = isolateStateDir();
  root = makeTmpDir("jev-receipt-mcp");
  makeGitRepo(root);
  process.env.TYPESAFE_API_KEY = "test-key";
  bridge = await startBridge({ workspaceRoot: root, port: 0, persistRuntime: false });
  const token = bridge.authStore.issueTokens({ clientId: "receipt-test", scopes: ["workspace.read", "workspace.write"] });
  client = new Client({ name: "receipt-test", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${bridge.localBaseUrl()}/mcp`), {
    requestInit: { headers: { authorization: `Bearer ${token.accessToken}` } },
  }));
}

afterEach(async () => {
  if (client) await client.close();
  if (bridge) await bridge.close();
  globalThis.fetch = originalFetch;
  delete process.env.TYPESAFE_API_KEY;
  delete process.env.C2C_STATE_DIR;
  if (root) cleanup(root);
  if (stateDir) cleanup(stateDir);
  bridge = undefined; client = undefined; root = undefined; stateDir = undefined;
});

describe("bound Jev MCP receipts", () => {
  it("returns Jev decisions as advice without issuing receipts or stop markers", async () => {
    await start();
    let upstreamCalls = 0;
    globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url) === "https://api.typesafe.ai/v1/systemone") {
        upstreamCalls++;
        expect(JSON.parse(String(init?.body)).state).toEqual(request);
        return new Response(JSON.stringify({ answers: { gate: { choice: "proceed" } } }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return originalFetch(url, init);
    }) as typeof fetch;
    const unbound = body(await client!.callTool({ name: "jev_decision_gate", arguments: request }));
    expect(unbound).toMatchObject({ available: true, decision: "proceed" });
    expect(unbound).not.toHaveProperty("receiptId");
    const forgedIdentity = await client!.callTool({ name: "jev_decision_gate", arguments: { ...request, proposal: { ...proposal, identity: "a".repeat(64) } } });
    expect(forgedIdentity.isError).toBe(true);
    for (const decision of ["proceed", "reframe", "stop"] as const) {
      globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
        if (String(url) === "https://api.typesafe.ai/v1/systemone") {
          upstreamCalls++;
          return new Response(JSON.stringify({ answers: { gate: { choice: decision } } }), { status: 200, headers: { "content-type": "application/json" } });
        }
        return originalFetch(url, init);
      }) as typeof fetch;
      const result = body(await client!.callTool({ name: "jev_decision_gate", arguments: { ...request, proposal: createExecutionProposal({ ...proposal, executionLineId: `advice-${decision}` }) } }));
      expect(result).toMatchObject({ available: true, decision });
      expect(result).not.toHaveProperty("receiptId");
    }
    const readToken = bridge!.authStore.issueTokens({ clientId: "read-only-advisor", scopes: ["workspace.read"] });
    const readClient = new Client({ name: "read-only-advisor", version: "1.0.0" });
    try {
      await readClient.connect(new StreamableHTTPClientTransport(new URL(`${bridge!.localBaseUrl()}/mcp`), {
        requestInit: { headers: { authorization: `Bearer ${readToken.accessToken}` } },
      }));
      const readOnlyResult = body(await readClient.callTool({ name: "jev_decision_gate", arguments: {
        ...request, proposal: createExecutionProposal({ ...proposal, executionLineId: "read-only-advice" }),
      } }));
      expect(readOnlyResult).toMatchObject({ available: true, decision: "stop" });
      expect(readOnlyResult).not.toHaveProperty("receiptId");
    } finally { await readClient.close(); }
    expect(upstreamCalls).toBe(5);
    const receiptDirectory = `${stateDir}/jev-receipts/${bridge!.workspace.id}`;
    const created = fs.existsSync(receiptDirectory) ? fs.readdirSync(receiptDirectory) : [];
    expect(created.some((name) => /^(stop-|stop-investigation-|[a-f0-9]{48}\.json)/.test(name))).toBe(false);
  });

  it("keeps historical Stop enforcement while advisory Jev cannot create a new Stop", async () => {
    await start();
    let decision: "offline" | "stop" | "proceed" = "offline";
    let upstreamCalls = 0;
    globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url) === "https://api.typesafe.ai/v1/systemone") {
        upstreamCalls++;
        return decision === "offline"
          ? new Response("offline", { status: 503 })
          : new Response(JSON.stringify({ answers: { gate: { choice: decision } } }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return originalFetch(url, init);
    }) as typeof fetch;
    const unavailable = body(await client!.callTool({ name: "jev_decision_gate", arguments: { ...request, proposal } }));
    expect(unavailable).toMatchObject({ available: false });
    expect(unavailable).not.toHaveProperty("receiptId");
    decision = "stop";
    const result = body(await client!.callTool({ name: "jev_decision_gate", arguments: { ...request, proposal: { ...proposal, executionLineId: "advisory-stop" } } }));
    expect(result).toMatchObject({ available: true, decision: "stop" });
    expect(result).not.toHaveProperty("receiptId");
    expect(await getJevStop(bridge!.workspace.id, "advisory-stop")).toBeNull();
    await issueJevReceipt(bridge!.workspace.id, createExecutionProposal(proposal), request, { available: true, decision: "stop" });
    decision = "proceed";
    const afterStop = await client!.callTool({ name: "jev_decision_gate", arguments: { ...request, proposal } });
    expect(afterStop.isError).toBe(true);
    expect(body(afterStop).error).toBe("JEV_STOPPED");
    const renamed = await client!.callTool({ name: "jev_decision_gate", arguments: { ...request, proposal: { ...proposal, executionLineId: "receipt-mcp-renamed" } } });
    expect(renamed.isError).toBe(true);
    expect(body(renamed).error).toBe("JEV_STOPPED");
    expect(upstreamCalls).toBe(2);
  });
});
