# Workflow v3 — Master Architecture

> Canonical source of truth for the C2C development workflow.
>
> This document defines the target workflow architecture.
> Phase-specific specs may refine it, but must not silently contradict it.

---

## 1. Core Principle

The workflow is built around one responsibility split:

```text
ChatGPT decides.
Codex executes.
User accepts.
```

### ChatGPT is responsible for

- understanding the user's real intent;
- classifying the task;
- selecting the correct process skill;
- diagnosing bugs before proposing fixes;
- designing new behavior before implementation;
- controlling scope;
- deciding whether Jev is required;
- producing the Execution Brief;
- compiling the Codex execution prompt;
- recommending the lowest-cost reliable model;
- selecting the appropriate validation strategy;
- reviewing Codex output before user acceptance;
- maintaining workflow state and WDRs when persistence is required.

### Codex is responsible for

- modifying code within the approved scope;
- using execution-side skills when relevant;
- running focused validation;
- using TDD for logic / behavior / bugfix work where appropriate;
- verifying before claiming completion;
- returning a Minimal Completion Report.

### The user is responsible for

- final visual acceptance;
- real-device acceptance;
- production acceptance;
- deciding whether to commit, push, merge, deploy, or stop.

---

## 2. Target End-to-End Workflow

```text
User Request
    ↓
Workflow Router
    ↓
Task Classification
    ↓
Primary Process Skill
    ↓
Diagnosis / Design
    ↓
Grill
    ↓
Jev Gate (conditional)
    ↓
Execution Brief
    ↓
Prompt Compiler
    ↓
Model Router
    ↓
Codex Execution
    ↓
Validation Router
    ↓
verification-before-completion
    ↓
Minimal Completion Report
    ↓
ChatGPT Review
    ↓
User Acceptance
    ↓
CLOSED
```

If execution fails:

```text
Failure
↓
Collect New Evidence
↓
systematic-debugging
↓
Re-route
↓
Re-Grill
↓
Re-run Jev if required
↓
New Execution Brief
↓
New Narrow Prompt
↓
Re-execute
```

The workflow must never respond to repeated failure by continuously enlarging the old execution prompt.

---

# 3. Phase 1 — Workflow Router

## 3.1 Purpose

Workflow Router is the mandatory entry point for software-development work.

It is a thin orchestration layer.

It does not replace the downstream process skills and does not implement product code.

Its responsibilities are:

```text
Understand intent
↓
Classify task
↓
Select primary process skill
↓
Classify risk
↓
Decide visibility
↓
Decide persistence
↓
Produce Routing Record
↓
Optionally materialize WDR
```

## 3.2 Routing Priority

When more than one category appears applicable, use this priority:

| Priority | Task Type | Primary Process Skill |
|---:|---|---|
| 1 | BUG / FAILURE | `systematic-debugging` |
| 2 | REVIEW FEEDBACK | `receiving-code-review` |
| 3 | APPROVED SPEC / PLAN REQUEST | `writing-plans` |
| 4 | ARCHITECTURAL CHANGE | `brainstorming` |
| 5 | BOUNDED FEATURE / CHANGE | `brainstorming` |
| 6 | SPIKE | `brainstorming` |

Routing is based on actual intent and current task state, not keyword matching.

## 3.3 Bug One-Way Escalation

Every bug starts with diagnosis:

```text
BUG / FAILURE
↓
systematic-debugging
↓
root cause investigation
```

If the root cause is local:

```text
→ BOUNDED_FIX
```

If the root cause requires changing subsystem boundaries, core interfaces, core data flow, or major responsibility boundaries:

```text
→ ARCHITECTURAL_UPGRADE
→ stop bounded patching
→ brainstorming
```

After architectural escalation:

```yaml
downgrade_allowed: false
```

The workflow must not silently downgrade back to a bounded patch for convenience.

---

# 4. Domain Skill Routing

Primary process skill is chosen first. Domain skills are additive.

## UI / Visual / Interaction work

```text
brainstorming
+
frontend-design
```

`frontend-design` does not replace `brainstorming`.

## Visual critique

Use Impeccable after a concrete visual direction exists.

Impeccable is advisory only.

Its findings do not automatically expand scope.

## Capability gaps

Use `find-skills` only when a real capability gap exists.

Do not invoke it by default.

## React / Next.js implementation

