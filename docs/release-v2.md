# v2.0 release notes

v2.0 establishes the stable MCP API surface for Codex with ChatGPT. The goal of
this release is compatibility and predictable behavior: clients can rely on the
tool names, input schemas, output field names and scope requirements documented
in [MCP tools](mcp-tools.md).

## Stable API surface

The v2.0 MCP API includes:

- Workspace inspection: `workspace_info`, `list_directory`, `read_file`, `search_workspace`.
- Git inspection: `git_status`, `git_diff`.
- Execution status and output: `test_status`, `execution_summary`, `execution_output`.
- Fixed workspace actions: `apply_patch`, `run_tests`, `build_project`, `run_lint`.

These tools keep their current output field names and permission model for the
2.x line. Additive schema fields may be introduced when they are backwards
compatible, but existing field names and meanings should remain stable.

## Execution behavior

`run_tests`, `build_project` and `run_lint` intentionally execute only configured
package scripts from `package.json`. They do not accept arbitrary command input.
All three tools share the same package-script runner and return:

```json
{
  "passed": true,
  "exitCode": 0,
  "stdout": "...",
  "stderr": "..."
}
```

The runner records execution summaries and sanitized output for later
inspection through `test_status`, `execution_summary` and `execution_output`.

## Deferred enhancements

The following features are explicitly deferred to later minor versions so v2.0
can ship with a compact, stable API:

- `review_diff`: a higher-level review helper over the existing `git_diff` API.
- Execution cancellation for long-running package scripts.
- Streaming command output over MCP.
- Richer progress/status metadata for running executions.

These should be introduced as additive tools or additive fields rather than by
changing the v2.0 tool contracts.

## Release checklist

- Update `package.json` and `src/version.ts` to `2.0.0`.
- Keep the documented MCP tool contracts stable.
- Run `pnpm build`.
- Run `pnpm test`.
- Review `docs/mcp-tools.md` for any schema or permission drift before tagging.
