import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { startBridge, type Bridge } from "../src/bridge/server.js";
import { briefDigest } from "../src/workflow/phase2/handoff-proof.js";
import { cleanup, isolateStateDir, makeGitRepo, makeTmpDir } from "./helpers.js";

let bridge: Bridge, client: Client, root: string, stateDir: string;
const originalFetch = globalThis.fetch;
const proposal = (line: string) => ({
  executionLineId: line, goal: "Add a bounded CSV export option",
  scope: { inScope: ["CSV export handler"], outOfScope: ["Other formats"] },
  approvedBasis: { type: "explicit_instruction", summary: "Add CSV export to the existing handler" },
  implementationBasis: ["Use the current export handler"], riskProfile: "Local deterministic change",
  jevRequired: false,
});
const preflight = { acceptanceCriteria: ["CSV download contains the selected rows"],
  taskEvidence: ["New independent feature with no related prior investigation"] };
const details = { knownFacts: ["Export handler is in src/export.ts"], mustChange: ["Add CSV export to the handler"],
  mustNotChange: ["Other format responses"], acceptanceCriteria: preflight.acceptanceCriteria,
  validationExpectation: ["Run focused export test"], riskNotes: ["Preserve existing format behavior"],
  persistence: { mode: "ephemeral" } };
function body(result: { content?: unknown }) { return JSON.parse((result.content as { text: string }[])[0].text) as Record<string, any>; }
const call = async (name: string, args: Record<string, unknown>) => body(await client.callTool({ name, arguments: args }));
const preflightCall = (p: ReturnType<typeof proposal>, evidence: unknown = preflight) => call("phase2_preflight", { proposal: p, preflight: evidence });
const transition = (p: ReturnType<typeof proposal>, bound?: unknown) => call("phase2_transition", { proposal: p, boundJevResult: bound });
const brief = (p: ReturnType<typeof proposal>, bound?: unknown) => call("phase2_execution_brief", { proposal: p, boundJevResult: bound, details });

