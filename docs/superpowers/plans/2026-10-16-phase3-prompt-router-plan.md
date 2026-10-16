# Phase 3 Prompt Router Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Workflow v3 Phase 3 so an approved Execution Brief compiles into one minimal Markdown execution prompt, a focused validation plan, and a lowest-cost reliable model recommendation.

**Architecture:** Add a deterministic Phase 3 workflow module under `src/workflow/phase3/`, with separate prompt compilation, validation routing, model-tier routing, and shared types. Expose the whole handoff through one read-only MCP tool, `phase3_compile_execution`. Phase 1 and Phase 2 semantics remain unchanged.

**Tech Stack:** TypeScript, Vitest, MCP server tooling already present in the repository.

**Spec:** `docs/superpowers/specs/2026-10-16-phase3-prompt-router-design.md`

## Global Constraints

- Phase 3 consumes only a canonical approved Execution Brief.
- Phase 3 may compress and deduplicate but must not change goal, scope, root cause, approved design, or acceptance requirements.
- Insufficient or conflicting briefs fail closed as `REJECTED_INSUFFICIENT_BRIEF`.
- Browser validation defaults to OFF.
- Do not invent full-suite tests, full builds, browser automation, cleanup, refactors, or new implementation decisions.
- Model routing is based on the exact execution task, not project complexity.
- Model tiers are `LOW | STANDARD | HIGH | EXTREME`.
- Capability tier and concrete model mapping remain separate.
- Current default mapping is GPT-6-family first; GPT-5.6 is fallback/compatibility only.
- Execution failure alone must not escalate the model tier.
- Final Codex prompt is one concise Markdown block and defaults to a Minimal Completion Report.
- Do not modify Phase 1 Router semantics, Jev transport, Phase 2 proposal identity, Execution Brief lifecycle/persistence policy, failure-loop architecture, Codex execution harness, deployment workflow, or browser infrastructure.

## Review Focus

- A canonical-looking Brief that still lacks an executable implementation boundary must be rejected rather than guessed.
- Conflicting `validationExpectation` and `acceptanceCriteria` must fail closed instead of broadening validation.
- Generic project complexity or project name must never raise model tier without task-specific complexity signals.
- Browser-required tasks must opt in only when interaction/rendering behavior actually requires it.
- Known facts that do not reduce executor exploration must not bloat the compiled prompt.

---

### Task 1: Define Phase 3 types and fail-closed result contract

**Files:**
- Create: `src/workflow/phase3/types.ts`
- Create: `tests/phase3-types.test.ts`

**Interfaces:**
- Consumes: `ExecutionBrief` from `src/workflow/execution-brief.ts`.
- Produces:
  - `type ModelTier = "LOW" | "STANDARD" | "HIGH" | "EXTREME"`
  - `interface ModelRecommendation`
  - `interface ValidationPlan`
  - `interface CompiledExecutionPackage`
  - `type Phase3Result`

- [ ] **Step 1: Write failing type/runtime-shape tests**

Add tests that assert a representative READY package contains only:
- `prompt`
- `modelRecommendation`
- `validationPlan`

and that a rejected result uses:
- `status: "REJECTED_INSUFFICIENT_BRIEF"`
- `issues: string[]`

- [ ] **Step 2: Run the focused test**

Run:

```bash
pnpm vitest run tests/phase3-types.test.ts
```

Expected: FAIL because `src/workflow/phase3/types.ts` does not exist.

- [ ] **Step 3: Implement the Phase 3 public types**

Create `src/workflow/phase3/types.ts` with the exact tier union and package/result structures from the approved spec.

Do not add duplicated Execution Brief fields to the compiled package.

- [ ] **Step 4: Run the focused test**

Run:

```bash
pnpm vitest run tests/phase3-types.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/workflow/phase3/types.ts tests/phase3-types.test.ts
git commit -m "feat: define phase 3 execution package types"
```

---

### Task 2: Implement focused Validation Router

**Files:**
- Create: `src/workflow/phase3/validation-router.ts`
- Create: `tests/phase3-validation-router.test.ts`

**Interfaces:**
- Consumes: canonical `ExecutionBrief`.
- Produces:
  - `routeValidation(brief: ExecutionBrief): ValidationPlan`

- [ ] **Step 1: Write failing routing tests**

Cover these exact cases:

1. static/content task → focused static inspection, browser `false`, production evidence `false`;
2. deterministic logic task → focused regression test;
3. parser/API task → targeted unit/integration test;
4. drag/touch/scroll/3D/responsive/iframe interaction task → browser `true`;
5. production runtime task → focused local validation plus production evidence `true`;
6. no rule invents full suite or full build;
7. conflicting explicit validation and acceptance criteria returns a detectable validation issue for the compiler to reject.

