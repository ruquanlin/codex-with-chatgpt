# Workflow v3 Phase 2 — Jev Gate + Execution Brief

## Status

```text
Phase 2 — Jev Gate + Execution Brief
STATUS: DESIGN APPROVED
IMPLEMENTATION: NOT STARTED
```

## 1. Purpose

Phase 2 defines the stable transition from an approved workflow decision to executable work.

It has two responsibilities:

1. decide whether a proposed Codex execution step is allowed to proceed through the Jev Gate when Jev is required;
2. normalize the approved execution intent into an Execution Brief before Phase 3 compiles a Codex prompt.

Phase 2 must not perform diagnosis, design, implementation planning, prompt optimization, model selection, or execution.

---

## 2. Position in Workflow v3

Normal flow:

```text
Workflow Router
→ Diagnosis / Design / Review
→ Grill
→ Execution Proposal
→ Jev Gate when required
→ READY_FOR_EXECUTION
→ Execution Brief
→ Phase 3 Prompt Compiler
→ Model Router
→ Codex
```

For deterministic work where Jev is not required:

```text
Confirmed Decision
→ READY_FOR_EXECUTION
→ Execution Brief
→ Phase 3 Prompt Compiler
```

Every Codex execution prompt must originate from an Execution Brief.

Phase 3 must not reconstruct execution intent directly from raw conversation context.

---

## 3. Jev Gate

### 3.1 Purpose

Jev answers only:

> Is the current execution proposal ready to proceed?

Jev evaluates the specific proposed execution step.

It does not decide whether the overall user task is valid or valuable.

### 3.2 Existing Implementation

The existing Jev adapter and transport remain authoritative for Jev execution.

Phase 2 must reuse the existing Jev implementation rather than create a second Jev mechanism.

The supported decisions remain:

```text
PROCEED
REFRAME
STOP
```

Jev remains fail-closed when required but unavailable.

### 3.3 Mandatory Trigger Conditions

Jev is required when any applicable workflow rule marks the execution proposal as requiring a gate, including:

- production or runtime risk;
- previous execution attempt failed;
- root cause remains materially uncertain;
- a real architecture or scope trade-off remains;
- high blast radius;
- complex high-risk architectural change;
- another Codex round risks becoming speculative or repetitive.

Ordinary deterministic bounded work must not invoke Jev merely for formality.

---

## 4. Execution Proposal State

Before Jev can run, the workflow must have a concrete execution proposal.

```text
DIAGNOSING / DESIGNING / REVIEWING
→ EXECUTION_PROPOSED
```

The proposal must already identify enough confirmed intent for Jev to judge whether that specific next step is justified.

Jev must not be asked to perform the missing diagnosis or design itself.

---

## 5. Jev State Transitions

### 5.1 PROCEED

```text
EXECUTION_PROPOSED
→ Jev(PROCEED)
→ READY_FOR_EXECUTION
→ create Execution Brief
→ Phase 3
```

`PROCEED` authorizes only the proposal that was evaluated.

It is not a general authorization for later changes to scope or execution intent.

### 5.2 REFRAME

```text
EXECUTION_PROPOSED
→ Jev(REFRAME)
→ invalidate current proposal
→ return to relevant decision stage
→ create materially revised proposal
→ run Jev again if still required
```

Relevant return stages may include:

```text
bug
→ systematic-debugging / root-cause framing

architectural work
→ design / implementation framing

review work
→ review interpretation
```

A `REFRAME` result must never be treated as a weak `PROCEED`.

The new proposal must differ materially in evidence, scope, approach, or objective.

Merely rewriting the wording of the same proposal is not sufficient.

### 5.3 STOP

```text
EXECUTION_PROPOSED
→ Jev(STOP)
→ STOPPED
```

When Jev returns `STOP`:

- do not create an Execution Brief;
- do not compile a Codex prompt;
- do not automatically create another Codex task for the same execution line.

`STOP` terminates the current execution line, not necessarily the entire user goal forever.

A new execution line may begin if materially new evidence, a changed goal, or a new approved design appears.

### 5.4 Jev Unavailable

If Jev is mandatory and unavailable:

```text
JEV_REQUIRED
→ available = false
→ BLOCKED
```

The workflow must:

- fail closed;
- not create an Execution Brief;
- not compile a Codex prompt;
- not continue automatically.

Only an explicit user instruction may bypass an unavailable mandatory Jev gate.

---

## 6. Proposal Identity

Every Jev decision applies to one execution proposal identity.

A previous `PROCEED` result must not be reused when the proposal changes materially.

Material changes include:

- goal changes;
- execution scope changes;
- root cause changes;
- approved design changes;
- meaningful changes to the required implementation approach;
- changes that materially alter risk or blast radius.

Such changes create a new gate candidate.

This prevents a previously approved proposal from silently authorizing later scope expansion.

---

## 7. Execution Brief

### 7.1 Purpose

The Execution Brief is the stable interface between ChatGPT workflow decision-making and Phase 3 prompt generation.

