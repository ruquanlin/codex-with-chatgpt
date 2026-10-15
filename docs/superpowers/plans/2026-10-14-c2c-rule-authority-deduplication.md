# C2C Rule Authority Deduplication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the active Global Workflow Router / Global Prompt Generation Contract the sole authority for generic coding-workflow decisions, with C2C limited to additive C2C-specific mechanics.

**Architecture:** This is a documentation-and-contract change, not an MCP/runtime redesign. Pin the authority boundary in the existing artifact test, deduplicate the C2C policy docs, then update protocol/Skill templates so direct execution is allowed when globally selected while delegated Codex mechanics remain intact.

**Tech Stack:** Markdown policy artifacts, Vitest artifact assertions.

**Spec:** `docs/superpowers/specs/2026-10-14-c2c-rule-authority-deduplication-final.md`

## Global Constraints

- Do not change MCP tools, connector permissions, Jev logic, execution-record persistence, or unrelated source.
- Global rules own scope, model choice, validation breadth, escalation, prompt generation, and generic completion reporting.
- C2C may only add C2C-specific mechanics.
- Preserve Jev, HANDOFF, workspace binding, execution-record finalization, and delegated-execution review.
- Do not commit or push.
- Use focused validation only.

## Review Focus

- No active unconditional `Codex owns execution` / `Codex executes` wording.
- Execution-record invariant remains intact.
- Mandatory Jev gate remains intact.
- Direct execution does not disable explicit Codex delegation.
- Existing copied Project instructions get separate migration guidance.

### Task 1: Pin the new authority contract

**Files:**
- Modify: `tests/workflow-artifacts.test.ts`

- [ ] Add failing assertions that:
  - `docs/codex-execution-policy.md` states global workflow authority and additive C2C policy.
  - `docs/efficient-debugging-workflow.md` uses `Required Validation`, not mandatory `Full Validation`.
  - `docs/protocol.md` has no unconditional `Codex owns execution.` and makes the state machine conditional on Codex delegation.
  - `skill/SKILL.md` has no unconditional `Codex executes.` in Project instructions and says execution ownership comes from the active global workflow.
  - existing execution-record and Jev assertions remain unchanged.

- [ ] Run `pnpm vitest run tests/workflow-artifacts.test.ts`.
  - Expected: new authority assertions fail against current artifacts; existing invariant assertions still pass.

### Task 2: Deduplicate C2C policy documents

**Files:**
- Modify: `docs/codex-execution-policy.md`
- Modify: `docs/efficient-debugging-workflow.md`

- [ ] Reframe `docs/codex-execution-policy.md` around additive C2C policy.
  - Keep execution-record invariant and mandatory Jev gate.
  - Remove/collapse generic independent policy for scope, model selection, minimal-change strategy, validation breadth, prompt/report format, escalation, and generic task-type defaults.
  - Add one explicit authority section pointing those decisions to the active global workflow.

- [ ] Reframe `docs/efficient-debugging-workflow.md`.
  - Preserve Jev and C2C-specific E2E requirements where a C2C invariant requires them.
  - Replace fixed `Phase 4 — Full Validation` with `Required Validation`, whose breadth comes from the global workflow and task acceptance criteria.
  - Remove duplicated generic model/usage advice.

- [ ] Run `pnpm vitest run tests/workflow-artifacts.test.ts`.
  - Expected: policy/debugging assertions pass; protocol/Skill assertions may still fail until Task 3.

### Task 3: Make protocol and Skill conditional on execution routing

**Files:**
- Modify: `docs/protocol.md`
- Modify: `skill/SKILL.md`
- Test: `tests/workflow-artifacts.test.ts`

- [ ] Update protocol Boot Prompt and Project instructions.
  - Remove unconditional `Codex owns execution` / `Codex executes`.
  - State that the active global workflow chooses the execution owner.
  - State that PLAN -> EXECUTING -> EXECUTED -> REVIEW applies only when Codex delegation is selected.
  - Keep connector safety, workspace identity, HANDOFF, and review semantics.

- [ ] Update the matching template in `skill/SKILL.md` with the same additive-authority boundary.

- [ ] Add concise migration guidance that existing Projects may retain copied legacy instructions and must be updated separately; do not add automatic migration.

- [ ] Run `pnpm vitest run tests/workflow-artifacts.test.ts`.
  - Expected: PASS.

- [ ] Focused static checks:
  - Search active policy/template files for `Codex owns execution`.
  - Search for `planning and review layer for one local workspace. Codex executes`.
  - Search for `Phase 4 — Full Validation`.
  - Expected: no active unconditional ownership wording and no mandatory full-validation phase. Historical summaries are out of scope.

- [ ] Verify retained invariants still exist:
  - mandatory Jev gate;
  - execution-record/finalization invariant;
  - HANDOFF/checkpoint semantics;
  - connector/workspace binding;
  - independent diff/output review after delegated execution.

## Manual Post-Implementation Acceptance

1. Update copied legacy instructions in the existing Pendlio Project.
2. Do the same for Portfolio if needed.
3. Fresh Pendlio chat: ask Workflow Router to inspect/validate the workspace. PASS = available connector tools may run directly without forcing a Codex prompt.
4. Separate fresh chat: explicitly request Codex delegation. PASS = delegated C2C PLAN/EXECUTED/REVIEW flow still applies.
