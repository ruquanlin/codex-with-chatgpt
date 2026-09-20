# Efficient Debugging Workflow

This document defines the default debugging and implementation workflow for C2C / Codex development tasks.

The goal is to reduce unnecessary model usage, avoid repeated full-suite validation, and make debugging more reliable by separating diagnosis, implementation, review, and end-to-end verification.

## Core Principle

**Diagnose first. Fix second. Validate progressively. Run full validation and E2E only near the end.**

Do not combine investigation, broad code changes, full test suites, and end-to-end verification into a single Codex task unless the task is trivially small.

The default workflow is:

1. Diagnosis
2. Minimal Fix
3. Review
4. Full Validation
5. End-to-End Verification
6. Commit / Push

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

## Phase 4 — Full Validation

Run broad validation only after the implementation has passed targeted tests and review.

Depending on the repository, this may include:

- full test suite;
- build;
- lint;
- typecheck;
- `git diff --check`;
- other project-specific validation.

Avoid repeating full validation after every small edit.

If a full-suite failure is unrelated to the change, report it clearly instead of expanding the task automatically.

---

## Phase 5 — End-to-End Verification

For infrastructure, protocol, bridge, connector, persistence, authentication, deployment, or runtime problems, unit tests are not sufficient.

Perform one real end-to-end verification after the implementation and full validation are stable.

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
- full validation passes or remaining unrelated failures are understood;
- required E2E verification passes.

Before committing:

- inspect `git status`;
- exclude unrelated or pre-existing untracked files;
- confirm no temporary diagnostics or local artifacts are included.

---

## Model / Usage Strategy

Use the most economical model that can reliably perform the current phase.

Default strategy:

- Use a lightweight model for narrow diagnosis, targeted implementation, and mechanical test work.
- Escalate to a stronger model only when:
  - the root cause remains unclear after focused diagnosis;
  - multiple subsystems interact in a way the lighter model cannot resolve;
  - the model repeatedly produces speculative or inconsistent fixes;
  - a high-risk architectural decision requires deeper reasoning.

A cheaper model is not necessarily cheaper overall if it causes repeated broad retries.

Optimize for **total task usage**, not just cost per single model call.

---

## Command / Test Efficiency Rules

Prefer:

- targeted file inspection;
- targeted search;
- targeted test files;
- targeted lint/typecheck where supported;
- one final full-suite run;
- one final E2E run.

Avoid:

- repeatedly running the full suite during diagnosis;
- repeatedly rebuilding the entire project after every tiny edit;
- asking Codex to re-read the entire repository;
- combining investigation, implementation, full validation, and E2E into one large task by default;
- rerunning expensive validation when no relevant code changed.

---

## Exception: Trivially Small Tasks

A task may skip the full staged workflow only when it is genuinely small and low-risk, for example:

- typo correction;
- documentation-only wording change;
- one obvious localized change with no runtime impact;
- deterministic formatting change.

Even then:

- keep the scope minimal;
- run the smallest relevant validation;
- do not perform unnecessary full-suite validation.

When uncertain, use the staged workflow.

---

## Default C2C Instruction

For non-trivial debugging tasks, Codex should assume:

> Diagnose first without changing code.  
> Once the root cause is confirmed, make the smallest fix and run targeted tests.  
> Review the diff before running the full suite.  
> Run full validation only near completion.  
> Perform real E2E verification last when runtime behavior is involved.  
> Commit or push only after E2E passes.

This workflow is the default unless the user explicitly requests a different process.
