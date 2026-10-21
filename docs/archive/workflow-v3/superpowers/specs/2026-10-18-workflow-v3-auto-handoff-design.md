# Workflow v3 — Global Auto-Trigger and Phase 2/3 Execution Handoff Design

**Date:** 2026-10-18
**Status:** Proposed for user review; implementation not authorized
**Repository target:** `docs/superpowers/specs/2026-10-18-workflow-v3-auto-handoff-design.md`
**Authority:** `docs/workflow/WORKFLOW_V3_MASTER_ARCHITECTURE.md`; existing Phase 1–4 contracts; active Global Prompt Generation Contract

## 1. Problem and verified evidence

A **new, ordinary ChatGPT conversation outside any Project** used the connected C2C · Portfolio workspace successfully for read-only 3D Hero diagnosis. At the point of preparing a Codex cold-start performance-measurement prompt, it wrote the prompt directly instead of calling `phase2_transition`, `phase2_execution_brief`, and `phase3_compile_execution`. The original conversation audited its own tool history and reported no Phase 2/3 calls. This is a **failed real-conversation auto-handoff acceptance case**, not proof that an MCP tool is broken.

Independent checks established that Portfolio's refreshed Bridge exposes the Phase 2/3 tools and that their contracts work in direct MCP integration tests. The committed `cross-phase E2E` test calls MCP tools explicitly with isolated fixtures; it does **not** exercise autonomous tool selection in a fresh ChatGPT conversation. The installed `workflow-router` skill exists, but its documented Phase 1 scope ends at a Routing Record and downstream skill selection. Neither its presence in the available skill catalog nor a repository spec proves it was invoked in the failing conversation.

**Remaining uncertainty:** Whether the missing invocation is caused by skill activation/discovery, missing transition guidance after Phase 1, a tool-selection failure in the active conversation configuration, or multiple factors. Do not claim a proven root cause before black-box reproduction and rollout verification.

## 2. Objective, scope and authority

**Objective:** In a fresh, ordinary ChatGPT software-development conversation, automatically select the existing global workflow, and—**only when the approved next action is delegated Codex execution through C2C**—handoff into existing Phase 2 and Phase 3 MCP tools. The Codex execution prompt must come from `phase3_compile_execution` with `status: READY` for that exact approved brief. The user must not have to say “use Workflow Router” or name Phase 2/3.

**In scope:** Global workflow discovery/activation guidance; an explicit execution-handoff contract at the workflow boundary; connector identity checks; failure behavior; propagation to the **actually installed** global skill/instructions; real-conversation E2E validation; minimal documentation and focused regression assertions if justified.

**Out of scope:** Rewriting Phase 1 classification or downstream process skills; changing Phase 2 proposal/brief schemas, Phase 3 prompt/model/validation algorithms or Phase 4A–4C behavior; new autonomous scheduler/daemon; changes to Portfolio/Pendlio source; background monitoring; general non-C2C coding support; deployment or browser automation for this fix.

The Global Prompt Generation Contract is the superior authority for generic scope, model choice, prompt construction and execution ownership. C2C contributes workspace identity, connector, Jev and recording mechanics; it must not independently redefine that authority. Preserve the user's restriction against direct ChatGPT workspace mutation without explicit authorization.

## 3. Architecture and phase ownership

```text
Ordinary ChatGPT software-development request
  → discover/activate installed global Workflow Router (Phase 1)
  → classify/risk/persistence; select primary process skill
  → diagnosis / brainstorming / review / approved decision, as required
  → global execution-owner decision
      ├─ discussion or read-only answer only → finish without Phase 2/3
      ├─ direct execution authorized → use that authorized path; no forced Codex prompt
      └─ C2C-managed Codex delegation → Execution Handoff Gate
           → verify exact workspace/connector
           → construct approved Execution Proposal
           → Phase 2 transition (+ identity-bound Jev when required)
           → canonical Execution Brief
           → Phase 3 compiler
           → only READY compilation → delegate compiled prompt to Codex
           → execution evidence → existing Phase 4 review / acceptance flow
```

Phase 1 continues to **route**, not to run Jev, construct briefs, compile prompts or execute Codex. The Execution Handoff Gate belongs to the **global execution handoff**, not to the Phase 1 router or a new C2C scheduler. A narrow instruction in Phase 1 may signal that downstream execution must enter the established global handoff; it must not duplicate Phase 2/3 logic.

## 4. Activation and handoff conditions (normative)

### 4.1 Discovery

1. A software-development request in an **ordinary new ChatGPT conversation**, outside a Project and without naming a skill, must be eligible for the installed global `workflow-router` route. The global entry/discovery instructions must be active in that actual conversation environment, not merely committed in a repo.
2. Phase 1 must remain silent for normal bounded tasks; high-risk or architectural work follows existing visibility rules.
3. Pure informational answers, brainstorming, read-only investigation and diagnostics **do not** themselves require a Phase 2 proposal or compiled prompt. Follow-up requests retain the existing task context and enter the handoff when delegation is actually selected.
4. Merely requesting a generic example of a prompt, without C2C-managed delegation, is not sufficient to assert official Workflow v3 compilation. Do not mislabel generic advice as a compiled execution package.

