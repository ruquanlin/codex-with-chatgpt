import { describe, expect, it } from "vitest";
import { runJevDecisionGate } from "../src/decision/jev-gate.js";

describe("Jev decision gate", () => {
  it("calls local Jev /ask without requiring an API key", async () => {
    let requestedUrl = "";
    const result = await runJevDecisionGate(
      { task: "Investigate an intermittent production error" },
      {
        endpoint: "http://127.0.0.1:17666/ask",
        fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
          requestedUrl = String(url);
          expect((init?.headers as Record<string, string>).Authorization).toBeUndefined();
          return new Response(JSON.stringify({ decision: "proceed", confidence: 0.9 }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }) as typeof fetch,
      }
    );
    expect(requestedUrl).toBe("http://127.0.0.1:17666/ask");
    expect(result.available).toBe(true);
    expect(result.decision).toBe("proceed");
  });

  it("returns the typed Jev gate decision", async () => {
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.context).toEqual({
        task: "Keep diagnosing Error 1102",
        evidence: ["Site recovered without a deploy"],
        attempts: ["Repeated the same log inspection twice"],
      });
      expect(body.choices).toEqual(
        expect.objectContaining({
          proceed: expect.any(String),
          reframe: expect.any(String),
          stop: expect.any(String),
        })
      );
      return new Response(
        JSON.stringify({
          answer: {
            decision: "reframe",
            confidence: 0.82,
            probabilities: { proceed: 0.12, reframe: 0.82, stop: 0.06 },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const result = await runJevDecisionGate(
      {
        task: "Keep diagnosing Error 1102",
        evidence: ["Site recovered without a deploy"],
        attempts: ["Repeated the same log inspection twice"],
      },
      { fetchImpl }
    );

    expect(result).toEqual({
      available: true,
      decision: "reframe",
      confidence: 0.82,
      probabilities: { proceed: 0.12, reframe: 0.82, stop: 0.06 },
      model: "local-jev",
    });
  });

  it("fails closed on malformed Jev output", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ answer: { decision: "maybe" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as typeof fetch;

    const result = await runJevDecisionGate(
      { task: "Investigate" },
      { fetchImpl }
    );
    expect(result.available).toBe(false);
    expect(result.error).toContain("unexpected");
  });

  it("fails closed when local Jev /ask is unavailable", async () => {
    const result = await runJevDecisionGate(
      { task: "Investigate" },
      {
        fetchImpl: (async () => {
          throw new Error("connect ECONNREFUSED 127.0.0.1:17666");
        }) as typeof fetch,
      }
    );
    expect(result.available).toBe(false);
    expect(result.error).toContain("Local Jev /ask request failed");
  });
});