`vercel-react-best-practices` belongs to the Codex execution side when relevant.

It is not a ChatGPT Phase 1 process skill.

## TDD

Use TDD on the Codex side for logic, behavior, regression, and bugfix work where it materially improves correctness.

Do not manufacture unnecessary test infrastructure for pure CSS, copy, spacing, or trivial visual-only changes.

## Completion verification

`verification-before-completion` is a Codex completion gate, not a Router responsibility.

---

# 5. Risk Router

Risk has two levels:

```text
NORMAL
HIGH
```

Set:

```yaml
risk: HIGH
```

when any of the following applies:

- production/runtime failure;
- security/auth/access boundary;
- data-integrity risk;
- high blast radius;
- previous execution attempt failed;
- root cause remains uncertain while execution is being requested;
- irreversible or external side effect is involved.

Important:

```text
Architectural != automatically HIGH
```

An architectural change can still be normal risk.

---

# 6. Visibility Gate

Default:

```yaml
visibility: SILENT
```

Use:

```yaml
visibility: EXPLICIT
```

when any of the following applies:

- Architectural task;
- HIGH risk;
- previous attempt failed;
- real scope / architecture trade-off;
- bug escalated to Architectural.

Routine bounded routing should remain invisible to the user.

Explicit routing notices should remain brief.

Example:

> This is a recurring high-risk production failure. I will re-establish the root cause before any execution step.

---

# 7. Routing Record

Every task receives an internal Routing Record.

Example:

```yaml
workflow_version: "3"

task_id: null

task_type: BUG
path: BOUNDED
risk: HIGH

process_skill: systematic-debugging
domain_skills: []

visibility: EXPLICIT

prior_attempt_failed: true
production_dependency: true
cross_session: false

architectural_upgrade: false
downgrade_allowed: true

jev_candidate: true

persistence: PERSIST

goal: "Diagnose recurring Worker 1102 failures."

upgrade_condition:
  "If root cause requires changing subsystem boundaries or core data flow, upgrade to Architectural and stop bounded patching."

status: ROUTED
```

The Routing Record is internal workflow state.

It is not a user-facing report.

---

# 8. Persistence Gate

Default:

```text
EPHEMERAL
```

Use:

```text
PERSIST
```

if any of the following is true:

- Architectural;
- HIGH risk;
- Jev candidate or required;
- previous execution attempt failed;
- cross-session;
- implementation plan involved;
- worktree or feature branch involved.

Equivalent rule:

```text
PERSIST =
    architectural
 OR risk == HIGH
 OR jev_candidate
 OR prior_attempt_failed
 OR cross_session
 OR plan_involved
 OR isolated_execution
```

---

# 9. WDR — Workflow Decision Record

Persistent workflow decisions are stored under:

```text
docs/workflow/decisions/
```

Filename format:

```text
YYYY-MM-DD-<short-task-slug>.md
```

Example:

```text
docs/workflow/decisions/2026-10-15-worker-1102.md
```

## 9.1 Purpose

A WDR answers only:

> Why was this task sent through this workflow path?

It should remain thin.

A WDR must not contain:

- full root-cause investigation;
- full design;
- implementation plan;
- Codex prompt;
- test logs;
- long completion report.

## 9.2 Ownership

WDR creation and updates belong to the ChatGPT workflow layer.

Codex may consume the routing decision but does not author, modify, or reinterpret the WDR.

## 9.3 Lifecycle

Normal flow:

```text
ROUTED
→ DIAGNOSING / DESIGNING
→ READY_FOR_EXECUTION
→ EXECUTING
→ ACCEPTANCE
→ CLOSED
```

Failure:

```text
EXECUTING
→ FAILED
→ RE-ROUTED
```

Architectural escalation:

```text
DIAGNOSING
→ ARCHITECTURAL_UPGRADE
→ DESIGNING
```

## 9.4 Git behavior

Creating or updating a WDR does not automatically commit it.

Normal sequence:

```text
create/update WDR
→ execute
→ user acceptance
→ decide whether WDR ships with the code change
```

If work is abandoned, the WDR may be marked:

```text
STOPPED
```

or removed during cleanup.

---

# 10. Phase 2 — Jev Gate

## 10.1 Purpose

Jev is a pre-Codex execution gate.

It does not replace diagnosis, design, Grill, or planning.

