# Codex Execution Policy

This document defines the default execution policy for **all tasks performed by Codex** in the C2C workflow.

It applies to:

- bug fixes;
- feature implementation;
- UI/UX changes;
- refactoring;
- documentation changes;
- test work;
- DevOps and deployment work;
- infrastructure and tooling;
- C2C / bridge / connector work;
- repository maintenance;
- any other task where Codex is asked to execute changes or commands.

The primary goals are:

1. reliable task completion;
2. minimal unnecessary model usage;
3. minimal unnecessary repository reads;
4. minimal unnecessary validation cost;
5. controlled scope;
6. clear escalation only when evidence requires it.

---

## 1. Global Principle

For every Codex-executed task:

> Use the lowest-cost approach that can reliably complete the current task or phase.

Optimize for **total task cost**, not the nominal cost of a single model call.

A cheaper model is not cheaper overall if it causes repeated failed attempts, broad re-reading, unnecessary validation, or repeated rewrites.

---

## 2. Scope Before Execution

Before Codex starts substantial work, the task should be reduced to the smallest useful scope.

Codex should identify:

- the concrete goal;
- the relevant subsystem;
- likely files or runtime boundaries;
- the minimum validation needed;
- whether the task requires diagnosis first;
- whether E2E verification is actually necessary.

Avoid broad instructions such as:

- inspect the entire repository;
- fix everything related to this;
- run all possible tests;
- refactor while fixing;
- optimize unrelated code at the same time.

Prefer narrow, explicit tasks with clear success criteria.

---

## 3. Model Selection

Use the most economical model that can reliably perform the current phase.

### Default

Use a lightweight model for:

- focused code inspection;
- narrow bug diagnosis;
- localized implementation;
- mechanical changes;
- targeted tests;
- documentation;
- simple refactors;
- deterministic repository tasks.

### Escalate only when needed

Use a stronger model when:

- the root cause remains unclear after focused diagnosis;
- multiple subsystems interact in a non-obvious way;
- the lighter model repeatedly proposes speculative fixes;
- the lighter model has already failed or backtracked more than once;
- the task requires significant architectural reasoning;
- correctness risk is high;
- subtle concurrency, state, protocol, security, or migration behavior is involved.

Do not upgrade the model preemptively without evidence.

Do not keep using a lightweight model indefinitely when it is clearly causing repeated retries.

---

## 4. Separate Diagnosis From Implementation

For non-trivial bugs or unclear failures:

1. diagnose first;
2. confirm the failure boundary;
3. then implement.

The diagnosis phase should normally:

- avoid source-code changes;
- avoid full-suite validation;
- inspect only relevant files, logs, environment, state, and runtime information;
- determine the smallest likely repair scope.

Do not make speculative code changes merely to test guesses when cheaper direct inspection can resolve the question.

For detailed debugging behavior, follow:

`docs/efficient-debugging-workflow.md`

---

## 5. Prefer Targeted Repository Inspection

Codex should minimize repository-wide reads.

Prefer:

- exact file reads;
- narrow searches;
- known call chains;
- targeted diffs;
- relevant configuration files;
- relevant tests.

Avoid repeatedly:

- scanning the entire repository;
- reading unrelated large files;
- reopening files that have not changed;
- re-deriving context already established in the same task.

Use existing task context whenever it remains valid.

---

## 6. Minimal Change Principle

Codex should make the smallest change that satisfies the task.

Default rules:

- do not refactor unrelated code;
- do not rename unrelated APIs;
- do not change formatting across unrelated files;
- do not introduce new abstractions unless they reduce real complexity;
- do not expand the task without evidence;
- preserve backward compatibility unless explicitly told otherwise.

If a broader refactor would be beneficial but is not required, report it separately instead of including it automatically.

---

## 7. Validation Strategy

Validation should grow in breadth only as the task approaches completion.

### During implementation

Prefer:

- targeted unit tests;
- targeted integration tests;
- changed-file lint;
- targeted typecheck;
- narrow command verification.

### Near completion

Run broader validation only after targeted validation and review succeed.

Possible final validation:

- full test suite;
- full build;
- full lint;
- full typecheck;
- `git diff --check`;
- project-specific validation.

Do not repeatedly run expensive full validation after every small edit.

---

## 8. E2E Verification

E2E verification is required when correctness depends on real runtime integration.

Typical examples:

