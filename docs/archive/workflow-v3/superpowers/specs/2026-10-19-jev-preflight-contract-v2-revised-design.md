# Workflow v3 — Jev Preflight Contract v2 (Revised Design)

**Date:** 2026-10-19  
**Status:** Revised draft for user review; not authorized for implementation  
**Target repository:** `codex-with-chatgpt`  
**Revises:** `docs/superpowers/specs/2026-10-18-jev-preflight-contract-v2-design.md`  
**Authority:** Active Global Prompt Generation Contract and C2C Mandatory Jev policy

## 1. Problem and preserved evidence

A Portfolio 3D Hero post-diagnosis Codex handoff reached Phase 3 `READY` without satisfying the mandatory Jev gate. That original E2E remains **failed**; later gate calls cannot retroactively repair it.

Current `src/workflow/phase2.ts` trusts caller-supplied `jevRequired=false`, yielding `READY_FOR_EXECUTION`; both Phase 2 MCP entry points inherit the bypass. A prior Codex attempt stopped because no trustworthy trigger facts were available. Later, the approved plan's Task 1 was stopped by Jev (`decision=stop`); do not retry that execution line or reinterpret the stop as approval.

## 2. Goals and exclusions

**Goals**
1. Prevent caller-controlled `jevRequired=false`, arbitrary trigger flags, or fabricated attestations from bypassing Mandatory Jev.
2. Preserve a no-Jev path only where C2C can verify **all four trigger exclusions** using independently verifiable facts.
3. Permit sourced current-conversation (L2) evidence to establish **positive** triggers, without requiring a persisted C2C diagnosis record.
4. Fail closed to the existing Jev workflow for unknown, insufficient or contradictory evidence.
5. Keep attestation reuse short-lived, proposal- and evidence-bound, and invalidated on material new facts.
6. Maintain safe legacy migration and preserve Phase 3/4 APIs.

**Excluded:** changing Jev model or thresholds, adding an external attestation service/database, editing Portfolio/Pendlio, recreating earlier E2E evidence, general workflow refactoring, automatic ingestion of all ChatGPT conversations, or source modifications before renewed design/plan approval.

## 3. Decision authority and trust boundaries

The Global Workflow Router supplies task facts and execution context. **It is not a trusted certificate issuer merely because it labels its own statements.** C2C performs verification of sources it can actually access and issues/records attestations server-side.

The mandatory triggers remain:
- `productionOrRuntimeIncident`
- `difficultOrUnclearBug`
- `completedPriorDiagnosisAndFollowupCodex`
- `repetitiveInvestigationWithoutProgress`

Preflight internal outcomes:
- `NOT_REQUIRED`: all four predicates reliably excluded by trusted evidence.
- `REQUIRED`: at least one trigger established.
- `REQUIRES_JEV_FOR_UNCERTAINTY`: absence/incompleteness/inconsistency of adequate evidence.

For `REQUIRED` or `REQUIRES_JEV_FOR_UNCERTAINTY`, Phase 2 enters the existing Jev path; it **does not itself fabricate or execute** a Jev result. Only an actual decision bound to the exact current proposal identity can authorize continuation. Invalid proposal format is a contract error, not an exemption.

**L1**: C2C-owned records whose existence, identity, relevant status and linkage are checked server-side. A record's absence cannot prove that no previous ChatGPT diagnosis exists.  
**L2**: sourced, reviewable current-conversation observations; may trigger Jev, but C2C cannot independently authenticate an arbitrary conversation transcript or accept unsupported negative claims as proof of `NOT_REQUIRED`.  
**L3**: self-declared flags, unsupported summaries, fake/stale record IDs, contradictions; never justify exemption.

## 4. Attestation issuance (C2C server-side)

**Chosen architecture:** C2C issues attestations after its own validation and stores them in an existing C2C-managed local state directory, provided the existing storage primitives meet isolation and consistency requirements.

