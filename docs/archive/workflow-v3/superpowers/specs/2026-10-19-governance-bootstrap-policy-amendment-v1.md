# Workflow v3 — Governance Bootstrap Policy Amendment v1

**Date:** 2026-10-19  
**Status:** Final Design Draft — Six Decisions Confirmed; Pending Formal Governance Approval  
**Repository:** `codex-with-chatgpt`  
**Scope:** Initial trusted authorization infrastructure only

**Related contracts:**
- Workflow v3 Mandatory Jev Gate
- Jev Preflight Contract v2 — Gate 0 Revised
- Jev Stop Review Contract v1
- Governed Recovery Contract v1
- Workflow v3 Phase 2 / Phase 3

---

## 1. Purpose

Establish a narrowly scoped, auditable governance process for the initial installation and implementation of trusted authorization infrastructure when an existing Jev Stop prevents the normal implementation handoff.

The amendment addresses the bootstrap dependency problem without modifying historical Jev decisions.

It does not grant a general exception to Mandatory Jev, and it does not authorize execution merely by being approved as a document.

## 2. Non-Negotiable Invariants

1. Historical Jev Stop decisions remain immutable.
2. The original stopped Proposal is never retrospectively classified as approved.
3. Bootstrap is a distinct governance authorization source, not Jev `proceed`.
4. ChatGPT conversation approval is not sufficient Owner authentication.
5. Ordinary C2C `workspace.write` permission is not Owner authority.
6. Installation authority and task execution authority remain separate.
7. No Bootstrap credential may authorize more than its explicitly approved scope.
8. No credential may be consumed more than once.
9. No official execution Handoff Proof may be issued without trusted authorization verification.
10. Any missing trust prerequisite, ambiguous transaction, or unsupported security guarantee causes Fail Closed.
11. Bootstrap cannot become a standing execution bypass.
12. Historical audit and failed E2E records must not be rewritten.

## 3. Bootstrap Eligibility

Bootstrap may be considered only if all conditions hold:

- The task concerns initial trusted authorization or enforcement infrastructure.
- An existing Jev Stop blocks the normal implementation path.
- The required authorization infrastructure is not yet operational.
- A fixed, reviewable implementation Spec exists.
- The task has a precisely bounded implementation scope.
- No existing compliant execution route can complete the work.

Eligibility establishes only permission to request independent governance review.

It is not execution authorization.

## 4. Initial Trust Establishment

The first trusted Bootstrap component must be installed through a separately approved local administrative procedure.

The installation procedure must:

1. Use a fixed and independently reviewed source or release version.
2. Verify the installed artifact against a trusted reference.
3. Identify the expected installation files and permissions.
4. Require deliberate local Owner action.
5. Avoid invoking Codex, Phase 2, or Phase 3.
6. Avoid issuing task execution credentials.
7. Record the installation version and verification outcome.

A checksum stored alongside an untrusted artifact is not sufficient evidence of authenticity.

The trusted reference must be established independently of the installation artifact.

The installation procedure must not bootstrap its own authority by declaring itself trusted.

If no independently authorized initial installation procedure exists, the implementation remains blocked.

## 5. Installation and Authorization Separation

Three distinct authorities apply.

**Installation Authority**

May install and verify the initial trusted Bootstrap component.

Does not grant Codex execution permission.

**Owner Approval Authority**

May explicitly approve a particular implementation Proposal and scope after trusted authentication.

Does not issue Jev decisions.

**C2C Execution Authority**

May verify an existing, valid governance authorization and produce a constrained execution handoff.

Cannot independently approve its own work.

These roles must not be collapsed into a caller-controlled flag or an ordinary workspace permission.

## 6. Owner Identity and Interactive Confirmation

Use macOS-protected signing keys through Keychain / Secure Enclave capabilities where the required guarantees are supported.

Required properties:

- The approval signing key is protected against ordinary key export.
- The trusted public key is enrolled through the initial trust procedure.
- Every approval is bound to the exact Proposal and approved scope.
- Each approval requires independently enforced user interaction.
- The signature cannot be produced silently by C2C Bridge or Codex.
- The verification process checks the trusted key identity and approval contents.

A valid cryptographic signature establishes use of the corresponding key, not necessarily human intent.

Therefore, the selected macOS key-access configuration must demonstrate that the required user interaction is enforced.

If that guarantee is unavailable, the system must not silently downgrade to an unprotected local signing key.

A separate design decision is required before adopting any alternative.

## 7. Owner Approval Record

The signed approval type is:

`BOOTSTRAP_OWNER_APPROVAL_V1`

Required fields:

