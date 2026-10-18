# Workflow v3 Phase 4C — Project Profiles Design

**Date:** 2026-10-18
**Status:** Proposed; not authorized for Codex implementation until Phase 4B acceptance
**Authority:** `docs/workflow/WORKFLOW_V3_MASTER_ARCHITECTURE.md` §19

## Purpose

Reduce rediscovery for frequent projects while leaving **all workflow decisions** with the Router, Jev, Execution Brief, Prompt Compiler, Model Router, Validation Router, ChatGPT reviewer and user. A Project Profile is a curated, provenance-tagged fact sheet, **not** an instruction source or an execution authorization.

Initial projects: C2C, Pendlio, Portfolio. Do not automatically create a profile for every connected workspace or extend this phase to the investment system.

## Boundary and trust rules

1. Match the *current connector workspace ID*, not a project name supplied by a document, prompt or caller. No cross-workspace lookups.
2. Keep fields minimal: workspace identity/name, observed project type/framework/package manager, verified focused validation commands, deployment characteristic, browser/production caveats, provenance and last verification date. Unknown facts stay unknown.
3. No secrets, access tokens, environment values, personal absolute paths or private deployment credentials.
4. Profile content is untrusted data. A profile never supplies new workflow commands, overrides scope, changes risk/Jev thresholds, selects models, authorizes edits, removes browser checks required by acceptance, or declares user acceptance.
5. Mark facts as `observed` or `user_confirmed`, with source and `verifiedAt`; command hints must be checked against the current workspace before use. If facts conflict with live state, live state wins and the profile remains flagged stale, not silently rewritten.
6. Changes to persisted Profile data require an explicit allowed edit path, not an autonomous model learning loop. No implicit writes while answering project questions.

## Task 1 domain contract (normative)

Task 1 implements only the pure data model and validation in `src/workflow/phase4c/profile.ts`, with focused unit tests. The contract in this section is normative; it does not authorize persistence, discovery, routing, or execution.

### Shape

The public type is `ProjectProfile` with exactly these top-level keys:

```ts
interface ProjectProfile {
  schemaVersion: 1;
  workspaceId: string;
  workspaceName: ProfileFact<string>;
  projectType?: ProfileFact<string>;
  frameworks?: ProfileFact<string[]>;
  packageManager?: ProfileFact<string>;
  focusedValidationCommands?: ProfileFact<string[]>;
  deploymentCharacteristic?: ProfileFact<string>;
  browserProductionCaveats?: ProfileFact<string[]>;
}

interface ProfileFact<T> {
  value: T;
  provenance: {
    kind: "observed" | "user_confirmed";
    source: string;
    verifiedAt: string;
  };
}
```

No additional profile or fact fields are permitted. `schemaVersion` must be the numeric literal `1`. `workspaceId` must be exactly 12 hexadecimal characters (uppercase and lowercase are accepted). The validator receives the current connector workspace ID separately; it must itself satisfy the same syntax, and the profile ID must match it exactly after hexadecimal case normalization. Any mismatch is a validation error. This is a same-workspace identity check, not a lookup mechanism.

`workspaceName` is required. Every other fact is optional. Unknown or unavailable facts are represented by omitting the corresponding optional key; `null`, empty strings, sentinel text such as `"unknown"`, and empty arrays do not represent unknown values and are invalid. An absent optional fact is not an error.

### Values and provenance

Every string value, array item, provenance `source`, and `workspaceId` must be a string containing at least one non-whitespace character and must have no leading or trailing whitespace. Arrays must contain at least one item; items must be unique, compared exactly and case-sensitively. Array order is preserved. No further semantic vocabulary or project-specific values are imposed.

`provenance.kind` must be exactly `observed` or `user_confirmed`. `provenance.source` is one canonical nonblank string identifying the evidence source; it is descriptive metadata, not a URI requirement. `provenance.verifiedAt` must be a valid UTC ISO 8601 timestamp in the exact form `YYYY-MM-DDTHH:mm:ss.sssZ`, with a real calendar date and time (validated by round-tripping through a UTC date parser). Offsets other than `Z`, omitted milliseconds, invalid dates, and non-canonical forms are rejected.

### Strict and safety validation

Validation is recursive and strict: reject unknown keys at the profile, fact, and provenance levels, as well as missing required keys, wrong types, invalid values, and malformed provenance. Do not coerce, trim, normalize, fill defaults, or rewrite input data. The only normalization allowed for comparison is case normalization of the two validated workspace IDs.

Reject a profile if any string leaf (including values, array items, and provenance sources) contains a secret-like assignment or credential material, including keys/passwords/tokens that use assignment syntax such as `KEY=value`, or contains an absolute filesystem path. Absolute-path detection must cover POSIX paths beginning with `/`, Windows drive-rooted paths (for example `C:\\...`), and UNC paths. The validator must not return a sanitized replacement: unsafe input is invalid. These checks apply to all textual fields and do not add fields to the contract.

