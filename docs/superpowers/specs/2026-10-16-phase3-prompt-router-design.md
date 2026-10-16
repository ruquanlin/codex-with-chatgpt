# Workflow v3 Phase 3 — Prompt Compiler / Model Router Design

**Date:** 2026-10-16  
**Status:** Approved design draft  
**Phase:** 3  
**Scope:** Prompt Compiler + Model Router + Validation Router

---

## 1. Purpose

Phase 3 converts an approved Phase 2 Execution Brief into the shortest sufficient Codex execution prompt, selects the lowest-cost reliable model for the exact task, and derives the minimum sufficient validation plan.

Phase 3 is deliberately deterministic and narrow.

It must not redesign the task, rediscover context already represented by the Execution Brief, or expand validation for safety-by-default reasons.

The core principle is:

```text
Execution Brief
→ deterministic compilation
→ validation routing
→ model routing
→ minimal Markdown prompt
→ Compiled Execution Package
```

---

## 2. Architectural Position

Phase 3 consumes only an approved Execution Brief produced by Phase 2.

```text
Approved Execution Brief
        ↓
validate Phase 3 input
        ↓
Prompt Compiler
        ↓
Validation Router
        ↓
Model Router
        ↓
Compiled Execution Package
```

Phase 3 must not reconstruct execution intent directly from raw conversation history.

If the Execution Brief is insufficient or internally conflicting, Phase 3 must fail closed and return the issue upstream.

---

## 3. Design Choice

### Recommended approach

Use a deterministic compiler and rule-based routers.

```text
ExecutionBrief
→ compilePrompt()
→ routeValidation()
→ routeModel()
→ CompiledExecutionPackage
```

This approach is preferred because it is:

- testable;
- cheap;
- predictable;
- easy to inspect;
- resistant to scope drift;
- aligned with Workflow v3's automation goals.

### Rejected alternatives

#### LLM-based Compiler / Router

Rejected as the default because it may:

- reinterpret scope;
- redesign the solution;
- add unnecessary validation;
- create nondeterministic routing behavior.

#### Hybrid rule + LLM routing

Not needed in Phase 3 because its input is already normalized by Phase 2.

If Phase 3 still needs substantial interpretation, the Execution Brief is not sufficient and should be rejected upstream rather than repaired inside Phase 3.

---

## 4. Phase 3 Contract

Phase 3 may:

- compress wording;
- remove redundancy;
- omit irrelevant sections;
- preserve task-specific boundaries;
- include confirmed facts that materially reduce Codex exploration;
- produce concise Markdown;
- choose the lowest-cost reliable model tier;
- derive the minimum sufficient validation plan.

Phase 3 must not:

- change the goal;
- expand scope;
- invent implementation requirements;
- choose a different root cause;
- redesign an approved solution;
- add speculative cleanup;
- request broader validation without justification;
- ask Codex to rediscover known facts;
- infer missing implementation decisions.

A concise summary:

```text
compile ≠ redesign
route ≠ reason from scratch
validate ≠ broaden
```

---

## 5. Compiled Execution Package

Phase 3 returns a small execution package rather than another persistent workflow artifact.

```ts
type ModelTier = "LOW" | "STANDARD" | "HIGH" | "EXTREME";

interface CompiledExecutionPackage {
  prompt: string;

  modelRecommendation: {
    tier: ModelTier;
    model: string;
    reason: string;
  };

  validationPlan: {
    checks: string[];
    browserRequired: boolean;
    productionEvidenceRequired: boolean;
  };
}
```

Constraints:

- `reason` is short and only explains why the selected tier is sufficient.
- `validationPlan` is used both for prompt generation and later review.
- The package must not duplicate the whole Execution Brief.
- Ordinary packages remain ephemeral.

---

## 6. Phase 3 Result

Phase 3 must fail closed when the Execution Brief is insufficient.

```ts
type Phase3Result =
  | {
      status: "READY";
      package: CompiledExecutionPackage;
    }
  | {
      status: "REJECTED_INSUFFICIENT_BRIEF";
      issues: string[];
    };
```

Example:

