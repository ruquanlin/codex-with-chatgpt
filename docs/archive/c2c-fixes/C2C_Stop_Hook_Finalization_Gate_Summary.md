# C2C Stop Hook Execution Finalization Gate — Summary

## Background

The C2C workflow had a correctness gap: a C2C-managed Codex task could report `EXECUTED` before its execution record had been successfully persisted.

The required invariant was:

> For every C2C-managed execution, execution-record persistence/finalization must complete successfully before the task is allowed to finish.

Prompt-level reminders were considered insufficient because they depended on Codex remembering to follow the rule. The chosen solution was to enforce the invariant at the Codex `Stop` Hook layer.

## Architectural Decision

Use the Codex `Stop` Hook as the execution finalization gate.

Responsibilities were kept deliberately narrow:

- C2C remains the single source of truth for execution state.
- The Stop Hook only checks whether the active C2C execution has a matching persisted execution record.
- The Hook does not implement a second persistence mechanism.
- Non-C2C tasks are not affected.
- Test/lint/review requirements are not added to this gate.

Final intended behavior:

```text
C2C-managed execution
        ↓
matching execution record?
   ├─ NO → block Stop / require finalization
   └─ YES → allow Stop
```

## Implementation

Main implementation areas:

- `src/hooks/stop-finalization.ts`
  - Implements the finalization gate logic.
  - Reads existing C2C session/checkpoint and execution-record state.

- `src/cli/index.ts`
  - Adds the hidden `c2c hook stop` JSON handler.

- `src/config/sandbox-allow.ts`
  - Installs the Stop Hook idempotently through the existing C2C setup path.

- `tests/stop-finalization-hook.test.ts`
  - Adds focused Stop Hook and CLI regression coverage.

- `tests/sandbox-allow.test.ts`
  - Covers hook installation behavior.

- `skill/SKILL.md`
  - Updates workflow guidance for the enforced execution-finalization behavior.

## `stop_hook_active` Bypass Found and Fixed

The first implementation allowed repeated Stop Hook invocation when `stop_hook_active=true` in order to prevent an infinite continuation loop.

That created a bypass:

```text
unfinalized C2C execution
→ first Stop blocked
→ continuation starts
→ finalization still fails
→ second Stop has stop_hook_active=true
→ Stop could be allowed
```

This violated the core invariant.

The fix changed the order and failure behavior:

1. Check C2C finalization first.
2. If the execution is finalized, allow Stop.
3. If it is unfinalized and this is the first Stop, block and request finalization.
4. If it is still unfinalized during the repeated Stop Hook invocation, return a stopped/failed outcome without starting another continuation loop.

Therefore:

- `stop_hook_active` no longer bypasses finalization.
- Infinite Stop Hook loops are still prevented.
- An unfinalized C2C task cannot complete successfully.

## Validation

After the bypass fix:

- Full test suite: **224/224 passed**
- TypeScript typecheck: **passed**
- `git diff --check`: **passed**
- No parallel persistence/state mechanism added.

## Runtime E2E

A runtime E2E was performed without modifying code.

Temporary workspace/state were created and an active C2C execution checkpoint was established:

```bash
TMP_WS="$(mktemp -d /tmp/c2c-stop-e2e-workspace.XXXXXX)"
TMP_STATE="$(mktemp -d /tmp/c2c-stop-e2e-state.XXXXXX)"
export C2C_STATE_DIR="$TMP_STATE"

node --import tsx src/cli/index.ts session set   -w "$TMP_WS"   --task c2c_gate   --iteration 2   --protocol-state EXECUTING   --waiting-for none
```

Observed:

```text
✓ 已记录 ChatGPT 会话，后续任务将复用
```

### Scenario 1 — Active C2C execution without matching execution record

Command:

```bash
printf '%s' '{"hook_event_name":"Stop","cwd":"'"$TMP_WS"'","stop_hook_active":false}' |
  node --import tsx src/cli/index.ts hook stop
```

Observed:

```json
{"continue":true,"decision":"block","reason":"C2C finalization is required before stopping. Persist execution metadata for c2c_gate iteration 2 through the existing c2c record or c2c exec path, then finish the response."}
```

Result: **PASS** — Stop was blocked.

### Scenario 2 — Persist matching execution record, then Stop again

Command:

```bash
node --import tsx src/cli/index.ts record   -w "$TMP_WS"   --task c2c_gate   --iteration 2   --changed-files 0   --tests 'runtime E2E'   --exit-status ok
```

Observed:

```text
✓ 已记录执行摘要
```

Then:

```bash
printf '%s' '{"hook_event_name":"Stop","cwd":"'"$TMP_WS"'","stop_hook_active":false}' |
  node --import tsx src/cli/index.ts hook stop
```

Observed:

```json
{"continue":false,"suppressOutput":true}
```

Result: **PASS** — after the matching execution record existed, Stop was allowed.

Final session inspection confirmed:

- active task: `c2c_gate`
- iteration: `2`
- protocol state: `EXECUTING`
- matching execution record present
- finalization allowed

`git status --short` remained empty during the E2E.

## Related Commits

The work was separated into clean commits before push, including:

- Jev decision-gate integration
- C2C execution-record finalization invariant
- C2C Stop Hook finalization gate

The Stop Hook work was committed with:

```text
feat: enforce C2C finalization with Stop hook
```

All local commits were subsequently pushed.

## Final Invariant

The workflow now enforces:

```text
IF task is C2C-managed
AND matching execution record is not persisted
THEN successful Stop is forbidden.
```

Operationally:

```text
non-C2C
→ Stop allowed

C2C + matching persisted execution record
→ Stop allowed

C2C + no matching record
→ first Stop blocked and finalization requested

C2C + still unfinalized on repeated Stop
→ fail/stop without continuation loop
→ cannot complete successfully
```

## Conclusion

The C2C execution-finalization requirement is no longer only a prompt or documentation convention.

It is now enforced through:

```text
C2C execution contract
→ persisted execution record
→ Codex Stop Hook gate
→ regression tests
→ runtime E2E verification
```

The execution finalization gap is therefore closed at both code and runtime levels.