A minimal attestation record contains:
- `contractVersion`
- `attestationId` (unguessable opaque identifier)
- `workspaceId` (issuer/workspace scope)
- `proposalIdentity`
- `evidenceDigest` (canonical material evidence)
- `decision` (`NOT_REQUIRED` or `REQUIRES_JEV`; an attestation is not a Jev `proceed`)
- `issuer` (server-controlled, not caller-trusted)
- `issuedAt` and `expiresAt` (server-controlled timestamps)
- a server-controlled evidence/source version or equivalent freshness handle **when available**

The exact representation and the need for a separate `REQUIRED` value in the persisted record remain implementation details; they may not weaken the Phase 2 outcome distinction.

The client can submit an `attestationId` for lookup but cannot author or update the stored decision, timestamps or issuer. Phase 2 must retrieve the record in the authenticated workspace scope and check current proposal identity, digest, expiration, and source validity. A caller's copied JSON, signed-looking string, or claimed `trusted=true` has no authority. If server-side storage integrity cannot be ensured under the actual threat model, this design is **blocked**, not silently downgraded.

**Critical limitation:** An authentic server-issued attestation only proves that C2C ran the checks it supports; it does **not** prove that all real-world/chat-context triggers are absent. A `NOT_REQUIRED` attestation is forbidden until the negative-evidence rule in §5 is demonstrably sound.

## 5. Outstanding blocker: real proof of no Jev triggers

Neither currently inspected Phase 2 APIs nor the examined `src/workflow/phase4a/store.ts` and `src/workflow/phase4c/store.ts` records provide a known, comprehensive fact source establishing all four triggers false for an arbitrary ordinary task. They show existing server-side storage patterns, **not** a trusted conversation-history oracle.

Therefore this revised architecture **does not yet satisfy** the approved requirement that a practical ordinary deterministic task can reliably obtain `NOT_REQUIRED`.

A mandatory design/feasibility gate precedes code changes:
1. Identify the exact independently verifiable source and how it proves each negative predicate (including the absence of prior diagnosis outside C2C).
2. Give one reproducible ordinary deterministic task and its expected no-Jev proof.
3. Demonstrate how a false negative, stale source, or missing conversation fact is detected or conservatively routed to Jev.
4. If no source is available without a new trusted runtime/attestation interface, return **DESIGN_BLOCKED** and seek approval for that *specific* interface. Do not implement a ceremonial attestation store that merely certifies caller statements.

The earlier Jev `stop` remains binding for its existing execution line. This design work does not authorize a reattempt.

## 6. Fifteen-minute lifetime and invalidation

**Approved choice:** 15-minute maximum TTL with exact proposal/evidence binding.

- Maximum lifetime is **900 seconds** using server timestamps.
- Reuse is permitted only for the same workspace, proposal identity, material evidence digest, and still-valid observed source version.
- Changes to goal, scope, approved basis, material risk, completed diagnosis, or relevant source facts invalidate the exemption immediately, regardless of TTL.
- Cosmetic reordering or whitespace alone does not invalidate when canonical factual content and provenance are unchanged.
- Restart does not extend validity. If the bridge cannot revalidate source freshness after restart, reject the exemption and route to Jev.
- TTL/hash alone **cannot detect undisclosed new chat facts**; when freshness cannot be corroborated, no exemption.

No Redis, independent signer, background cleanup daemon or cross-device long-term cache is required.

## 7. Identity, normalization and legacy behavior

Extend the existing SHA-256 `proposalIdentity` with a canonical representation of material preflight facts and provenance. Canonicalization is shared by issuer and both Phase 2 endpoints; distinguish v1/v2 to avoid accepting a legacy result for a materially different evidence state.

Preserve `EXECUTION_PROPOSED`, `READY_FOR_EXECUTION`, `REFRAME_REQUIRED`, `STOPPED`, `BLOCKED`.

| Input/decision | Result |
|---|---|
| Verifiable `NOT_REQUIRED` + valid attestation | `READY_FOR_EXECUTION` without Jev |
| Positive trigger or unknown evidence, no bound Jev | `EXECUTION_PROPOSED` |
| Matching Jev `proceed` | `READY_FOR_EXECUTION` |
| Matching Jev `reframe` | `REFRAME_REQUIRED` |
| Matching Jev `stop` | `STOPPED` |
| Jev unavailable | `BLOCKED` |
| Legacy `jevRequired=true` | Must use Jev |
| Legacy `jevRequired=false`, no valid attestation | Must use Jev; never unconditional READY |
| Malformed proposal/attestation | Explicit validation error, never READY |