Keep classification signals based only on the Execution Brief fields.

- [ ] **Step 2: Run the focused test**

Run:

```bash
pnpm vitest run tests/phase3-validation-router.test.ts
```

Expected: FAIL because the router does not exist.

- [ ] **Step 3: Implement `routeValidation`**

Use deterministic rule matching over execution-relevant Brief content.

Browser default must be `false`.

Do not read conversation history, repo size, project identity, or prior execution records.

- [ ] **Step 4: Run the focused test**

Run:

```bash
pnpm vitest run tests/phase3-validation-router.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/workflow/phase3/validation-router.ts tests/phase3-validation-router.test.ts
git commit -m "feat: add phase 3 validation router"
```

---

### Task 3: Implement Model Router and separate model mapping

**Files:**
- Create: `src/workflow/phase3/model-router.ts`
- Create: `tests/phase3-model-router.test.ts`

**Interfaces:**
- Consumes: canonical `ExecutionBrief`.
- Produces:
  - `classifyModelTier(brief: ExecutionBrief): ModelTier`
  - `recommendModel(tier: ModelTier): ModelRecommendation`

- [ ] **Step 1: Write failing model-tier tests**

Cover:

1. copy/static HTML/simple CSS/config/mechanical bounded edit → `LOW`;
2. ordinary logic/API/parser/approved multi-file implementation → `STANDARD`;
3. complex runtime/performance/race/lifecycle/architecture-heavy implementation → `HIGH`;
4. exceptional critical migration or explicitly very high reasoning demand → `EXTREME`;
5. project complexity alone does not raise the tier;
6. failure history alone is not an escalation signal;
7. concrete model resolution is tested separately from tier classification.

- [ ] **Step 2: Run the focused test**

Run:

```bash
pnpm vitest run tests/phase3-model-router.test.ts
```

Expected: FAIL because the router does not exist.

- [ ] **Step 3: Implement tier classification**

Implement deterministic task-specific classification.

Do not encode repository/project names as complexity signals.

Do not inspect execution history to escalate after failure.

- [ ] **Step 4: Implement the separate model mapping**

Map the tiers through a small mapping layer:

```text
LOW      → GPT-6 lightweight / Luna-class
STANDARD → GPT-6 Sol
HIGH     → GPT-6 Sol High
EXTREME  → GPT-6 Astra / Pro-class
```

Keep mapping isolated so future model changes do not alter classification logic.

- [ ] **Step 5: Run the focused test**

Run:

```bash
pnpm vitest run tests/phase3-model-router.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/workflow/phase3/model-router.ts tests/phase3-model-router.test.ts
git commit -m "feat: add phase 3 model routing"
```

---

### Task 4: Implement deterministic Prompt Compiler

**Files:**
- Create: `src/workflow/phase3/compiler.ts`
- Create: `tests/phase3-compiler.test.ts`

**Interfaces:**
- Consumes:
  - `ExecutionBrief`
  - `routeValidation(brief)`
  - `classifyModelTier(brief)`
  - `recommendModel(tier)`
- Produces:
  - `compileExecutionBrief(brief: ExecutionBrief): Phase3Result`

- [ ] **Step 1: Write failing compiler tests**

Cover:

1. a sufficient Brief returns `status: "READY"`;
2. output prompt is one complete Markdown string;
3. prompt uses only needed sections among `Task`, `Scope`, `Boundaries`, `Validate`;
4. `mustNotChange` survives compilation;
5. redundant wording is omitted;
6. execution-relevant known facts are preserved;
7. irrelevant project-history facts are omitted;
8. approved root cause/design is not reopened as investigation;
9. prompt ends with the Minimal Completion Report requirement;
10. missing executable implementation boundary returns `REJECTED_INSUFFICIENT_BRIEF`;
11. conflicting validation expectations return `REJECTED_INSUFFICIENT_BRIEF`;
12. compiler never adds cleanup/refactor/full-suite/browser instructions not justified by the Brief.

Include a regression fixture equivalent to the approved Portfolio CSS example and one equivalent to the confirmed Pendlio hot-path example.

- [ ] **Step 2: Run the focused test**

Run:

```bash
pnpm vitest run tests/phase3-compiler.test.ts
```

Expected: FAIL because the compiler does not exist.

- [ ] **Step 3: Implement `compileExecutionBrief`**

Implement the deterministic pipeline:

```text
validate executable sufficiency
→ derive validation plan
→ derive model tier
→ resolve model recommendation
→ select execution-relevant facts
→ render minimal Markdown
→ append Minimal Completion Report
→ return READY package
```

