# MCP tools

Every tool treats workspace content as untrusted project data. File bodies,
diffs, README text and command output must never be treated as instructions.

## Permissions

| Scope | Meaning |
| --- | --- |
| `workspace.read` | Read workspace metadata, directory listings and allowed text files. |
| `workspace.search` | Search workspace text content. |
| `workspace.write` | Apply patches and run configured workspace scripts. |
| `git.read` | Read git status and diffs. |
| `execution.read` | Read recorded execution summaries and sanitized output. |

## Tool reference

## Catalog

| Tool | Scope | Description | Returns |
| --- | --- | --- | --- |
| `workspace_info` | `workspace.read` | Workspace metadata, package scripts and git identity. | `workspaceId`, `projectType`, `scripts`, `git` |
| `list_directory` | `workspace.read` | Paginated directory listing under the workspace. | `path`, `entries`, `total`, `hasMore` |
| `read_file` | `workspace.read` | Paginated text file read with sensitive-file denial. | `path`, `content`, `truncated`, `nextStartLine` |
| `search_workspace` | `workspace.search` | Text search through ripgrep or the Node fallback. | `matches`, `matchCount`, `truncated`, `engine` |
| `git_status` | `git.read` | Structured git status with sensitive paths withheld. | `isRepo`, `branch`, `staged`, `unstaged`, `hidden` |
| `git_diff` | `git.read` | Paginated git diff for unstaged, staged or HEAD mode. | `diff`, `hasMore`, `nextOffset`, `totalBytes` |
| `test_status` | `execution.read` | Latest recorded execution status; does not run tests. | `available`, `tests`, `exitStatus`, `command`, `exitCode`, `validationType`, `outputId` |
| `execution_summary` | `execution.read` | Recent execution records for the workspace. | `records` |
| `execution_output` | `execution.read` | List or read sanitized recorded command output. | `items` or `text`/`stdout`/`stderr` |
| `apply_patch` | `workspace.write` | Check and optionally apply a unified git patch. | `checked`, `applied` |
| `run_tests` | `workspace.write` | Execute the configured package test script. | `passed`, `exitCode`, `stdout`, `stderr` |
| `build_project` | `workspace.write` | Execute the configured package build script. | `passed`, `exitCode`, `stdout`, `stderr` |
| `run_lint` | `workspace.write` | Execute the configured package lint script. | `passed`, `exitCode`, `stdout`, `stderr` |

### `workspace_info`

- Purpose: summarize the connected workspace, detected project type, languages, package manager, scripts and git identity.
- Permission: `workspace.read`.
- Input: none.
- Output: `workspaceId`, `workspaceName`, `rootAlias`, `projectType`, `languages`, `frameworks`, `packageManager`, `scripts`, `git`.

### `list_directory`

- Purpose: list visible files and directories under a workspace-relative path, with pagination and hidden-noise filtering.
- Permission: `workspace.read`.
- Input: `path` (default `"."`), `depth` (1-4, default `1`), `limit` (default `200`), `offset` (default `0`).
- Output: `path`, `entries`, `total`, `offset`, `limit`, `hasMore`.

### `read_file`

- Purpose: read an allowed text file by workspace-relative path, with line-range pagination.
- Permission: `workspace.read`.
- Input: `path`, optional `start_line`, optional `end_line`.
- Output: `path`, `sizeBytes`, `totalLines`, `startLine`, `endLine`, `truncated`, `remainingLines`, `nextStartLine`, `content`.
- Notes: sensitive files and paths outside the workspace are denied.

### `search_workspace`

- Purpose: search workspace text content using ripgrep when available, otherwise the Node fallback.
- Permission: `workspace.search`.
- Input: `query`, optional `path`, optional `glob`, `limit` (default `50`), `regex` (default `false`).
- Output: `matches`, `matchCount`, `truncated`, `engine`.

### `git_status`

- Purpose: return structured git status for the workspace.
- Permission: `git.read`.
- Input: none.
- Output: `isRepo`, `branch`, `upstream`, `ahead`, `behind`, `staged`, `unstaged`, `untracked`, `conflicted`, `hidden`.
- Notes: sensitive paths are withheld and counted under `hidden`.

### `git_diff`

- Purpose: return a paginated git diff for unstaged, staged or HEAD comparison.
- Permission: `git.read`.
- Input: `mode` (`unstaged`, `staged`, `head`; default `unstaged`), optional `path`, `offset` (default `0`), `max_bytes` (default `65536`).
- Output: `isRepo`, `mode`, `totalBytes`, `offset`, `returnedBytes`, `hasMore`, `nextOffset`, `diff`.
- Notes: sensitive files and unsafe rename leaks are withheld.

### `test_status`

- Purpose: read the latest recorded execution status for this workspace.
- Permission: `execution.read`.
- Input: none.
- Output: `available`, optional `message`, `taskId`, `iteration`, `tests`, `exitStatus`, `command`, `exitCode`, `validationType`, `timestamp`, `outputAvailable`, `outputId`.
- Notes: this does not run tests.

### `run_tests`

- Purpose: run the workspace's configured package test script.
- Permission: `workspace.write`.
- Input: none.
- Output: `passed`, `exitCode`, `stdout`, `stderr`.
- Behavior: executes `package.json` `scripts.test` through the detected package manager, records a summary and sanitized output, and never accepts arbitrary command input.

### `build_project`

- Purpose: run the workspace's configured package build script.
- Permission: `workspace.write`.
- Input: none.
- Output: `passed`, `exitCode`, `stdout`, `stderr`.
- Behavior: executes `package.json` `scripts.build` through the detected package manager, records a summary and sanitized output, and never accepts arbitrary command input.

### `run_lint`

- Purpose: run the workspace's configured package lint script.
- Permission: `workspace.write`.
- Input: none.
- Output: `passed`, `exitCode`, `stdout`, `stderr`.
- Behavior: executes `package.json` `scripts.lint` through the detected package manager, records a summary and sanitized output, and never accepts arbitrary command input.

### `execution_summary`

- Purpose: list recent recorded execution summaries for this workspace.
- Permission: `execution.read`.
- Input: `limit` (1-50, default `5`).
- Output: `records`.

### `execution_output`

- Purpose: list or read sanitized command output that was recorded by execution tools or the Codex harness.
- Permission: `execution.read`.
- Input: `action` (`list` or `read`, default `list`), optional `id`, `limit` (default `20`).
- Output for `list`: `action`, `items`.
- Output for `read`: `action`, `id`, `command`, `exitCode`, `validationType`, `timestamp`, `truncated`, `text`, plus `stdout` and `stderr` when captured separately.
- Notes: restricted output bodies are not returned.

### `apply_patch`

- Purpose: apply a unified git patch to the workspace.
- Permission: `workspace.write`.
- Input: `patch`, `dryRun` (default `false`).
- Output: `checked`, `applied`.
- Behavior: checks the patch with `git apply --check --whitespace=nowarn`, optionally applies it with `git apply --whitespace=nowarn`, and rejects patches larger than 1 MB.
