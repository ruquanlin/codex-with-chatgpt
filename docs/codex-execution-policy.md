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

Before a C2C-specific action, verify the connected workspace/connector identity and any C2C-only acceptance gate relevant to that action. Apply the mandatory Jev gate below when its trigger conditions are met.

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

## 2A. Mandatory Jev Decision Gate

Jev is a mandatory pre-Codex decision gate for debugging work that risks
becoming speculative, repetitive, or wasteful.

Do **not** call Jev for ordinary, well-scoped, deterministic tasks.

Jev **must** be called before creating or sending another Codex task when any
of these conditions applies:

- the issue is a difficult or unclear bug;
- the issue is a production/runtime incident;
- at least one diagnosis/investigation round has already completed and another
  diagnosis, repair, or follow-up Codex round is being considered;
- the current investigation is repeating similar checks without materially
  reducing uncertainty.

The `jev_decision_gate` result controls the next step:

- `proceed`: Codex may continue with the proposed task;
- `reframe`: do not send the current task. Narrow or change the task using the
  evidence, then run the gate again before Codex;
- `stop`: do not create another Codex task for the current line of investigation;
- `available: false`: do not silently bypass the gate. Report that Jev is
  unavailable and stop automatic continuation. Proceed without Jev only when
  the user explicitly instructs C2C to bypass the gate.

This rule is mandatory even when another workflow rule would otherwise suggest
continuing diagnosis, escalating model strength, or attempting another fix.

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