An attestation must not substitute for a Jev `proceed` when Jev is required. A Jev `proceed` must not substitute for ordinary approval, scope, identity, or brief integrity checks.

## 8. Store feasibility and failure handling

Read-only inspection found C2C-local storage patterns using `getStateDir()`, workspace-scoped folders, validated records, and filesystem primitives:
- `src/workflow/phase4a/store.ts`: workspace-scoped failure records and exclusive-create/link behavior.
- `src/workflow/phase4c/store.ts`: workspace-scoped profiles and stale-fact handling.

These are **candidate reusable patterns**, not proof that an attestation record can already be safely issued, atomically refreshed and invalidated. Verify permissions, workspace isolation, atomic write/read, duplicate/conflicting IDs, corruption, restart behavior, clock skew, and source-version checks before adopting the store. Reuse the existing primitives if sufficient; otherwise report a blocker before considering any additional storage architecture.

Fail closed on read failure, invalid record, expired proof, identity mismatch, absent source-freshness proof, or conflict; do not treat an I/O error as `NOT_REQUIRED`. Do not record complete private conversations in attestations.

## 9. Bounded implementation sequence (replaces earlier Task 1–3 assumption)

**Gate 0 — trusted negative-evidence feasibility (design/read-only):** establish §5 with inspectable evidence. If impossible, stop; no coding task. This is not permission to rerun the Jev-stopped Codex task.

**Task 1 — attestation contract and source validation (only after Gate 0):** write narrowly scoped types/source validator and focused failing tests; preserve positive L2 triggers and legacy fail-closed behavior.

**Task 2 — local attestation store and 900-second validation (only after Task 1):** use current C2C-managed state patterns; focused tests cover issuer authority, workspace isolation, expiry, tampering, restart, and evidence changes.

**Task 3 — Phase 2 integration (only after Task 2):** use a shared verification path in `phase2_transition` and `phase2_execution_brief`; keep names, outputs, phase states and Phase 3/4 intact. Add focused identity and MCP regressions.

No full build/test suite by default. Do not commit/push unrelated or pre-existing untracked files. Prepare a **revised implementation plan** only after this Spec is reviewed and Gate 0's trust requirement is resolved.

## 10. Acceptance and real-conversation E2E

Focused tests must prove:
1. Legacy false with no proof cannot enter ungated READY.
2. All four positive triggers, including L2 post-diagnosis follow-up, require Jev.
3. Real, independently verifiable all-negative case can use valid `NOT_REQUIRED`.
4. Fake/altered/expired/wrong-workspace/replayed attestation cannot authorize skip.
5. Material facts/diagnosis changes invalidate reuse before the 900-second limit.
6. Jev decisions and identity mismatch retain expected Phase 2 behavior.
7. Both MCP entry points agree and an unready proposal cannot create a brief.
8. No additional dependency or changes to Phase 3/4.

Release gate: in a genuinely new ordinary ChatGPT conversation, verify an actual Portfolio post-diagnosis handoff invokes Jev before any approved Codex prompt; separately verify one independently justified deterministic exemption. Record actual tool order, outcomes, IDs and timestamps. Original failed Portfolio E2E remains failed. A successful suite or a signed-looking document alone is not E2E proof.

## 11. Review decision

**Confirmed so far:** evidence-driven policy; positive L2 diagnosis evidence; uncertainty routes to Jev; material evidence changes invalidate identity; safe legacy migration; C2C issuer; 15-minute TTL; preference for existing local state store.

**Not yet proven:** a verifiable practical source for all-negative classifications; freshness for unseen conversation changes; adequacy of existing store for this exact contract.

**Requested review:** approve this revised architecture **with Gate 0 explicitly blocking implementation** until the trust-source question is solved, or revise the assumption that arbitrary ordinary tasks must be provably exempt without an additional trusted conversation-state interface. No implementation or modified history is authorized by approving this document alone.
