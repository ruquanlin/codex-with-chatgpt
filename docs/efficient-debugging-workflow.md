# Efficient Debugging Workflow

This document defines C2C-specific debugging mechanics. The active global workflow remains authoritative for generic scope, execution ownership, model selection, validation breadth, prompt generation, and escalation.

These rules are additive: they preserve C2C-specific decision gates and runtime verification requirements without creating a second global debugging workflow.

## Core Principle

**Use the active global workflow for generic debugging strategy; apply the C2C-specific gates and protocol requirements below when their conditions are met.**

The phase names below describe C2C debugging checkpoints. They do not independently require Codex delegation or broaden validation beyond what the active global workflow and acceptance criteria require.

The default workflow is:

1. Diagnosis
2. Minimal Fix
3. Review
4. Required Validation
5. End-to-End Verification
6. Commit / Push

### Optional Jev advice

Consult `jev_decision_gate` only when the user explicitly asks for Jev advice.
Debugging difficulty, production context, follow-up work, and repeated checks
do not automatically require Jev. Use deterministic Preflight and existing
authorization, historical Stop, failure, and Handoff Proof checks to decide
whether execution is ready.

Jev output is advisory only:

- `proceed`, `reframe`, and `stop` do not authorize execution or create a Jev
  Receipt or Stop Marker;
- Jev being unavailable does not independently block an otherwise authorized
  task;
- historical Stop Markers continue to block affected execution lines;
- deployment, deletion, production changes, and other external side effects
  still require the applicable user approval.

Ordinary well-scoped deterministic tasks do not require Jev.

---

## Phase 1 — Diagnosis Only

The first task should identify the root cause without modifying code.

Default rules:

- Do not edit source files.
- Do not run the full test suite.
- Do not run full build/lint unless directly required to diagnose the issue.
- Inspect only the files, logs, runtime state, environment variables, processes, and configuration paths needed for the problem.
- Prefer targeted commands and narrow searches.
- Explicitly identify the suspected failure boundary.

The diagnosis should report:

- observed behavior;
- expected behavior;
- exact failing layer or boundary;
- relevant files/processes/state paths;
- likely root cause;
- smallest reasonable repair scope;
- targeted tests that should be added or run after the fix.

If the root cause is still uncertain, remain in the diagnosis phase. Do not begin speculative implementation.

### Example

For a state-directory mismatch, diagnosis should first determine:

- where the CLI writes state;
- where the bridge reads state;
- which executable launched the bridge;
- which environment variables each process uses;
- whether multiple installations or state roots exist.

Only after those facts are known should a fix be attempted.

---

## Phase 2 — Minimal Fix

Once the root cause is sufficiently clear, implement the smallest repair that addresses it.

Default rules:

- Modify only files directly related to the diagnosed problem.
- Avoid opportunistic refactors.
- Preserve backward compatibility unless the task explicitly requires a breaking change.
- Add regression tests for the confirmed failure mode.
- Prefer targeted tests over the entire suite.
- Do not commit or push yet.

The implementation report should include:

- root cause addressed;
- files changed;
- behavior before vs. after;
- regression tests added;
- targeted test results;
- any remaining uncertainty.

---

## Phase 3 — Review

Before broad validation, independently review the implementation.

Review should check:

- whether the fix actually matches the diagnosed root cause;
- whether unrelated behavior changed;
- whether error paths are handled;
- whether retries or resumed sessions behave correctly;
- whether state transitions remain valid;
- whether duplicate records/actions can occur;
- whether backward compatibility is preserved;
- whether the new tests meaningfully cover the original failure.

Use git diff and targeted code inspection.

Do not run the full test suite merely as a substitute for reasoning about the diff.

If review finds a problem, return to Phase 2 with another minimal fix.

---

## Phase 4 — Required Validation

Run only the validation required by the active global workflow and the task acceptance criteria.

This checkpoint does not independently require a full test suite, full build, full lint, full typecheck, or other broad validation. C2C-specific validation may still be required when a C2C invariant cannot otherwise be proven.

If required validation exposes an unrelated failure, report it without expanding the task automatically.

---

## Phase 5 — End-to-End Verification

For infrastructure, protocol, bridge, connector, persistence, authentication, deployment, or runtime problems, unit tests are not sufficient.

Perform real end-to-end verification when a C2C-specific runtime invariant requires consumer-visible proof. The active global workflow decides whether any additional E2E is warranted.

The E2E test should:

- use the actual runtime path;
- use the actual bridge/daemon/autostart path when relevant;
- produce a fresh identifiable task/request;
- verify the result from the consumer side, not only the writer side;
- check timestamps / IDs to prove fresh data is visible;
- verify no duplicate side effects occur.

For C2C execution-record changes, for example:

1. Create a fresh C2C task ID.
2. Run one harmless validation command.
3. Finalize the iteration normally.
4. Confirm `execution_summary` sees the new record from ChatGPT.
5. Confirm `execution_output` sees the matching output when applicable.
6. Confirm retries/finalization do not create duplicate records.

Do not consider the issue fully resolved until the real consumer can observe the expected result.

---

## Phase 6 — Commit / Push

Commit and push only after:

- diagnosis is understood;
- minimal fix is complete;
- targeted tests pass;
- review passes;
- required validation passes or remaining unrelated failures are understood;
- required E2E verification passes.

Before committing:

- inspect `git status`;
- exclude unrelated or pre-existing untracked files;
- confirm no temporary diagnostics or local artifacts are included.

---

## Global Workflow Delegation

Generic repository-inspection strategy, command/test efficiency, small-task exceptions, validation breadth, model choice, and commit/push sequencing come from the active global workflow.

This document adds only C2C-specific debugging gates and runtime/protocol verification requirements.