It answers only:

> Is the current execution proposal ready to proceed?

## 10.2 Mandatory Trigger Conditions

Jev is required when any of the following applies:

- production/runtime risk;
- previous execution attempt failed;
- root cause remains uncertain;
- real architecture / scope trade-off exists;
- high blast radius;
- complex high-risk architectural change.

## 10.3 Output

Jev may return only:

```text
PROCEED
REFRAME
STOP
```

## 10.4 Non-responsibilities

Jev does not:

- brainstorm;
- debug;
- design;
- write implementation plans;
- write Codex prompts;
- review diffs;
- replace user acceptance.

---

# 11. Execution Brief

The workflow must not jump directly from diagnosis/design to Codex prompt generation.

First create a standard Execution Brief.

The Execution Brief is the stable interface between ChatGPT decision-making and Codex execution.

Recommended fields:

```text
Goal
Known Facts
Root Cause / Approved Design
Scope
Must Change
Must Not Change
Acceptance Criteria
Validation Expectation
Risk Notes
```

The Execution Brief must contain only confirmed decisions and known facts.

It must not ask Codex to rediscover already-established context.

---

# 12. Phase 3 — Prompt Compiler

The Prompt Compiler converts the approved Execution Brief into the shortest sufficient Codex execution prompt.

## 12.1 Prompt principles

The execution prompt should:

- be narrow;
- state the actual task goal;
- preserve scope boundaries;
- include only relevant must-not-change constraints;
- reuse known facts;
- request focused validation;
- avoid unrelated cleanup;
- avoid scope expansion;
- avoid redundant policy text;
- avoid repeating repo rules Codex already has.

## 12.2 Preferred structure

Use only as much structure as needed:

```text
Task
Scope
Boundaries
Validate
```

Do not add headings when a shorter prompt is clearer.

---

# 13. Model Router

After Prompt Compiler, recommend the lowest-cost reliable model for the exact execution task.

Principle:

```text
lowest-cost reliable model
```

Examples:

- simple CSS / copy / bounded visual edit
  - lower-cost capable model;
- complex runtime bug
  - stronger reasoning model;
- architecture-heavy implementation
  - stronger reasoning model;
- high-risk final review
  - high-capability model.

The workflow should not default to the most expensive model when a cheaper reliable model is sufficient.

---

# 14. Validation Router

Validation is selected by task type.

The workflow must not default to full tests, full builds, or browser automation.

## Pure CSS / copy

```text
static check
+
focused visual acceptance
```

## Logic bug

```text
focused regression test
```

## Parser / API handling

```text
targeted parser / unit / integration test
```

## React behavior

```text
focused unit / integration test
```

## 3D / drag / touch / scroll / responsive interaction

```text
browser / real interaction validation
```

## Production runtime bug

```text
local focused validation
+
production telemetry
```

Browser default:

```text
OFF
```

Use browser interaction only when the acceptance criterion genuinely requires interaction, rendering, motion, drag, scroll, touch, responsive behavior, iframe behavior, or similar visual/runtime evidence.

---

# 15. Codex Execution Contract

Codex must not redefine the task.

It receives an approved execution boundary.

Codex responsibilities:

```text
implement
↓
run focused validation
↓
verification-before-completion
↓
Minimal Completion Report
```

Default Minimal Completion Report:

```text
Changed:
- ...

Validation:
- ...

Blocking issue:
- none
```

Avoid long execution narratives unless a blocking issue requires explanation.

---

# 16. ChatGPT Review

Codex completion is not final acceptance.

After Codex reports completion:

```text
Codex Completion
↓
ChatGPT Review
↓
Scope Check
↓
Validation Check
↓
Risk Check
↓
Optional Grill
↓
User Acceptance
```

ChatGPT checks:

- whether scope was exceeded;
- whether unrelated changes were introduced;
- whether validation matches the task;
- whether new risk appeared;
- whether another decision cycle is required;
- whether real-device or production acceptance is needed.

---

# 17. User Acceptance

Final acceptance belongs to the user.

Especially for:

- visual quality;
- responsive behavior;
- touch interaction;
- 3D interaction;
- iframe behavior;
- production behavior;
- deployment correctness;
- real-device behavior.

ChatGPT and Codex may support acceptance, but neither replaces it.

---

