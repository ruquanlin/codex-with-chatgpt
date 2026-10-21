# Task

Fix the C2C orphaned-checkpoint bug that occurs when a user manually stops a Codex turn before the normal C2C Stop finalization completes.

## Reproduced failure

A C2C-managed iteration can be left in this state:

- `session.checkpoint` still exists;
- no matching execution record exists for `(taskId, iteration)`;
- the next `UserPromptSubmit` currently hard-blocks with:

`Previous C2C-managed task ... has no execution record. Finalize it before starting another Codex task.`

This happened after manually stopping Codex.

The current blocking logic is in:

`src/hooks/user-prompt-submit.ts`

```ts
const active = previous?.checkpoint;
if (active && !hasExecutionRecord(workspace.id, active.taskId, active.iteration)) {
  return {
    decision: "block",
    reason:
      `Previous C2C-managed task ${active.taskId} iteration ${active.iteration} has no execution record. ` +
      "Finalize it before starting another Codex task.",
  };
}
```

The normal Stop hook finalization already exists in:

`src/hooks/stop-finalization.ts`

and persists an execution output + execution record.

## Desired behavior

When a new `UserPromptSubmit` arrives and there is an active previous C2C checkpoint with no matching execution record:

1. treat the previous iteration as interrupted;
2. persist a valid execution record for that exact previous `(taskId, iteration)`;
3. mark it semantically as interrupted rather than successful completion;
4. then enroll the new prompt as the next iteration normally;
5. do not require the user to manually run `c2c hook stop`;
6. do not block merely because the previous Codex turn was manually stopped.

This recovery must happen only for an already C2C-connected workspace after the existing durable-binding/endpoint check.

## Persistence requirements

Use the existing execution persistence path and schema.

The recovered previous iteration should have clear metadata indicating interruption, for example:

- a command identifying C2C interrupted recovery/finalization;
- `validationType: "other"`;
- `tests: null`;
- an `exitStatus` such as `"interrupted"`;
- a short `notes` value explaining that the next `UserPromptSubmit` recovered an orphaned checkpoint after the prior turn ended before Stop finalization.

If execution output is persisted for this recovery, make it a small synthetic diagnostic message rather than pretending that the interrupted task completed successfully.

Do not invent successful test, lint, build, or typecheck results.

## Failure behavior

If interrupted recovery persistence itself fails:

- fail closed;
- block the new prompt;
- preserve the existing checkpoint;
- return a clear recovery/finalization error.

Do not silently discard the prior checkpoint.

## Important behavior boundaries

Do not change normal successful Stop finalization.

Do not create duplicate records when the previous iteration already has a matching execution record.

Do not change behavior for non-C2C workspaces.

Do not clear or skip a checkpoint unless its matching execution record has actually been persisted.

Do not modify Portfolio or any unrelated project.

Keep the task ID stable and let the new prompt receive the normal next iteration number.

Do not change global user hook configuration as part of this task.

## Implementation guidance

Prefer the smallest maintainable solution.

If practical, reuse or extract the existing execution-finalization persistence logic rather than maintaining two subtly different copies between:

- `src/hooks/stop-finalization.ts`
- `src/hooks/user-prompt-submit.ts`

However, do not perform a broad refactor just for style.

The recovery path should be explicit and easy to distinguish from a normally completed iteration.

## Regression tests

Locate the existing hook/session/execution tests and add focused regression coverage.

At minimum verify all of the following:

### 1. Previous checkpoint already has an execution record

- no recovery record is added;
- no duplicate record is created;
- the new prompt enrolls normally;
- the new prompt receives the normal next iteration.

### 2. Previous checkpoint is missing an execution record

- the exact previous `(taskId, iteration)` receives one interrupted execution record;
- the record is clearly marked as interrupted;
- no successful validation result is invented;
- the new prompt is not blocked;
- the new prompt enrolls as the next iteration.

### 3. Recovery persistence fails

- the new prompt is blocked;
- the prior checkpoint remains intact;
- the failure message clearly states that interrupted recovery/finalization failed.

### 4. Repeated invocation

- repeated invocation cannot create duplicate recovery records for the same `(taskId, iteration)`.

### 5. Non-C2C workspace

- behavior remains unchanged;
- no execution record is synthesized.

### 6. Normal Stop finalization

- existing `stop-finalization` behavior remains unchanged;
- existing Stop-finalization tests continue to pass.

## Validation

Run only the relevant focused tests first.

Then run the repository build/typecheck required to update generated executable output if this project expects `dist` to be rebuilt.

Confirm that the actual CLI invoked through:

```bash
node bin/c2c.js
```

contains the fix after the build.

If generated `dist` files are part of the repository's normal workflow, update them through the existing build process rather than editing generated files manually.

Do not commit or push.

Do not modify unrelated files.

## Completion criteria

The task is complete when this user flow works without manual intervention:

1. start a C2C-managed Codex task;
2. manually stop Codex before normal Stop finalization finishes;
3. submit the next C2C-managed prompt;
4. C2C automatically records the previous iteration as interrupted;
5. the next iteration starts normally;
6. the user no longer sees:

`Previous C2C-managed task ... has no execution record. Finalize it before starting another Codex task.`

Use the Minimal Completion Report.
