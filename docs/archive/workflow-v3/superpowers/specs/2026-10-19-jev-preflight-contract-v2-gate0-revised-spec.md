# Workflow v3 — Jev Preflight Contract v2: Gate 0 Revised Spec

**Date:** 2026-10-19  
**Status:** Review draft — not approved for code execution  
**Target:** `codex-with-chatgpt`  
**Revises:** `docs/superpowers/specs/2026-10-19-jev-preflight-contract-v2-revised-design.md`  
**Basis:** C2C read-only inspection; user-selected safety-first Gate 0 option A

## 1. Problem and preserved history

The original Portfolio 3D Hero follow-up handoff returned Phase 3 `READY` while failing Mandatory Jev. The original E2E remains **FAILED**. A prior Jev `stop` for its original investigation line remains binding; no retrospective gate call or re-run may reinterpret it.

Read-only code review found three separate authorization gaps:

1. `src/workflow/phase2.ts` turns caller-provided `jevRequired=false` directly into `READY_FOR_EXECUTION`.
2. Phase 2 trusts caller-supplied `boundJevResult.result`; matching the locally calculated proposal hash does **not** prove Jev was called.
3. `phase3_compile_execution` accepts any structurally valid Execution Brief and can produce `READY` without verifying a successful Phase 2 handoff.

The third gap exists at the MCP handoff boundary; it does **not** require rewriting `compileExecutionBrief` itself.

## 2. Decisions fixed by Gate 0

- **A — fail closed:** Only independent, complete, current evidence for *all four* non-trigger predicates may justify `NOT_REQUIRED`. An unsupported declaration, including `jevRequired=false`, is never enough.
- **Current capability limit:** Inspected execution records, Phase 4A history, Phase 4B `CLOSED`, Phase 4C profiles, and session checkpoints do not prove complete ChatGPT conversation history. In particular, Phase 4B `CLOSED` is a calculated execution-line result, not a trusted conversation-history closure certificate.
- **Initial v2 rollout:** `NOT_REQUIRED` issuance remains disabled. Ordinary tasks with unprovable trigger exclusions enter the actual Jev gate. This intentionally makes the initial rollout stricter than the usual deterministic-task shortcut.
- **Future compatibility:** Retain the already-selected C2C-issued attestation design and maximum 900-second validity for a later *provable* `NOT_REQUIRED` path. Never issue a decorative attestation that only certifies caller assertions.
- **No new conversation-history service or external database** is authorized by this revision. Enabling the future exemption requires a separate trusted-source feasibility decision.

## 3. Trigger and evidence contract

Retain the four policy predicates:

- `productionOrRuntimeIncident`
- `difficultOrUnclearBug`
- `completedPriorDiagnosisAndFollowupCodex`
- `repetitiveInvestigationWithoutProgress`

Preflight classifications:

| Classification | Required behavior |
|---|---|
| `REQUIRED` | At least one trigger established; actual Jev required |
| `REQUIRES_JEV_FOR_UNCERTAINTY` | Trigger absence cannot be reliably proved; actual Jev required |
| `NOT_REQUIRED` | Reserved for a future complete, independently verified all-negative source; unavailable in initial rollout |

L1 server-owned records may establish facts they actually record, including **positive** history. Their absence does not prove there was no previous ChatGPT investigation. Sourced L2 current-conversation evidence may positively trigger Jev; it cannot independently authorize exemption. Unsupported L3 flags, narratives, or fake identifiers authorize nothing. Malformed envelopes produce validation errors; conflicting or incomplete otherwise well-formed facts conservatively require Jev.

Proposal identity uses a versioned, canonical SHA-256 digest of `executionLineId`, goal, scope, approved basis, implementation basis, risk profile, and material preflight evidence/provenance. Canonicalization must treat cosmetic whitespace/order changes consistently while changing identity for new diagnosis, scope, risk or material-source facts. Include the identity format version to prevent cross-version replay.

## 4. Genuine Jev result provenance

A self-supplied JSON object such as `{ proposalIdentity, result: { available: true, decision: 'proceed' } }` has **no authorization value**.

For C2C-managed handoffs:

1. The existing `jev_decision_gate` MCP operation receives the complete current proposal as an **additive** optional field. A legacy call without the proposal may still return diagnostic Jev advice but cannot create a usable Phase 2 authorization receipt.
2. C2C computes canonical proposal identity and binds the actual Jev request task/evidence/attempts to that proposal. The receipt records the exact request-context digest as well as the proposal's preflight evidence digest; a text label supplied by a caller is not independent provenance.
3. Only after C2C itself calls the configured Jev endpoint does the server issue a workspace-scoped, unguessable receipt for the **returned** decision. The caller cannot choose the recorded decision, `issuer`, timestamps, or digest.
4. `phase2_transition` and `phase2_execution_brief` retrieve the receipt through authenticated server-side storage and independently check workspace, proposal identity, material-evidence digest, expiration, and decision state. A copied caller-created result is rejected, even when its proposal hash matches.
5. `proceed` may authorize `READY_FOR_EXECUTION`; `reframe` requires a newly framed proposal and renewed gate; `stop` blocks further Codex tasks for the existing investigation line; genuine Jev unavailability is `BLOCKED`, not an automatic bypass.

The authenticated record proves **that Jev was actually called on the recorded input**, not that caller-provided narrative covers every fact in ChatGPT. This is an explicit remaining trust boundary. Identity or evidence changes require a fresh gate.

### Receipt minimum

- `contractVersion`, opaque `receiptId`, `workspaceId`, `executionLineId`
- `proposalIdentity`, `materialEvidenceDigest`, `jevRequestDigest`
- `issuer` (server-controlled), actual `available` and `decision`/error status
- `issuedAt`, `expiresAt` (server-controlled)

Permit no more than **900 seconds** for reusable positive `proceed` authorization. A `stop` is **not** implicitly cleared by expiry of an authorization receipt; preserve its original line-wide prohibition through an appropriate server-managed stop marker. This marker cannot automatically detect a caller deliberately mislabeling the same investigation as a new line; the workflow's existing user/agent line-identity obligation remains in force. Do not synthesize historical Jev records that the server never stored.

### Local-state trust

Use existing `getStateDir()`-based workspace separation and secure/atomic write patterns if verified sufficient. Refuse authorization on corrupt/missing/conflicting/expired/stale records, cross-workspace access, restart freshness uncertainty, or partial writes. State writes remain inside C2C local metadata; they are **not** source edits in the user's workspace. Do not persist full private conversation transcripts. If local-state integrity is inadequate, stop and report a blocker rather than introducing an unapproved database.

## 5. Phase 2 and Phase 3 gates

### Phase 2

Both `phase2_transition` and `phase2_execution_brief` must share one verifier. Deprecated `jevRequired` may continue to be accepted for migration but `false` can never authorize skip and `true` cannot be downgraded. The legacy caller-provided `boundJevResult` must not authorize readiness; the replacement is a server-issued Jev receipt reference.

State mapping preserves existing names:

| Evidence | Phase 2 result |
|---|---|
| No proven exemption and no valid Jev receipt | `EXECUTION_PROPOSED` |
| Verified matching Jev `proceed` | `READY_FOR_EXECUTION` |
| Verified matching Jev `reframe` | `REFRAME_REQUIRED` |
| Verified matching Jev `stop` or previously stopped line | `STOPPED` |
| Verified unavailable Jev | `BLOCKED` |
| Invalid/mismatched/forged/expired receipt | Never `READY_FOR_EXECUTION` |
| Future verifiable exemption | `READY_FOR_EXECUTION` only after separate trusted-source approval |

When Phase 2 creates an approved Brief, C2C also persists a bounded **handoff proof** keyed to the canonical Brief digest, workspace, proposal identity, and valid authorization. The proof cannot be created from a client-supplied arbitrary Brief without successful Phase 2 processing.

### Phase 3

At the `phase3_compile_execution` **MCP boundary**, verify a matching Phase 2-issued handoff proof for the canonical supplied Brief before calling the existing compiler. Reject an unproven Brief with an explicit gate error, never `READY`.

Keep the Phase 3 call's `{ brief }` input, compiler algorithms, model router, validation router, and generated prompt format unchanged. The gate is a narrowly scoped MCP authorization check, not a rewrite of Phase 3. A user or model can still draft arbitrary prose outside C2C; the claim is only about the **official C2C-managed handoff path**.

## 6. Policy alignment