# 18. Phase 4 — Failure Loop

The workflow must never respond to failure by simply enlarging the old prompt.

Forbidden pattern:

```text
failure
→ add more instructions
→ failure
→ add even more instructions
```

Required pattern:

```text
Execution failed
↓
STOP
↓
Collect new evidence
↓
systematic-debugging
↓
Update root cause
↓
Re-route
↓
Re-Grill
↓
Re-run Jev if required
↓
New Execution Brief
↓
New Narrow Prompt
```

Every failed execution creates a new decision cycle.

---

# 19. Project Profiles

High-frequency projects may have stable Project Profiles.

Initial candidates:

```text
Pendlio
Portfolio
C2C
```

A Project Profile may contain:

- framework;
- repository conventions;
- deployment path;
- known test commands;
- production characteristics;
- browser policy;
- common validation strategy;
- known runtime constraints;
- common execution boundaries.

Project Profiles provide stable context only.

They do not make workflow decisions.

---

# 20. Ideal User Experience

The user should be able to say:

```text
Pendlio 又出现 1102 了。
```

and the workflow should automatically resolve into:

```text
Workflow Router
→ BUG
→ HIGH
→ previous attempt failed
→ systematic-debugging
→ PERSIST WDR

Diagnosis
→ root cause

Grill
→ Jev REQUIRED

Jev
→ PROCEED

Execution Brief
→ Prompt Compiler
→ Model Router

Codex
→ minimal fix
→ focused validation
→ verification-before-completion

ChatGPT
→ review

User
→ production acceptance
```

The user should no longer need to repeatedly say:

```text
先 Grill
跑 Jev
调用 debugging
不要改太多
给我 Prompt
不要浏览器
记得 focused test
```

These should be handled automatically by the workflow.

---

# 21. Phase Status

| Phase | Scope | Status |
|---|---|---|
| Phase 1 | Workflow Router, Skill Routing, Risk, Visibility, Persistence, Routing Record, WDR, auto-trigger / discovery | COMPLETE — E2E verified |
| Phase 2 | Jev Gate + Execution Brief | NEXT |
| Phase 3 | Prompt Compiler + Model Router + Validation Router | NOT STARTED |
| Phase 4 | Failure Loop + Project Profiles + Completion Routing | NOT STARTED |

Phase 1 completion includes:

- Workflow Router implemented;
- workflow discovery fixed;
- auto-trigger behavior fixed;
- E2E routing behavior verified.

---

# 22. Canonical Repository Location

This document should live at:

```text
docs/workflow/WORKFLOW_V3_MASTER_ARCHITECTURE.md
```

Recommended surrounding structure:

```text
docs/workflow/
├── WORKFLOW_V3_MASTER_ARCHITECTURE.md
├── decisions/
│   └── ... WDR files
└── phases/
    ├── phase-1-router.md
    ├── phase-2-jev-execution-brief.md
    ├── phase-3-prompt-model-validation.md
    └── phase-4-failure-profiles-completion.md
```

Phase-specific specs may refine the Master Architecture.

They must not silently contradict it.

If the architecture itself changes, update this document first, then update the affected Phase spec and implementation.

---

# 23. Completion Definition for Workflow v3

Workflow v3 is complete only when all of the following are true:

1. every software-development request enters through Workflow Router;
2. task classification reliably selects the correct process skill;
3. bug diagnosis occurs before fix proposals;
4. architectural escalation is one-way;
5. high-risk work becomes explicit;
6. persistence decisions are consistent;
7. WDRs are created only when useful;
8. Jev is mechanically triggered by defined conditions;
9. Execution Brief is the stable interface before Codex execution;
10. Codex prompts are compiled from approved briefs;
11. model selection uses the lowest-cost reliable option;
12. validation is routed by task type;
13. Codex cannot claim completion without fresh verification;
14. failure creates a new decision cycle;
15. Project Profiles reduce rediscovery without taking over routing;
16. ChatGPT reviews Codex completion before user acceptance;
17. user acceptance remains the final authority for visual, real-device, and production behavior.

---

# 24. Design Goal

Workflow v3 is not intended to add bureaucracy.

Its purpose is:

```text
Make the correct workflow happen automatically,
while reducing repeated explanation,
repeated discovery,
scope drift,
incorrect execution,
and unnecessary model / tool cost.
```
