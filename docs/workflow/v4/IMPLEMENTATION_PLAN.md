# Workflow v4 — Minimal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` when actually implementing. Preserve the current authorized C2C → Codex handoff and execution-record contract; this plan does not waive either.

**Goal:** Make the approved v4 three-step workflow usable without the v3 Phase 2/3 chain, while preserving existing workspace authorization, historical Stop checks, and C2C execution records.

**Architecture:** Add only the missing *read-only* historical Stop query to C2C. Do not build another orchestrator, receipt, lifecycle system, or replacement compiler. The default-path change is an **upstream workflow-rule change**, not something a repository patch can authorize.

**Tech Stack:** TypeScript, MCP SDK, Zod, Vitest; current workspace `codex-with-chatgpt`, `main` @ `dc88d8d` (read-only baseline, not a branch lock).

**Spec:** Approved conversation artifact `workflow-v4-minimal-spec-2026-10-21.md` (2026-10-21). Before code execution, make that approved copy available in the workspace; do not silently substitute the old v4 lean design.

## Global Constraints

- Preserve all existing Stop markers, OAuth/Bridge identity checks, C2C finalization records, and untracked files.
- Do not alter v3 Phase 2/3 implementations or remove legacy MCP tools during the first release.
- Keep Skill Routing, conditional Impeccable, automatic window recommendations, document self-review, and **Luna Light as the default target** in the governing ChatGPT workflow instructions—not a new C2C runtime subsystem.
- Jev is advisory and invoked only when the user asks. Model upgrades require a task-specific reason, a named available model, and a reasoning level.
- No automatic historical Stop clearance. A relevant Stop with no trusted clearance path stays blocked; do not rename tasks to evade it.
- No deployment, broad refactor, full test suite, or edits to Portfolio, Pendlio, or Investment as part of this plan.

## Task 1 — Minimal read-only historical Stop query (Codex)

**Files**
- Modify `src/mcp/server.ts` for the MCP tool; reuse `createExecutionProposal()` and the existing Stop matching semantics.
- Modify `src/workflow/phase2/jev-receipts.ts` only if needed to make Stop lookup **strictly read-only on a fresh workspace**: `getJevStop()` currently calls `secret()`, which may create `issuer.key`. Preserve all matching and signature checks.
- Add `tests/jev-stop-status-mcp.test.ts` for focused MCP tests.
- Update the existing exact-tool-list assertion in `tests/mcp-integration.test.ts` (and its output schema assertion) only as needed for the added tool.

**Interface**
- `jev_stop_status({ proposal })`, where `proposal` uses the current `ExecutionProposalInput` fields plus optional existing `identity`; workspace is determined by the authenticated connector, never caller-supplied.
- Require `workspace.read`, mark the tool read-only, and validate/recompute proposal identity before lookup.
- Return `{ state: "STOPPED" | "CLEAR" }`. `CLEAR` means *no matching existing marker under current line-ID/fingerprint semantics*, not proof that arbitrary paraphrases are unrelated. Corrupt, conflicting, or unreadable marker data must produce an explicit failure, never `CLEAR`.

**Steps**
- [ ] Add failing focused MCP tests: matching line Stop → `STOPPED`; changed execution-line ID with identical investigation materials → `STOPPED`; unrelated proposal → `CLEAR`; malformed proposal / mismatched identity → error; missing `workspace.read` → denial; corrupted Stop storage → error; fresh workspace with no Stop → `CLEAR` and no new `issuer.key`; verify the query makes no writes.
- [ ] Run `pnpm exec vitest run tests/jev-stop-status-mcp.test.ts` and confirm the new test fails before implementation.
- [ ] Register the minimal read-only tool. Make the lookup avoid key creation on first read, while treating existing marker + missing/invalid signing key as an explicit error. Do not change marker persistence, matching, or Jev decision logic.
- [ ] Update the exact tool-list/schema assertion for this one addition.
- [ ] Run `pnpm exec vitest run tests/jev-stop-status-mcp.test.ts tests/jev-receipts.test.ts tests/mcp-integration.test.ts` and `pnpm exec tsc --noEmit`. Report actual outcomes; don't claim success without outputs.

**Acceptance:** Tool is visible to a connected client, preserves line-ID/fingerprint Stop behavior and workspace isolation, makes no filesystem changes on lookup, and fails closed for invalid/uncertain status. Legacy tools remain available.

## Task 2 — Switch the *authoritative* default workflow (configuration, not a Codex patch)

- [ ] Confirm the responsible upper-level workflow instruction can actually be updated. A repository Markdown or `docs/codex-execution-policy.md` edit **does not** supersede an active higher-priority Phase 2/3 handoff requirement.
- [ ] Once authorized through that instruction's owning mechanism, change only the default routing: `ChatGPT task + targeted skills → Codex execution + focused validation → user acceptance`; ordinary tasks no longer require `phase2_preflight`, `phase2_transition`, `phase2_execution_brief`, or `phase3_compile_execution`.
- [ ] Preserve C2C workspace identity/permissions, task-specific user authorization, `jev_stop_status` before delegated execution, relevant current Stop blocks, and persisted execution records. Skill Routing remains automatic; window handoff is suggested only when needed; documents must pass ChatGPT self-review before delivery.
- [ ] Check only **known affected historical Stop lines** once. Keep any unclassified Stop blocked; do not invent a clearance path or initiate a full migration. This does not block unrelated clean tasks.
- [ ] Until this change is actually effective, use the current Phase 2/3 protocol. **Do not claim v4 is active because Task 1 passed.**

**Acceptance:** The current authoritative instruction—not a lower-priority repository file—permits the simpler ordinary path. If not, stop and report the owner/configuration blocker once; don't generate another governance design.

## Task 3 — Focused cutover acceptance (only after Tasks 1–2)

- [ ] Run **one real bounded, authorized, low-risk task** in `codex-with-chatgpt`: verify correct workspace, read-only Stop status, one concise Markdown Codex prompt, default Luna/Light if actually available, targeted Codex validation, persisted execution record, and user acceptance.
- [ ] Confirm the ordinary path made **zero** calls to the four removed v3 Phase 2/3 tools; do not state an unavailable model/thinking setting was used.
- [ ] Run one **negative** Stop case to verify it refuses execution; don't clear the historical marker or create a fake approval.
- [ ] If a prerequisite fails, record its exact cause and end this attempt. Retry only with changed evidence. Do not expand the scope or launch a cross-project rollout.

**Acceptance:** One genuine ordinary path works; the Stop case remains blocked; no unapproved write/deploy, no v3-chain calls, and no replay loop. Only then declare v4 default active and consider later project-by-project adoption.

## Review Focus (focused, not additional phases)

1. Same investigation with only execution-line ID changed still hits historical Stop → Task 1 test.
2. Malformed, tampered, or conflicting marker never becomes a false `CLEAR` → Task 1 test.
3. Read-only client can query; unauthorized client cannot → Task 1 test.
4. Existing active Phase 2/3 authority cannot be bypassed by editing a repository file → Task 2 acceptance.
5. A normal task can complete with a persisted execution record but without legacy Phase 2/3 calls → Task 3 acceptance.

**Scope stop:** No general Stop migration engine, new receipt format, Prompt Compiler, WDR machinery, model router, governance bootstrap, or broad archival work. This plan has **one code task** and two controlled non-code acceptance tasks.