The current policy sentence "Do not call Jev for ordinary, well-scoped, deterministic tasks" remains the desired **future UX**, but cannot override the mandatory safety boundary when trigger exclusions are unknown. Amend the policy narrowly:

> Ordinary deterministic tasks may skip Jev only when C2C has independently verified that no mandatory trigger applies. Until such proof is supported, insufficient evidence requires Jev. This is not permission to infer a negative from absent C2C history.

Preserve all Jev `proceed` / `reframe` / `stop` / unavailable semantics. Global Prompt Generation Contract remains authoritative for generic task scope, model and validation cost.

## 7. Boundaries

Allowed implementation scope after separate authorization: Phase 2 identity/preflight and receipt verifier, minimal C2C-local receipt/handoff storage, narrow MCP modifications for `jev_decision_gate`, Phase 2 and Phase 3 entry points, one C2C policy paragraph, and focused regression tests.

Do **not** change the Jev model or its thresholds, existing Prompt Compiler/model-selection logic, Phase 4 algorithms, Portfolio/Pendlio repositories, unrelated workflow routing, existing historical evidence, or the original stopped execution line. No new external service or dependency by default.

### 7A. Jev Execution-Line Identity and Stop Integrity

**Status:** Approved implementation constraint  
**Basis:** C2C read-only inspection, 2026-10-19

The existing `jev_decision_gate` accepts only `task`, `evidence`, and `attempts`. It does not independently verify execution-line identity or persist an authoritative Stop marker.

#### Requirements

1. Bind every C2C-managed Jev authorization to a server-verified `executionLineId`, canonical Proposal Identity, and material evidence digest.
2. Preserve prior `stop` decisions for their original investigation lines. Renaming or resubmitting an equivalent task must not clear a Stop.
3. Treat missing, inconsistent, or unverifiable execution-line evidence as insufficient for authorization.
4. Issue authorization receipts only from actual C2C-observed Jev responses.
5. A new proposal must not inherit authorization from an earlier proposal or invalidate its Stop.
6. Do not infer that a prior low-confidence `stop` was incorrect. The observed result remains binding.
7. Do not change Jev's underlying model, scoring, thresholds, or decision semantics.

#### Acceptance Criteria

- An existing stopped execution line remains blocked.
- A caller cannot clear Stop by changing only its execution-line identifier.
- Missing authoritative provenance cannot yield `READY_FOR_EXECUTION`.
- Identity and evidence changes invalidate existing authorization receipts.
- No historical Jev result is fabricated or retroactively reclassified.

**Implementation boundary:** Enforce these constraints through the existing Gate 0 identity, receipt, and Stop-marker work. Do not introduce a separate lifecycle service.

## 8. Acceptance and release evidence

Focused tests must show:

1. Caller `jevRequired=false` alone cannot produce ready state or Brief.
2. A fabricated `proceed`, even with matching identity, cannot produce ready state.
3. A **real C2C Jev call** returns an identity- and evidence-bound receipt; only that valid `proceed` unlocks Phase 2.
4. `reframe`, `stop`, unavailable, prior stop, wrong workspace, altered material evidence, replay, expiry, and corrupt storage fail closed.
5. Both Phase 2 MCP operations enforce identical checks, and the Brief proof is issued only after actual readiness.
6. Calling Phase 3 directly with a structurally valid but unproven Brief cannot produce `READY`.
7. Phase 3's existing compiler behavior and Phase 4 behavior remain unchanged beyond MCP gate enforcement.
8. Initial rollout does not claim an independently verified `NOT_REQUIRED` case, nor an end-to-end exemption capability.

A fresh ordinary ChatGPT conversation must then run a *new, permitted* post-diagnosis C2C handoff and record actual tool order, Jev request/result, receipts, Phase 2 result, Brief and Phase 3 status. Do not re-run the stopped Portfolio investigation line. Separately verify that an ordinary deterministic task **without trusted exclusions** takes the safe Jev path; do not misrepresent that test as a successful exemption. Original failed E2E stays failed.

## 9. Decision / open limitations

**Recommended for review:** Approve safety-first gate enforcement now, with `NOT_REQUIRED` explicitly disabled until an independently verifiable all-negative source is designed and separately approved. Preserve the previously chosen 15-minute attestation ceiling for that future capability.

**Not yet authorized:** source edits, running Codex, or treating either historical E2E or future tests as passing before observation.