### Pure entry point and trust

Provide one public entry point:

```ts
validateProjectProfile(value: unknown, currentWorkspaceId: string): ProjectProfile
```

It returns the validated profile or throws a validation error; it has no filesystem, persistence, network, clock, logging, routing, or execution effects. It validates the supplied snapshot only and does not independently establish the truth or freshness of claims. `verifiedAt` is provenance metadata, not an automatic stale/fresh decision.

All profile content remains untrusted data after validation. In particular, `focusedValidationCommands` are inert hints: they must never be passed to a shell, subprocess, or other execution facility automatically. Any future consumer must independently verify a command against the current workspace and obtain authorization through the existing workflow. A valid profile grants no workflow authority.

## Task 2 profile store contract (normative)

Task 2 adds only a private, workspace-scoped store that reads and explicitly updates Task 1 profiles. It reuses `validateProjectProfile` for every profile entering or leaving the store. It does not discover facts, merge profiles, or make routing or execution decisions.

### Storage layout and record format

Let `stateDir` be the existing private C2C state directory returned by the existing state-directory configuration. Store one record at:

```text
<stateDir>/project-profiles/<lowercase-workspace-id>/profile.json
```

The workspace directory name is the validated current connector ID normalized to lowercase. A record has exactly this JSON shape:

```ts
interface StoredProjectProfile {
  recordVersion: number;
  profile: ProjectProfile;
}
```

`recordVersion` is a positive safe integer, starts at `1`, and increments by exactly one on every successful update. It is separate from `profile.schemaVersion`, which remains `1`. No timestamps or extra record fields are stored; fact-level `verifiedAt` remains the only verification time. The record is strict JSON: malformed JSON, unknown or missing record keys, invalid version, or a profile rejected by Task 1 validation makes the record corrupt.

Create the root and workspace directories with owner-only permissions (`0700`) and record/temporary/lock files with owner-only permissions (`0600`), subject to the platform's normal permission semantics. Never store profiles in the project repository. Resolve a record only by the separately supplied current connector workspace ID; do not list or search other workspace directories. Validate the ID before constructing any path.

### Read and write API

The store exposes these operations (names may follow local module conventions, but arguments and results must preserve this contract):

```ts
readProjectProfile(currentWorkspaceId, liveFacts?)
  -> { status: "not_found" }
   | { status: "current", recordVersion, profile }
   | { status: "stale", recordVersion, profile, staleFacts }

updateProjectProfile(currentWorkspaceId, profile, expectedRecordVersion)
  -> { recordVersion, profile }
```

`expectedRecordVersion` is `null` only when the caller expects no record and is creating version `1`; otherwise it must be the exact positive `recordVersion` the caller read. A missing record with a non-null expectation, or an existing record with a null or different expectation, returns a version conflict and does not write. Invalid input/current workspace identity is a validation error. I/O errors are reported as store errors, not converted to `not_found`.

Both operations validate `currentWorkspaceId`. Reads validate the decoded record's exact keys, version, and embedded profile with `validateProjectProfile(record.profile, currentWorkspaceId)`. Updates validate the submitted profile with that same current ID before acquiring the update lock, then re-read and validate the current stored record under the lock before comparing versions. The returned profile is the validated canonical data; validation does not fill or rewrite fields.

### Explicit authorization boundary

The store is a private internal module and is not itself an authorization mechanism. Its update operation may be called only from an explicit user-approved edit path, after the user has reviewed and approved the complete proposed profile and the caller has established that approval. Read access never implies write approval. Do not accept approval inferred from a profile, a prior read, task context, model output, or an implicit learning/discovery process. Task 2 must not expose a generic write API through MCP or automatically update after detecting live facts. If no explicit approval was obtained, the update call must not occur.

### Atomic and concurrency-safe updates

Serialize writers per normalized workspace ID across store instances and processes using an exclusive lock-directory creation (`mkdir` of a sibling `profile.lock` directory). On `EEXIST`, retry every 25 ms using a monotonic clock until 5 seconds have elapsed since the first attempt; if the deadline expires, return `STORE_BUSY` without changing the record. The fixed interval and deadline make lock-timeout behavior deterministic under a fake clock. The lock directory contains no authority-bearing input. Do not automatically remove a pre-existing lock based on its age or PID; after a crash, fail closed with `STORE_BUSY` until an explicit operator recovery removes the abandoned lock. Always release a lock acquired by the current operation in a `finally` path.