It freezes confirmed execution intent before prompt compilation.

It contains only facts and decisions already established upstream.

It must not ask Codex to rediscover known context.

### 7.2 Ownership

Execution Brief ownership belongs exclusively to the ChatGPT workflow layer.

```text
ChatGPT creates and updates the Execution Brief.
Phase 3 consumes it.
Codex consumes the resulting prompt.
```

Codex must not:

- create the Execution Brief;
- modify it;
- expand it;
- reinterpret its scope;
- fill in missing decisions.

If required information is missing, the workflow must return upstream rather than ask Codex to infer it.

---

## 8. Execution Brief Schema

Canonical logical schema:

```text
ExecutionBrief
├─ goal
├─ knownFacts[]
├─ approvedBasis
│  ├─ type: root_cause | approved_design | explicit_instruction
│  └─ summary
├─ scope
│  ├─ inScope[]
│  └─ outOfScope[]
├─ mustChange[]
├─ mustNotChange[]
├─ acceptanceCriteria[]
├─ validationExpectation[]
├─ riskNotes[]
└─ persistence
   ├─ mode: ephemeral | persisted
   └─ reference?: string
```

### 8.1 `goal`

A concise statement of what this execution is expected to accomplish.

The goal describes the current execution, not the entire project.

### 8.2 `knownFacts[]`

Only verified or explicitly established facts.

Must not contain:

- speculation;
- assumptions presented as facts;
- unverified root-cause guesses;
- unnecessary conversation history.

### 8.3 `approvedBasis`

Identifies why implementation is ready.

Allowed types:

```text
root_cause
approved_design
explicit_instruction
```

Examples:

```text
root_cause
→ a debugging workflow established the actual failure mechanism

approved_design
→ an architectural or bounded design was approved

explicit_instruction
→ a deterministic execution request requires no additional design decision
```

The summary must contain only the relevant approved basis.

### 8.4 `scope.inScope[]`

Defines what this execution may change or address.

It must be as narrow as correctness allows.

### 8.5 `scope.outOfScope[]`

Defines adjacent work that must not be included.

Use this field when it materially reduces exploration or scope expansion.

### 8.6 `mustChange[]`

Contains only changes that are required for task completion.

It must not become a generic implementation checklist when no mandatory implementation detail exists.

### 8.7 `mustNotChange[]`

Captures specific protected behavior, files, interfaces, or logic when touching them would create unnecessary risk or violate the approved scope.

### 8.8 `acceptanceCriteria[]`

Defines the observable conditions under which this execution is considered correct.

Acceptance criteria must be task-specific.

### 8.9 `validationExpectation[]`

Defines focused validation appropriate to the current task.

It must not automatically request:

- full test suites;
- full builds;
- full lint runs;
- broad audits;
- unrelated browser checks;
- unrelated E2E validation.

Broader validation is included only when the task genuinely requires it.

### 8.10 `riskNotes[]`

Contains only risks that materially affect execution behavior.

Do not use this field for general background information.

### 8.11 `persistence`

Defines whether the brief exists only in workflow runtime state or is persisted for recovery.

---

## 9. Information Explicitly Excluded from the Execution Brief

The Execution Brief must not contain:

```text
model selection
Codex prompt wording
full investigation history
raw logs
WDR routing rationale
full implementation narrative
completion-report format
unrelated project context
speculative improvements
```

Ownership remains separated:

```text
Workflow Router / WDR
→ routing decision and reason

Diagnosis / Design / Plan
→ reasoning and approved solution

Execution Brief
→ frozen execution intent

Phase 3 Prompt Compiler
→ shortest sufficient execution prompt

Model Router
→ execution model

Codex
→ implementation

Completion / Review layer
→ execution result and acceptance
```

---

## 10. Hybrid Persistence Model

### 10.1 Default

Execution Briefs are ephemeral by default.

```text
EPHEMERAL
```

Ordinary bounded deterministic work must not create repository artifacts simply because an Execution Brief exists logically.

### 10.2 Persisted Briefs

Upgrade to:

```text
PERSISTED
```

when reliable recovery is required.

Persistence applies when one or more of the following is true:

- Persistence Gate = `PERSIST`;
- task is Architectural;
- task risk is HIGH;
- Jev is required or the task is a Jev candidate;
- a previous execution attempt failed;
- execution continues across sessions;
- an implementation plan is involved;
- a worktree or feature branch is involved;
- the Brief must survive a failure loop or context loss.

### 10.3 Persistence Location

Persisted Execution Briefs live under:

```text
docs/workflow/execution-briefs/
```

Filename format:

```text
YYYY-MM-DD-<short-task-slug>.md
```

Example:

```text
docs/workflow/execution-briefs/2026-10-16-worker-1102.md
```

### 10.4 Update Semantics

The same execution line should update its existing persisted Brief rather than creating unnecessary new files.

A new Execution Brief identity is required when the execution line changes materially, including changes to:

- root cause;
- approved design;
- goal;
- scope;
- required implementation approach.

---