- bridge / connector behavior;
- authentication;
- state persistence;
- process startup;
- autostart;
- deployment;
- networking;
- external APIs;
- browser behavior;
- background workers;
- end-user flows;
- multi-process state.

For isolated local code changes, E2E may not be necessary.

When E2E is required, run it **after** the implementation is stable and broad validation has passed.

The E2E check must verify behavior from the consumer side whenever possible.

---

## 9. Avoid Repeated Full-Suite Runs

Full validation is expensive.

Default policy:

- targeted tests during diagnosis and implementation;
- one broad validation pass near completion;
- rerun broad validation only when subsequent changes could realistically invalidate it.

Do not run the full suite just because a task contains the word "fix".

---

## 10. Execution Reports

Codex reports should be concise and useful.

A normal completion report should include:

- what changed;
- root cause or rationale when relevant;
- files changed;
- targeted validation performed;
- final validation performed;
- E2E result when applicable;
- remaining known limitations;
- whether commit/push was performed.

Avoid long restatements of the original prompt.

Avoid dumping full command logs unless specifically needed.

---

## 11. Do Not Commit or Push Prematurely

Unless explicitly requested otherwise:

Do not commit or push until:

- implementation is complete;
- relevant targeted tests pass;
- review is complete;
- required broad validation passes;
- required E2E passes.

Before commit:

- inspect `git status`;
- exclude unrelated changes;
- exclude unknown untracked files;
- exclude temporary diagnostics;
- confirm the intended diff.

---

## 12. Existing Unrelated Changes

If the working tree already contains unrelated modifications:

- do not overwrite them;
- do not include them in the task automatically;
- do not clean them up without explicit reason;
- clearly distinguish task changes from pre-existing changes.

When validation fails because of unrelated existing issues, report that fact and keep the task scope narrow.

---

## 13. Stop Conditions

Codex should stop and report rather than continue consuming resources when:

- the task is blocked by missing credentials or external access;
- required information cannot be obtained safely;
- repeated attempts are not reducing uncertainty;
- a stronger model is clearly required;
- the requested change would require a materially broader redesign than originally scoped.

At that point, report the exact blocker and the next most efficient step.

---

## 14. Escalation Policy

Escalation must be evidence-based.

A reasonable escalation sequence is:

1. lightweight model + narrow inspection;
2. lightweight model + targeted implementation;
3. stronger model only if diagnosis or implementation is still uncertain;
4. broader validation only after the implementation stabilizes;
5. E2E only when runtime behavior requires it.

Do not escalate model strength and validation breadth at the same time unless necessary.

---

## 15. Task-Type Defaults

### Bug Fix

Use:

- diagnosis first;
- minimal fix;
- targeted regression test;
- review;
- final broad validation;
- E2E only when runtime integration is involved.

### New Feature

Use:

- define acceptance criteria;
- identify smallest architecture change;
- implement incrementally;
- targeted tests;
- review;
- broad validation near completion;
- user-flow E2E if appropriate.

### UI / UX Change

Use:

- inspect affected components only;
- avoid unrelated redesign;
- targeted UI behavior checks;
- build/lint near completion;
- real browser verification when meaningful.

### Documentation

Use:

- direct edit;
- no unnecessary test suite;
- validate links/format only when relevant.

### Refactor

Use:

- prove behavior before changing structure;
- preserve external behavior;
- targeted tests before and after;
- avoid bundling feature changes.

### Infrastructure / C2C / DevOps

Use:

- diagnosis first;
- inspect process/environment/state boundaries;
- minimal implementation;
- targeted tests;
- broad validation;
- real E2E is usually required.

---

## 16. Default Instruction for All Codex Tasks

Unless the user explicitly requests a different process, Codex should follow this rule:

> Keep the task narrowly scoped.  
> Use the lowest-cost model that can reliably complete the current phase.  
> Diagnose before changing code when the cause is uncertain.  
> Prefer targeted inspection and targeted validation.  
> Make the smallest necessary change.  
> Run broad validation only near completion.  
> Perform E2E only when real runtime behavior requires it.  
> Escalate model strength only when evidence shows the current model is insufficient.  
> Do not commit or push before required validation succeeds.

---

## 17. Relationship to Other C2C Documentation

This policy applies globally to all Codex execution.

For debugging-specific details, also follow:

`docs/efficient-debugging-workflow.md`

If the two documents overlap:

- this file defines the global execution policy;
- `efficient-debugging-workflow.md` defines the detailed debugging sequence.

Both should remain aligned with `skill/SKILL.md`.
