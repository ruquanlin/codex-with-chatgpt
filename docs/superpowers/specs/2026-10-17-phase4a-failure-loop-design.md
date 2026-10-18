# Workflow v3 Phase 4A — Failure Loop Design

**Date:** 2026-10-17  
**Status:** Draft for user review  
**Phase:** 4A  
**Scope:** Failure Loop only

---

## 1. Purpose

Phase 4A closes the missing feedback loop in Workflow v3.

Its purpose is not to retry a failed Codex prompt. Its purpose is to terminate a failed execution line, preserve the evidence needed to reason about that failure, and require any further code change to begin a new decision cycle.

Core rule:

```text
failed execution line
→ immutable failure record
→ new decision required
→ router / diagnosis / Grill / Jev when required
→ new execution proposal identity
→ new Execution Brief
→ new Phase 3 package
```

Forbidden:

```text
failure
→ enlarge old prompt
→ rerun old execution line
```

---

## 2. Architectural Position

```text
Phase 1 Router
      ↓
Phase 2 Proposal + Jev + Execution Brief
      ↓
Phase 3 Compiler + Model Router + Validation Router
      ↓
Execution
      ↓
Review
      ↓
Acceptance when required
      ↓
Phase 4A
      ├─ success → completion path
      └─ failure → Failure Record → NEW_DECISION_REQUIRED → Phase 1 Router
```

Phase 4A is not a second router and not a debugging engine.

It only:
- terminates the failed execution line;
- classifies the failure;
- records evidence;
- invalidates the failed line for further execution;
- declares the next route;
- requires a new execution line for any subsequent modification.

---

## 3. Failure Boundary

The entire execution cycle must pass:

```text
Execution Brief
→ implementation
→ focused validation
→ ChatGPT review
→ required acceptance
```

Failure includes:
- implementation / execution failure;
- validation failure;
- review failure;
- required production, real-device, interaction, deployment, visual, or user acceptance failure.

If any required stage fails, the current execution line cannot continue.

---

## 4. Execution-Line State Model

Normal success:

```text
ACTIVE_EXECUTION
        ↓
REVIEW_PENDING
        ↓
acceptance required?
   ↓ yes       ↓ no
ACCEPTANCE_PENDING   COMPLETED
   ↓
COMPLETED
```

Failure:

```text
ACTIVE_EXECUTION
REVIEW_PENDING
ACCEPTANCE_PENDING
        ↓
      FAILED
```

`COMPLETED` is terminal success.

`FAILED` is the only persisted terminal failure state for that execution line.

`NEW_DECISION_REQUIRED` is an emitted workflow outcome, not another persisted state. It requires a new decision cycle and a new execution line.

Forbidden:

```text
FAILED → ACTIVE_EXECUTION
```

Required:

```text
executionLine A: FAILED
        ↓
NEW_DECISION_REQUIRED
        ↓
new decision cycle
        ↓
executionLine B: ACTIVE_EXECUTION
```

---

## 5. Failure Types

```ts
type FailureType =
  | "EXECUTION_FAILURE"
  | "VALIDATION_FAILURE"
  | "REVIEW_FAILURE"
  | "ACCEPTANCE_FAILURE";
```

`EXECUTION_FAILURE` covers implementation, required command, or runtime failure.

`VALIDATION_FAILURE` covers either:
- validation proving incorrect behavior; or
- the validation strategy itself being insufficient.

`REVIEW_FAILURE` covers scope excess, unrelated changes, boundary violations, missing required validation, or implementation that no longer matches the approved execution boundary.

`ACCEPTANCE_FAILURE` covers required production, real-device, responsive, interaction, visual, deployment, or user acceptance that does not pass.

---

## 6. Next Routes

```ts
type FailureNextRoute =
  | "SYSTEMATIC_DEBUGGING"
  | "VALIDATION_REROUTE"
  | "ROUTER_REGRILL"
  | "ROUTER_RECLASSIFY";
```

Mapping:

| Failure type | Next route | Rule |
|---|---|---|
| `EXECUTION_FAILURE` | `SYSTEMATIC_DEBUGGING` | Re-establish the root cause from new evidence |
| `VALIDATION_FAILURE` | `SYSTEMATIC_DEBUGGING` | Validation proves actual incorrect behavior |
| `VALIDATION_FAILURE` | `VALIDATION_REROUTE` | The validation strategy itself is insufficient |
| `REVIEW_FAILURE` | `ROUTER_REGRILL` | Re-establish the acceptable execution boundary |
| `ACCEPTANCE_FAILURE` | `ROUTER_RECLASSIFY` | Reclassify from the acceptance evidence |

