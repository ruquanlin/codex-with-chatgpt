# Phase 4A Failure Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Terminate a failed Workflow v3 execution line, persist one immutable failure record, and require a new Phase 2 decision for further execution.

**Architecture:** A small Phase 4A domain module validates explicit upstream failures, checks their identity against the supplied Phase 2 proposal, and emits `NEW_DECISION_REQUIRED` without executing its route. Workspace-scoped, create-only files in the existing C2C state directory preserve failures; two narrow MCP tools record/query them. The existing Phase 2 MCP entry points reject reuse of recorded failed lines, leaving Phase 2 identity hashing and Phase 3 compilation unchanged.

**Tech Stack:** TypeScript, Node.js fs/crypto, Zod, Vitest, existing MCP server.

**Spec:** `docs/superpowers/specs/2026-10-17-phase4a-failure-loop-design.md`

## Global Constraints

- Failure covers execution, validation, review, and required acceptance; upstream supplies type, stage, summary, evidence, and next route.
- `FAILED` is terminal for the old execution line; `NEW_DECISION_REQUIRED` is an emitted outcome, not a persisted state.
- No retry/resume of the old line. Another implementation attempt needs a distinct `executionLineId` and hence a fresh Phase 2 proposal identity.
- Validation routing is explicit upstream input, never inferred by Phase 4A from command output.
- Failure recording requires the matching Phase 2 proposal input; recompute its identity with the existing Phase 2 helper, without changing the Phase 2 hashing contract. This checks consistency of supplied data, not server-side provenance.
- Canonical Failure Records live in C2C state, not the project repo; never mix them into `src/execution/records.ts`.
- Do not modify Phase 2 identity construction, Execution Brief shape, Phase 3 compiler, Jev behavior, Router policy, or the Codex harness.
- No Project Profiles, Completion Routing, debugging orchestration, WDR automation, generic search API, browser work, unrelated cleanup, or broad test runs.
- All commits, if made during execution, must stage only the named task files; leave the three pre-existing untracked `docs/*.md` files untouched.

## File Map

| File | Single responsibility |
|---|---|
| `src/workflow/phase4a/failure.ts` | Canonical failure types, pair validation, stable ID, terminal outcome |
| `src/workflow/phase4a/store.ts` | Create-only C2C-state persistence and two bounded workspace queries |
| `src/mcp/server.ts` | Minimal authorized tools and failed-line guard at Phase 2 handoff |
| `tests/phase4a-failure.test.ts` | Domain contracts and Phase 2 identity separation |
| `tests/phase4a-store.test.ts` | Immutability, idempotence, workspace isolation, bounded queries |
| `tests/mcp-integration.test.ts` | Tool registration, auth, record/query and Phase 2 guard |

## Review Focus

- A failure with a proposal identity or execution-line ID inconsistent with the supplied Phase 2 proposal must be rejected (Task 1).
- Duplicate request with a different summary/evidence must return `FAILURE_RECORD_CONFLICT` and preserve the original record (Tasks 2–3).
- Concurrent requests for the same line with conflicting evidence must produce exactly one winner, one explicit conflict, and one immutable file (Task 2).
- Invalid `VALIDATION_FAILURE` route or missing evidence must fail closed, not be inferred (Task 1).
- Invalid or out-of-range history limits must fail instead of silently returning unbounded data (Task 3).
- A previously failed `executionLineId` must be rejected by both Phase 2 MCP entry points even if other proposal fields change (Task 4).

---

### Task 1: Canonical failure contract

**Files:**
- Create: `src/workflow/phase4a/failure.ts`
- Create: `tests/phase4a-failure.test.ts`

**Interfaces:**
- `FailureType = "EXECUTION_FAILURE" | "VALIDATION_FAILURE" | "REVIEW_FAILURE" | "ACCEPTANCE_FAILURE"`
- `FailureStage = "EXECUTION" | "VALIDATION" | "REVIEW" | "ACCEPTANCE"`
- `FailureNextRoute = "SYSTEMATIC_DEBUGGING" | "VALIDATION_REROUTE" | "ROUTER_REGRILL" | "ROUTER_RECLASSIFY"`
- `FailureInput = Pick<FailureRecord, "executionLineId" | "proposalIdentity" | "failureType" | "failedAtStage" | "summary" | "evidence" | "nextRoute">`
- `FailureRecord = FailureInput & { failureId: string; createdAt: string }`
- `failureIdFor(workspaceId: string, executionLineId: string): string`
- `createFailureRecord(workspaceId: string, proposal: ExecutionProposalInput, input: FailureInput, createdAt?: Date): FailureRecord`
- `failureOutcome(record: FailureRecord): { state: "FAILED"; outcome: "NEW_DECISION_REQUIRED"; failure: FailureRecord }`

