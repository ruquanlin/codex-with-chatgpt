# Workflow v3 Global Auto-Trigger / Execution Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Date:** 2026-10-18

**Status:** Proposed implementation plan; requires user review and separate execution authorization

**Goal:** Ensure an ordinary ChatGPT conversation preparing a C2C-managed Codex delegation actually calls the correct workspace's Phase 2 → Phase 3 tools and uses their returned compiled prompt, without forcing these calls for discussion or read-only analysis.

**Architecture:** Preserve the installed global Workflow Router's Phase 1 responsibility. Add only a short **handoff signal** to the owned Router skill and the actual **global execution-handoff authority** once its delivery surface has been identified and verified. Existing C2C MCP tools remain the sole Phase 2/3 implementation. The runtime success gate is fresh ordinary-chat tool-call evidence, not repository tests or a plausible-looking prompt.

**Tech Stack:** ChatGPT private plugin skill (`workflow-router`), installed global workflow instructions (location to be verified in Task 1), C2C MCP bridge (TypeScript/Vitest), Plugin Creator guarded plugin-release update, fresh ChatGPT conversations for E2E.

**Spec:** `docs/superpowers/specs/2026-10-18-workflow-v3-auto-handoff-design.md`

**Authority:** `docs/workflow/WORKFLOW_V3_MASTER_ARCHITECTURE.md` and active Global Prompt Generation Contract.

## Global Constraints

- The user's approved scope is **planning**, not authorization to edit C2C/Portfolio/Pendlio code, mutate a workspace, update a plugin release, or run Codex. Each such execution step needs its applicable approval.
- Do not modify `src/workflow/phase2.ts`, `src/workflow/phase3/*`, any public MCP schemas, Phase 4A–4C, Jev decision rules, or project source code. No new Bridge scheduler or second Router.
- Maintain the global/connector authority split: generic task routing, model choice, prompt creation and execution ownership remain global; C2C adds workspace identity, transport, Jev and execution-record mechanics.
- Use the installed **owned** private plugin named `workflow-router`, not a guessed repository copy. Inspection has verified the plugin files `.codex-plugin/plugin.json` and `skills/workflow-router/SKILL.md` and its current version `1.0.0`; **re-read its release ID just before updating**.
- `workflow-router` decides Phase 1 routing; it must not run Jev, construct Execution Briefs, compile prompts, or control Codex. The global execution-handoff authority owns the Phase 2/3 call sequence.
- No Phase 2/3 overhead for ordinary explanatory requests, brainstorming, or diagnosis-only requests. Trigger on a concrete approved **C2C-managed Codex delegation**, including a read-only measurement task.
- A production performance probe is **not** authorization to change files. For measurement-only briefs, mandatory `mustChange` describes the operation; `mustNotChange` protects source, model, configuration, Git and deployment.
- Never guess a C2C connector from recent use or a similar name. Resolve the correct connector and verify `workspace_info` before Phase 2.
- No claim of formal C2C handoff without a real `phase2_transition` → `phase2_execution_brief` → `phase3_compile_execution` call sequence and the returned `status: READY`/`package.prompt`. Stop on Jev denial/unavailability, invalid identity, insufficient brief, or compiler rejection.
- Keep existing pre-existing untracked C2C documents untouched; new files must be explicitly staged, with no blanket `git add -A`.

## Review Focus

1. **Ordinary chat outside a Project:** installed skill *exists* but the new chat still does not invoke it. Task 1 baseline and Task 4 repeated live-chat test must distinguish availability from activation.
2. **Multiple C2C connectors:** the wrong workspace produces a plausible prompt. Task 3 contract review and Task 4 identity test must require exact `workspace_info` match or one user disambiguation.
3. **Jev `stop` / unavailable / mismatched proposal identity:** no accidental Phase 3 fallback. Task 3 contract review and Task 4 negative-path checks must preserve fail-closed behavior.
4. **Read-only measurement with required `mustChange`:** the compiler output might imply code editing or a deploy. Task 3 sample-brief check and Task 4 live Portfolio probe must prohibit all repository mutation.
5. **Plugin updated but old skill remains active in fresh chats:** version/skill inspection alone is insufficient. Task 3 rollout check and Task 4 two fresh-chat trials must observe actual returned Phase 2/3 tool results; otherwise No-Go and rollback/review.