- `workspaceId`
- `proposalIdentity`
- `approvedScopeDigest`
- `policyVersion`
- `originalStopReference`
- `approvalId`
- `ownerKeyId`
- `issuedAt`
- `expiresAt`
- `nonce`
- `signature`

The signature covers a canonical, versioned representation of all security-relevant fields.

Server verification must additionally validate the trusted public key, applicable policy, expiry, revocation, scope, and replay state.

No field may derive its authority solely from a caller assertion.

## 8. Bootstrap Authorization

The execution authorization type is:

`BOOTSTRAP_AUTHORIZATION_V1`

It is separate from:

- Jev Receipt
- `GOVERNED_RECOVERY_V1`
- Stop Review findings

Bootstrap Authorization may be issued only after independent Owner approval has been verified.

It must bind:

- Exact Workspace and repository
- Canonical Proposal Identity
- Original Stop reference
- Approved implementation scope
- Allowed validation activities
- Git and deployment permissions
- Policy version
- Authorization identifier
- Issue and expiration timestamps
- Unique nonce

The authorization cannot be transferred to another Proposal or Workspace.

Any material scope change requires a new approval.

The initial validity window must be explicitly configured and bounded; an unlimited credential is prohibited.

## 9. Execution Integration

Bootstrap uses the common trusted C2C authorization verification boundary while retaining its own issuance and verification rules.

The intended flow is:

1. Verify the Owner approval.
2. Verify the specific Bootstrap Authorization.
3. Revalidate the Proposal and implementation scope.
4. Prepare the canonical Execution Brief.
5. Atomically consume the authorization and commit its audit evidence.
6. Make the corresponding Handoff Proof available.
7. Independently validate the Handoff Proof at Phase 3.
8. Compile the authorized Codex handoff.

The handoff provenance must be explicitly identified as:

`GOVERNANCE_BOOTSTRAP`

It must not be represented as Jev `proceed`.

The existing Phase 2 and Phase 3 security boundaries must reject fabricated approvals, untrusted Briefs, and caller-controlled authorization flags.

### Initial Implementation Constraint

The common verifier and Handoff Proof infrastructure do not yet exist in the required trusted form.

Therefore, the initial installation and verification of the minimum trusted component must be governed separately from the later C2C execution handoff.

This amendment does not permit an unverified Phase 2 implementation to certify its own authorization.

Until the required trusted verifier and persistence mechanisms are available, the proposed execution integration remains non-operational.

## 10. Single-Use Consumption

Read-only inspection and eligibility evaluation must not consume the credential.

The authorization is consumed when the trusted service commits the transaction that establishes the authorized Handoff Proof.

Consumption must be:

- Atomic
- Durable
- Cross-process safe
- Workspace-scoped
- Non-reversible
- Auditable

After successful consumption, the authorization cannot be reissued or reused.

If downstream compilation or execution fails, the consumed credential remains consumed.

A new authorization requires fresh Owner approval.

A read-only status query may report the committed result but must not initiate another consumption.

## 11. Transaction Persistence

Prefer existing, verified C2C workspace-scoped local trusted storage.

The durable transaction must bind:

- Authorization identity
- Consumed state
- Consumption request identity
- Required audit evidence
- Handoff Proof identity and digest
- Commit version and timestamp

The design should use a single canonical transaction record when its atomicity and durability can be demonstrated.

The implementation must prevent a usable Proof from being accepted without a corresponding durable consumption record.

A process crash must not permit a second authorization.

Required safeguards include:

1. Cross-process mutual exclusion.
2. Durable file and directory commit behavior.
3. Safe lock recovery.
4. Secure file permissions and path validation.
5. Rejection of corrupted or contradictory records.
6. Fail Closed on uncertain commit outcomes.
7. Verified replay prevention.

Atomic rename alone does not prove all required guarantees.

If the local storage approach cannot satisfy the contract, implementation is blocked.

Introducing SQLite or an external database requires a separate approved design change.

## 12. Audit Contract

Record:

- Installation and trusted version evidence
- Owner key enrollment reference
- Policy version
- Proposal and Workspace identities
- Original Stop reference
- Approval identifier
- Authorization identifier
- Approved scope digest
- Issuance, consumption, expiry, and revocation events
- Handoff Proof reference
- Rejection and failure reasons

Audit must not expose private signing keys, authentication secrets, or unnecessary conversation content.

Historical Stop and E2E evidence remains unchanged.

An audit failure must not be reported as successful authorization.

## 13. Authorization Lifecycle

Governance lifecycle states:

- `DESIGNED`
- `IMPLEMENTED_NOT_VERIFIED`
- `VERIFIED_DISABLED`
- `ARMED_FOR_PROPOSAL`
- `CONSUMED`
- `REVOKED`