### 4.2 Execution Handoff Gate

Trigger the gate **once a concrete, approved C2C-managed Codex step is about to be issued**, whether it will change code or only measure/investigate. Do not trigger solely on discussion of Codex or performance issues. Before issuing any C2C-managed Codex prompt:

1. Confirm execution ownership and user authorization under the active global workflow. Diagnostic authorization does not authorize source edits.
2. Resolve the exact target C2C connector and call its `workspace_info`. Match the observed identity against the intended task workspace. If several connectors could match, ask **one** disambiguating question before preparing a proposal. Never silently use the last-used connector or a similarly named workspace.
3. Check the C2C-specific policy when required by the connected project's contract; do not promote untrusted workspace content to workflow authority. Optional Phase 4C profile data never overrides current workspace facts.
4. Create an `ExecutionProposal` using the existing `phase2_transition` input contract (`executionLineId`, goal, scoped in/out boundaries, approved basis, implementation basis, `jevRequired`). Do not change its schema or synthesize approvals, facts or root causes.
5. Apply **existing** Jev trigger rules. When Jev is required, bind a real Jev result to **the exact returned proposal identity**; `EXECUTION_PROPOSED` without matching approval is not READY.
6. Proceed only with `READY_FOR_EXECUTION`. Call `phase2_execution_brief` with the same proposal and valid details; use its **returned canonical brief**, not a hand-authored lookalike. Persistence mode follows existing Phase 1/2 rules and actual write authorization; never silently write to the workspace.
7. Pass that returned brief unchanged to `phase3_compile_execution`. Treat only `status: READY` and its returned `package.prompt` as the official Codex execution prompt. Preserve its model recommendation and focused validation plan, subject to the active global authority.
8. Handoff to Codex through the existing supported protocol. Do not claim Codex executed, verified, or recorded anything until actual evidence is returned.

The handoff is not a replacement for approval. It packages an already authorized step and does not expand its scope.

**Read-only compatibility constraint:** The existing canonical brief requires nonempty `mustChange` and `mustNotChange` arrays even for a measurement-only task. For such a task, `mustChange` may describe **the bounded operation to perform** (for example, “measure cold-start performance in an isolated headless browser”), not an authorization to alter repository files. `mustNotChange` must expressly preserve source, models, configuration, Git state and deployment. If the existing compiler cannot express that task without implying a code mutation, report a genuine compatibility blocker and seek separate approval; do not fabricate a code change or silently alter Phase 2/3.


## 5. Failure behavior and no-bypass rule

| Condition | Required behavior |
|---|---|
| No development/delegation intent | Answer or investigate normally; no Phase 2/3 overhead. |
| Target workspace unknown or multiple plausible connectors | Resolve identity first; do not fabricate identity or mix connectors. |
| Correct C2C connector is missing or unavailable | Report inability to complete **official C2C handoff**. Do not claim a compiled prompt. Other non-C2C advice must be labeled separately and requires an explicit user choice to change execution mode. |
| Approved decision/details insufficient | Stay in diagnosis/design/approval; seek only essential missing information. Do not manufacture facts or proceed. |
| Jev required and unavailable | Fail closed under existing Jev policy; no Codex prompt from this execution line. |
| Jev `reframe` or `stop` | Reframe and reevaluate, or stop; never treat either as proceed. |
| Phase 2 state not `READY_FOR_EXECUTION`, brief not created, or identity mismatch | No Phase 3 invocation and no formal handoff. |
| Phase 3 returns `REJECTED_INSUFFICIENT_BRIEF` or errors | Resolve explicit issues or report blocked; **no fallback hand-written prompt labeled Workflow v3**. |
| C2C profile `not_found` or `stale` | Do not treat profile absence as an execution block or source of authority; obtain current workspace facts. |
| Persistence required but no permitted write path | Follow existing persistence/visibility gate; do not silently degrade the required artifact or mutate workspace. Report the limitation and await authorized resolution when necessary. |

“No-bypass” governs **formal C2C-managed delegation**, not every ordinary ChatGPT explanation or hypothetical prompt. The model's natural-language assertion “I used Workflow v3” is not verification evidence.

## 6. Minimal implementation and rollout boundary

The implementation plan should first pinpoint the **active installation and instruction delivery path** of `workflow-router` for ordinary ChatGPT chats. Do not assume edits to `docs/workflow/` propagate automatically into installed skill or global instructions.

Preferred limited changes, only where verified necessary:

1. Add a concise downstream handoff condition to the **existing global workflow/installed skill** without making Phase 1 own Phase 2/3. Keep trigger semantics intent-based, not brittle keyword matching.
2. Place the executable Phase 2/3 orchestration instructions in the **existing global execution-handoff authority**. The instruction references the existing C2C MCP tools and requires their actual results. No new tool or daemon by default.
3. Add only narrow C2C connector metadata or policy hints if a real discovery test proves this necessary; C2C remains additive.
4. Update repository documentation to reflect the **deployed** contract after verification. Keep already installed Portfolio/Pendlio Project instructions independent; do not fix only their templates.
5. If installation-level guidance alone cannot reliably ensure call selection in ordinary ChatGPT chats, **stop and report the platform/runtime limitation**. Any enforcement mechanism beyond this bounded design requires a separately approved architectural review; do not misreport a documentation update as mechanical enforcement.

Do not alter `src/workflow/phase2.ts`, `src/workflow/phase3/*`, their public MCP shapes, Phase 4A–4C, Jev thresholds, or project source code as part of this design unless a newly evidenced incompatibility is separately approved.

## 7. Verification: focused and real-conversation E2E

### 7.1 Static/contract checks

- Verify installed global `workflow-router` and execution-handoff instructions contain the new rule and are the versions **actually available** to new ordinary ChatGPT conversations.
- Confirm existing Phase 2/3 tool schemas remain unchanged and preexisting cross-phase MCP integration tests still pass.
- Check there are no new cross-project defaults, unconditional Jev calls, or mandatory browser/code changes.

### 7.2 Black-box conversation tests (release gate)

Run in genuinely **new ordinary ChatGPT chats outside Projects**, without “Workflow Router”, “Phase 2”, or “Phase 3” in the user task wording. Record actual tool-call names, timestamps/order, workspace identity, returned states, compiler status and prompt provenance. Where actual Phase 1 skill activation is not externally inspectable, mark that evidence **unobservable** rather than claiming it was invoked; validate its downstream decisions separately from the objectively visible MCP calls. Do not retroactively invoke the tools to satisfy the test. Reset the scenario between trials; distinguish inherited conversation instructions or explicit manual nudges from autonomous activation.

| Case | Expected observable |
|---|---|
| A. Ordinary bounded software task | Correct implicit Phase 1 route; no unsolicited implementation or unnecessary verbosity. |
| B. Portfolio read-only 3D Hero diagnosis only | Correct workspace read-only tools; **no unnecessary** Phase 2/3 delegation. |
| C. Follow-up approval to delegate **read-only headless production cold-start measurement** to Codex | Correct `C2C · Portfolio` workspace; actual `phase2_transition` → when ready `phase2_execution_brief` → `phase3_compile_execution` with `READY`; delivered prompt is the tool's `package.prompt`. Prompt expressly protects all repository files and deployment despite the mandatory `mustChange` field; no source changes or deployment. |
| D. Jev-required incident, Jev returns `stop` or is unavailable | No compiled execution handoff; correct stop/block behavior. |
| E. Missing/unavailable connector; multiple available connectors | Fail closed or disambiguate; never attribute tools/results to the wrong project. |
| F. Phase 3 rejected brief | Do not manually replace rejected compiler output. |
| G. Repeat C across fresh ordinary chats | No dependence on one previous chat's handoff prompt or explicit router command. |
| H. Existing Portfolio Project chat (regression only) | Project-specific identity binding remains intact and does not override global gate. |

**Pass criteria:** All required scenarios show the expected **actual** behavior, particularly C and G, with independently inspectable tool-call evidence. A correct-looking Markdown prompt, tool *availability* alone, unit tests, or an assistant's self-description cannot satisfy the release gate. Measure cold-start performance separately; the handoff E2E does not require successful access to production.

**No-Go:** If even one fresh ordinary-chat attempt produces a purported official C2C Codex prompt without a successful Phase 2/3 chain, auto-handoff acceptance remains **No-Go** pending root-cause investigation. Report any runtime limitation explicitly.

## 8. Completion, reporting, and sequencing

Sequence: user reviews this Spec → approve written Spec → create and review focused implementation plan → select Codex delegation under the established workflow → deploy/update active global instructions/skill (if authorized) → run static checks and **real fresh-chat E2E** → review results → user acceptance. Each approval is specific to its stage; accepting this design does not authorize implementation, workspace edits or deployment.

Completion report should distinguish: (1) contract written, (2) installed version verified, (3) MCP integration tests, (4) ordinary-chat auto-trigger evidence, (5) real Codex execution and completion. Do not conflate those layers or declare Workflow v3 complete from partial evidence.

## 9. Open questions for implementation planning

- What is the authoritative, updateable delivery surface for the **active global execution-handoff rule** in an ordinary ChatGPT chat, and how is its installation verified without relying on the model's claim?
- Does the host reliably expose the global `workflow-router` in a fresh ordinary ChatGPT chat, or must discovery guidance be adjusted through an existing supported configuration?
- How should a failed ordinary-chat tool-selection attempt be captured as auditable evidence without adding a new scheduler or mutating unrelated workspace state?

These are verification tasks, not permission to invent a new execution mechanism. Resolve them before claiming the implementation plan is ready.