---

## Task 1 — Locate the executable global handoff authority (read-only hard gate)

**Files/surfaces inspected; no writes:**
- Installed `workflow-router` plugin: `.codex-plugin/plugin.json`, `skills/workflow-router/SKILL.md`.
- C2C spec: `docs/superpowers/specs/2026-10-18-workflow-v3-auto-handoff-design.md`.
- C2C integration boundary: `src/mcp/server.ts` (`phase2_transition`, `phase2_execution_brief`, `phase3_compile_execution`).
- The **actual** global instruction/skill delivery surface for execution handoff in an ordinary ChatGPT conversation. Its location is deliberately not invented in this plan.

**Interface:** Produce a read-only `HandoffSurfaceFinding` note (in the task report, not workspace files): `{ routerPluginId, routerReleaseId, installedSkillFile, globalHandoffSurface, editor/owner, updateMechanism, ordinaryChatVisibilityEvidence }`. `globalHandoffSurface` must be a *verified* concrete configurable surface, not an architectural label.

- [ ] **Step 1:** Retrieve `workflow-router` from `list_owned_personal_plugins`, then use `get_plugin_files` to read the exact manifest and `skills/workflow-router/SKILL.md`. Confirm ownership, current release and that the skill is **Phase 1-only**. This discovery has already worked in the planning conversation; recheck at execution time for release drift.
- [ ] **Step 2:** Identify the user-controlled, **actually loaded** global execution-handoff instruction surface in **ordinary new ChatGPT chats outside Projects**. Inspect eligible installed skills and supported account/plugin configuration; do not equate the C2C repository, current Project instructions, or a chat message with an always-on global surface. Name the concrete update interface and owner.
- [ ] **Step 3:** Reuse the already audited failing ordinary-chat Portfolio diagnosis → cold-start Codex-prompt conversation as the **pre-change negative control** when its tool-call history is still inspectable. Record the actual missing Phase 2/3 calls and prompt provenance. Only rerun an equivalent fresh chat if the original evidence is unavailable or materially incomplete. Do **not** execute Codex or change Portfolio files.
- [ ] **Step 4 — HARD STOP:** If no supported editable global handoff authority is confirmed, write `BLOCKED: GLOBAL_HANDOFF_SURFACE_UNVERIFIED` with the evidence and stop. Do not substitute an edited Markdown in `docs/workflow/`, modify Phase 1 to implement Phase 2/3, silently create another plugin, or declare a fix. Seek user approval for a revised architecture/installation route.

**Gate output:** A specific editable handoff surface and update procedure, a known current Router plugin release, and a baseline observation. Only then start Task 2.

## Task 2 — Prepare the minimal installed-rule change and review it (no publication yet)

**Change candidates after Task 1 succeeds:**
- **Update:** owned `workflow-router` plugin `skills/workflow-router/SKILL.md`; edit `.codex-plugin/plugin.json` only if an explicit release/version/description update is needed.
- **Update:** the concrete **global execution-handoff surface resolved in Task 1** (record its exact path/setting in the execution report before touching it).
- **Do not update:** `src/workflow/*`, C2C MCP tool declarations, Portfolio/Pendlio Projects' stored instructions.

**Interface:** Router emits only a downstream handoff marker/requirement; the global execution owner makes the delegation decision and carries out the Phase 2/3 MCP sequence. No new public TypeScript API, schema or daemon.

- [ ] **Step 1:** Draft **one concise Phase 1 downstream rule** in `skills/workflow-router/SKILL.md`: after a process skill reaches an approved decision, if global execution ownership selects C2C Codex delegation, hand control to the existing execution-handoff authority. State explicitly that Phase 1 does not run Phase 2/3 itself. Preserve all priority, risk, visibility and persistence rules.
- [ ] **Step 2:** Draft **one global execution-handoff rule** in the actual verified surface. It must specify these observable calls, using the *verified* target connector: `workspace_info` → `phase2_transition` → (real identity-bound Jev, if required) → `phase2_execution_brief` → `phase3_compile_execution`. Only pass through returned canonical brief and the tool-returned `package.prompt` on `READY`; no fallback hand-authored formal prompt.
- [ ] **Step 3:** Include focused branches in that rule: no delegation means no Phase 2/3; missing/ambiguous connector means explain/ask once; Jev `stop`/`reframe`/unavailable blocks; insufficient approval/details and Phase 3 rejection block; optional stale/missing Phase 4C profile never overrides live workspace identity; measured/read-only work never gives mutation permission.
- [ ] **Step 4:** Review the complete proposed diff **before publication** against the Spec and the Review Focus. Ensure no new routing authority is created in C2C, no unconditional Jev, no runtime assumptions, no expanded model/validation requirements, and no repeated long policy text. Request the user's explicit approval for publishing the installed-rule change.

