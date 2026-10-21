# Workflow v3 — Jev Preflight Contract v2 Design

**Date:** 2026-10-18  
**Status:** Draft for user review — not approved for implementation  
**Target repository:** `codex-with-chatgpt`  
**Proposed location:** `docs/superpowers/specs/2026-10-18-jev-preflight-contract-v2-design.md`  
**Authority:** Active Global Prompt Generation Contract; existing C2C Mandatory Jev policy

## 1. Problem and evidence

An original Portfolio 3D Hero follow-up handoff completed Phase 3 compilation with `READY`, but its Jev gate was not validly satisfied. The original E2E remains **failed**; no later calls may retroactively change that result.

The present `ExecutionProposal` contains caller-supplied `jevRequired: boolean`. In `src/workflow/phase2.ts`, `transitionExecutionProposal` directly returns `READY_FOR_EXECUTION` when the flag is false. Both Phase 2 MCP entry points in `src/mcp/server.ts` use the same behavior. Neither the contract nor the transition has reliable trigger facts distinguishing a first deterministic task from a post-diagnosis follow-up or production incident.

A prior narrow Codex attempt was correctly **blocked without code changes**: the existing schema could not safely enforce mandatory Jev while preserving the non-Jev deterministic path. Previously reported 5/5 Phase 2 tests and 6/6 focused MCP integration tests validate existing behavior, not a fix.

## 2. Goals and non-goals

**Goals:**
- Enforce Mandatory Jev when the work is a difficult/unclear bug, production/runtime incident, a Codex follow-up after at least one completed diagnosis round, or a repetitive investigation without material uncertainty reduction.
- Preserve a no-Jev path for adequately evidenced ordinary deterministic tasks.
- Accept specifically sourced current-conversation diagnosis evidence even without a persisted C2C record.
- Fail closed on uncertainty by requiring the existing Jev decision gate, subject to its normal `proceed`/`reframe`/`stop`/unavailable semantics.
- Bind the operative preflight facts to the precise Execution Proposal identity, invalidating old Jev decisions when material facts change.
- Allow safe migration for legacy clients without retaining `jevRequired=false` as a bypass.

**Out of scope:** Jev model/threshold changes; Phase 3 and Phase 4 logic; automatic background history ingestion; Portfolio/Pendlio code; rewriting or replaying historical E2E results; unrelated cleanup; source changes during the design stage.

## 3. Architectural placement

The existing global workflow gathers task facts and chooses execution ownership. Before any C2C-managed Codex delegation, Phase 2 validates a **Preflight Evidence Envelope** and derives `NOT_REQUIRED`, `REQUIRED`, or `REQUIRES_JEV_FOR_UNCERTAINTY`. These are internal decisions, not new public Phase 2 states. The existing `jev_decision_gate` supplies an actual decision; Phase 2 requires an identity-bound result whenever the preflight does not establish `NOT_REQUIRED`.

Phase 2 remains the enforcement point in both `phase2_transition` and `phase2_execution_brief`. Both must use the same normalized decision and identity logic. No new independent Jev inference service or forced call for every deterministic task is introduced.

## 4. Evidence contract (proposed semantics, not frozen TypeScript schema)

A v2 proposal adds `preflightEvidence` with a version marker, explicit trigger assessments for the four policy predicates, and a compact evidence reference for each assessment. The normative predicates are:

1. `productionOrRuntimeIncident`
2. `difficultOrUnclearBug`
3. `completedPriorDiagnosisAndFollowupCodex`
4. `repetitiveInvestigationWithoutProgress`

Each assessment has `true | false | unknown` plus provenance and a short factual rationale. An assessment of `false` **must not** be inferred merely from silence; all four must be demonstrably false for `NOT_REQUIRED`. Do not infer root cause, user approval, or historical execution from a free-text goal.

Evidence provenance:
- **L1, verified system record:** exact C2C record ID/source, linked to this execution line or an explicitly referenced prior line; validate existence, identity and relevant state server-side. Mere user-supplied IDs are not proof.
- **L2, current conversation evidence:** explicit factual assertion with a precise, reviewable conversation reference or compact cited observation and its relationship to the proposed action. This evidence is accepted for triggering Jev without prior C2C persistence. It is not independently authenticated by the C2C workspace and **cannot, merely by self-assertion, prove absence of all triggers**.
- **L3, unsourced/inconsistent:** unsupported labels, guesses, silent omission, contradictory assertions. Such inputs cannot establish `NOT_REQUIRED`.

Trust boundary: C2C cannot inspect arbitrary ChatGPT conversations through its current MCP contract. Therefore “validation” of L2 means schema, reference completeness, relation to this exact proposal and internal consistency—not cryptographic verification of conversation contents. For a genuinely fail-safe deterministic skip, either validated L1/other independently verifiable facts or a separately specified trusted attestation source is necessary. If that source is not available in v2, ambiguous/unverifiable negative claims take the Jev-required route. **Do not claim that merely adding four caller-supplied flags prevents malicious or mistaken false negatives.**

## 5. Preflight decision and state transitions

Preflight precedence (the same in both MCP endpoints):

1. Validate proposal and evidence-envelope shape, references and linkage. Reject malformed structural input; treat unsupported claims/uncertainty as requiring Jev, not as permission to skip.
2. If any supported policy trigger is evidenced as `true`, determine `REQUIRED`.
3. If any trigger is unknown, missing, contradictory, or negative evidence is insufficient, determine `REQUIRES_JEV_FOR_UNCERTAINTY`.
4. Only when all triggers are adequately established `false`, determine `NOT_REQUIRED`.
5. Legacy `jevRequired=true` is a floor: it still forces Jev, even if other evidence suggests no gate; legacy `false` is **never sufficient** to establish `NOT_REQUIRED`.