```json
{
  "status": "REJECTED_INSUFFICIENT_BRIEF",
  "issues": [
    "mustChange does not identify the approved implementation boundary",
    "validationExpectation conflicts with acceptanceCriteria"
  ]
}
```

Phase 3 only reports the missing or conflicting information.

It must not fill in the missing answer itself.

---

## 7. Prompt Compiler

### 7.1 Goal

Convert the approved Execution Brief into the shortest sufficient Codex prompt.

The prompt must contain only:

- the actual goal;
- relevant scope;
- necessary boundaries;
- relevant known facts;
- focused validation;
- the Minimal Completion Report requirement.

### 7.2 Preferred structure

Use only the sections that add value:

```md
## Task

...

## Scope

...

## Boundaries

...

## Validate

...
```

Sections may be omitted when unnecessary.

The final output must be one complete Markdown prompt.

### 7.3 Compilation rules

The compiler should:

1. validate the Execution Brief;
2. derive the focused validation plan;
3. derive the model tier;
4. select only execution-relevant facts;
5. remove duplicated wording;
6. render concise Markdown;
7. append the Minimal Completion Report requirement;
8. return the compiled package.

### 7.4 Known Facts

Known Facts enter the Codex prompt only when they materially reduce unnecessary exploration.

Include facts such as:

- confirmed root cause;
- confirmed file or logic location;
- approved implementation approach;
- already-verified behavior that Codex should not rediscover.

Do not include general project history.

### 7.5 Approved Basis

`approvedBasis` should be converted into execution-relevant wording only.

Do not expose the upstream decision process, Jev rationale, or brainstorming history unless it directly affects implementation.

### 7.6 Risk Notes

Include risk notes only when they affect:

- implementation boundaries;
- validation requirements;
- behavior that must not regress.

Do not include generic risk commentary.

### 7.7 Minimal Completion Report

The prompt should normally end with:

```text
Report:
- what changed
- focused validation performed
- any blocking issue
```

Avoid long execution narratives by default.

---

## 8. Model Router

### 8.1 Principle

The Model Router selects the:

```text
lowest-cost reliable model
```

for the exact execution prompt.

Routing is based on the current task, not the overall project complexity.

```text
task complexity ≠ project complexity
```

### 8.2 Tier model

Use four capability tiers:

```text
LOW
STANDARD
HIGH
EXTREME
```

### 8.3 LOW

Typical tasks:

- copy changes;
- static HTML edits;
- bounded CSS changes;
- simple configuration values;
- deterministic one-file mechanical changes;
- small changes with a fully specified implementation boundary.

### 8.4 STANDARD

Typical tasks:

- ordinary business logic changes;
- API handling;
- parser changes;
- multi-file implementation with an approved design;
- small features within an existing architecture;
- routine regression fixes;
- moderate state coordination.

### 8.5 HIGH

Typical tasks:

- complex runtime bugs;
- performance hotspots;
- race conditions;
- lifecycle problems;
- difficult state coordination;
- architecture-heavy implementation;
- high-risk behavior changes.

### 8.6 EXTREME

Reserved for exceptional tasks such as:

- very difficult architecture reasoning;
- unusually complex debugging;
- critical migration logic;
- tasks where concrete evidence shows ordinary high-reasoning execution is insufficient.

EXTREME must not become a default safety tier.

---

## 9. Model Mapping

Routing must separate capability tier from concrete model names.

Core workflow logic determines:

```text
Task characteristics
→ Model Tier
```

A separate mapping layer determines:

```text
Model Tier
→ Current model
```

Current intended strategy:

```text
LOW      → GPT-6 lightweight / Luna-class
STANDARD → GPT-6 Sol
HIGH     → GPT-6 Sol High
EXTREME  → GPT-6 Astra / Pro-class
```

GPT-5.6 is not the normal default route.

It may remain available as a compatibility or fallback option.

The router must not encode assumptions such as:

```text
older generation = cheaper
```

The mapping may change independently as model cost, speed, and availability change.

---

## 10. Failure Is Not a Model Escalation Signal

A failed execution must not automatically escalate the model.

Forbidden pattern:

```text
LOW fails
→ STANDARD
→ HIGH
→ EXTREME
```

Required pattern:

```text
execution failed
→ collect new evidence
→ re-enter the correct workflow stage
→ update diagnosis/design if needed
→ create new execution proposal
→ Phase 2 produces a new Execution Brief
→ Phase 3 routes again
```

Only the new task characteristics may justify a higher model tier.

---

## 11. Validation Router

### 11.1 Principle

Use the minimum sufficient validation for the exact task.

Browser use defaults to:

```text
OFF
```

Phase 3 must not request full tests, full builds, or browser automation by default.

### 11.2 Static / content changes

Examples:

- copy;
- static HTML;
- simple CSS;
- configuration values.

Default:

```text
focused static inspection
```

Do not automatically request:

- full test suite;
- full build;
- browser automation.

### 11.3 Logic changes

Examples:

- business logic;
- state transitions;
- deterministic bug fixes;
- utilities.

Default:

```text
focused regression test
```

Prefer extending an existing relevant test over creating broad new test infrastructure.

### 11.4 Parser / API changes

Examples:

- parsing;
- normalization;
- response transformation;
- error handling.

Default:

```text
targeted unit/integration test
```

Reuse existing fixtures when possible.

### 11.5 UI behavior

Ordinary React or UI behavior:

```text
focused unit/integration validation
```

Browser or real interaction validation is justified for:

- drag;
- touch;
- scroll;
- 3D;
- animation;
- responsive layout;
- iframe behavior;
- pointer/gesture conflicts;
- actual rendering acceptance.

### 11.6 Production runtime issues

Typical validation:

```text
focused local regression
+
production telemetry / runtime evidence
```

A production bug does not automatically require broad E2E validation.

---

## 12. Validation Priority

Validation is derived in this order:

```text
Explicit Execution Brief expectation
        ↓
Task-type rule
        ↓
Minimum sufficient validation
```

Phase 3 may:

- deduplicate validation requests;
- narrow redundant validation;
- preserve explicitly justified validation.

Phase 3 must not:

- invent full-suite validation;
- add browser validation without a relevant acceptance criterion;
- broaden the task for completeness.

---

## 13. Example — Simple Portfolio CSS Change

Input intent:

- move one mobile hotspot description slightly upward;
- no desktop changes;
- no 3D interaction changes.

Compiled prompt:

```md
## Task

Move the mobile hotspot description slightly upward.

## Scope

Update only the existing mobile hotspot description positioning.

## Boundaries

Do not change desktop layout, hotspot behavior, or 3D interaction logic.

## Validate

Verify the affected mobile layout only.

Report:
- what changed
- focused validation performed
- any blocking issue
```

Recommended tier:

```text
LOW
```

The compiler must not add broad instructions such as:

```text
Inspect the full portfolio architecture.
Review all responsive styles.
Run the full test suite.
Open the browser and verify everything.
```

---

## 14. Example — Confirmed Pendlio Runtime Root Cause

Known confirmed fact:

```text
resolveMunichStationByEva repeatedly rebuilds alias sets inside a hot loop
```

Compiled prompt:

```md
## Task

Remove the confirmed repeated station-resolution work from the departure merge hot path.

## Scope

Use the approved precomputed EVA-to-station lookup in the affected merge path.

## Boundaries

Do not redesign direction logic or change unrelated timetable behavior.

## Validate

Run the focused db-timetables regression covering the affected canonical station path.

Report:
- what changed
- focused validation performed
- any blocking issue
```

The prompt must not say:

```text
Investigate why Worker 1102 happens.
```

because the root cause is already known.

---

## 15. Rejected Prompt Pattern

Phase 3 must not generate prompts like:

```md
Investigate the codebase and determine the best solution.
Fix anything related that looks wrong.
Run all relevant tests.
Refactor if necessary.
```

This pattern is invalid because it:

- reopens diagnosis;
- reopens design;
- has unbounded scope;
- has unbounded validation;
- permits speculative cleanup.

---

## 16. Code Module Boundary

Recommended module layout:

```text
src/workflow/phase3/
  compiler.ts
  model-router.ts
  validation-router.ts
  types.ts
```

### compiler.ts

Responsibilities:

- accept an approved Execution Brief;
- validate Phase 3 readiness;
- render the minimal Markdown prompt;
- assemble the final package.

