# Workflow Decision Records

This directory stores **Workflow Decision Records (WDRs)** for Workflow v3.

WDRs are created only when the Persistence Gate decides that a workflow decision is valuable enough to survive context loss.

---

## When to create a WDR

Default:

```text
EPHEMERAL
```

Create a WDR only when one or more of the following applies:

- Architectural task;
- HIGH risk;
- Jev candidate or required;
- previous execution attempt failed;
- cross-session work;
- implementation plan involved;
- worktree or feature branch involved.

---

## Location

WDRs live in:

```text
docs/workflow/decisions/
```

---

## Filename

Use:

```text
YYYY-MM-DD-<short-task-slug>.md
```

Example:

```text
2026-10-15-worker-1102.md
```

---

## What a WDR records

A WDR should remain thin.

It may record:

- workflow version;
- task type;
- path;
- risk;
- selected process skill;
- relevant domain skills;
- visibility;
- persistence reason;
- prior-attempt state;
- architectural-upgrade state;
- Jev candidate state;
- goal;
- upgrade condition;
- workflow status.

A WDR answers only:

> Why was this task sent through this workflow path?

---

## What a WDR must not contain

Do not put these into WDR files:

- full root-cause investigation;
- full design;
- implementation plan;
- Codex execution prompt;
- test logs;
- long completion reports;
- unrelated project documentation.

Those belong in their own artifacts.

---

## Ownership

WDR ownership belongs to the ChatGPT workflow layer.

```text
ChatGPT decides.
Codex executes.
User accepts.
```

Codex may read a WDR when needed, but must not:

- create it;
- modify it;
- reinterpret the routing decision.

If ChatGPT cannot materialize a WDR because project write access is unavailable, the Routing Record may remain in workflow state until it can be persisted.

Do not delegate WDR authorship to Codex.

---

## Lifecycle

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

If work is intentionally abandoned:

```text
STOPPED
```

---

## Git behavior

Creating or updating a WDR does not automatically commit it.

Normal sequence:

```text
create/update WDR
→ execute task
→ user acceptance
→ decide whether WDR ships with the code change
```

A WDR may be removed during cleanup if the work is abandoned and no persistent record is useful.

---

## Relationship to the Master Architecture

The canonical workflow architecture is:

```text
docs/workflow/WORKFLOW_V3_MASTER_ARCHITECTURE.md
```

WDRs record individual workflow decisions.

They do not redefine Workflow v3.