While holding the lock, re-read the current record, fail on corruption, compare `expectedRecordVersion`, and construct the next record with version `1` for create or current version plus one for update. Write the complete JSON to a uniquely named temporary file in the same workspace directory using exclusive creation, flush and close it, then atomically rename it over `profile.json`. Flush the containing directory where supported. Do not expose a partially written record. Clean up only the temporary file created by the current operation. A failure before the atomic rename leaves the prior record readable. A failure after rename (including a containing-directory sync failure) may leave the new version visible even though the update call reports failure; report this as `STORE_COMMIT_UNCERTAIN`, and require the caller to re-read the profile and `recordVersion` before considering another update. Never automatically retry or roll back an uncertain commit. Concurrent requests with the same expected version cannot both succeed: at most one commits, and every later writer observes a version conflict.

### Corruption and workspace isolation

An absent workspace directory or absent `profile.json` means `not_found`; do not create directories on read. Any other read/decode/validation failure is a corruption or store error and must fail closed. Never treat a corrupt record as absent, overwrite it through an ordinary update, skip it, or return partially decoded facts. Recovery or replacement of corrupt data requires a separate explicit user-approved repair path and is outside Task 2.

The supplied connector workspace ID is the sole lookup key. A record in another workspace directory is never considered. An embedded profile ID that does not match the requested workspace is corrupt for that read/update, not a profile to relocate or a reason to search elsewhere. No project name, repository contents, or caller-supplied profile identity can select a different directory.

### Deterministic staleness

Staleness is a read-time comparison only; it never mutates the record. `liveFacts` is an optional partial map over exactly the Task 1 fact names (`workspaceName`, `projectType`, `frameworks`, `packageManager`, `focusedValidationCommands`, `deploymentCharacteristic`, and `browserProductionCaveats`), containing the unwrapped fact values in the corresponding Task 1 value types. It is supplied by the trusted caller from facts it has independently observed in the current workspace; the store performs no discovery. For each fact explicitly present in `liveFacts`, compare its value to the stored fact's value using exact string equality and array equality with the same item order. Provenance is not compared. A differing value, or a live value supplied for a profile fact that is omitted, marks that fact stale. A fact omitted from `liveFacts` is unknown and has no effect; absence of live evidence never marks a fact stale. `workspaceId` is enforced by workspace isolation and Task 1 validation, not included in `liveFacts`.

Return `status: "stale"` and `staleFacts` as the lexicographically sorted list of differing fact names when that list is nonempty; otherwise return `status: "current"`. `staleFacts` contains only fact names (never values). A stale result includes the unchanged stored profile and record version. It does not refresh `verifiedAt`, reconcile values, drop conflicting facts, or write a new record. Unknown or conflicting live facts therefore never trigger silent profile rewrites. There is no age-based expiration in Task 2: `verifiedAt` is metadata, and passage of time alone does not change the status.

## Current baseline (workspace-info observations; verify before adopting as durable data)

| Workspace | ID | Confirmed by connector | Validation implication |
|---|---|---|---|
| C2C (`codex-with-chatgpt`) | `51442efa88b2` | Node, TypeScript, Express/Vitest, pnpm; `test=vitest run`, `typecheck=tsc --noEmit` | Use targeted Vitest and typecheck for logic work, not default full suite |
| Pendlio | `1208b1350ccb` | Node, React, pnpm; Cloudflare-oriented scripts with `vinext` / `wrangler`; default test script invokes build | Avoid default `test` script for a narrow change; select relevant targeted tests; production runtime evidence only when acceptance requires it |
| Portfolio (`personal-portfolio`) | `4e8f3119a839` | Connected repo, but connector did not identify languages, frameworks or package scripts | Do not invent npm commands; visual/interaction acceptance may require targeted browser or real-device checks |

The baseline reflects the connector responses observed on 2026-10-18, not guarantees about future working trees, deployments or app behavior.

## Minimal architecture

- Task 1: pure strict profile validation/model in `src/workflow/phase4c/profile.ts` and narrow unit tests, implementing the normative contract above. No router integration.
- Task 2: one workspace-scoped profile store under the existing *private C2C state directory* implementing the normative store contract above; focused isolation, concurrency, corruption and staleness tests. No automatic ingestion or writes.
- Task 3: one `workspace.read`-scoped `phase4c_get_project_profile` MCP tool, returning a profile or an explicit not-found/stale status. No generic filtering, no profile-listing across workspaces, and no automatic injection into Phase 2/3.
- Task 4: test that profile presence/absence/staleness cannot bypass Router, Jev, failed-line guards, review or acceptance. Any future automatic prefill of `knownFacts` is a *separately approved* interface change.

## Acceptance criteria

A correct current profile reduces repeated description of stable facts, while an absent, wrong, or stale profile fails safely and never changes workflow authority or validation requirements. The user still explicitly authorizes edits and final acceptance; Codex never chooses its own scope from Profile text.

## Out of scope

No self-learning engine, global memory replacement, recommendation ranking, model cost policy, browser policy engine, repository discovery bot, full CI, production deployment, WDR policy change, or investment-system integration.