| Preflight / bound decision | Existing Phase 2 state |
|---|---|
| `NOT_REQUIRED` | `READY_FOR_EXECUTION` without Jev |
| Jev required/uncertain, no matching decision | `EXECUTION_PROPOSED` (await real Jev) |
| Matching Jev `proceed` | `READY_FOR_EXECUTION` |
| Matching Jev `reframe` | `REFRAME_REQUIRED` |
| Matching Jev `stop` | `STOPPED` |
| Jev unavailable | `BLOCKED` |
| Invalid/mismatched identity or malformed envelope | No READY; return an explicit validation error or await matching gate, as appropriate |

“Automatic routing to Jev” is a handoff obligation for the orchestrator, **not** a fabricated Jev result or an assumption that the MCP phase transition calls the model internally. Jev `proceed` never substitutes for normal proposal/brief integrity or permission checks. If Jev cannot be called, fail closed; no hidden bypass.

## 6. Identity and evidence normalization

Continue using the existing SHA-256 `proposalIdentity`, extended with a deterministic representation of **material** preflight facts: policy-trigger assessments, linked source identity/record reference, and any material diagnosis or scope evidence relevant to Jev judgment. Changes to goal, scope, approved basis, or these material facts change identity and invalidate earlier results.

Ignore nonsemantic presentation order, whitespace/display copy and unrelated notes *only when* the normalized factual assessment and its source referent are unchanged. Do not drop evidentiary contradictions or edited observations under “cosmetic” normalization. The precise canonicalization and versioning must be implemented as a single shared helper and tested. The current flag must not be able to alter preflight requirements by itself.

A Jev result is valid only when explicitly bound to the *current* resulting identity and when the gate result is `available: true` with `decision: proceed`. `reframe` requires an updated proposal and new evaluation. `stop` prevents the execution line from proceeding.

## 7. Legacy compatibility

Do not rename current MCP tools or change Phase 3/Phase 4 APIs. Retain existing fields during migration, introducing optional v2 evidence inputs at the Phase 2 boundary:

- Legacy `jevRequired=true`: still requires Jev, matching the current identity.
- Legacy `jevRequired=false` with no adequate v2 evidence: **not READY**; route to Jev, accept only a real identity-bound `proceed`.
- V2 with adequate evidence of no trigger: normal no-Jev path.
- Legacy or v2 explicit trigger/uncertainty: require Jev.

Migration can increase Jev calls for old clients; this is intentional until they supply sufficient evidence. Existing tests asserting unconditional `false -> READY` must be updated, not silently retained as a bypass. Define deterministic identity encoding for v1 vs v2 so a Jev result issued for one cannot be silently applied to materially different facts in the other. Avoid persisting new files without authorization.

## 8. Failure behavior

- Malformed shape: explicit contract error; no READY.
- Missing/uncorroborated evidence: Jev-required route; no READY until valid bound result.
- Conflicting evidence: no `NOT_REQUIRED`; surface the conflict; do not conceal it via normalization. Jev may assess the uncertainty but cannot authenticate false claims.
- Jev `reframe`: no current prompt; update proposal and re-evaluate.
- Jev `stop` or unavailable: stop/block, no Phase 3.
- Workspace/connector mismatch, absent approval, or invalid Execution Brief: existing guardrails still apply independently.
- Previous failed Portfolio handoff remains failed regardless of v2 implementation.

## 9. Focused acceptance matrix

1. Production incident with caller `jevRequired=false` cannot become READY without bound `proceed`.
2. A completed read-only diagnosis followed by another C2C-managed Codex measurement requires Jev based on sourced L2 evidence, even without a C2C diagnosis record.
3. Difficult/unclear bug and repetitive no-progress investigation each require Jev.
4. Ordinary first-pass deterministic task with **adequate provenance for excluding all triggers** can become READY without Jev; weak negative self-assertion alone cannot qualify.
5. Legacy `jevRequired=false` without evidence does not bypass; `true` still requires Jev.
6. Unknown, incomplete or inconsistent evidence cannot produce ungated READY.
7. Identity changes for material evidence/goal/scope updates; cosmetic reordering does not cause a duplicate call; old bound Jev result cannot be reused across identities.
8. `proceed`, `reframe`, `stop`, unavailable, and mismatched identity preserve correct existing Phase 2 state behavior in **both** MCP endpoints.
9. Existing canonical brief and Phase 3 prompt only follow `READY_FOR_EXECUTION` and retain their current integrity checks.
10. Real fresh-chat E2E: a new Portfolio post-diagnosis handoff actually invokes Jev, binds the returned decision and—only if authorized—continues Phase 2/3. Capture actual tool calls and timestamps. No retroactive repair of the old E2E.

**Validation scope:** Targeted Phase 2 unit tests and MCP integration tests first; a new consumer-side E2E is separately required for the actual handoff behavior. Do not run broad test suites by default.

## 10. Open design caveat and review gate

**Unresolved enforcement boundary requiring explicit review:** With today's C2C contract, L2 source text is supplied by the caller and is not verifiable from inside the MCP server. A policy claiming *provable* classification of every ordinary task as non-Jev-required is not achievable through this evidence envelope alone. This design intentionally fails closed when exclusions are not adequately evidenced; it does not claim prevention against a dishonest caller fabricating a purported L1/L2 proof. The implementation plan must specify which negative-evidence sources are genuinely verifiable and whether the no-Jev path is practically usable without adding a trusted source. If these criteria cannot be met narrowly, stop and request approval for the smallest further contract/source change rather than pretending the gate is mechanically complete.

**Next gate:** User reviews this draft; approval authorizes a reviewed spec, not code modification. Only then prepare the implementation plan under the existing Workflow Router.
