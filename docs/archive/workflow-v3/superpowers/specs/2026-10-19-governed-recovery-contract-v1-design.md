# Workflow v3 — Governed Recovery Contract v1

**Date:** 2026-10-19  
**Status:** Final Design Draft — Seven Decisions Confirmed; Pending Formal Spec Approval  
**Repository:** `codex-with-chatgpt`  
**Dependencies:**
- Jev Preflight Contract v2 — Gate 0 Revised Spec
- Jev Stop Review Contract v1
- Workflow v3 Phase 2 / Phase 3

---

## 1. Purpose

Governed Recovery defines a controlled, independently authorized exception for a materially new execution proposal when an earlier related investigation was stopped by Jev.

Its purpose is to support legitimate new work without silently bypassing the Mandatory Jev Gate.

Governed Recovery is not a Jev retry mechanism, a Stop override, or a replacement for normal execution authorization.

This contract is not operational until its governance policy, trusted identity mechanism, persistence guarantees, and server-side enforcement are separately approved and implemented.

## 2. Non-Negotiable Invariants

1. Original Jev `stop` decisions remain unchanged.
2. The original stopped Proposal cannot be resumed through Governed Recovery.
3. Changing only a task name, execution-line identifier, wording, model, or validation scope does not create an eligible new Proposal.
4. No Recovery Authorization can be issued solely from ChatGPT assertions or conversational approval.
5. Stop Review v1 outcomes never grant execution authorization.
6. Only authenticated C2C server-side operations can issue and validate Recovery Authorization.
7. Recovery Authorization must never masquerade as Jev `proceed`.
8. No unverified or incomplete evidence may authorize execution.
9. Authorization consumption must be strictly single-use and concurrency-safe.
10. No historical Stop, execution record, or E2E result may be rewritten.

## 3. Proposal Eligibility

A candidate must be a materially new Proposal, not a renamed or partitioned version of a stopped task.

Two independent evidence requirements apply:

**Evidence A — Material Change**

Evidence must establish a meaningful change in task objective, technical basis, independently approved implementation scope, or newly discovered facts.

**Evidence B — Non-Restatement**

Separate, independently verifiable evidence must establish that the candidate is not merely the previously stopped task with changed labels or task boundaries.

Evidence A and Evidence B must not be two representations of the same unsupported assertion.

The verifier must compare the candidate against known related stopped lines, using their verified goals, scopes, evidence, and identities.

If relevant Stop history is missing, incomplete, or unverifiable, the candidate is ineligible until sufficient trusted evidence is available.

**Eligibility states:**
- `NOT_ELIGIBLE`
- `ELIGIBLE_FOR_REVIEW`
- `INSUFFICIENT_EVIDENCE`

Eligibility is not execution authorization.

## 4. Trust and Provenance

Evidence classifications:

- **L1:** Authenticated C2C records and independently verified repository or technical evidence, limited to the facts they establish.
- **L2:** Current conversation approvals and contextual evidence, requiring independent verification for security-sensitive conclusions.
- **L3:** Unverified caller narratives, labels, hashes, or claimed identities; never independently authorizing.

A C2C-generated Proposal Identity proves canonical equality of submitted material, not the truth of every submitted claim.

The service must validate provenance separately from identity.

## 5. Owner Authorization

Recovery requires:

1. Verified eligibility.
2. An authenticated Workspace Owner.
3. A separate high-privilege confirmation.
4. Explicit approval of the exact Proposal and recovery scope.
5. Server-issued authorization bound to verified evidence.

Ordinary `workspace.write` access does not imply Owner-level governance authority.

The Owner confirmation must use a trusted channel with sufficient authentication guarantees. A ChatGPT text message alone is insufficient.

The implementation must first verify that existing C2C authentication infrastructure can establish Owner identity and separate privileged approval.

If it cannot, implementation remains blocked until an appropriate trusted mechanism is separately approved.

## 6. Recovery Authorization

The server issues a distinct authorization type:

`GOVERNED_RECOVERY_V1`

Required binding fields:

- `workspaceId`
- `executionLineId`
- `proposalIdentity`
- `originalStopReference`
- `materialEvidenceDigest`
- `approvedScopeDigest`
- `ownerApprovalId`
- `issuedAt`
- `expiresAt`
- `nonce`
- `authorizationId`

All security-critical fields must be server-controlled or independently verified.

The authorization must be unguessable, workspace-scoped, and non-transferable.