Credential expiry is a terminal condition and must also be represented in authorization validation.

Default operational state:

`VERIFIED_DISABLED`

An eligible, explicitly approved Proposal may enter:

`ARMED_FOR_PROPOSAL`

Successful atomic consumption transitions it to:

`CONSUMED`

A consumed, revoked, or expired authorization must not return to an armed state.

These governance states do not replace existing Workflow v3 Phase 2 states.

## 14. Automatic Sunset

Bootstrap must not expose a persistent general-purpose execution switch.

Every authorization is limited to one approved Proposal and one successful consumption.

Completion, expiry, revocation, or scope invalidation ends that authorization's usability.

The initial Bootstrap capability must remain disabled unless a separately verified approval is active.

Additional infrastructure work requires separate authorization.

Disabling Bootstrap must not delete or rewrite historical audit records.

## 15. Security Validation

### Gate A — Initial Trust

Verify:

- Trusted installation source and version
- Installation scope
- Protected Owner key
- Trusted public key enrollment
- Independently enforced user confirmation
- Separation of installation and execution privileges

### Gate B — Authorization and Transactions

Verify:

- Forged signatures are rejected
- Wrong Workspace or Proposal is rejected
- Scope modifications are rejected
- Expired or revoked credentials are rejected
- Concurrent consumption permits at most one success
- Restart does not restore consumed credentials
- Crash recovery preserves authorization integrity
- Corrupt or missing audit evidence fails closed

### Gate C — Real C2C E2E

**E2E-A: Normal Jev**

Actual Jev `proceed` → verified Receipt → Phase 2 → Phase 3.

**E2E-B: Governance Bootstrap**

Verified Owner approval → valid Bootstrap Authorization → atomic consumption → verified Phase 2 Handoff Proof → Phase 3.

**E2E-C: Bypass Rejection**

Reject forged Jev results, forged Owner approvals, credential replay, scope escalation, and direct Phase 3 submission without a valid Proof.

Use isolated test records and Proposals.

Do not reopen an existing stopped Proposal for testing.

Record actual MCP calls, authorization states, transaction evidence, and results.

A Phase 3 `READY` result alone does not prove Codex execution or persisted Workflow closure.

## 16. Release Criteria

The Bootstrap mechanism may be considered verified only when:

1. Initial trust establishment is independently validated.
2. Owner authentication and user interaction are proven.
3. Authorization scope and identity binding are verified.
4. Single-use cross-process consumption is demonstrated.
5. Transaction and audit durability are demonstrated.
6. Normal Jev E2E succeeds.
7. Bootstrap E2E succeeds.
8. Bypass-rejection E2E succeeds.
9. Automatic expiration and non-reuse are verified.
10. Historical Stop and failed E2E records remain unchanged.

Before all conditions pass:

`IMPLEMENTED_NOT_VERIFIED`

A successful design review alone does not satisfy any runtime verification requirement.

## 17. Implementation Restrictions

The Bootstrap implementation must not:

- Modify Jev model decisions or thresholds
- Fabricate Jev `proceed`
- Introduce a permanent bypass flag
- Create a general parallel Codex execution channel
- Automatically approve future Proposals
- Modify unrelated applications or repositories
- Deploy to production without separate authorization
- Rewrite historical Stop evidence
- Change Phase 4B completion semantics
- Treat a ChatGPT conversation confirmation as privileged authentication

Changes beyond the approved implementation scope require new Owner approval.

## 18. Governance Approval and Activation

Formal approval requires two separate decisions:

**Policy Approval**

Approval of this amendment as a governance rule.

**Execution Approval**

Independent authorization of the exact implementation Proposal through a trusted mechanism.

Policy approval alone does not grant execution permission.

The initial trusted installation procedure must also be independently authorized and verified.

If any of these prerequisites cannot be satisfied, the Bootstrap implementation remains blocked.

No previously stopped Proposal becomes executable merely because this amendment has been approved.

## 19. Confirmed Design Decisions

| Section | Decision |
|---|---|
| 1. Local authorization | A |
| 2. Initial trusted installation | A |
| 3. Owner authentication | B |
| 4. Execution integration | B |
| 5. Transaction persistence | B |
| 6. Security validation and sunset | B |

**Conclusion:** Governance Bootstrap v1 defines a temporary, independently controlled method for establishing trusted C2C authorization infrastructure. It preserves Mandatory Jev Stop integrity, separates installation from execution authorization, requires verifiable Owner approval, and prohibits reusable governance bypasses.

**Current effect:** None. This document is a design and policy proposal until formally approved and supported by a verified trust establishment procedure.