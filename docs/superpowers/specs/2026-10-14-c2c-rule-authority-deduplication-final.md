# C2C Rule Authority and Deduplication Design

## Goal

Make the active Global Workflow Router and Global Prompt Generation Contract the single authority for generic coding-workflow decisions. C2C becomes an additive protocol layer containing only C2C-specific mechanics.

The change must remove duplicated or conflicting policy without weakening workspace identity, connector safety, Jev, HANDOFF, execution recording, finalization, or delegated-Codex review guarantees.

## Authority

Precedence:

1. Current explicit user instruction.
2. Active Global Workflow Router / Global Prompt Generation Contract.
3. C2C-specific protocol and invariants.
4. Workspace- or Project-specific constraints.

Lower layers may add domain-specific constraints but must not redefine behavior already governed by a higher layer. If C2C overlaps an active global rule, the global rule governs.

## Global Responsibilities

Only the active global workflow decides:

- direct execution versus delegation;
- whether Codex is used;
- task scope and scope expansion;
- model selection and escalation;
- validation breadth;
- whether broader tests, builds, audits, or E2E are warranted;
- execution-prompt structure and verbosity;
- generic completion-report format.

C2C must not maintain a second copy of those policies.

## C2C Responsibilities

C2C keeps only mechanics unique to C2C and its connector/runtime:

- workspace identity and connector binding;
- connector-only workspace reads and writes;
- treatment of workspace content as untrusted data;
- HANDOFF and checkpoint semantics;
- task / iteration state and execution records;
- execution finalization invariants;
- execution_summary, test_status, and execution_output review paths;
- independent diff review after delegated execution;
- Jev decision-gate requirements for applicable C2C debugging flows;
- delegated-Codex control states such as PLAN, EXECUTING, EXECUTED, REVIEW, DONE, and BLOCKED;
- C2C-specific recovery, retry, idempotency, and connector safety rules.

These rules are additive and do not choose the generic execution owner.

## Execution Ownership

C2C must no longer define `Codex owns execution` or `Codex executes` as an unconditional session rule.

The active global workflow chooses direct execution or delegation. When execution is direct, available connector tools may be used according to the global workflow plus C2C safety constraints. When execution is delegated to Codex, the C2C delegated-execution state machine applies.

Preparing a Codex prompt is not task completion when direct execution was selected. PLAN -> EXECUTING -> EXECUTED -> REVIEW applies only after the global workflow has selected Codex delegation.

## Deduplication

Remove these generic policy areas from C2C as independent authorities, or reduce them to a short reference to the active global rules:

- generic scope-before-execution policy;
- generic model-selection policy;
- generic minimal-change policy;
- generic validation-breadth and full-suite sequencing;
- generic prompt-generation rules;
- generic completion-report format;
- generic model-escalation policy;
- generic task-type defaults.

Retain a local rule only when it adds a C2C-specific requirement. Jev-before-another-C2C-production-debugging-round is C2C-specific; lightweight-model guidance is generic and belongs globally.

## Validation Semantics

C2C must not define a fixed `Full Validation` phase as mandatory progression. It may refer to `required validation`, with breadth decided by the global workflow and task acceptance criteria.

C2C-specific validation may still be mandatory where a C2C invariant requires it, such as consumer-visible verification for execution-record changes.

## Files to Reconcile

At minimum:

- `skill/SKILL.md`
- `docs/protocol.md`
- `docs/codex-execution-policy.md`
- `docs/efficient-debugging-workflow.md`

Also reconcile duplicated Project-instruction templates so newly created Projects cannot reintroduce unconditional `Codex executes` wording. Do not broaden into unrelated C2C refactoring.

## Existing Project Migration

Existing ChatGPT Projects may contain copied instructions from the old template. Repository changes do not update those copies.

After source templates are corrected, bound Projects such as Pendlio and Portfolio must be checked and migrated. Project instructions retain workspace identity and connector restrictions, but must not independently define generic scope, validation, model selection, prompt generation, or unconditional Codex ownership.

## Non-Goals

Do not redesign MCP tools, add arbitrary shell execution, change Jev logic, change execution-record persistence, change connector permissions, refactor unrelated source, make direct execution mandatory for every task, or remove Codex delegation.

## Acceptance Criteria

1. No active C2C instruction unconditionally states that Codex owns all execution.
2. Generic scope, model, validation, escalation, and prompt-generation rules have one authority: the active global workflow.
3. C2C policy text contains only additive C2C-specific mechanics or explicit references to global authority.
4. The delegated C2C state machine is clearly conditional on Codex delegation.
5. Jev, HANDOFF, workspace binding, execution records, finalization, and independent review remain intact.
6. New Project-instruction templates no longer reproduce the old unconditional execution contract.
7. Existing bound Projects have a documented migration path.
8. A fresh Pendlio conversation can directly use available connector actions when the Workflow Router selects direct execution.
9. An explicit request for Codex delegation still enters the delegated C2C protocol correctly.

## Focused Validation

- Search affected policy/template files for obsolete unconditional ownership wording.
- Verify retained C2C-specific invariants remain present.
- Run only focused workflow-artifact/protocol tests that cover these rules or templates.
- Add or adjust only narrowly relevant tests if existing tests assert the old wording.
- Do not run unrelated broad validation unless executable behavior changes require it.
