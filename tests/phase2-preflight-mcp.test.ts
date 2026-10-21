import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { startBridge, type Bridge } from "../src/bridge/server.js";
import { createExecutionProposal } from "../src/workflow/phase2.js";
import { briefDigest } from "../src/workflow/phase2/handoff-proof.js";
import { issueJevReceipt } from "../src/workflow/phase2/jev-receipts.js";
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

  it("does not require Jev for labels when bounded task materials are complete", async () => {
    for (const p of [
      { ...proposal("mandatory-flag"), jevRequired: true },
      { ...proposal("unclear-bug"), goal: "Investigate an unclear difficult bug" },
      proposal("followup"), proposal("repeated"),
    ]) {
      expect((await preflightCall(p, { ...preflight, completedPriorDiagnosisAndFollowupCodex: true,
        repetitiveInvestigationWithoutProgress: true })).state).toBe("NOT_REQUIRED");
    }
  });

  it("requires concrete materials for vague evidence, criteria, and high-risk work", async () => {
    expect(await preflightCall(proposal("vague-evidence"), { ...preflight, taskEvidence: ["已批准"] }))
      .toMatchObject({ state: "NEEDS_TASK_DETAILS" });
    expect(await preflightCall(proposal("vague-criteria"), { ...preflight, acceptanceCriteria: ["done"] }))
      .toMatchObject({ state: "NEEDS_TASK_DETAILS" });
    expect(await preflightCall({ ...proposal("incident"), riskProfile: "Production runtime incident" }))
      .toMatchObject({ state: "NEEDS_TASK_DETAILS" });
    const completeRisk = { ...proposal("bounded-incident"), riskProfile: "Production incident; permitted action is read-only diagnosis; stop if customer data changes; verify with read-only health checks" };
    const riskEvidence = { taskEvidence: ["Investigate elevated error rate using service logs; stop before any writes"],
      acceptanceCriteria: ["Confirm the affected endpoint and compare error rate before and after the incident window"] };
    expect(await preflightCall(completeRisk, riskEvidence)).toMatchObject({ state: "NOT_REQUIRED", receiptId: expect.any(String) });
  });

  it("does not treat prohibited deployment language in an ordinary UI task as high risk", async () => {
    const uiChange = { ...proposal("portfolio-ui"), goal: "Update the Portfolio dashboard status card layout",
      scope: { inScope: ["Adjust spacing and labels in the Portfolio dashboard"],
        outOfScope: ["Do not deploy this change or modify production applications"] },
      implementationBasis: ["Use existing Portfolio UI components"],
      riskProfile: "Local UI-only change; stop if deployment or production access is needed" };
    const evidence = { taskEvidence: ["The requested change only affects dashboard presentation"],
      acceptanceCriteria: ["The status card spacing and labels match the requested design"] };
    expect(await preflightCall(uiChange, evidence)).toMatchObject({ state: "NOT_REQUIRED", receiptId: expect.any(String) });
  });

  it("keeps actual deployment operations high risk and accepts boundaries stated in outOfScope", async () => {
    const deployment = { ...proposal("actual-deployment"), goal: "Deploy the Portfolio application to production",
      scope: { inScope: ["Deploy the approved Portfolio build"],
        outOfScope: ["Do not change application code; stop if deployment health checks fail; verify the production release"] },
      implementationBasis: ["Use the approved production release process"],
      riskProfile: "Production deployment; permitted action is release execution; stop if health checks fail" };
    const evidence = { taskEvidence: ["Execute the approved deployment and inspect release health"],
      acceptanceCriteria: ["Verify the production release health checks pass"] };
    expect(await preflightCall(deployment, evidence)).toMatchObject({ state: "NOT_REQUIRED", receiptId: expect.any(String) });
    expect(await preflightCall({ ...deployment, riskProfile: undefined }, evidence))
      .toMatchObject({ state: "NEEDS_TASK_DETAILS", reasonCodes: ["RISK_BOUNDARY_OR_STOP_CONDITION_MISSING"] });
  });

  it("allows a bounded read-only diagnosis when the root cause is unknown", async () => {
    const diagnostic = { ...proposal("unknown-root-cause"), goal: "Investigate intermittent export endpoint 500 errors; root cause unknown",
      scope: { inScope: ["Read export service logs and request traces"], outOfScope: ["Do not modify code, data, or production configuration"] },
      riskProfile: "Read-only investigation; stop if evidence requires writes" };
    const evidence = { taskEvidence: ["Compare failing request traces with healthy requests; stop after identifying the failing boundary"],
      acceptanceCriteria: ["Identify the failing boundary from logs or report that evidence is insufficient"] };
    expect(await preflightCall(diagnostic, evidence)).toMatchObject({ state: "NOT_REQUIRED", receiptId: expect.any(String) });
  });

  it("treats an explicit prohibition on bypassing authentication as a safe boundary", async () => {
    const secureReview = { ...proposal("auth-review"), goal: "Review the existing authentication response behavior",
      scope: { inScope: ["Read authentication handler and its tests"], outOfScope: ["Do not bypass authentication or modify token validation"] },
      implementationBasis: ["Preserve existing authentication checks"],
      riskProfile: "Security review; permitted actions are read-only source and test inspection; stop before edits; verify expected authentication behavior" };
    const evidence = { taskEvidence: ["Inspect the authentication handler and its unit tests"],
      acceptanceCriteria: ["Confirm missing tokens are rejected by the handler"] };
    expect(await preflightCall(secureReview, evidence)).toMatchObject({ state: "NOT_REQUIRED", receiptId: expect.any(String) });
  });

  it("uses declared incident signals and scoped read-only actions as risk evidence", async () => {
    expect(await preflightCall(proposal("incident-flag"), { ...preflight, productionOrRuntimeIncident: true }))
      .toMatchObject({ state: "NEEDS_TASK_DETAILS" });
    const diagnostic = { ...proposal("production-read-only"),
      goal: "Investigate production export errors with root cause unknown",
      scope: { inScope: ["Read-only inspection of export service logs and request traces"],
        outOfScope: ["Do not modify production code, data, or configuration"] },
      riskProfile: "Production incident; stop if inspection would require writes" };
    const evidence = { taskEvidence: ["Compare request traces with healthy requests; stop after identifying the failing boundary"],
      acceptanceCriteria: ["Verify the failing endpoint from request traces or report insufficient evidence"] };
    expect(await preflightCall(diagnostic, { ...evidence, productionOrRuntimeIncident: true }))
      .toMatchObject({ state: "NOT_REQUIRED", receiptId: expect.any(String) });
  });

  it("does not approve an unknown-cause repair because an unrelated change is prohibited", async () => {
    const contradictory = { ...proposal("unknown-cause-contradiction"),
      goal: "Investigate the export endpoint; root cause unknown",
      scope: { inScope: ["Modify retry logic in the handler"], outOfScope: ["Do not modify the unrelated compiler"] },
      riskProfile: "Read-only investigation; stop if evidence requires writes" };
    const evidence = { taskEvidence: ["Read request traces and stop after identifying the failing boundary"],
      acceptanceCriteria: ["Identify the failing boundary from request traces or report insufficient evidence"] };
    expect(await preflightCall(contradictory, evidence)).toMatchObject({ state: "NEEDS_TASK_DETAILS" });
  });

  it("issues v4 receipts and rejects a correctly signed legacy v3 receipt", async () => {
    const p = proposal("receipt-version");
    const issued = await preflightCall(p);
    expect(issued).toMatchObject({ state: "NOT_REQUIRED", receiptId: expect.any(String) });
    const bound = { preflightReceiptId: issued.receiptId, preflight };
    const made = await brief(p, bound);
    expect(made).toMatchObject({ created: true });
    const receiptFile = path.join(stateDir, "preflight-receipts", bridge.workspace.id, `${issued.receiptId}.json`);
    const envelope = JSON.parse(fs.readFileSync(receiptFile, "utf8"));
    expect(envelope.record.version).toBe(4);
    envelope.record.version = 3;
    envelope.mac = createHmac("sha256", fs.readFileSync(path.join(stateDir, "preflight-receipts", bridge.workspace.id, "issuer.key")))
      .update(JSON.stringify(envelope.record)).digest("hex");
    fs.writeFileSync(receiptFile, JSON.stringify(envelope));
    expect((await transition(p, { preflightReceiptId: issued.receiptId, preflight })).state).not.toBe("READY_FOR_EXECUTION");
    expect(await brief(p, { preflightReceiptId: issued.receiptId, preflight })).toMatchObject({ created: false });
    expect(await call("phase3_compile_execution", { brief: made.brief }))
      .toMatchObject({ status: "REJECTED_INSUFFICIENT_BRIEF" });
  });

  it("reports an immutable handoff proof digest conflict without replacing the proof", async () => {
    const p = proposal("proof-conflict"), issued = await preflightCall(p);
    const bound = { preflightReceiptId: issued.receiptId, preflight };
    const made = await brief(p, bound);
    expect(made).toMatchObject({ state: "READY_FOR_EXECUTION", created: true });
    const proofFile = path.join(stateDir, "handoff-proofs", bridge.workspace.id,
      `${briefDigest(made.brief as Parameters<typeof briefDigest>[0])}.json`);
    const original = fs.readFileSync(proofFile, "utf8");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(Date.now() + 900_001));
    const second = await preflightCall(p);
    const conflict = await brief(p, { preflightReceiptId: second.receiptId, preflight });
    expect(conflict).toMatchObject({ error: "PHASE2_EXECUTION_BRIEF_FAILED", message: "Conflicting handoff proof" });
    expect(fs.readFileSync(proofFile, "utf8")).toBe(original);
  });

  it("keeps missing baseline details out of NOT_REQUIRED", async () => {
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
      .toMatchObject({ decision: "stop" });
    await issueJevReceipt(bridge.workspace.id, createExecutionProposal(stopped),
      { task: stopped.goal, evidence: ["known investigation"], attempts: [] }, { available: true, decision: "stop" });
    const renamed = { ...proposal("renamed-stop"), jevRequired: false };
    expect((await preflightCall(renamed)).state).toBe("STOPPED");
    const independent = { ...proposal("independent-task"), goal: "Add a bounded JSON export option",
      scope: { inScope: ["JSON export handler"], outOfScope: ["Other formats"] },
      approvedBasis: { type: "explicit_instruction", summary: "Add JSON export to the existing handler" },
      implementationBasis: ["Use the JSON export handler"] };
    expect(await preflightCall(independent)).toMatchObject({ state: "NOT_REQUIRED", receiptId: expect.any(String) });
  });
});