Maximum validity: **900 seconds**.

Its lifetime governs acceptance of the authorization, not the duration of an execution that has already been legitimately authorized.

## 7. Authorization Lifecycle

Permitted lifecycle:

`ELIGIBLE → PENDING_OWNER_APPROVAL → ISSUED → CONSUMED`

Terminal alternatives:

- `EXPIRED`
- `REVOKED`
- `REJECTED`

Only an issued, unexpired, matching authorization may be consumed.

Consumption is strictly single-use.

After successful consumption, the credential must never be reactivated, rolled back to issued, or used for another execution.

A failed downstream operation requires a new Owner approval. Automatic authorization retries are prohibited.

Inspection and eligibility checks must not consume credentials.

## 8. Atomic Consumption and Persistence

Use verified, workspace-scoped C2C local storage when it can provide the required guarantees.

Required properties:

1. Cross-request and cross-process atomic consumption.
2. Durable consumed state across process restarts.
3. Consistent authorization and audit commits.
4. Tamper-resistant validation within the stated local threat model.
5. Fail-closed recovery from corrupt, missing, contradictory, or uncertain state.
6. Idempotent handling of duplicate operation identifiers without permitting a second consumption.

Atomic file replacement alone does not prove the full transaction guarantees.

Authorization consumption, necessary audit evidence, and Phase 2 handoff-proof issuance must use a consistent commit boundary.

No usable Handoff Proof may become visible before durable authorization consumption and required audit recording.

If atomicity or durability cannot be demonstrated, stop implementation and report the blocker.

No external database or additional storage dependency is authorized by default.

## 9. Unified Authorization Verifier

The existing C2C Phase 2 authorization boundary must support two distinctly typed sources:

**Normal authorization**
- Genuine server-issued Jev Receipt
- Actual Jev `proceed`
- Verified Proposal and evidence binding

**Governed Recovery authorization**
- Verified materially new Proposal
- Verified eligibility and Owner approval
- Valid server-issued single-use Recovery Authorization

Both sources share a trusted server verification boundary but retain separate issuance and verification rules.

A Recovery Authorization must not be converted into a Jev Receipt or represented as a Jev decision.

Previously stopped original Proposals remain ineligible under either recovery request manipulation or identity substitution.

## 10. Phase 2 Integration

Retain existing Phase 2 state names:

- `EXECUTION_PROPOSED`
- `READY_FOR_EXECUTION`
- `REFRAME_REQUIRED`
- `STOPPED`
- `BLOCKED`

Both `phase2_transition` and `phase2_execution_brief` must enforce the same authorization requirements.

The initial state or eligibility inspection must not consume Recovery Authorization.

At authorized Brief creation, the service atomically:

1. Revalidates current Proposal, scope, evidence, and Owner authorization.
2. Consumes the Recovery Authorization.
3. Commits required audit evidence.
4. Issues the canonical Execution Brief and matching Handoff Proof.

If the complete security transaction cannot be committed consistently, no usable Handoff Proof may be issued.

Caller-supplied flags, including `jevRequired=false`, `recoveryApproved=true`, or fabricated decision objects, have no authorization value.

## 11. Phase 3 Integration

The `phase3_compile_execution` MCP boundary must independently verify the server-issued Handoff Proof before compiling.

Verification includes:

- Workspace identity
- Proposal Identity
- Canonical Brief digest
- Authorization provenance
- Applicable validity and revocation conditions
- Known blocking Stop evidence

Phase 3 must not issue or consume Recovery Authorization.

Keep the existing underlying Prompt Compiler, model router, validation router, and prompt-formatting algorithms unchanged.

A structurally valid but unproven Brief must never produce an official C2C `READY` package.

## 12. Stop Review Separation

Stop Review v1 is strictly non-authorizing.

Its permitted outcomes:

- `STOP_UPHELD`
- `REVIEW_FINDING`
- `INSUFFICIENT_EVIDENCE`

None may be converted directly into Recovery Authorization.

Stop Review may provide inspectable evidence to a separately approved eligibility assessment, but findings do not bypass independent verification or Owner approval.

Review records remain isolated from execution authorization records.

## 13. Audit Contract

Record at minimum:

- Authorization and review identifiers
- Workspace and Proposal identity
- Referenced original Stop
- Evidence digests and verified provenance
- Owner approval reference
- Authorization issuance and expiration
- Consumption request identifier
- State transitions and timestamps
- Rejection and failure reasons

