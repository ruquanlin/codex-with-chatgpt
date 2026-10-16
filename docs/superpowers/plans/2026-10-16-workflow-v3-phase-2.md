# Workflow v3 Phase 2 — Jev Gate + Execution Brief Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the minimal Phase 2 mechanics required to represent Jev-gated execution proposals, create validated Execution Briefs, persist them when required, and hand a stable brief to Phase 3 without implementing Prompt Compiler or Model Router.

**Architecture:** Reuse the existing Jev implementation unchanged. Add a small Phase 2 workflow module that owns proposal identity, Jev-result transitions, Execution Brief validation, and hybrid persistence. Keep the implementation independent from Phase 3 so the resulting brief becomes its only future input contract.

**Tech Stack:** TypeScript, Node.js, Vitest.

**Spec:** `docs/workflow/phases/phase-2-jev-execution-brief.md`

## Global Constraints

- Reuse `src/decision/jev-gate.ts`; do not create another Jev transport or decision engine.
- Do not implement Phase 3 Prompt Compiler or Model Router.
- Execution Brief ownership remains in the ChatGPT workflow layer.
- Codex must not expand or reinterpret brief scope.
- Ordinary deterministic tasks must not invoke Jev merely for formality.
- Mandatory Jev unavailable must fail closed.
- Validation must stay focused on Phase 2 behavior.
- Do not refactor unrelated C2C protocol, session, bridge, or execution-record code.

## Review Focus

- A changed execution proposal must not reuse an earlier Jev `proceed`.
- `reframe` must invalidate the current proposal and must not produce a brief.
- `stop` and unavailable mandatory Jev must not reach `READY_FOR_EXECUTION`.
- An ephemeral brief must not create repository files.
- Persisted brief paths and contents must remain bounded to `docs/workflow/execution-briefs/`.

---

### Task 1: Add the canonical Execution Brief model

**Files:**
- Create: `src/workflow/execution-brief.ts`
- Create: `tests/execution-brief.test.ts`

**Produces:**
- `ExecutionBrief`
- `ExecutionBriefInput`
- `ApprovedBasisType`
- `createExecutionBrief(input)`
- deterministic validation of required Phase 2 fields

- [ ] Write failing tests covering:
  - valid `root_cause`, `approved_design`, and `explicit_instruction` bases;
  - required `goal`;
  - `knownFacts`;
  - `scope.inScope` / `scope.outOfScope`;
  - `mustChange` / `mustNotChange`;
  - acceptance criteria;
  - focused validation expectations;
  - risk notes;
  - `ephemeral | persisted`.

- [ ] Verify the focused test file fails because the module does not yet exist.

- [ ] Implement the minimum typed Execution Brief model and constructor/validator required by the approved schema.

- [ ] Verify only `tests/execution-brief.test.ts`.

- [ ] Do not add prompt wording, model choice, raw logs, WDR rationale, or completion-report fields.

---

### Task 2: Add execution proposal identity and Jev transition logic

**Files:**
- Create: `src/workflow/phase2.ts`
- Create: `tests/phase2.test.ts`
- Reuse without redesign: `src/decision/jev-gate.ts`

**Produces:**
- `ExecutionProposal`
- stable proposal identity/fingerprint
- Phase 2 states needed for:
  - `EXECUTION_PROPOSED`
  - `READY_FOR_EXECUTION`
  - `STOPPED`
  - `BLOCKED`
  - upstream reframe result
- pure transition logic consuming Jev result

- [ ] Write failing tests proving:
  - Jev not required → proposal can become `READY_FOR_EXECUTION`;
  - required + `proceed` → `READY_FOR_EXECUTION`;
  - required + `reframe` → proposal invalidated and no brief eligibility;
  - required + `stop` → `STOPPED`;
  - required + unavailable → `BLOCKED`;
  - materially changed goal, scope, approved basis, or implementation basis changes proposal identity;
  - previous `proceed` cannot authorize a materially changed proposal.

- [ ] Run only `tests/phase2.test.ts` and confirm RED.

- [ ] Implement the smallest pure state-transition layer necessary to pass those tests.

- [ ] Keep Jev execution itself in `src/decision/jev-gate.ts`; Phase 2 consumes its typed result rather than duplicating its network logic.

- [ ] Run `tests/phase2.test.ts` until GREEN.

---

### Task 3: Gate Execution Brief creation behind Phase 2 readiness

**Files:**
- Modify: `src/workflow/phase2.ts`
- Modify: `tests/phase2.test.ts`
- Reuse: `src/workflow/execution-brief.ts`

**Produces:**
- one explicit Phase 2 API that creates a brief only from a valid `READY_FOR_EXECUTION` proposal