**Gate output:** One reviewed, minimal proposed plugin file diff and one reviewed, minimal global-handoff configuration diff. No live configuration change until separately approved.

## Task 3 — Publish the approved configuration with version evidence

**Affected released artifact:** the owned `workflow-router` private plugin; plus the specific global-handoff setting discovered in Task 1. **No workspace source changes.**

**Interface:** `get_plugin_files(plugin_id)` returns the current `current_release_id`; `update_plugin({ plugin_id, archive, expected_release_id })` publishes an owned-plugin overlay with compare-and-swap semantics. Use only the exact discovered plugin identity and release ID.

- [ ] **Step 1:** Save a reversible snapshot of the current released plugin (`get_owned_plugin_archive`) and of the current global handoff configuration (if that surface supports export or revision history). Record version/release IDs without copying secrets into repo documentation.
- [ ] **Step 2:** Build a minimal plugin overlay archive containing updated manifest and `skills/workflow-router/SKILL.md`, preserving existing plugin identity and references. Validate the archive structure and diff locally; do not embed unrelated changes.
- [ ] **Step 3:** With explicit publication authorization, update the plugin using `update_plugin` with freshly read `expected_release_id`. On a release conflict, **stop**, refresh the source/review; never force overwrite.
- [ ] **Step 4:** With explicit configuration authorization, update the **verified** global execution-handoff surface. Do not infer that changing the Router plugin also changes global handoff instructions. If the latter cannot be updated, mark deployment incomplete and stop; do not label a Router-only update as successful end-to-end handoff.
- [ ] **Step 5:** Re-read the installed Router skill and the configured handoff rule to confirm their published contents/version. Verify the Portfolio C2C connector still shows the required Phase 2/3 tools. A positive config check is only **installation evidence**, not runtime acceptance.

**Gate output:** Published revisions for **both required surfaces** and a reversible previous version. If one cannot be updated, rollback where possible and report No-Go.

## Task 4 — Verify the behavioral contract using fresh ordinary chats (release gate)

**Files:** No source edits. Evidence artifact may be a concise local report prepared after the runs, e.g. `docs/workflow/decisions/` only if the existing Persistence Gate and user authorization require a WDR; do not create one by default. Obtain actual ChatGPT tool-call records from the test conversations; an assistant's self-report alone is insufficient.

**Interface:** For each test capture `{ scenario, chatKind, promptScope, observedToolNamesInOrder, workspaceInfoIdentity, phase2State, briefCreated, phase3Status, promptProvenance, result, limitations }` as an audit note. Record only necessary non-secret evidence.