The detecting validation/review layer must explicitly supply the `VALIDATION_FAILURE` route, based on its assessment of whether validation exposed incorrect behavior or an insufficient validation strategy. Phase 4A only validates the supplied failure type / route pair. It does not infer the route from raw command output, select a root cause, or repair a missing decision.

Phase 4A declares the route but does not execute debugging, Grill, Jev, Phase 2, or Phase 3.

---

## 7. Failure Record

Every failed execution line produces one immutable canonical Failure Record.

```ts
interface FailureRecord {
  failureId: string;
  executionLineId: string;
  proposalIdentity: string;

  failureType: FailureType;
  failedAtStage:
    | "EXECUTION"
    | "VALIDATION"
    | "REVIEW"
    | "ACCEPTANCE";

  summary: string;
  evidence: string[];

  nextRoute: FailureNextRoute;
  createdAt: string;
}
```

The record describes only the failed execution line.

It must not contain the next cycle's:
- new root cause;
- new scope;
- new `mustChange`;
- new implementation design;
- new Execution Brief;
- new prompt.

---

## 8. Failure Identity and Idempotency

`failureId` makes failure recording immutable and idempotent.

```text
same canonical failure event
→ same failureId
→ no duplicate canonical record
```

The implementation may use a deterministic stable hash of the canonical identity-bearing fields.

Exact serialization is an implementation detail, provided it is deterministic and focused tests cover it.

---

## 9. Execution Identity Invalidation

Phase 4A reuses existing Phase 2 identity semantics.

Before failure:

```text
executionLineId A
→ proposal.identity A
→ Execution Brief A
→ Phase 3 package A
```

After failure, line A is historical only.

Any later modification must use:

```text
executionLineId B
→ proposal.identity B
→ Execution Brief B
→ Phase 3 package B
```

Even if the user goal is unchanged, `executionLineId A` must not be reused.

Because Phase 2 proposal identity includes `executionLineId`, a new line naturally receives a new proposal identity and an old identity-bound Jev result cannot authorize it.

---

## 10. Invalidated vs Retained Information

After `FAILED`, these are historical only:
- old Execution Brief;
- old Phase 3 compiled prompt;
- old model recommendation;
- old validation plan;
- old identity-bound Jev result.

There must be no retry or resume API for those artifacts.

The next cycle may retain as evidence:
- original user goal;
- still-applicable explicit user constraints;
- verified facts;
- execution output;
- failed validation output;
- diff observations;
- production or real-device evidence;
- previous root-cause theory as a hypothesis;
- the Failure Record itself.

Rule:

```text
observed evidence may survive
approved execution authority does not
```

---

## 11. Persistence

Failure Records are persistent by default, but canonical storage is C2C workflow state, not the project repository.

Storage must be:
- machine-readable;
- append-only;
- workspace-scoped;
- idempotent by `failureId`;
- queryable by later routing logic;
- independent of a git commit.

Phase 4A must not automatically create failure Markdown files in the repository.

When the existing Workflow v3 Persistence Gate requires durable project history, relevant failure evidence may be incorporated into an existing WDR or another already-approved persisted artifact.

Phase 4A must not create a second repository persistence policy.

---

## 12. Relationship to Existing Execution Records

Existing Codex `ExecutionRecord` and Phase 4A `FailureRecord` stay separate.

`ExecutionRecord` answers:
- what Codex ran;
- what files changed;
- what command / validation result was recorded.

`FailureRecord` answers:
- why the whole workflow execution line is no longer valid;
- what evidence caused that decision;
- where workflow control must return next.

Do not overload the existing execution-record schema with workflow-level failure semantics.

---

## 13. Relationship to Existing Router Rules

The existing Router already treats `prior_attempt_failed` as significant for visibility, persistence, and risk-aware handling.

Phase 4A therefore does not duplicate those rules.

It makes the prior failure available as canonical evidence so the Router can apply its existing policy in the new decision cycle.

---

## 14. Failure Detection and Ownership

The layer that detects failure supplies explicit failure information.

Examples:
- execution layer supplies execution failure;
- validation/review supplies validation or review failure;
- acceptance handling supplies acceptance failure.

Phase 4A validates and records the transition.

For `VALIDATION_FAILURE`, the detecting layer supplies either `SYSTEMATIC_DEBUGGING` (observed incorrect behavior) or `VALIDATION_REROUTE` (insufficient validation strategy). A missing or ambiguous route is rejected rather than inferred.

It must not scrape arbitrary command output, infer a next route, or independently invent a new root cause.

---

## 15. Fail-Closed Rules