- [ ] Add failing tests showing:
  - `READY_FOR_EXECUTION` can produce an Execution Brief;
  - `REFRAME`, `STOPPED`, and `BLOCKED` cannot;
  - brief contents reflect the approved proposal and do not invent missing decisions.

- [ ] Run focused Phase 2 tests and verify RED.

- [ ] Implement the minimum handoff from Phase 2 state to `createExecutionBrief()`.

- [ ] Run the same focused tests and verify GREEN.

---

### Task 4: Implement hybrid Execution Brief persistence

**Files:**
- Create: `src/workflow/execution-brief-persistence.ts`
- Create: `tests/execution-brief-persistence.test.ts`

**Produces:**
- deterministic persisted path under:
  `docs/workflow/execution-briefs/YYYY-MM-DD-<short-task-slug>.md`
- no filesystem write for ephemeral briefs
- update-in-place semantics for the same execution line

- [ ] Write failing tests proving:
  - ephemeral mode performs no write;
  - persisted mode resolves only inside `docs/workflow/execution-briefs/`;
  - persisted output contains the canonical brief fields;
  - the same execution-line identity updates the same artifact;
  - a materially new execution-line identity can resolve to a new artifact;
  - path traversal / invalid slug input cannot escape the configured directory.

- [ ] Verify the focused persistence tests fail.

- [ ] Implement the smallest persistence helper needed for those behaviors.

- [ ] Run only the persistence tests and verify GREEN.

- [ ] Do not mix WDR content into the persisted brief.

---

### Task 5: Expose the Phase 2 contract through C2C without implementing Phase 3

**Files:**
- Modify only if needed: `src/mcp/server.ts`
- Modify: `tests/mcp-integration.test.ts`
- Do not modify Jev bridge transport unless a focused test proves it necessary.

**Goal:** Make the Phase 2 primitives consumable by the workflow layer without turning MCP into a second Workflow Router.

- [ ] Add focused integration tests for only the minimum Phase 2 surface required by the workflow layer.
- [ ] Confirm existing `jev_decision_gate` behavior remains unchanged.
- [ ] Expose only the minimum structured operations necessary to consume Phase 2 state / Execution Brief functionality.
- [ ] Do not expose a Prompt Compiler endpoint.
- [ ] Do not add model-selection behavior.
- [ ] Do not move routing authority into C2C.
- [ ] Run only the affected MCP integration tests.

---

### Task 6: Align workflow policy/documentation with the implemented contract

**Files:**
- Add approved spec: `docs/workflow/phases/phase-2-jev-execution-brief.md`
- Modify only where Phase 2 executable behavior must be reflected:
  - `skill/SKILL.md`
  - relevant C2C workflow policy docs
  - `tests/workflow-artifacts.test.ts`
- Create directory documentation only if needed:
  - `docs/workflow/execution-briefs/`

**Goal:** Document the implemented contract without duplicating the Global Workflow Router or Global Prompt Generation Contract.

- [ ] Add focused artifact tests for:
  - Execution Brief before Codex prompt generation;
  - Jev binding to the current proposal;
  - fail-closed unavailable behavior;
  - separation of WDR and Execution Brief;
  - Phase 3 explicitly out of scope.
- [ ] Update only the minimum policy text necessary to describe Phase 2.
- [ ] Do not reintroduce generic scope, model, validation, or prompt-generation policy into C2C.
- [ ] Run `tests/workflow-artifacts.test.ts`.

---

### Task 7: Focused Phase 2 verification

**Files:** no new implementation scope.

- [ ] Run the Phase 2-specific tests:
  - `tests/execution-brief.test.ts`
  - `tests/phase2.test.ts`
  - `tests/execution-brief-persistence.test.ts`
  - affected MCP integration tests
  - `tests/jev-decision-gate.test.ts`
  - `tests/workflow-artifacts.test.ts`
- [ ] Run TypeScript typecheck/build only if the new TypeScript interfaces require repository-level compilation verification.
- [ ] Inspect the final diff and verify:
  - no Phase 3 implementation;
  - no duplicate Jev implementation;
  - no unrelated refactor;
  - no changes to execution-record/finalization semantics;
  - no generic workflow authority moved into C2C.

## Completion Criteria

Phase 2 implementation is complete when:

```text
confirmed execution proposal
→ optional mandatory Jev gate
→ deterministic Phase 2 transition
→ READY_FOR_EXECUTION
→ canonical Execution Brief
→ ephemeral or persisted according to policy
→ stable handoff boundary ready for Phase 3
```

and `REFRAME`, `STOP`, or mandatory-Jev-unavailable cannot silently reach Codex execution.