Import `ExecutionProposalInput` and `createExecutionProposal` from existing `src/workflow/phase2.ts`. Recompute `proposal.identity` from the supplied proposal and reject unless its `executionLineId` and computed identity both match the failure input. This is a consistency check, not cryptographic proof that the proposal was previously approved or issued by the server.

Use stable SHA-256 over a canonical workspace ID + execution-line ID pair for `failureId`. One failed line has one canonical failure; identical goals on *different* lines must have different IDs. Use the real `workspace.id` format (12 hex characters); never use the line ID as a filesystem path segment.

- [ ] **Step 1: Write failing domain tests.** Assert the five legal (type, stage, route) combinations: execution/debugging; validation/debugging; validation/reroute; review/regrill; acceptance/reclassify. Assert rejection for mismatched stage/route, unsupported fields, missing/blank identity or evidence, absent validation route, mismatch between the supplied proposal's line ID and the failure line ID, and incorrect proposal identity (including when goal/scope differ). Assert stable ID for the same workspace/line, different ID for another line, and the exact terminal outcome shape.
- [ ] **Step 2: Run `pnpm exec vitest run tests/phase4a-failure.test.ts`.** Expect FAIL before implementation.
- [ ] **Step 3: Implement only the exported domain contract.** Validate the entire input, normalize text consistently, generate ISO `createdAt`; no root-cause inference, new scope, new prompt, success lifecycle manager, or actual route execution.
- [ ] **Step 4: Re-run the same focused test.** Expect PASS.
- [ ] **Step 5: Commit this task's two files only** (if committing is authorized): `feat: define phase4a failure contract`.

### Task 2: Immutable workspace-scoped failure store

**Files:**
- Create: `src/workflow/phase4a/store.ts`
- Create: `tests/phase4a-store.test.ts`

**Interfaces:**
- `persistFailureRecord(workspaceId: string, record: FailureRecord): Promise<FailureRecord>`
- `getFailureByExecutionLine(workspaceId: string, executionLineId: string): Promise<FailureRecord | null>`
- `listRecentFailures(workspaceId: string, limit?: number): Promise<FailureRecord[]>`
- `class FailureRecordConflictError extends Error` — raised when an immutable existing record for the same execution line differs in canonical fields.

Store one immutable JSON file per `failureId` under `getStateDir()/failures/<workspaceId>/<failureId>.json`. This is append-only at the record level: write a complete owner-only temporary file, publish atomically using an exclusive hard link to the final path, and remove the temporary file. The final record must never be partially visible or overwritten; do not use read-modify-rewrite JSONL. For duplicate creation return the original stored record only when every canonical input field agrees (ignore the newly generated timestamp). Otherwise throw `FailureRecordConflictError` for a same-line conflicting report; the MCP layer maps it to `FAILURE_RECORD_CONFLICT`. Invalid or corrupted existing records must fail closed, not silently make a failed line look reusable. Query latest records ordered newest first with deterministic tie-break, default 10 / maximum 50.

- [ ] **Step 1: Write failing store tests.** Use isolated `C2C_STATE_DIR`, clean it afterward. Check file path/permissions where supported, no changes under workspace root, persistent re-read, missing line → null, duplicate idempotence and original timestamp, conflicting duplicate rejection, concurrent identical calls → one file; concurrent conflicting calls for the same line → one success, one `FailureRecordConflictError`, original winner preserved and exactly one file; distinct workspace isolation, latest-N ordering/cap, and corrupted stored record rejection.
- [ ] **Step 2: Run `pnpm exec vitest run tests/phase4a-store.test.ts`.** Expect FAIL.
- [ ] **Step 3: Implement only the three store operations.** Validate workspace ID and record ID before I/O; read JSON through canonical record validation. No new datastore, WDR generation, execution-record modification, or general query filters.
- [ ] **Step 4: Re-run the same focused test.** Expect PASS.
- [ ] **Step 5: Commit the two task files only** (if authorized): `feat: persist phase4a failure records`.

### Task 3: Record/query MCP surface

**Files:**
- Modify: `src/mcp/server.ts` (add only Phase 4A imports, output schemas, and tool registrations)
- Modify: `tests/mcp-integration.test.ts`

