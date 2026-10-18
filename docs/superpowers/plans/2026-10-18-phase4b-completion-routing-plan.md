# Workflow v3 Phase 4B — Focused Implementation Plan

**Date:** 2026-10-18
**Status:** Proposed task plan
**Spec:** `docs/superpowers/specs/2026-10-18-phase4b-completion-routing-design.md`

## Task 1 — Pure completion domain (first execution)

**Files:** Create `src/workflow/phase4b/completion.ts` and `tests/phase4b-completion.test.ts` only.

- Define strict `CompletionInput`, `CompletionResult` and `routeCompletion(proposal, input)`, using existing `createExecutionProposal` to verify `executionLineId` and `proposalIdentity`.
- Support only the states/outcomes in the spec; do not persist a result or invoke Phase 4A.
- Test missing/failed/passed validation; review pending/failed/passed; required versus not-required acceptance; pending/accepted/rejected; missing evidence; illegal combinations; identity mismatches. Confirm Codex `done` alone cannot produce `COMPLETED`.
- TDD: first run `pnpm exec vitest run tests/phase4b-completion.test.ts` expecting a failing new test, implement, then rerun the same test and `pnpm exec tsc --noEmit`.
- Do not commit or push automatically. Minimal Completion Report only.

## Task 2 — Read-only completion MCP entry

**Files:** Modify `src/mcp/server.ts` and `tests/mcp-integration.test.ts` only; reuse Task 1 domain.

- Add one narrowly scoped `phase4b_route_completion` tool requiring `workspace.read`.
- Check existing Failure Record for this workspace and execution line; if found, return `FAILED / NEW_DECISION_REQUIRED`. Fail closed if failure history is corrupted/unreadable.
- Verify state transitions through the MCP interface, output schema, permissions, existing failed-line override, invalid identity, and no state mutation or next-route execution.
- Run only Phase 4B MCP cases plus `tests/phase4b-completion.test.ts`, relevant existing Phase 4A contract tests if needed, and `pnpm exec tsc --noEmit`.
- Do not change Phase 2/3 implementation or Phase 4A persistence semantics.

## Task 3 — Phase 4B focused acceptance

**Files:** Tests only if a concrete gap is found; otherwise no code changes.

- Validate the four meaningful outcomes against real sample proposals: review pending, acceptance pending, closed without acceptance, closed after explicit user acceptance; plus already-failed line override.
- Verify the design's trust limitation is documented: supplied acceptance is not cryptographic proof of user authorship; `CLOSED` is not a persisted global terminal claim.
- No automatic acceptance, commit, push or production action.

## Phase boundary

After Phase 4B acceptance: enter Phase 4C Project Profiles as a separate design/implementation stream. Only after 4B/4C are accepted, run a cross-phase Workflow v3 E2E matrix. Any proposal to persist completed-line finality, add cross-phase identity enforcement or shared atomic terminal storage requires a new explicit design decision, not scope creep.
