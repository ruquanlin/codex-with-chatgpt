export type JevGateDecision = "proceed" | "reframe" | "stop";

export interface JevGateInput {
  task: string;
  evidence?: string[];
  attempts?: string[];
}

export interface JevGateResult {
  available: boolean;
  decision?: JevGateDecision;
  confidence?: number;
  probabilities?: Record<string, number>;
  model?: string;
  error?: string;
}

type FetchLike = typeof fetch;

const DEFAULT_ENDPOINT = "http://127.0.0.1:17666/ask";
const DEFAULT_MODEL = "local-jev";

function localJevEndpoint(): string {
  if (process.env.JEV_ASK_URL) return process.env.JEV_ASK_URL;
  if (process.env.JEV_BASE_URL) return new URL("/ask", process.env.JEV_BASE_URL).toString();
  return DEFAULT_ENDPOINT;
}

function parseGateAnswer(payload: unknown): {
  choice?: unknown;
  confidence?: unknown;
  probabilities?: unknown;
  model?: unknown;
} | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  const answer = root.answer && typeof root.answer === "object" ? root.answer as Record<string, unknown> : null;
  const gate =
    root.answers &&
    typeof root.answers === "object" &&
    (root.answers as Record<string, unknown>).gate &&
    typeof (root.answers as Record<string, unknown>).gate === "object"
      ? (root.answers as Record<string, unknown>).gate as Record<string, unknown>
      : null;

  if (typeof root.decision === "string") {
    return {
      choice: root.decision,
      confidence: root.confidence,
      probabilities: root.probabilities,
      model: root.model,
    };
  }
  if (answer && typeof answer.decision === "string") {
    return {
      choice: answer.decision,
      confidence: answer.confidence,
      probabilities: answer.probabilities,
      model: answer.model ?? root.model,
    };
  }
  if (answer && typeof answer.choice === "string") {
    return {
      choice: answer.choice,
      confidence: answer.confidence,
      probabilities: answer.probabilities,
      model: answer.model ?? root.model,
    };
  }
  if (gate) {
    return {
      choice: gate.choice,
      confidence: gate.confidence,
      probabilities: gate.probabilities,
      model: root.model,
    };
  }
  return null;
}

export async function runJevDecisionGate(
  input: JevGateInput,
  options: {
    apiKey?: string;
    endpoint?: string;
    model?: string;
    fetchImpl?: FetchLike;
  } = {}
): Promise<JevGateResult> {
  const endpoint = options.endpoint ?? localJevEndpoint();
  const model = options.model ?? process.env.JEV_DEFAULT_MODEL ?? DEFAULT_MODEL;
  const fetchImpl = options.fetchImpl ?? fetch;

  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        question:
          "Should another Codex debugging/execution step be run now, based only on the supplied task, evidence and prior attempts?",
        context: {
          task: input.task,
          evidence: input.evidence ?? [],
          attempts: input.attempts ?? [],
        },
        choices: {
          proceed:
            "The next Codex step is well-scoped, evidence-driven, and likely to reduce uncertainty or implement a confirmed fix.",
          reframe:
            "More Codex work may be useful, but the next task should first be narrowed or changed because the current framing is speculative, repetitive, or missing a decisive observation.",
          stop:
            "Another Codex step is unlikely to add useful information now because the investigation is repeating itself, the needed evidence is external/unavailable, or the task is already resolved.",
        },
        response_format: {
          type: "json",
          schema: {
            decision: ["proceed", "reframe", "stop"],
            confidence: "number between 0 and 1",
            probabilities: "optional object with proceed, reframe, and stop probabilities",
          },
        },
      }),
    });
  } catch (error) {
    return {
      available: false,
      model,
      error: "Local Jev /ask request failed: " + (error instanceof Error ? error.message : String(error)),
    };
  }

  if (!response.ok) {
    return {
      available: false,
      model,
      error: "Jev request failed with HTTP " + response.status + ".",
    };
  }

  const payload = await response.json();
  const answer = parseGateAnswer(payload);
  if (!answer || (answer.choice !== "proceed" && answer.choice !== "reframe" && answer.choice !== "stop")) {
    return {
      available: false,
      model,
      error: "Jev returned an unexpected gate response.",
    };
  }

  return {
    available: true,
    decision: answer.choice,
    confidence: typeof answer.confidence === "number" ? answer.confidence : undefined,
    probabilities: answer.probabilities && typeof answer.probabilities === "object" ? answer.probabilities as Record<string, number> : undefined,
    model: typeof answer.model === "string" ? answer.model : model,
  };
}
