# Phase 1 — Workflow Router

> Final Phase 1 specification for Workflow v3.
>
> Status: **COMPLETE — E2E verified**

---

## 1. Purpose

Workflow Router is the mandatory entry point for software-development work.

It is a thin ChatGPT-side orchestration layer that decides which workflow path a task should enter before any Codex execution begins.

Core boundary:

```text
ChatGPT decides.
Codex executes.
User accepts.
```

The Router does not replace downstream process skills and does not implement product code.

---

## 2. Responsibilities

Workflow Router is responsible for:

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

It does not:

- modify product code;
- directly execute Codex work;
- run Jev;
- create an Execution Brief;
- compile Codex prompts;
- select execution models;
- choose validation commands;
- implement the Failure Loop;
- parse completion reports.

---

## 3. Routing Priority

When multiple routes appear plausible, use this priority:

| Priority | Task Type | Primary Process Skill |
|---:|---|---|
| 1 | BUG / FAILURE | `systematic-debugging` |
| 2 | REVIEW FEEDBACK | `receiving-code-review` |
| 3 | APPROVED SPEC / PLAN REQUEST | `writing-plans` |
| 4 | ARCHITECTURAL CHANGE | `brainstorming` |
| 5 | BOUNDED FEATURE / CHANGE | `brainstorming` |
| 6 | SPIKE | `brainstorming` |

Routing is based on actual user intent and current task state, not keyword matching.

---

## 4. Bug One-Way Escalation

Every bug begins with diagnosis:

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

After escalation:

```yaml
downgrade_allowed: false
```

Once a bug has been proven architectural, it must not silently return to a bounded patch path for convenience.

---

## 5. Domain Skill Routing

Primary process skill is chosen first. Domain skills are additive.

### UI / Visual / Interaction

```text
brainstorming
+
frontend-design
```

`frontend-design` does not replace `brainstorming`.

### Visual critique

Use Impeccable after a concrete visual direction exists.

Impeccable is advisory only and its findings do not automatically expand scope.

### Capability gaps

Use `find-skills` only when a genuine capability gap exists.

Do not invoke it by default.

### React / Next.js execution

`vercel-react-best-practices` belongs to the Codex execution side when relevant.

It is not a Phase 1 process skill.

### TDD

TDD belongs to the Codex execution side for logic, behavior, regression, and bugfix work where appropriate.

Do not manufacture unnecessary test infrastructure for pure CSS, copy, spacing, or trivial visual-only changes.

### Completion verification

`verification-before-completion` is a Codex completion gate, not a Router responsibility.

---

## 6. Risk Gate

Risk has two levels:

```text
NORMAL
HIGH
```

Set:

```yaml
risk: HIGH
```

when any of the following is true:

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

---

## 7. Visibility Gate

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
- previous execution attempt failed;
- real scope / architecture trade-off;
- bug escalated to Architectural.

Routine bounded routing should remain invisible to the user.

Explicit notices should remain brief.

---

## 8. Routing Record

Every routed task produces an internal Routing Record.

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

The Routing Record is internal workflow state and is not a user-facing report.

---

## 9. Persistence Gate

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
- cross-session work;
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

## 10. WDR Relationship

Persistent workflow decisions are materialized as Workflow Decision Records under:

```text
docs/workflow/decisions/
```

WDR ownership belongs to the ChatGPT workflow layer.

Codex may consume routing decisions but does not create, modify, or reinterpret WDRs.

WDRs remain thin and must not contain full diagnosis, design, implementation plan, Codex prompt, test logs, or long completion reports.

---

## 11. Auto-Trigger / Workflow Discovery

Workflow Router must be discovered automatically for software-development work.

Expected behavior:

```text
ANY software-development task
↓
Workflow Router
↓
correct downstream process skill
```

The user should not need to say:

```text
Use Workflow Router.
```

The Router must act as the default entry point before downstream planning, debugging, review handling, or implementation planning.

---

## 12. Acceptance Criteria

Phase 1 is considered successful only when all of the following are true:

1. normal bounded tasks route silently;
2. bugs route to `systematic-debugging` before fix proposals;
3. review feedback routes to `receiving-code-review`;
4. approved specs route directly to `writing-plans`;
5. visual work may add `frontend-design` without replacing the process skill;
6. high-risk work becomes explicit;
7. architectural escalation is one-way;
8. ordinary bounded tasks do not create unnecessary WDRs;
9. high-risk / architectural / persistent tasks create WDRs when materialization is possible;
10. WDR ownership remains with ChatGPT;
11. Workflow Router auto-trigger / workflow discovery works without explicit user invocation.

---

## 13. Final Status

```text
Phase 1 — Workflow Router
STATUS: COMPLETE
```

Verified outcomes:

- Router implemented;
- routing priority implemented;
- Bug one-way escalation implemented;
- Risk Gate implemented;
- Visibility Gate implemented;
- Persistence Gate implemented;
- Routing Record schema implemented;
- WDR rules implemented;
- workflow discovery fixed;
- auto-trigger behavior fixed;
- E2E routing behavior verified.

Phase 1 is closed.

The next phase is:

```text
Phase 2 — Jev Gate + Execution Brief
```
