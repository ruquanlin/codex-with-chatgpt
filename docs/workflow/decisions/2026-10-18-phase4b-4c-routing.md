---
workflow_version: "3"
task_type: ARCHITECTURAL_CHANGE
path: ARCHITECTURAL
risk: HIGH
process_skill: brainstorming
domain_skills: []
visibility: EXPLICIT
prior_attempt_failed: false
production_dependency: false
architectural_upgrade: false
downgrade_allowed: false
jev_candidate: true
status: DESIGNING
---

## Goal

Plan and incrementally implement Workflow v3 Phase 4B Completion Routing and Phase 4C Project Profiles after accepted Phase 4A Failure Loop.

## Routing decision

An architectural path is required because completion authority, user acceptance, failure handoff and stable project context cross workflow subsystem boundaries. Implement Phase 4B before Phase 4C, one bounded Codex task at a time. Jev returned `proceed` for the narrow Phase 4B domain task on 2026-10-18; this is not advance authorization for later tasks.

## Boundaries

Do not change Phase 2/3 identities, the Phase 4A immutable failure schema, user acceptance authority or the permission boundary without a separately reviewed design. Code execution remains with Codex; final acceptance, commit, push and deployment decisions remain with the user.
