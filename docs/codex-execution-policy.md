# Codex Execution Policy

This document defines **C2C-specific** execution policy for work performed through the C2C workflow.

The active global workflow is authoritative for generic coding-workflow decisions, including execution ownership, task scope, model selection, validation breadth, prompt generation, escalation, and generic completion reporting.

C2C is additive: it may impose connector-, protocol-, recording-, handoff-, or Jev-specific constraints, but it must not redefine those generic decisions.

---

## 1. Authority Boundary

If a C2C rule overlaps with an active global workflow rule, the active global workflow governs. C2C only adds C2C-specific mechanics.

Execution ownership is not decided by this policy. When the active global workflow selects direct execution, available connector tools may be used under C2C safety constraints. When it selects Codex delegation, the delegated C2C protocol applies.

Direct execution does not imply permission to modify source code. C2C mutation
tools such as `apply_patch` may only be used when the active global workflow
confirms explicit user authorization for direct workspace mutation. Selecting
direct execution is not itself direct-write authorization. This authorization
does not bypass workspace identity or connector safety checks.

## 1A. C2C Preflight Additions

Before a C2C-specific action, verify the connected workspace/connector identity and any C2C-only acceptance gate relevant to that action. Jev is optional advisory input only when the user explicitly requests consultation; it is not part of ordinary development, debugging, or approved fixes.

Generic scope, cost, model, validation, and prompt-generation preflight rules come from the active global workflow, not from this document.

---

## 2. Global Execution-Record Invariant

Every C2C-managed Codex task has a mandatory execution-record invariant:
execution reporting and finalization are part of the C2C execution contract,
not optional wording that each individual task prompt must repeat.

This invariant applies to every C2C-managed iteration, including
diagnosis-only, implementation, review, documentation, validation-only,
no-change, and `changedFiles=0` tasks. A C2C-managed iteration must not be
considered complete until the matching `(taskId, iteration)` execution
metadata is successfully persisted through the existing `c2c record` or
`c2c exec` path.

If persistence fails, the iteration is an infrastructure/toolchain failure,
not a completed task. Duplicate finalization for the same task and iteration
remains idempotent, and persisted metadata remains readable through
`execution_summary` / `test_status`; command output remains the separate
`execution_output` path when applicable.

## 2A. Optional Jev Advisory

Jev may be consulted only when the user explicitly requests it. Difficult or
unclear bugs, production incidents, follow-up work, and repeated investigation
do not by themselves require a Jev call. Use deterministic Preflight and the
existing workspace, identity, historical Stop, failure, authorization, and
handoff-proof checks for execution readiness.

The `jev_decision_gate` response is advisory. `proceed`, `reframe`, and `stop`
are not execution authorization, do not issue a Jev Receipt, and cannot create
a new Stop Marker. Jev unavailability alone does not block a task that passes
the applicable deterministic checks.

Existing historical Stop Markers continue to block their affected execution
lines under the original checks. Preflight is not proof that the user approved
an external or high-impact action; deployment, deletion, production changes,
and other external side effects still require the applicable user approval.

---

## 3. Generic Workflow Authority

Scope, model selection, change size, validation breadth, prompt generation, escalation, and generic completion reporting are governed by the active global workflow. C2C does not restate or override those rules.

`docs/efficient-debugging-workflow.md` may add C2C-specific debugging mechanics, but it is subject to the same authority boundary.

---

## 4. C2C Runtime Verification

C2C may require consumer-visible runtime verification when the changed behavior is itself a C2C mechanism, such as bridge/connector integration, execution-record visibility, checkpoint/finalization behavior, or another protocol invariant that cannot be proven from static artifacts alone.

Whether any broader validation is required remains a decision for the active global workflow and the task acceptance criteria.

When a C2C-specific runtime check is required, verify it from the consumer side where possible and preserve the normal execution-record/finalization semantics.

---

## 5. Relationship to Other C2C Documentation

This policy is additive to the active global workflow; it is not a second global workflow.

For C2C-specific debugging mechanics, also follow `docs/efficient-debugging-workflow.md`.

`skill/SKILL.md` and `docs/protocol.md` define C2C connector/session mechanics and delegated-execution protocol. None of these documents may redefine generic workflow decisions owned by the active global workflow.
