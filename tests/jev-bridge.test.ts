import { afterEach, describe, expect, it, vi } from "vitest";
import { startBridge, type Bridge } from "../src/bridge/server.js";
import { writeSecureJson } from "../src/config/paths.js";
import { cleanup, isolateStateDir, makeGitRepo, makeTmpDir } from "./helpers.js";

const originalFetch = globalThis.fetch;
let bridge: Bridge | undefined;
let root: string | undefined;
let stateDir: string | undefined;

afterEach(async () => {
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
  delete process.env.TYPESAFE_API_KEY;
  delete process.env.C2C_STATE_DIR;
  if (bridge) await bridge.close();
  if (root) cleanup(root);
  bridge = undefined;
  root = undefined;
  stateDir = undefined;
});

async function start(): Promise<void> {
  const workspaceRoot = makeTmpDir("jev-bridge");
  root = workspaceRoot;
  makeGitRepo(workspaceRoot);
  bridge = await startBridge({ workspaceRoot, port: 0, persistRuntime: false });
}

describe("local Jev bridge", () => {
  it("maps the request exactly and sends bearer authorization", async () => {
    process.env.TYPESAFE_API_KEY = "test-key";
    stateDir = isolateStateDir();
    writeSecureJson(`${stateDir}/secrets/typesafe.json`, { apiKey: "file-key" });
    await start();
    const upstream = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://api.typesafe.ai/v1/systemone");
      expect(init?.headers).toMatchObject({ Authorization: "Bearer test-key" });
      expect(JSON.parse(String(init?.body))).toEqual({
        model: "jev-latest",
        state: { task: "do it" },
        questions: {
          gate: { type: "choice", instructions: "choose", criteria: { proceed: "yes" } },
        },
      });
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
    });
    globalThis.fetch = upstream as typeof fetch;

    const response = await originalFetch(`${bridge!.localBaseUrl()}/ask`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: "choose", context: { task: "do it" }, choices: { proceed: "yes" }, response_format: { unsupported: true } }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("rejects requests when TYPESAFE_API_KEY is missing", async () => {
    stateDir = isolateStateDir();
    await start();
    const response = await originalFetch(`${bridge!.localBaseUrl()}/ask`, { method: "POST", body: "{}", headers: { "content-type": "application/json" } });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "typesafe_api_key_missing" });
  });

  it("uses the secure state-file fallback when the environment is absent", async () => {
    stateDir = isolateStateDir();
    writeSecureJson(`${stateDir}/secrets/typesafe.json`, { apiKey: "file-key" });
    await start();
    const upstream = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({ Authorization: "Bearer file-key" });
      return new Response("{}", { status: 200 });
    });
    globalThis.fetch = upstream as typeof fetch;
    const response = await originalFetch(`${bridge!.localBaseUrl()}/ask`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect(response.status).toBe(200);
  });
});
