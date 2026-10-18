# Workflow v3 Phase 4B — Completion Routing Design

**Date:** 2026-10-18
**Status:** Proposed; implementation may begin with the bounded domain contract only
**Authority:** `docs/workflow/WORKFLOW_V3_MASTER_ARCHITECTURE.md` and Phase 4A Failure Loop design
**Scope:** Completion decision only; Project Profiles belong to Phase 4C

## 1. Goal and ownership

Make the last part of Workflow v3 deterministic:

```text
Codex completion report + focused verification evidence
  → ChatGPT review
  → user acceptance, if explicitly required
  → COMPLETED → workflow-level CLOSED
```

ChatGPT decides review and whether acceptance is required. Codex reports and verifies work, but its `done` claim is not acceptance. The user supplies required visual, production, deployment, real-device and other acceptance. Closing a workflow **never** automatically commits, pushes, merges or deploys code.

This phase is **not** a second Workflow Router, an autonomous reviewer or a new authorization provider.

## 2. Known integration facts

- Phase 2 `ExecutionProposalInput` contains `executionLineId`; `createExecutionProposal()` recomputes a stable `identity`.
- The Phase 3 `ExecutionBrief` currently omits `executionLineId`, so Phase 4B must **not** claim a globally authenticated Phase 3 lineage.
- Phase 4A already provides an immutable Failure Record and `getFailureByExecutionLine(workspace.id, lineId)`.
- Phase 4A records only `FAILED` as terminal failure. Its future conceptual success states are `REVIEW_PENDING`, `ACCEPTANCE_PENDING`, `COMPLETED`; `NEW_DECISION_REQUIRED` is an emitted outcome.
- Existing Phase 4A failed-line blocking is only at the two Phase 2 MCP entry points. Do not claim blanket invalidation across all callers.

## 3. Narrow decision model

Use a pure function for Task 1:

```ts
routeCompletion(
  proposal: ExecutionProposalInput,
  input: CompletionInput
): CompletionResult
```

`CompletionInput` has strictly validated fields:

- `executionLineId` and `proposalIdentity`: nonblank and exactly consistent with recomputed Phase 2 proposal identity;
- `validation`: explicit `PASSED | FAILED | MISSING`, with nonblank evidence for a recorded pass or failure;
- `review`: explicit `PENDING | PASSED | FAILED`, with nonblank evidence for a decision;
- `acceptance`: explicit `required: boolean`, `status: NOT_REQUIRED | PENDING | ACCEPTED | REJECTED`, and evidence when accepted or rejected.

No acceptance decision may be recorded before review passes. `required=false` must pair with `NOT_REQUIRED`; `required=true` must pair with `PENDING`, `ACCEPTED` or `REJECTED`. Never infer that acceptance is unnecessary from a Project Profile, task name or a Codex report. Empty evidence or inconsistent combinations fail closed.

Result is one of:

| Input condition | State | Outcome |
|---|---|---|
| Validation absent | `BLOCKED` | `VERIFICATION_REQUIRED` |
| Validation fails, or review fails, or required acceptance is rejected | `BLOCKED` | `FAILURE_RECORD_REQUIRED` |
| Validation passes; review pending | `REVIEW_PENDING` | `REVIEW_REQUIRED` |
| Review passes; required acceptance pending | `ACCEPTANCE_PENDING` | `USER_ACCEPTANCE_REQUIRED` |
| Review passes; acceptance explicitly not required | `COMPLETED` | `CLOSED` |
| Review and required user acceptance pass | `COMPLETED` | `CLOSED` |

The `BLOCKED` here is a *nonterminal response*, not an independently persisted execution-line state. Phase 4B never writes a Phase 4A failure on the caller's behalf. When `FAILURE_RECORD_REQUIRED` is returned, the upstream decision layer supplies the appropriate type/stage/evidence/nextRoute to `phase4a_record_failure`; a successful Phase 4A recording then terminates the line. A pre-existing Phase 4A failure always overrides any completion claim (`FAILED` / `NEW_DECISION_REQUIRED`) at the MCP boundary.

## 4. Evidence and actor limits

Passing validation requires actual focused verification evidence. A summary or claim from Codex alone must not be treated as ChatGPT review. The review and required acceptance fields represent *decisions already obtained by the ChatGPT/user interaction*; this contract does not authenticate which human typed them. MCP `workspace.read` authorization authenticates access to this tool, **not** user acceptance provenance. The caller must never fabricate user acceptance, and a missing decision remains pending.

An immutable completion record is **not** introduced in the first implementation. `COMPLETED` / `CLOSED` is a deterministic workflow-level result for the supplied evidence, not a durable global lock on the execution line. This avoids adding a competing terminal store without an atomic reconciliation contract with Phase 4A. If persistent success terminality is later required, approve and test a shared cross-phase atomic terminal contract separately; do not silently create a second file store.

## 5. MCP and runtime boundary (Task 2)

Expose one read-only MCP tool, proposed name `phase4b_route_completion`:

- Input: `{ proposal, completion }`, bound to current workspace (never accept a caller workspace ID).
- Require `workspace.read`; strict schema; reuse the pure completion evaluator.
- Check `getFailureByExecutionLine(workspace.id, completion.executionLineId)` before returning any successful state. Existing failure forces `FAILED / NEW_DECISION_REQUIRED` with the existing Failure Record reference.
- Fail closed on unreadable failure history.
- No code execution, no automatic browser, no automatic validation, no persistence, no Phase 1 rerouting, no commits/deployments.

## 6. Acceptance tests

1. Missing verification cannot complete; failed verification directs to Phase 4A and never closes.
2. A Codex completion report alone cannot bypass ChatGPT review.
3. Explicit non-required acceptance closes only after review passes.
4. Required user acceptance is never inferred; it remains pending until expressly accepted with evidence.
5. Review failure and acceptance rejection require Phase 4A handling; never silently retry an old line.
6. Identity mismatch or illegal state combinations fail closed.
7. A pre-existing failed line cannot be marked closed through the new MCP tool.
8. Existing Phase 2, Phase 3 and Phase 4A behavior is unchanged; no broad tests/browser work.

## 7. Non-goals and known limitations

Do not modify Phase 2 proposal identity, Phase 3 brief or compiler, Jev, Router, WDR policy, Phase 4A failure schema, Codex execution harness, or authorization scopes. No new success persistence or generic lifecycle subsystem. This phase does not cryptographically establish whether a review or acceptance came from ChatGPT/a particular user, and does not globally block out-of-band Phase 3 compilation of an old brief.
