# Jev Preflight Contract v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent bypass of Mandatory Jev for follow-up debugging and incidents while preserving a verifiably justified no-Jev route for deterministic tasks.

**Architecture:** Introduce a small evidence-envelope validator and deterministic preflight classifier consumed by the existing Phase 2 transition and both MCP endpoints. Bind material evidence to proposal identity. Missing, weak or inconsistent negative claims require an actual Jev decision; no new Jev model or Phase 3/4 changes.

**Tech Stack:** TypeScript, MCP SDK, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-18-jev-preflight-contract-v2-design.md` (user-approved; its older in-file Draft label is administrative, not implementation permission).

## Global Constraints

- Keep existing tool names and the existing Phase 2 public state vocabulary.
- Accept sourced L2 conversation evidence for **positive** trigger detection, without assuming C2C can independently authenticate a conversation.
- Preserve the legacy `jevRequired=true` mandatory floor; never allow legacy `false` alone to skip Jev.
- Do not alter Jev model or thresholds, Phase 3/4, Portfolio/Pendlio, historic E2E evidence, or pre-existing untracked files.
- Keep changes minimal; no broad test suite, full build or unrelated refactors by default.
- **Important design gate:** The approved spec does not identify an existing independently verifiable source that reliably establishes all four triggers *false*. Do not interpret caller-authored L1 IDs, L2 assertions or a self-declared `deterministic` flag as such proof. If no narrowly usable existing trusted source can be demonstrated, do **not** invent a no-Jev certificate or claim full spec completion. Report the precise limitation for further design approval before making an architectural expansion.

## File Responsibilities

- `src/workflow/phase2/preflight.ts` (new, if implementation is viable): evidence types, normalization, policy-trigger classifier; one focused responsibility.
- `src/workflow/phase2.ts`: proposal input/identity and shared transition integration.
- `src/mcp/server.ts`: pass the same evidence through both Phase 2 MCP entry points; server-side verifiable source lookups only where currently supported.
- `tests/phase2-preflight.test.ts` (new): evidence classifications and canonicalization.
- `tests/phase2.test.ts`: shared Phase 2 state and binding regressions.
- `tests/mcp-integration.test.ts`: consumer-facing endpoint parity and rejection of false-negative bypass.

## Review Focus

1. Legacy `jevRequired=false`, missing envelope: never READY without identity-bound Jev proceed.
2. Fake or stale L1 record ID: cannot prove any trigger false; do not grant the no-Jev route.
3. L2 sourced prior diagnosis + follow-up task: Jev required even if caller says false.
4. Material evidence or scope changes: invalidate previously bound Jev; cosmetic reorder does not.
5. Malformed or contradictory evidence: explicit validation error for malformed shape, Jev-required path for uncertain truth, never unconditional READY.

---

### Task 1: Establish Verifiable Negative-Evidence Boundary

**Files:** Read `src/workflow/phase2.ts`, `src/mcp/server.ts`, `src/execution/records.ts` and relevant record/store APIs; **no code changes unless the gate succeeds**.

**Interface:** Produce a short decision note identifying exact existing record identifiers, verifiable fields and an admissible no-Jev case, or report a blocker.

- [ ] Inspect only existing server-visible records and linkage needed to establish the four negative policy predicates. Do not assume that absence of a prior C2C record proves absence of diagnosis in ChatGPT.
- [ ] Specify the exact trust boundary for L1 positive facts, L2 sourced positive facts, and negative exclusions; confirm the envelope can be validated without creating a new trust service.
- [ ] Demonstrate at least one practical ordinary deterministic task that can qualify `NOT_REQUIRED` through independently verifiable facts under the approved spec. If impossible, **stop implementation here and report** what smallest contract/trusted-source decision needs user approval; do not silently weaken the acceptance criterion.

**Acceptance:** A documented, reproducible source-and-validation rule for no-Jev classification, or an explicit blocker. No schema/logic changes before this boundary is settled.

### Task 2: Evidence Envelope and Phase 2 Identity/Decision

**Files:** Create `src/workflow/phase2/preflight.ts`; modify `src/workflow/phase2.ts`; add `tests/phase2-preflight.test.ts`; modify `tests/phase2.test.ts`.

**Interfaces:** Add `preflightEvidence?` to `ExecutionProposalInput`; expose one deterministic `evaluatePreflight(...)` helper with `NOT_REQUIRED | REQUIRED | REQUIRES_JEV_FOR_UNCERTAINTY`, and one stable normalization routine included in `proposalIdentity`. Exact TypeScript shape should implement the four named predicates and source references in §4 of the spec, not arbitrary new flags.

- [ ] Write focused failing tests: all four positive triggers, L2 follow-up diagnosis, legacy false/true, incomplete/contradictory evidence, valid no-Jev proof from Task 1, malformed envelope, material versus cosmetic evidence changes.
- [ ] Run `pnpm exec vitest run tests/phase2-preflight.test.ts tests/phase2.test.ts`; confirm the new regressions fail for the existing bypass.
- [ ] Implement envelope validation and stable canonicalization; include material source reference, assessment, and relevant diagnosis facts in identity; preserve v1/v2 identity distinction.
- [ ] Update the shared Phase 2 transition: only verified `NOT_REQUIRED` is ungated READY; other cases await matching Jev result and retain existing proceed/reframe/stop/unavailable semantics.
- [ ] Run `pnpm exec vitest run tests/phase2-preflight.test.ts tests/phase2.test.ts`; require PASS before proceeding.

**Acceptance:** An unsupported `jevRequired=false` never becomes READY; reliably evidenced ordinary tasks can skip Jev; a prior Jev result is invalidated by material fact changes.

### Task 3: Enforce in Both MCP Entry Points

**Files:** Modify only relevant handlers in `src/mcp/server.ts`; targeted tests in `tests/mcp-integration.test.ts`.

**Interfaces:** Keep `phase2_transition` and `phase2_execution_brief` names, returned Phase 2 states and canonical brief contract unchanged. Both routes use the same Phase 2 evaluator and trusted-record verification results; neither decides from caller `jevRequired` alone.

- [ ] Write focused MCP regressions for legacy false bypass, L2 Portfolio-style diagnosis follow-up, valid deterministic exemption, unavailable/reframe/stop, invalid bound identity, malformed evidence, and no brief creation when not READY.
- [ ] Run focused MCP tests and verify failure on the old behavior (use existing integration-test filtering conventions rather than running all unrelated tests).
- [ ] Make the minimum handler changes and pass evidence consistently to the shared evaluator; do not have either endpoint invent or internally fake a Jev response.
- [ ] Rerun `pnpm exec vitest run tests/phase2-preflight.test.ts tests/phase2.test.ts` and the relevant filtered `tests/mcp-integration.test.ts` cases. Check `git diff --check` and inspect only changed files.

**Acceptance:** Phase 2 MCP tools agree for the same proposal/evidence and cannot create a brief on an ungated false-negative path.

## Consumer-Side Release Gate (after implementation)

Run a **new** Portfolio post-diagnosis Codex handoff from an ordinary conversation: record actual workspace identity, Phase 2 calls, Jev invocation/result, proposal identity, brief and Phase 3 `READY` if allowed. Include a separate deterministic task that genuinely qualifies for no Jev under the Task 1 source rule. Preserve the older failed Portfolio E2E as failed. A unit/MCP test pass alone does not establish auto-trigger success.

## Completion Report

Only: what changed; focused validation performed; blockers. Before implementation, obtain user review of this plan and separate authorization for Codex execution. Do not automatically commit or push unrelated files.