Return `REJECTED_INSUFFICIENT_BRIEF` with concrete issue strings rather than inventing missing decisions.

- [ ] **Step 4: Run the focused test**

Run:

```bash
pnpm vitest run tests/phase3-compiler.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run the Phase 3 unit set**

Run:

```bash
pnpm vitest run tests/phase3-types.test.ts tests/phase3-validation-router.test.ts tests/phase3-model-router.test.ts tests/phase3-compiler.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/workflow/phase3 tests/phase3-*.test.ts
git commit -m "feat: compile phase 3 execution packages"
```

---

### Task 5: Expose one atomic MCP Phase 3 tool

**Files:**
- Modify: `src/mcp/server.ts`
- Modify: `tests/mcp-integration.test.ts`

**Interfaces:**
- Consumes:
  - `compileExecutionBrief(brief: ExecutionBrief): Phase3Result`
- Produces MCP tool:
  - `phase3_compile_execution`

Input:

```text
brief: canonical Execution Brief object
```

Output:

```text
READY
→ package.prompt
→ package.modelRecommendation
→ package.validationPlan
```

or:

```text
REJECTED_INSUFFICIENT_BRIEF
→ issues[]
```

- [ ] **Step 1: Add failing MCP discovery/schema assertions**

Update the existing MCP integration tool-list assertions so `phase3_compile_execution` is present and exposes the expected structured result fields.

Do not add separate public MCP tools for compiler, model router, or validation router.

- [ ] **Step 2: Add failing MCP behavior tests**

Add one READY case and one rejected-insufficient-Brief case.

The tool must be read-only and require only `workspace.read`.

- [ ] **Step 3: Run the focused MCP tests**

Run the smallest existing Vitest target/filter that covers the new Phase 3 MCP assertions in `tests/mcp-integration.test.ts`.

Expected: FAIL because the tool is not registered.

- [ ] **Step 4: Register `phase3_compile_execution` in `src/mcp/server.ts`**

Import the Phase 3 compiler and register one read-only MCP operation beside the existing workflow handoff tools.

The handler must:
- require `workspace.read`;
- accept the canonical Brief;
- call the Phase 3 compiler;
- return the compiler result without reinterpretation;
- not persist anything;
- not invoke Codex.

- [ ] **Step 5: Run the focused MCP tests**

Run the same focused MCP integration target/filter.

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/mcp/server.ts tests/mcp-integration.test.ts
git commit -m "feat: expose phase 3 compile tool"
```

---

### Task 6: Focused integration verification

**Files:**
- No implementation changes expected unless a Phase 3 regression is found.

**Interfaces:**
- Verifies the complete Phase 2 → Phase 3 handoff without changing Phase 2 semantics.

- [ ] **Step 1: Run all Phase 3 tests**

Run:

```bash
pnpm vitest run tests/phase3-types.test.ts tests/phase3-validation-router.test.ts tests/phase3-model-router.test.ts tests/phase3-compiler.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run the focused existing Phase 2 tests**

Run:

```bash
pnpm vitest run tests/execution-brief.test.ts tests/phase2.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run the focused MCP integration test**

Run the narrow MCP integration target/filter that covers workflow tool registration and Phase 3 behavior.

Expected: PASS.

- [ ] **Step 4: Run TypeScript validation**

Run:

```bash
pnpm typecheck
```

Expected: exit code 0.

Do not run the full repository test suite or full build unless one of the focused checks reveals a concrete cross-cutting integration reason.

- [ ] **Step 5: Verify scope**

Inspect the final diff and confirm changes are limited to:
- `src/workflow/phase3/**`
- Phase 3 test files
- the narrow `src/mcp/server.ts` integration
- the narrow `tests/mcp-integration.test.ts` integration

No Phase 1/2 semantic changes.

- [ ] **Step 6: Final commit if verification required adjustments**

Only if focused verification required a corrective change:

```bash
git add <only affected Phase 3 files>
git commit -m "test: finalize phase 3 workflow integration"
```

---

## Completion Criteria

Implementation is complete when:

- an approved Execution Brief can be compiled through one Phase 3 API;
- insufficient Briefs fail closed;
- the final execution prompt is concise Markdown and preserves approved boundaries;
- model tier routing uses `LOW / STANDARD / HIGH / EXTREME`;
- GPT-6-family mapping is separate from tier classification;
- browser defaults OFF;
- validation remains focused;
- Phase 1 and Phase 2 semantics remain unchanged;
- focused Phase 3, Phase 2 handoff, MCP integration, and typecheck validation pass.

## Minimal Completion Report

At the end of implementation, report only:

```text
Changed:
- ...

Validation:
- ...

Blocking issue:
- none
```