beforeEach(async () => {
  stateDir = isolateStateDir(); root = makeTmpDir("phase2-preflight"); makeGitRepo(root);
  bridge = await startBridge({ workspaceRoot: root, port: 0, persistRuntime: false });
  const token = bridge.authStore.issueTokens({ clientId: "preflight-test", scopes: ["workspace.read", "workspace.write"] });
  client = new Client({ name: "preflight-test", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${bridge.localBaseUrl()}/mcp`), {
    requestInit: { headers: { authorization: `Bearer ${token.accessToken}` } },
  }));
});
afterEach(async () => {
  vi.useRealTimers(); await client?.close(); await bridge?.close();
  globalThis.fetch = originalFetch; delete process.env.TYPESAFE_API_KEY;
  delete process.env.C2C_STATE_DIR; cleanup(root); cleanup(stateDir);
});

describe("trusted conditional preflight over MCP", () => {
  it("issues NOT_REQUIRED without Jev and compiles only its authorized Brief", async () => {
    const p = proposal("ordinary-csv");
    const issued = await preflightCall(p);
    expect(issued).toMatchObject({ state: "NOT_REQUIRED", receiptId: expect.any(String) });
    const bound = { preflightReceiptId: issued.receiptId, preflight };
    expect(await transition(p, bound)).toMatchObject({ state: "READY_FOR_EXECUTION" });
    const made = await brief(p, bound);
    expect(made).toMatchObject({ state: "READY_FOR_EXECUTION", created: true });
    expect(await call("phase3_compile_execution", { brief: made.brief })).toMatchObject({ status: "READY", package: { prompt: expect.any(String) } });
    const proofFile = path.join(stateDir, "handoff-proofs", bridge.workspace.id, `${briefDigest(made.brief as Parameters<typeof briefDigest>[0])}.json`);
    const original = fs.readFileSync(proofFile, "utf8");
    fs.writeFileSync(proofFile, original.replace('"authorizationSource":"NOT_REQUIRED"', '"authorizationSource":"JEV_PROCEED"'));
    const tampered = await call("phase3_compile_execution", { brief: made.brief });
    expect(tampered).toMatchObject({ status: "REJECTED_INSUFFICIENT_BRIEF" });
    expect(tampered).not.toHaveProperty("package");
    fs.writeFileSync(proofFile, original);
    const receiptFile = path.join(stateDir, "preflight-receipts", bridge.workspace.id, `${issued.receiptId}.json`);
    const receipt = fs.readFileSync(receiptFile, "utf8");
    fs.writeFileSync(receiptFile, receipt.replace('"decision":"NOT_REQUIRED"', '"decision":"REQUIRES_JEV"'));
    const invalidSource = await call("phase3_compile_execution", { brief: made.brief });
    expect(invalidSource).toMatchObject({ status: "REJECTED_INSUFFICIENT_BRIEF" });
    expect(invalidSource).not.toHaveProperty("package");
    fs.writeFileSync(receiptFile, receipt);
    expect((await transition(p, bound)).state).toBe("READY_FOR_EXECUTION");
  });

  it("keeps mandatory signals and missing details out of NOT_REQUIRED", async () => {
    expect((await preflightCall({ ...proposal("mandatory-flag"), jevRequired: true })).state).toBe("REQUIRES_JEV");
    expect((await preflightCall({ ...proposal("unclear-bug"), goal: "Investigate an unclear difficult bug" })).state).toBe("REQUIRES_JEV");
    expect((await preflightCall({ ...proposal("incident"), riskProfile: "Production runtime incident" })).state).toBe("REQUIRES_JEV");
    expect((await preflightCall(proposal("followup"), { ...preflight, completedPriorDiagnosisAndFollowupCodex: true })).state).toBe("REQUIRES_JEV");
    expect((await preflightCall(proposal("repeated"), { ...preflight, repetitiveInvestigationWithoutProgress: true })).state).toBe("REQUIRES_JEV");
    expect((await preflightCall(proposal("missing"), { taskEvidence: preflight.taskEvidence, acceptanceCriteria: [] })).state).toBe("NEEDS_TASK_DETAILS");
    expect((await preflightCall({ ...proposal("missing-goal"), goal: "" })).state).toBe("NEEDS_TASK_DETAILS");
  });

  it("rejects forged, changed, tampered and expired preflight authorization", async () => {
    const p = proposal("ordinary-integrity"), issued = await preflightCall(p);
    const bound = { preflightReceiptId: issued.receiptId, preflight };
    expect((await transition(p)).state).toBe("EXECUTION_PROPOSED");
    expect((await transition(p, { preflightReceiptId: "a".repeat(48), preflight })).state).toBe("EXECUTION_PROPOSED");
    expect((await transition({ ...p, jevRequired: true }, bound)).state).not.toBe("READY_FOR_EXECUTION");
    expect((await transition({ ...p, riskProfile: "Production incident" }, bound)).state).not.toBe("READY_FOR_EXECUTION");
    expect((await transition({ ...p, newRiskSignal: "production incident" } as ReturnType<typeof proposal>, bound)).state).not.toBe("READY_FOR_EXECUTION");
    expect((await transition(p, { ...bound, preflight: { ...preflight, productionOrRuntimeIncident: true } })).state).not.toBe("READY_FOR_EXECUTION");
    const file = path.join(stateDir, "preflight-receipts", bridge.workspace.id, `${issued.receiptId}.json`);
    const original = fs.readFileSync(file, "utf8");
    fs.writeFileSync(file, original.replace('"decision":"NOT_REQUIRED"', '"decision":"REQUIRES_JEV"'));
    expect((await transition(p, bound)).state).not.toBe("READY_FOR_EXECUTION");
    fs.writeFileSync(file, original);
    const record = JSON.parse(original).record;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(Date.parse(record.expiresAt) + 1));
    expect((await transition(p, bound)).state).not.toBe("READY_FOR_EXECUTION");
    expect(await brief(p, bound)).toMatchObject({ created: false });
  });

  it("isolates receipts by workspace", async () => {
    const p = proposal("ordinary-workspace"), issued = await preflightCall(p);
    const made = await brief(p, { preflightReceiptId: issued.receiptId, preflight });
    expect(made).toMatchObject({ state: "READY_FOR_EXECUTION", created: true });
    const otherRoot = makeTmpDir("preflight-other"); makeGitRepo(otherRoot);
    const other = await startBridge({ workspaceRoot: otherRoot, port: 0, persistRuntime: false });
    const token = other.authStore.issueTokens({ clientId: "other", scopes: ["workspace.read", "workspace.write"] });
    const peer = new Client({ name: "other", version: "1.0.0" });
    try {
      await peer.connect(new StreamableHTTPClientTransport(new URL(`${other.localBaseUrl()}/mcp`), {
        requestInit: { headers: { authorization: `Bearer ${token.accessToken}` } },
      }));
      const result = body(await peer.callTool({ name: "phase2_transition", arguments: { proposal: p,
        boundJevResult: { preflightReceiptId: issued.receiptId, preflight } } }));
      expect(result.state).not.toBe("READY_FOR_EXECUTION");
      const compiled = body(await peer.callTool({ name: "phase3_compile_execution", arguments: { brief: made.brief } }));
      expect(compiled).toMatchObject({ status: "REJECTED_INSUFFICIENT_BRIEF" });
      expect(compiled).not.toHaveProperty("package");
    } finally { await peer.close(); await other.close(); cleanup(otherRoot); }
  });
  it("keeps related Stop precedence after an ID change while allowing unrelated work", async () => {
    process.env.TYPESAFE_API_KEY = "test-key";
    globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url) === "https://api.typesafe.ai/v1/systemone") {
        if (!init?.body) throw new Error("Missing Jev request");
        return new Response(JSON.stringify({ answers: { gate: { choice: "stop" } } }), {
          status: 200, headers: { "content-type": "application/json" },
        });
      }
      return originalFetch(url, init);
    }) as typeof fetch;
    const stopped = { ...proposal("known-stop"), jevRequired: true };
    expect(await call("jev_decision_gate", { task: stopped.goal, evidence: ["known investigation"], attempts: [], proposal: stopped }))
      .toMatchObject({ decision: "stop", receiptId: expect.any(String) });
    const renamed = { ...proposal("renamed-stop"), jevRequired: false };
    expect((await preflightCall(renamed)).state).toBe("STOPPED");
    const independent = { ...proposal("independent-task"), goal: "Add a bounded JSON export option",
      scope: { inScope: ["JSON export handler"], outOfScope: ["Other formats"] },
      approvedBasis: { type: "explicit_instruction", summary: "Add JSON export to the existing handler" },
      implementationBasis: ["Use the JSON export handler"] };
    expect(await preflightCall(independent)).toMatchObject({ state: "NOT_REQUIRED", receiptId: expect.any(String) });
  });
});