Audit records must not contain Owner credentials or full private conversation transcripts.

Historical audit events must not be silently overwritten or deleted.

Write failures and uncertain commit results must not be reported as successful authorization.

## 14. Failure Handling

Fail closed for:

- Missing or unverifiable Stop evidence
- Missing independent material-change evidence
- Unsupported Owner identity
- Missing privileged Owner confirmation
- Forged or mismatched authorization
- Expired, revoked, or consumed credential
- Workspace mismatch
- Material scope or evidence change
- Replay or concurrent duplicate consumption
- Corrupt or unavailable persistence
- Inconsistent audit and authorization records
- Missing or invalid Handoff Proof
- Unknown authorization provenance

No failure may automatically convert an existing Jev `stop` into `proceed`.

## 15. Implementation Boundaries

Allowed implementation, after separate authorization:

- Material-change eligibility verifier
- Minimal Owner approval integration
- Server-issued Recovery Authorization
- Workspace-scoped authorization and audit storage
- Unified Phase 2 verification boundary
- Minimal Phase 3 Handoff Proof verification changes
- Focused tests and required C2C runtime verification

Do not:

- Change Jev scoring, thresholds, or model
- Rewrite Phase 3 compiler internals
- Modify Phase 4 completion semantics
- Implement new conversation-history infrastructure
- Introduce an external database by default
- Change Portfolio or Pendlio
- Modify historical Stop or E2E records
- Create a parallel Codex execution channel
- Automatically grant Recovery from Stop Review findings

## 16. Security Validation

### Layer 1 — Authorization invariants

Test forged approvals, incorrect workspace binding, altered Proposal material, missing evidence, original stopped Proposal reuse, identifier-only changes, expired credentials, and authorization replay.

### Layer 2 — Persistence and concurrency

Test concurrent consumption across requests and processes, restart persistence, corrupted records, interrupted writes, and audit consistency.

Only one concurrent consumer may succeed.

### Layer 3 — Real C2C E2E

**E2E-A: Normal Jev**

Actual Jev `proceed` → server receipt → Phase 2 Brief → verified Phase 3 `READY`.

**E2E-B: Governed Recovery**

Controlled test Stop → independently verified new Proposal → authenticated Owner approval → Recovery Authorization → Phase 2 atomic consumption and Handoff Proof → Phase 3 verification.

**E2E-C: Bypass rejection**

Forged Jev results, forged Owner approval, reused authorization, unproven Brief, and Stop Review-as-authorization must all fail.

Use isolated test identities and records. Do not reopen previously stopped investigations.

Capture the actual connector calls, server states, audit persistence, and proof verification results.

Do not interpret Phase 4B calculated `CLOSED` as persisted conversation closure.

## 17. Release Criteria

The following are mandatory:

1. Focused security regression tests pass.
2. Cross-process atomic consumption and recovery behavior are verified.
3. Trusted Owner authentication and privileged confirmation are proven.
4. All three real C2C E2E paths pass.
5. Normal Jev execution remains functional.
6. Original Stop records remain unchanged.
7. No official C2C handoff bypass is introduced.
8. No historical failed E2E result is reclassified.

Before successful verification, use:

`IMPLEMENTED_NOT_VERIFIED`

Only after complete release evidence may the implementation be classified as verified.

## 18. Governance Prerequisites and Bootstrap

The current Mandatory Jev policy does not authorize Governed Recovery.

Before implementing this contract:

1. Formally approve this Spec.
2. Separately approve the necessary governance-policy amendment.
3. Verify the intended Owner authentication and persistence capabilities.
4. Establish a compliant, explicitly authorized implementation and bootstrap route.

A design approval alone does not grant execution rights.

No implementation may use fabricated `proceed`, invented receipts, retrospective Jev results, or an implicitly authorized new execution line.

If no lawful bootstrap route exists under the active policy, the implementation remains blocked until the policy is explicitly revised.

The original stopped Proposal remains stopped.

## 19. Final Design Decisions

- Recovery Scope: **A**
- Material Change Evidence: **B**
- Owner Authentication: **B**
- Credential Consumption: **A**
- Persistence: **A**
- Phase 2/3 Integration: **B**
- Validation: **B**

**Design conclusion:** Governed Recovery v1 provides a narrowly scoped, auditable authorization path for genuinely new Proposals while preserving historical Jev Stop integrity. It becomes executable only after explicit governance authorization and verified server-side enforcement.