A canonical failure requires:
- non-empty `executionLineId`;
- non-empty `proposalIdentity`;
- supported `failureType`;
- supported `failedAtStage`;
- non-empty summary;
- at least one evidence item;
- compatible `nextRoute`;
- valid or canonically generated timestamp.

Invalid combinations create no canonical record.

Examples:

```text
EXECUTION_FAILURE + VALIDATION_REROUTE
REVIEW_FAILURE + SYSTEMATIC_DEBUGGING
missing executionLineId
missing evidence
```

---

## 16. Public Workflow Surface

Phase 4A should expose only enough surface to:
1. create / validate a failure transition;
2. persist the canonical Failure Record;
3. query the current workspace's latest N Failure Records (with a bounded N), or records matching one exact `executionLineId`.

Do not add arbitrary filtering, full-text search, date-range queries, route-based queries, or a generic failure database API.

It must not expose a general-purpose orchestration API.

Core boundary:

```text
record failure ≠ execute next route
```

Exact MCP tool names belong in the implementation plan.

---

## 17. Scope Boundaries

### In scope

- failure-domain types;
- failure-stage representation;
- deterministic next-route contract;
- failed-line terminal semantics;
- new-decision-cycle requirement;
- Failure Record schema;
- `failureId` idempotency;
- local C2C-state persistence;
- query support required by later routing;
- minimal MCP integration;
- focused tests.

### Out of scope

- implementing systematic-debugging itself;
- changing Jev logic;
- changing Phase 2 proposal identity semantics;
- changing Execution Brief semantics;
- changing Phase 3 compilation;
- redesigning model or validation routing;
- Project Profiles;
- full Completion Routing;
- automatic WDR generation;
- broad execution-record refactoring;
- generic workflow orchestration;
- unrelated repository cleanup.

---

## 18. Implementation Constraints

1. No old-line retry path.
2. Any later modification requires a new `executionLineId` and new proposal identity.
3. Old identity-bound Jev authorization does not carry over.
4. Prior evidence may carry forward; prior executable decisions do not.
5. Phase 4A records and routes failure; it does not diagnose.
6. Phase 4A does not recompile Phase 3.
7. Canonical Failure Records default to C2C state, not repo files.
8. Existing Codex `ExecutionRecord` remains separate.
9. Phase 4B / 4C must not be implemented speculatively.

---

## 19. Focused Validation Requirements

Implementation validation should prove:
1. each supported failure type accepts its valid next route;
2. invalid failure-type / route combinations fail closed;
3. a failed line cannot transition back to active execution;
4. duplicate recording of the same canonical failure is idempotent;
5. a distinct later execution line remains distinct even when the goal is unchanged;
6. old proposal identity / Jev binding is not reused for the new line;
7. validation failure uses the explicit upstream route; missing or invalid routes fail closed without inference;
8. `FAILED` is persisted but `NEW_DECISION_REQUIRED` remains an emitted outcome only;
9. only current-workspace latest-N and exact-`executionLineId` queries are supported, with workspace isolation and bounded N;
10. existing execution-record behavior remains unchanged;
11. existing Phase 2 / 3 focused boundary tests stay green if touched.

Do not require a full repository test suite without a concrete cross-cutting reason.

Browser validation is not required.

---

## 20. Acceptance Criteria

Phase 4A is complete when:
- a failed execution cycle is terminal for that execution line;
- one canonical immutable Failure Record is created;
- the record contains identity, type, stage, summary, evidence, route, and timestamp;
- duplicate recording is idempotent;
- further modification cannot reuse failed executable artifacts;
- continuation requires a new execution line and new Phase 2 identity;
- execution, validation, review, and acceptance failures are representable;
- next-route mapping follows this design;
- failure history persists in C2C state without automatically dirtying the repo;
- the existing Router can consume prior-failure evidence without Phase 4A duplicating Router policy;
- no Project Profile or broader Completion Routing functionality is introduced.

---

## 21. Non-Goals

Phase 4A does not:
- maximize autonomous retries;
- make Codex self-correct indefinitely;
- preserve and mutate a failed prompt until it passes;
- turn every validation failure into systematic-debugging;
- automatically treat acceptance mismatch as a code bug;
- replace ChatGPT review;
- replace user acceptance;
- centralize Workflow v3 orchestration.

Its narrow purpose is:

> Failure ends the current execution authority. Evidence survives. Any further modification begins from a new decision.

---

## 22. Handoff

After this design is approved, create a focused implementation plan covering only:
- failure-domain types and validation;
- state persistence / query support;
- minimal MCP surface;
- focused tests and boundary integration.

Do not expand the implementation plan into Phase 4B Completion Routing or Phase 4C Project Profiles.
