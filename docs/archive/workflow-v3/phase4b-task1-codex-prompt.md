## Task

Implement only **Phase 4B Task 1: pure Completion Routing domain** from `docs/superpowers/specs/2026-10-18-phase4b-completion-routing-design.md` and `docs/superpowers/plans/2026-10-18-phase4b-completion-routing-plan.md`.

## Scope

Create `src/workflow/phase4b/completion.ts` and `tests/phase4b-completion.test.ts`. Implement strict `routeCompletion(proposal, input)` with existing Phase 2 proposal identity validation. Cover all specified review/acceptance states, missing or failed validation, failure-handoff outcomes and illegal input combinations. Do not infer user acceptance.

## Boundaries

Do not modify MCP, persistence, Phase 2/3/4A, Router, Jev or existing tests. Do not touch the three pre-existing untracked `docs/*.md` files. No commit or push.

## Validate

Write failing focused tests first, then run `pnpm exec vitest run tests/phase4b-completion.test.ts` and `pnpm exec tsc --noEmit`. Report only changes, validation and blockers.