## 11. Relationship to WDR

WDR and Execution Brief are intentionally separate.

```text
WDR
→ Why was this task routed through this workflow path?

Execution Brief
→ What exactly is approved for execution now?
```

A WDR must not contain the full Execution Brief.

An Execution Brief must not duplicate the routing rationale stored in a WDR.

Both artifacts are owned by the ChatGPT workflow layer.

---

## 12. Relationship to Specs and Plans

```text
Spec
→ what should be designed and why

Implementation Plan
→ how the approved design should be implemented

Execution Brief
→ the normalized, current execution intent handed to Phase 3
```

An Execution Brief may consume confirmed conclusions from a spec or plan but must not copy them wholesale.

Only execution-relevant facts and constraints belong in the Brief.

---

## 13. Phase 3 Boundary

Phase 3 receives an approved Execution Brief.

The Prompt Compiler may:

- compress it;
- remove redundant wording;
- convert it into concise Markdown;
- preserve necessary task-specific constraints;
- produce the shortest sufficient execution prompt.

The Prompt Compiler must not:

- change the goal;
- expand scope;
- invent implementation requirements;
- choose a different root cause;
- redesign the solution;
- add speculative cleanup;
- request broader validation without justification;
- rediscover context already represented by the Brief.

If the Brief is insufficient, Phase 3 must reject it back to Phase 2 or the relevant upstream decision stage.

It must not compensate by making assumptions.

---

## 14. Failure Loop Integration

A failed execution does not automatically enlarge the previous prompt.

Required flow:

```text
Execution failure
→ collect new evidence
→ re-enter appropriate workflow stage
→ update diagnosis / design
→ create new execution proposal
→ re-run Jev if required
→ create new or updated Execution Brief
→ Phase 3 compiles a new narrow prompt
```

A failed execution invalidates assumptions that depended on the failed execution line.

The previous Brief may remain as historical context but must not automatically authorize another attempt.

---

## 15. State Model

Canonical Phase 2 state flow:

```text
ROUTED
→ DIAGNOSING / DESIGNING / REVIEWING
→ EXECUTION_PROPOSED
→ JEV_REQUIRED?
    ├─ no
    │    → READY_FOR_EXECUTION
    │
    └─ yes
         ├─ PROCEED
         │    → READY_FOR_EXECUTION
         │
         ├─ REFRAME
         │    → proposal invalidated
         │    → previous decision stage
         │
         ├─ STOP
         │    → STOPPED
         │
         └─ unavailable
              → BLOCKED

READY_FOR_EXECUTION
→ create Execution Brief
→ Phase 3 Prompt Compiler
```

---

## 16. Non-Goals

Phase 2 does not:

- redesign the existing Jev transport;
- create another Jev implementation;
- replace systematic debugging;
- replace brainstorming or design;
- replace implementation planning;
- choose the Codex model;
- generate the final Codex prompt;
- execute source-code changes;
- review the resulting diff;
- replace user acceptance;
- make Jev mandatory for every task;
- persist every ordinary Execution Brief;
- turn WDRs into general workflow logs.

---

## 17. Acceptance Criteria

Phase 2 is complete only when all of the following are true:

1. the existing Jev mechanism remains the single Jev execution path;
2. mandatory Jev conditions are enforced before applicable Codex execution;
3. ordinary deterministic work can bypass Jev without bypassing Execution Brief creation;
4. `PROCEED`, `REFRAME`, `STOP`, and Jev-unavailable have explicit workflow transitions;
5. mandatory Jev unavailable fails closed;
6. Jev approval is bound to a specific execution proposal identity;
7. material proposal changes invalidate prior approval;
8. every Codex execution prompt originates from an Execution Brief;
9. Execution Brief has a stable schema;
10. Execution Brief contains only confirmed execution-relevant facts and decisions;
11. Codex cannot author or modify an Execution Brief;
12. Phase 3 cannot expand or reinterpret Execution Brief scope;
13. ordinary Briefs remain ephemeral;
14. persistent/high-risk/cross-session Briefs can be materialized under `docs/workflow/execution-briefs/`;
15. WDR and Execution Brief responsibilities remain separate;
16. failure creates a new decision cycle rather than a larger retry prompt;
17. no Phase 2 behavior redefines Phase 1 Router authority or Phase 3 Prompt Compiler responsibilities.

---

## 18. Implementation Boundary

Phase 2 implementation should be narrowly limited to the mechanics necessary to represent and enforce:

- Jev trigger integration;
- proposal/result state transitions;
- Execution Brief schema and lifecycle;
- hybrid persistence;
- the handoff contract to Phase 3.

Do not implement Phase 3 Prompt Compiler or Model Router as part of Phase 2.

Do not broaden the work into unrelated C2C refactoring.

---

## 19. Phase Status After Implementation

When implementation and focused validation are complete:

```text
Phase 2 — Jev Gate + Execution Brief
STATUS: COMPLETE
```

The next phase becomes:

```text
Phase 3 — Prompt Compiler + Model Router
```
