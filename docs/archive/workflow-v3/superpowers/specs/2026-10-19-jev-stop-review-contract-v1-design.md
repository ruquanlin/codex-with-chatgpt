# Workflow v3 — Jev Stop Review Contract v1

**Status:** Formal Spec Draft — Design A Confirmed  
**Date:** 2026-10-19  
**Target:** `codex-with-chatgpt`  
**Dependency:** Jev Preflight Contract v2 — Gate 0 Revised Spec

## 1. Objective

Provide a bounded, evidence-based review of existing Jev `stop` decisions without changing their enforcement status.

Stop Review is an **observability and governance mechanism**, not an execution authorization mechanism.

A successful review must never independently enable Codex execution, Phase 2 readiness, or Phase 3 compilation.

## 2. Authority and Invariants

The following invariants are mandatory:

1. The original Jev `stop` remains binding.
2. Stop Review cannot issue `proceed`, authorization receipts, or exemption attestations.
3. Review outcomes cannot transition Phase 2 into `READY_FOR_EXECUTION`.
4. No review can modify, delete, expire, or supersede an existing Stop marker.
5. Missing evidence must never be interpreted as proof that Stop is invalid.
6. Repeated reviews cannot change execution eligibility.
7. Review records are evidence only and must not be accepted as authorization by downstream tools.

The Global Prompt Generation Contract remains authoritative for generic execution decisions. Mandatory Jev rules remain binding.

## 3. Review Eligibility

A review is eligible only when:

- A specific Jev `stop` decision is identified.
- A concrete review question exists.
- The request is explicitly authorized by the user.
- Review can proceed without resubmitting the stopped task to Jev.

Low confidence or close decision probabilities may justify examining the evidence, but do not establish that a Stop was incorrect.

If the original Stop cannot be authenticated, the review may document the available historical information but must mark its provenance as unverified.

## 4. Review Identity

Each review must refer to:

- `workspaceId`
- `executionLineId`, if verifiably known
- `proposalIdentity`, if available
- Original Stop record identifier, if available
- Original decision timestamp, if verified
- Material evidence digest, if available
- Review request identifier

Unverified identifiers must not be represented as authenticated facts.

A review cannot create missing historical Jev evidence retroactively.

## 5. Permitted Operations

Stop Review may:

1. Read existing Jev decision evidence.
2. Inspect relevant C2C execution metadata.
3. Compare the original task and the proposed follow-up.
4. Identify missing, stale, contradictory, or incomplete evidence.
5. Assess whether an execution-line identity ambiguity exists.
6. Produce a non-authorizing review result.
7. Record review metadata in a separately controlled audit store.

Audit recording may append review metadata but must not mutate Jev decisions, Stop markers, authorization records, or repository source files.

## 6. Review Outcomes

Only three outcomes are permitted.

### STOP_UPHELD

Available evidence supports maintaining the original Stop, or no substantiated problem was found.

### REVIEW_FINDING

A specific potential defect, inconsistency, or provenance problem was identified.

This finding may justify a separately authorized governance or engineering proposal, but does not permit continuation of the stopped execution line.

### INSUFFICIENT_EVIDENCE

The available records do not permit a reliable conclusion.

The original Stop remains binding.

No `REVIEW_APPROVED`, `OVERRIDE`, `PROCEED`, or `READY` result is permitted in v1.

## 7. Audit Contract

The review record must include:

- Unique review ID
- Referenced Stop identity and provenance status
- Workspace identity
- Verified review inputs and source references
- Missing evidence
- Review outcome
- Concise reasoning
- Review timestamp
- Explicit `authorizationGranted: false`

Review records must be append-only and stored separately from execution authorization.

Duplicate submissions for the same review identity must be idempotent.

Audit persistence failures must be reported as incomplete review recording, not as a successful audited review.

No full private conversation transcripts are required.

## 8. Enforcement Isolation

Stop Review must not modify:

- Jev scoring, model, or thresholds
- `jev_decision_gate` decision semantics
- Existing Stop marker enforcement
- Phase 2 authorization logic
- Phase 3 execution authorization
- Receipt or exemption issuance
- Phase 4 completion routing
- Historical E2E results

No downstream authorization verifier may consume review outcomes as positive execution evidence.

A review finding must not automatically create a new execution line.

## 9. Initial Implementation Boundaries

The initial implementation should be limited to:

- One read-only review evaluator
- Minimal audit record schema and append-only persistence
- Focused validation of non-authorizing behavior
- An optional read-only MCP review endpoint

Do not introduce:

- A Stop override endpoint
- A new Jev decision model
- A conversation-history service
- A separate external database
- A review-driven execution continuation route

Existing trusted local-state infrastructure may be reused only where appropriate.

If the available storage or identity evidence cannot support a trustworthy audit record, report the limitation instead of inventing provenance.

## 10. Acceptance Criteria

The implementation must demonstrate:

1. Reviewing a real Stop never changes its original decision.
2. Any review outcome leaves Phase 2 execution eligibility unchanged.
3. A review record cannot be supplied as an authorization receipt.
4. Missing Stop provenance produces an explicitly unverified result.
5. Changing only the execution-line identifier does not establish an unrelated investigation.
6. Duplicate review requests do not produce inconsistent audit records.
7. Audit write failure cannot be reported as successful persistence.
8. Existing Phase 2, Phase 3, and Jev authorization behavior remains unchanged.
9. Previously stopped tasks remain stopped after every review outcome.
10. No historical Stop or E2E result is rewritten.

Validation should use focused unit and integration tests only.

## 11. Relationship to Jev Preflight v2

Stop Review v1 is independent of the approved Gate 0 implementation tasks.

It does not unblock the current Jev Preflight v2 implementation.

Any future ability to override Stop requires a separate governance contract, explicit approval, and implementation of an independently verified authorization boundary.

Until then, Stop Review is strictly non-authorizing.

## 12. Release Gate

Stop Review v1 may be declared implemented only after:

- Focused tests pass.
- Audit records are verifiably isolated from authorization.
- A real stopped case is reviewed without changing execution eligibility.
- No existing Stop is reclassified or cleared.

A successful review is not evidence that a stopped Codex task may resume.