- [ ] **Step 1:** In a **new ordinary ChatGPT chat outside any Project**, ask for Portfolio 3D Hero read-only diagnosis. Confirm correct C2C workspace read tools and no unnecessary `phase2_transition` / `phase3_compile_execution` during diagnosis alone.
- [ ] **Step 2:** In the same chat, authorize **C2C Codex** delegation of the **read-only cold-start measurement**. Do not name the Router/Phase tools. Inspect actual tool calls: exact Portfolio `workspace_info`, Phase 2 transition and returned `READY_FOR_EXECUTION`, canonical brief creation, Phase 3 `READY`, and the delivered prompt taken from the returned `package.prompt`. Confirm `mustNotChange` and prompt prohibit edits/deploy; **do not execute Codex** for this handoff-only test.
- [ ] **Step 3:** Repeat Steps 1–2 in a **second genuinely fresh ordinary chat** with no handoff prompt or manual Router cue inherited from the first. Two independent passing runs are the required positive gate; a generated Markdown prompt without actual tool provenance fails.
- [ ] **Step 4:** Test connector ambiguity with two live C2C connections: require exact workspace disambiguation, not silent last-used selection. Test unavailable connector by removing access *only if the user explicitly approves that reversible action*; otherwise use a genuinely unconnected target and verify truthful fail-closed behavior.
- [ ] **Step 5:** Exercise negative Jev/insufficient brief/compiler rejection **in isolated fixture tooling** rather than forging Jev decisions against live Portfolio. Verify the global contract does not silently produce a formal prompt after `STOPPED`, `REFRAME_REQUIRED`, `BLOCKED`, mismatched identity, or `REJECTED_INSUFFICIENT_BRIEF`.
- [ ] **Step 6:** Verify one existing Portfolio Project conversation still respects its bound connector and that generic programming discussion or a hypothetical prompt request is not misrepresented as a formal C2C compiled handoff.
- [ ] **Step 7 — RELEASE GATE:** Mark `PASS` only if the real ordinary-chat cases (especially Steps 2–3) show actual correct tool order and prompt provenance. If even one ordinary fresh chat bypasses Phase 2/3 yet claims formal C2C delegation, mark `NO-GO`; capture evidence, halt rollout and use the stored snapshot for rollback/review. **Do not declare success on static tests or the assistant's narrative.**

**Gate output:** Evidence-backed `PASS` / `NO-GO` / `BLOCKED` covering distinct installation, actual routing, compiled handoff and Codex execution states. Codex execution remains separately untested until authorized.

## Task 5 — Minimal repository reconciliation and completion report (only after Task 4)

**Files:**
- **Update if needed:** `docs/workflow/WORKFLOW_V3_MASTER_ARCHITECTURE.md` *only* to reflect the observed deployed integration status; do not silently rewrite original Phase 1 or later-phase contracts.
- **Create if warranted:** `docs/workflow/decisions/YYYY-MM-DD-auto-handoff-rollout.md` for a concise evidence-linked rollout decision if the existing persistence rules require it and user authorizes a workspace write.
- **Leave untouched:** `src/workflow/*`, existing MCP tests unless a concrete regression gap is demonstrated, preexisting untracked docs.

- [ ] **Step 1:** Record the ownership and exact deployed global handoff surface, plugin version (not private backend IDs), what was changed, how to rollback, and scope of the actual E2E evidence. Avoid copying chat transcripts or private connector details into a public repository.
- [ ] **Step 2:** Run focused verification without a full suite by default: `pnpm exec vitest run tests/mcp-integration.test.ts -t "cross-phase E2E"` from the C2C repository; expected the isolated cross-phase case to pass. For any authorized docs modifications, run `git diff --check` and review only intended paths.
- [ ] **Step 3:** Present a completion matrix with separate status for: installed rule updated, actual ordinary-chat skill/route observable, Phase 2/3 call chain, Phase 3 prompt provenance, negative-path safety, and **real Codex execution** (not claimed until actually run). Obtain explicit user acceptance before Go.
- [ ] **Step 4:** If authorized to commit docs, stage only named changed files; never stage unrelated pre-existing untracked files. No push/deploy without a separate instruction.

## Stop conditions and rollback

- **Task 1 gate fails:** No verified editable global handoff authority ⇒ stop without mutations; a plugin-only note is not a runtime fix.
- **Task 2 scope expands:** Any proposal to build a scheduler, change MCP schemas, or weaken Jev/approval ⇒ stop and return to architectural review.
- **Task 3 publication fails or drifts:** No blind retry; compare release versions and restore/review before proceeding. A previously downloaded plugin archive is a backup, not proof it was restored.
- **Task 4 black-box E2E fails:** Leave auto-handoff acceptance **No-Go**. Roll back approved active configuration/release through its supported guarded update process, then diagnose the observed runtime limitation. Do not conceal it by adding a manual invocation command to the test prompt.

## Execution decision

This is a **configuration/skill handoff and runtime-validation task**, not a Phase 2/3 code refactor. Recommended sequence after user approval: perform Task 1 as a read-only probe, review Task 2's actual proposed changes, request explicit authorization before Task 3's live plugin/configuration mutation, and then carry out Task 4's new-chat tests. If the global execution-handoff authority is not editable or observable, stop at Task 1 rather than sending Codex to patch irrelevant C2C files.

No implementation, plugin release update, bridge restart, deployment, or Codex run is authorized by this plan alone.
