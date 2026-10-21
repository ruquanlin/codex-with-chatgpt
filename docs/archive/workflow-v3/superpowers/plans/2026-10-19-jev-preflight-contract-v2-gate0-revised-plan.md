# Jev Preflight Contract v2 — Gate 0 Revised Implementation Plan

**Date:** 2026-10-19  
**Status:** Proposed — design review only; **no execution authorization**  
**Spec:** `2026-10-19-jev-preflight-contract-v2-gate0-revised-spec.md`  
**Repository:** `codex-with-chatgpt`

## Objective

Close three official C2C bypass paths: caller `jevRequired=false`, forged caller `proceed`, and direct Phase 3 compilation of an unapproved Brief. Fail closed when negative Jev evidence is unavailable. Do **not** implement the `NOT_REQUIRED` exemption until independent all-negative evidence is possible.

## Order and boundaries

This replaces the implementation assumptions in `docs/superpowers/plans/2026-10-19-jev-preflight-contract-v2-plan.md` **only if the revised Spec and this plan are approved**. Do not resume the previously Jev-stopped implementation line; obtain a genuinely new authorized execution line and follow normal Jev/Phase 2/3 routing before issuing any official Codex prompt.

Do not modify Portfolio/Pendlio, `src/workflow/phase3/compiler.ts`, Phase 3 model/validation routing, Phase 4 algorithms, Jev scoring/model, historical E2E records, unrelated docs, or existing uncommitted files. No full suite/build or drive-by refactor.

### Task 1 — Canonical preflight identity and fail-closed Phase 2

**Scope:** `src/workflow/phase2.ts`; a small `src/workflow/phase2/preflight.ts` if needed; focused Phase 2 tests.

- Introduce versioned canonical material evidence/provenance in proposal identity.
- Treat legacy `jevRequired=false` as insufficient for exemption; retain true as requiring Jev.
- Keep existing Phase 2 state names and decision semantics; do not yet grant ready from caller `boundJevResult`.
- Initial `NOT_REQUIRED` emission disabled.

**Focused validation:** `tests/phase2.test.ts` plus a dedicated preflight test file. Cover both caller false and fake matching proceed, trigger/uncertainty cases, and material versus cosmetic change.

### Task 2 — C2C-issued Jev receipt and stop protection

**Scope:** minimal C2C-local receipt store under `src/workflow/phase2/` (or equivalent), `jev_decision_gate` MCP handler and its focused tests.

- Add optional bound proposal to the existing Jev tool; legacy unbound calls may still provide advisory output but cannot authorize Phase 2.
- Issue an opaque server-owned workspace/proposal/evidence/request-bound receipt **only after** a real Jev endpoint result.
- Validate receipt provenance, expiry (900 seconds maximum for reusable `proceed`), namespace, source consistency and tampering; preserve stop for the same investigation line without treating receipt expiry as clearing it.
- Prefer proven existing atomic, permission-restricted local-state primitives; no new DB or service. If store consistency cannot be ensured, stop and report blocker.

**Focused validation:** new receipt-store tests and existing Jev MCP cases, including wrong workspace, fake receipt, replay, corruption, stop, unavailable and restart.

### Task 3 — Both Phase 2 MCP endpoints plus issued Brief proof

**Scope:** `src/mcp/server.ts`, shared Phase 2 verifier/store, focused MCP tests.

- Accept server-issued Jev receipt reference for the current proposal; reject caller-authored `boundJevResult` as authorization.
- Reuse exactly the same decision verifier in `phase2_transition` and `phase2_execution_brief`.
- Persist a workspace/proposal/Brief-digest handoff proof only when a genuinely ready Brief is created.
- Keep existing Phase 2 tool names, states, and Brief content shape. Internal C2C metadata persistence must not modify project source files.

**Focused validation:** filtered `tests/mcp-integration.test.ts` cases proving endpoint parity and no Brief on unready/mismatched inputs.

### Task 4 — Guard Phase 3 MCP handoff, not its compiler

**Scope:** only the `phase3_compile_execution` MCP handler, its shared proof lookup and filtered integration tests.

- Before compiling, verify current-workspace C2C handoff proof for the canonical submitted Brief.
- Return explicit MCP gate error for valid-looking but unapproved Briefs.
- Keep `{ brief }` inputs and underlying compiler, model router, validation router and generated prompt format unchanged.

**Focused validation:** direct forged Phase 3 call rejected; a Brief issued through successful Phase 2 continues to compile `READY` when valid.

### Task 5 — Narrow policy alignment and focused release check

**Scope:** only relevant Mandatory Jev paragraph in `docs/codex-execution-policy.md`, targeted tests for tools touched above.

- State that deterministic exemption requires independently verified negative trigger evidence; when unverifiable, call Jev. Do not claim the exemption works in this release.
- Run only affected unit/MCP integration cases and `git diff --check`; inspect changed paths and pre-existing dirty state. Do not commit/push without separate authorization.

## Consumer-side E2E (separate approval)

1. From a **new permitted** investigation line in an ordinary ChatGPT conversation, observe genuine Jev call → server receipt → Phase 2 ready/brief → Phase 3 ready (only if actual Jev `proceed`).
2. Confirm an unbound/forged proceed cannot take the same path.
3. Confirm an ordinary task lacking trusted all-negative evidence goes to Jev; this is **not** a `NOT_REQUIRED` acceptance test.
4. Leave original Portfolio failed E2E and earlier Jev `stop` unchanged. Report actual observed tool calls, not simulated compliance.

## Acceptance and minimal report

**Accept:** three bypass paths closed at the official C2C boundary; no fake exemption; genuine Jev decisions identity-bound; no changes to compiler internals or Phase 4.  
**Report:** what changed; focused validation; blockers.  
**Model advice after an authorized, compiled Codex prompt:** choose the lowest-cost model that reliably fits each specific task, not the overall project complexity.