**Interfaces:**
- `phase4a_record_failure`: input `{ proposal: ExecutionProposalInput, failure: FailureInput }`, output `{ state: "FAILED", outcome: "NEW_DECISION_REQUIRED", failure: FailureRecord }`; requires `workspace.write`. Recompute and verify proposal identity before persistence; mismatches return `INVALID_FAILURE`, immutable same-line conflicts return `FAILURE_RECORD_CONFLICT`.
- `phase4a_failure_history`: input `{ limit?: number, executionLineId?: string }`, output `{ failures: FailureRecord[] }`; requires `workspace.read`. Exactly one query mode: latest N (default 10, max 50), OR exact execution line. Reject combined `limit` + `executionLineId`; do not implement any additional query options.
- Both tools use `workspace.id` from the active MCP context, not caller-supplied workspace IDs. Mark the history tool read-only; the record tool mutates C2C state only.

- [ ] **Step 1: Write failing MCP tests.** Add a `describe("Phase 4A", ...)` group, then update the exact tool list and output-schema assertions. Verify successful record + read-back, duplicate outcome, mismatched proposal line/identity rejection, conflicting same-line failure → `FAILURE_RECORD_CONFLICT`, invalid type/route input, denied write scope, workspace-scoped history, exact-line lookup, invalid combined query, and limit 0/51 rejection. Confirm neither tool runs a next route.
- [ ] **Step 2: Run `pnpm exec vitest run tests/mcp-integration.test.ts -t "Phase 4A"`.** Expect FAIL.
- [ ] **Step 3: Register precisely the two tools.** Reuse existing `requireScope`, `okStructured`, and `fail` patterns; do not introduce generic workflow APIs or modify existing tool payloads.
- [ ] **Step 4: Re-run the same focused MCP tests.** Expect PASS.
- [ ] **Step 5: Commit only `src/mcp/server.ts` and `tests/mcp-integration.test.ts`** (if authorized): `feat: expose phase4a failure record and history tools`.

### Task 4: Prevent reuse of failed lines at Phase 2 MCP entry points

**Files:**
- Modify: `src/mcp/server.ts` (only the `phase2_transition` and `phase2_execution_brief` handlers)
- Modify: `tests/mcp-integration.test.ts`
- Test: `tests/phase2.test.ts` (existing behavior only)

**Interfaces:**
- Consume `getFailureByExecutionLine(workspace.id, proposal.executionLineId)`.
- If found, return MCP error `FAILED_EXECUTION_LINE` before any Phase 2 transition/brief persistence.
- If absent, retain the exact current Phase 2 behavior and proposal identity hashing.

- [ ] **Step 1: Add failing integration tests.** Record failure for line A, then assert both Phase 2 MCP calls reject A even with changed goal/scope; line B remains eligible; the old Jev identity-bound result does not authorize B; the failure persists across repeated reads and A remains blocked. Existing direct Phase 2 tests must still pass.
- [ ] **Step 2: Run `pnpm exec vitest run tests/mcp-integration.test.ts -t "Phase 4A"`.** Expect FAIL.
- [ ] **Step 3: Add the two small read guards.** Do not change `src/workflow/phase2.ts`, `src/workflow/execution-brief.ts`, or Phase 3. On unreadable failure history, fail closed rather than treating the line as unused.
- [ ] **Step 4: Run focused validation:** `pnpm exec vitest run tests/phase4a-failure.test.ts tests/phase4a-store.test.ts tests/phase2.test.ts tests/mcp-integration.test.ts` and `pnpm exec tsc --noEmit`. Expect PASS.
- [ ] **Step 5: Commit only this task's two modified files** (if authorized): `fix: reject failed execution lines at phase2 handoff`.

---

## Boundary / Acceptance Notes

- Acceptance is limited to blocking known failed lines **through `phase2_transition` and `phase2_execution_brief` only**; tests must verify both guards and must not claim system-wide invalidation of old Briefs or compiled packages.
- The old proposal and Jev binding can no longer authorize execution **through the guarded Phase 2 MCP entry points**. A new execution line gets a new identity; prior evidence can be cited as facts, not as approved execution authority.
- Phase 3 currently receives a Brief *without* `executionLineId`. Its existing compile endpoint remains callable with old Brief data; Phase 4A does **not** provide global enforcement or retroactively identify and reject every out-of-band attempt to compile an old Brief. Closing that global caller-enforcement gap would require a separately approved identity-carrying handoff contract; do not silently alter Phase 2/3 to accomplish it here.
- Phase 4A records failure and emits `NEW_DECISION_REQUIRED`. It does not itself invoke Router, systematic-debugging, Grill, Jev, Phase 2, or Phase 3.
- `COMPLETED`, `REVIEW_PENDING`, and `ACCEPTANCE_PENDING` remain conceptual lifecycle stages for later Completion Routing; do not add a separate lifecycle subsystem in 4A.
- No full build, full suite, or browser testing is expected for these changes. Report only changed files, focused validation, and blocking issue.