### model-router.ts

Responsibilities:

- classify task characteristics;
- select `LOW / STANDARD / HIGH / EXTREME`;
- resolve the tier through the model mapping layer.

Must not:

- read raw conversation history;
- re-diagnose the task;
- reinterpret scope.

### validation-router.ts

Responsibilities:

- derive minimum sufficient validation;
- preserve explicit justified validation;
- keep browser off unless required.

### types.ts

Owns Phase 3 types:

- `Phase3Result`;
- `CompiledExecutionPackage`;
- `ModelTier`;
- `ValidationPlan`.

---

## 17. Phase 2 Boundary

Existing Phase 2 logic should remain semantically unchanged.

Relevant existing files include:

```text
src/workflow/execution-brief.ts
src/workflow/phase2.ts
src/workflow/execution-brief-persistence.ts
```

Phase 3 must not move its compiler logic into Phase 2.

A thin handoff/export is acceptable only when required for integration.

---

## 18. MCP Interface

Expose one primary workflow-level operation:

```text
phase3_compile_execution
```

Input:

```text
ExecutionBrief
```

Output:

```text
READY
  → prompt
  → modelRecommendation
  → validationPlan
```

or:

```text
REJECTED_INSUFFICIENT_BRIEF
  → issues[]
```

Do not expose three separate public tools for prompt compilation, model routing, and validation routing.

Internal modules may be tested independently, but the workflow handoff should remain atomic.

---

## 19. Test Scope

Phase 3 should primarily use deterministic unit tests.

Required cases:

1. Execution Brief produces a minimal prompt.
2. Redundant fields are omitted.
3. Must-not-change constraints survive compilation.
4. Known Facts appear only when execution-relevant.
5. Insufficient Brief fails closed.
6. Compiler does not expand scope.
7. LOW routing works.
8. STANDARD routing works.
9. HIGH routing works.
10. EXTREME routing works.
11. Failure history alone does not escalate model tier.
12. Browser defaults to OFF.
13. Interaction tasks may enable browser validation.
14. Production runtime tasks may require telemetry evidence.
15. Full-suite validation is not invented.
16. Final prompt is emitted as one complete Markdown block.
17. Model tier classification is independent from concrete model mapping.

Focused validation only.

Do not default to:

- full repository test suite;
- full build;
- browser automation;
- broad audit.

A narrow typecheck or Phase 3-specific test run is sufficient unless implementation creates a concrete reason for more.

---

## 20. Explicit Non-Goals

Phase 3 must not modify or redesign:

```text
Phase 1 Router semantics
Jev transport
Phase 2 proposal identity
Execution Brief lifecycle policy
Execution Brief persistence policy
failure-loop architecture
Codex execution harness
diff review workflow
user acceptance
deployment workflow
browser automation infrastructure
```

Do not broaden Phase 3 into unrelated C2C refactoring.

---

## 21. Acceptance Criteria

Phase 3 is complete when:

1. every Codex prompt originates from an approved Execution Brief;
2. Prompt Compiler produces concise Markdown without reopening diagnosis or design;
3. compiler output preserves goal, scope, and must-not-change boundaries;
4. insufficient Briefs fail closed;
5. model selection uses `LOW / STANDARD / HIGH / EXTREME`;
6. model tier and concrete model mapping are decoupled;
7. GPT-6 family is the primary routing strategy;
8. GPT-5.6 is not the normal default route;
9. task complexity, not project complexity, determines the model tier;
10. execution failure alone does not escalate model tier;
11. validation defaults to minimum sufficient focused checks;
12. browser validation defaults to OFF;
13. full-suite / full-build validation is not invented;
14. the workflow exposes one atomic Phase 3 compile operation;
15. Phase 1 and Phase 2 semantics remain unchanged;
16. Phase 3 behavior is covered by focused deterministic tests.

---

## 22. Final Phase 3 Boundary

The entire phase should remain conceptually small:

```text
Approved Execution Brief
→ deterministic Prompt Compiler
→ focused Validation Router
→ lowest-cost reliable Model Router
→ Compiled Execution Package
```

Phase 3 does not decide what the task should be.

It only converts an already-approved execution intent into the narrowest reliable execution package.
