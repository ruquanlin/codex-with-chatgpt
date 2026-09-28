# Jev Decision Gate Integration Summary — 2026-09-28

## Goal

Connect the existing C2C `jev_decision_gate` to the real TypeSafe Jev API without exposing the API key to ChatGPT, MCP tool arguments, prompts, or the repository.

## Final Architecture

```text
ChatGPT
  -> C2C MCP `jev_decision_gate`
  -> current C2C bridge `/ask` endpoint
  -> TypeSafe `POST /v1/systemone`
  -> Jev
  -> proceed / reframe / stop
```

The gate uses the bridge's actual runtime host/port instead of a hardcoded port.

## API Key Handling

- Primary source: `TYPESAFE_API_KEY` environment variable.
- Fallback: `getStateDir()/secrets/typesafe.json`.
- Local file shape: `{ "apiKey": "..." }`.
- Real key is stored outside the repository with owner-only file permissions (`0600`).
- The key is never logged or returned by the bridge.

## TypeSafe Mapping

The local `/ask` adapter maps the existing gate payload to:

```json
{
  "model": "jev-latest",
  "state": "<existing context>",
  "questions": {
    "gate": {
      "type": "choice",
      "instructions": "<existing question>",
      "criteria": "<existing choices>"
    }
  }
}
```

The existing `proceed / reframe / stop` semantics remain unchanged.

## Validation

- `tests/jev-decision-gate.test.ts`: passed.
- `tests/jev-bridge.test.ts`: passed locally.
- TypeScript build: passed.
- Direct real `/ask` call reached TypeSafe successfully and returned Jev `1.13.0`.
- Final real MCP E2E passed:

```json
{
  "available": true,
  "decision": "stop",
  "confidence": 1,
  "probabilities": {
    "stop": 1,
    "reframe": 0,
    "proceed": 0
  },
  "model": "jev-1.13.0"
}
```

This proves the full path:

```text
ChatGPT -> MCP gate -> dynamic bridge /ask -> local secret -> TypeSafe -> Jev
```

## Files Changed

- `src/bridge/server.ts`
- `src/mcp/server.ts`
