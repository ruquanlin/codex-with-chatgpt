import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { startBridge, type Bridge } from "../src/bridge/server.js";
import { appendExecutionRecord } from "../src/execution/records.js";
import { saveExecutionOutput } from "../src/execution/output.js";
import { makeTmpDir, cleanup, write, makeGitRepo, git, isolateStateDir } from "./helpers.js";

let root: string;
let bridge: Bridge;
let client: Client;
let accessToken: string;
let stateDir: string;

function textOf(result: { content?: unknown }): string {
  const content = result.content as { type: string; text: string }[];
  return content?.[0]?.text ?? "";
}

function jsonOf<T = Record<string, unknown>>(result: { content?: unknown }): T {
  return JSON.parse(textOf(result)) as T;
}

function structuredJsonOf<T = Record<string, unknown>>(result: { content?: unknown; structuredContent?: unknown }): T {
  const parsed = jsonOf<T>(result);
  expect(result.structuredContent).toEqual(parsed);
  return parsed;
}

function expectToolOutputSchema(
  tools: Awaited<ReturnType<Client["listTools"]>>["tools"],
  name: string,
  properties: string[]
): void {
  const schema = tools.find((tool) => tool.name === name)?.outputSchema as
    | { type?: string; properties?: Record<string, unknown> }
    | undefined;
  expect(schema?.type).toBe("object");
  expect(Object.keys(schema?.properties ?? {})).toEqual(expect.arrayContaining(properties));
}

beforeAll(async () => {
  stateDir = isolateStateDir();
  root = makeTmpDir("mcp-ws");
  makeGitRepo(root);
  write(
    root,
    "package.json",
    JSON.stringify({
      name: "demo",
      scripts: {
        build: "node -e \"console.log('configured build passed')\"",
        lint: "node -e \"console.log('configured lint passed')\"",
        test: "node -e \"console.log('configured tests passed')\"",
      },
      dependencies: { react: "^19.0.0" },
    })
  );
  write(root, ".env", "API_KEY=supersecret\n");
  write(root, "docs/codex-execution-policy.md", "# Fake workspace policy\n\nThis must never be returned.\n");
  write(root, "docs/efficient-debugging-workflow.md", "# Fake workspace workflow\n\nThis must never be returned.\n");
  // an uncommitted change so git_diff has content
  write(root, "src/index.ts", "export const answer = 43; // changed\n");

  bridge = await startBridge({
    workspaceRoot: root,
    port: 0,
    persistRuntime: false,
    authStoreFile: path.join(makeTmpDir("auth"), "store.json"),
  });
  const tokens = bridge.authStore.issueTokens({
    clientId: "it-client",
    scopes: ["workspace.read", "workspace.search", "workspace.write", "git.read", "execution.read"],
  });
  accessToken = tokens.accessToken;

  client = new Client({ name: "c2c-test-client", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`${bridge.localBaseUrl()}/mcp`), {
    requestInit: { headers: { authorization: `Bearer ${accessToken}` } },
  });
  await client.connect(transport);
});

afterAll(async () => {
  await client.close();
  await bridge.close();
  cleanup(root);
});

describe("MCP tools over Streamable HTTP", () => {
  it("lists all MCP tools", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name).sort();
    expect(names).toEqual([
      "apply_patch",
      "build_project",
      "execution_brief_validate",
      "execution_output",
      "execution_summary",
      "git_diff",
      "git_status",
      "jev_decision_gate",
      "list_directory",
      "phase2_execution_brief",
      "phase2_transition",
      "phase3_compile_execution",
      "read_file",
      "run_lint",
      "run_tests",
      "search_workspace",
      "test_status",
      "workflow_policy",
      "workspace_info",
    ]);
    for (const forbidden of ["write_file", "delete_file", "execute_shell", "git_commit", "install_package"]) {
      expect(names).not.toContain(forbidden);
    }

    expectToolOutputSchema(tools, "workspace_info", ["workspaceId", "workspaceName", "projectType", "git"]);
    expectToolOutputSchema(tools, "list_directory", ["path", "entries", "total", "hasMore"]);
    expectToolOutputSchema(tools, "read_file", ["path", "content", "startLine", "endLine", "nextStartLine"]);
    expectToolOutputSchema(tools, "search_workspace", ["matches", "matchCount", "truncated", "engine"]);
    expectToolOutputSchema(tools, "git_status", ["isRepo", "branch", "staged", "unstaged", "untracked", "hidden"]);
    expectToolOutputSchema(tools, "git_diff", ["isRepo", "mode", "diff", "hasMore", "nextOffset"]);
    expectToolOutputSchema(tools, "test_status", ["available", "tests", "outputAvailable", "outputId"]);
    expectToolOutputSchema(tools, "execution_summary", ["records"]);
    expectToolOutputSchema(tools, "execution_output", ["action", "items", "text", "stdout", "stderr"]);
    expectToolOutputSchema(tools, "apply_patch", ["checked", "applied"]);
    expectToolOutputSchema(tools, "run_tests", ["passed", "exitCode", "stdout", "stderr"]);
    expectToolOutputSchema(tools, "build_project", ["passed", "exitCode", "stdout", "stderr"]);
    expectToolOutputSchema(tools, "run_lint", ["passed", "exitCode", "stdout", "stderr"]);
    expectToolOutputSchema(tools, "jev_decision_gate", ["available", "decision", "confidence", "probabilities"]);
    expectToolOutputSchema(tools, "execution_brief_validate", ["valid", "brief"]);
    expectToolOutputSchema(tools, "phase2_transition", ["state", "proposal"]);
    expectToolOutputSchema(tools, "phase2_execution_brief", ["state", "brief", "persistence"]);
    expectToolOutputSchema(tools, "phase3_compile_execution", ["status", "package", "issues"]);
    expectToolOutputSchema(tools, "workflow_policy", ["changed", "policyHash", "version"]);
  });

  it("exposes the live registered MCP tool names through the read-only admin diagnostic", async () => {
    const response = await fetch(`${bridge.localBaseUrl()}/admin/mcp-tools`, {
      headers: { authorization: `Bearer ${bridge.adminToken}` },
    });
    expect(response.status).toBe(200);
    const diagnostic = await response.json() as { count: number; names: string[]; phase2Tools: Record<string, boolean> };
    const liveTools = await client.listTools();
    expect(diagnostic.count).toBe(liveTools.tools.length);
    expect(diagnostic.names).toEqual(liveTools.tools.map((tool) => tool.name).sort());
    expect(diagnostic.phase2Tools).toEqual({
      phase2_transition: true,
      phase2_execution_brief: true,
      execution_brief_validate: true,
    });
  });

  it("workflow_policy returns installed policy docs and supports hash-based cheap checks", async () => {
    const first = structuredJsonOf<{
      changed: boolean;
      policyHash: string;
      version: string;
      sources: { path: string; sha256: string; sizeBytes: number }[];
      policy: { global: string; debugging: string };
    }>(await client.callTool({ name: "workflow_policy", arguments: {} }));

    expect(first.changed).toBe(true);
    expect(first.policyHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.version).toBeTruthy();
    expect(first.sources.map((source) => source.path).sort()).toEqual([
      "docs/codex-execution-policy.md",
      "docs/efficient-debugging-workflow.md",
    ]);
    expect(first.policy.global).toContain("# Codex Execution Policy");
    expect(first.policy.debugging).toContain("# Efficient Debugging Workflow");
    expect(first.policy.global).not.toContain("Fake workspace policy");
    expect(first.policy.debugging).not.toContain("Fake workspace workflow");

    const unchanged = structuredJsonOf<{
      changed: boolean;
      policyHash: string;
      version: string;
      sources?: unknown;
      policy?: unknown;
    }>(await client.callTool({ name: "workflow_policy", arguments: { knownHash: first.policyHash } }));

    expect(unchanged).toEqual({
      changed: false,
      policyHash: first.policyHash,
      version: first.version,
    });

    const changed = structuredJsonOf<{
      changed: boolean;
      policyHash: string;
      sources: unknown[];
      policy: { global: string; debugging: string };
    }>(await client.callTool({ name: "workflow_policy", arguments: { knownHash: "not-current" } }));

    expect(changed.changed).toBe(true);
    expect(changed.policyHash).toBe(first.policyHash);
    expect(changed.sources.length).toBe(2);
    expect(changed.policy.global).toContain("# Codex Execution Policy");
    expect(changed.policy.debugging).toContain("# Efficient Debugging Workflow");
  });

  it("validates and returns a canonical Execution Brief without writing it", async () => {
    const brief = {
      goal: "Fix the handler", knownFacts: ["Failure reproduced"],
      approvedBasis: { type: "root_cause", summary: "Cause established" },
      scope: { inScope: ["handler"], outOfScope: ["redesign"] },
      mustChange: ["Correct handler"], mustNotChange: ["API"],
      acceptanceCriteria: ["Regression passes"], validationExpectation: ["Run focused test"],
      riskNotes: ["Low risk"], persistence: { mode: "ephemeral" },
    };
    const result = structuredJsonOf<{ valid: boolean; brief: typeof brief }>(await client.callTool({ name: "execution_brief_validate", arguments: { brief } }));
    expect(result).toEqual({ valid: true, brief });
    expect(fs.existsSync(path.join(root, "docs", "workflow", "execution-briefs"))).toBe(false);
  });

  it("compiles an approved brief through one read-only Phase 3 tool and rejects insufficient boundaries", async () => {
    const brief = {
      goal: "Fix handler logic", knownFacts: ["Confirmed handler is in src/handler.ts"],
      approvedBasis: { type: "approved_design", summary: "Correct the existing handler branch" },
      scope: { inScope: ["Existing handler branch"], outOfScope: ["Other API behavior"] },
      mustChange: ["Correct the handler branch for empty input"], mustNotChange: ["Public API"],
      acceptanceCriteria: ["Empty input returns the expected response"], validationExpectation: ["Run focused handler regression"],
      riskNotes: ["Low risk"], persistence: { mode: "ephemeral" },
    };
    const ready = structuredJsonOf<{ status: string; package: { prompt: string; modelRecommendation: { tier: string }; validationPlan: { browserRequired: boolean } } }>(
      await client.callTool({ name: "phase3_compile_execution", arguments: { brief } })
    );
    expect(ready.status).toBe("READY");
    expect(ready.package.prompt).toContain("Correct the handler branch for empty input");
    expect(ready.package.modelRecommendation.tier).toBe("STANDARD");
    expect(ready.package.validationPlan.browserRequired).toBe(false);
    const rejected = structuredJsonOf<{ status: string; issues: string[] }>(
      await client.callTool({ name: "phase3_compile_execution", arguments: { brief: { ...brief, mustChange: ["Fix it"] } } })
    );
    expect(rejected.status).toBe("REJECTED_INSUFFICIENT_BRIEF");
    expect(rejected.issues[0]).toContain("mustChange");
    expect(fs.existsSync(path.join(root, "docs", "workflow", "execution-briefs"))).toBe(false);
  });

  it("runs the Phase 2 transition and creates a brief only for the matching Jev-approved proposal", async () => {
    const proposal = {
      executionLineId: "mcp-line-1", goal: "Fix the handler",
      scope: { inScope: ["handler"], outOfScope: ["redesign"] },
      approvedBasis: { type: "approved_design", summary: "Approved narrow change" },
      implementationBasis: ["preserve API"], jevRequired: true,
    };
    const first = structuredJsonOf<{ state: string; proposal: { identity: string } }>(await client.callTool({ name: "phase2_transition", arguments: { proposal } }));
    expect(first.state).toBe("EXECUTION_PROPOSED");
    const details = {
      knownFacts: ["Handler failure reproduced"], mustChange: ["Correct handler"], mustNotChange: ["Public API"],
      acceptanceCriteria: ["Focused test passes"], validationExpectation: ["Run focused test"], riskNotes: ["Low risk"],
      persistence: { mode: "ephemeral" },
    };
    const changedProposal = { ...proposal, goal: "Expand and redesign handler" };
    const stale = structuredJsonOf<{ state: string; created: boolean; brief?: unknown }>(await client.callTool({ name: "phase2_execution_brief", arguments: {
      proposal: changedProposal,
      boundJevResult: { proposalIdentity: first.proposal.identity, result: { available: true, decision: "proceed" } },
      details,
    } }));
    expect(stale).toMatchObject({ state: "EXECUTION_PROPOSED", created: false });
    expect(stale).not.toHaveProperty("brief");

    const ready = structuredJsonOf<{ state: string; proposal: { identity: string } }>(await client.callTool({ name: "phase2_transition", arguments: {
      proposal, boundJevResult: { proposalIdentity: first.proposal.identity, result: { available: true, decision: "proceed" } },
    } }));
    expect(ready.state).toBe("READY_FOR_EXECUTION");
    const result = structuredJsonOf<{ state: string; brief: { goal: string }; persistence: { path?: string } }>(await client.callTool({ name: "phase2_execution_brief", arguments: {
      proposal, boundJevResult: { proposalIdentity: ready.proposal.identity, result: { available: true, decision: "proceed" } }, details,
    } }));
    expect(result.state).toBe("READY_FOR_EXECUTION");
    expect(result.brief.goal).toBe(proposal.goal);
    expect(result.persistence.path).toBeUndefined();
    expect(fs.existsSync(path.join(root, "docs", "workflow", "execution-briefs"))).toBe(false);
  });

  it.each([
    ["reframe", true, "REFRAME_REQUIRED"],
    ["stop", true, "STOPPED"],
    [undefined, false, "BLOCKED"],
  ] as const)("prevents brief creation for %s Jev result", async (decision, available, expectedState) => {
    const proposal = {
      executionLineId: `blocked-${expectedState}`, goal: "Fix the handler",
      scope: { inScope: ["handler"], outOfScope: [] },
      approvedBasis: { type: "root_cause", summary: "Cause established" },
      implementationBasis: ["correct handler"], jevRequired: true,
    };
    const created = structuredJsonOf<{ proposal: { identity: string } }>(await client.callTool({ name: "phase2_transition", arguments: { proposal } }));
    const result = structuredJsonOf<{ state: string; created: boolean; brief?: unknown }>(await client.callTool({ name: "phase2_execution_brief", arguments: {
      proposal,
      boundJevResult: { proposalIdentity: created.proposal.identity, result: { available, ...(decision ? { decision } : {}), error: "Jev unavailable" } },
      details: {
        knownFacts: ["Known"], mustChange: ["Change"], mustNotChange: ["Protected"],
        acceptanceCriteria: ["Pass"], validationExpectation: ["Focused test"], riskNotes: ["Risk"],
        persistence: { mode: "ephemeral" },
      },
    } }));
    expect(result).toMatchObject({ state: expectedState, created: false });
    expect(result).not.toHaveProperty("brief");
  });

  it("persists persisted Phase 2 briefs through the workspace persistence implementation", async () => {
    const proposal = {
      executionLineId: "persisted-mcp-line", goal: "Fix and verify the handler",
      scope: { inScope: ["handler"], outOfScope: [] },
      approvedBasis: { type: "explicit_instruction", summary: "Explicit bounded request" },
      implementationBasis: ["change handler"], jevRequired: false,
    };
    const result = structuredJsonOf<{ state: string; brief: { persistence: { mode: string } }; persistence: { path?: string; reference?: string } }>(await client.callTool({ name: "phase2_execution_brief", arguments: {
      proposal,
      details: {
        knownFacts: ["Handler exists"], mustChange: ["Correct handler"], mustNotChange: ["API"],
        acceptanceCriteria: ["Focused test passes"], validationExpectation: ["Run focused test"], riskNotes: ["Bounded"],
        persistence: { mode: "persisted" },
      },
      persistenceOptions: { taskSlug: "handler-fix", date: "2026-10-16" },
    } }));
    expect(result.state).toBe("READY_FOR_EXECUTION");
    expect(result.brief.persistence.mode).toBe("persisted");
    expect(result.persistence.reference).toMatch(/^docs\/workflow\/execution-briefs\/2026-10-16-handler-fix-[a-f0-9]{8}\.md$/);
    expect(fs.readFileSync(result.persistence.path!, "utf8")).toContain("## Goal\nFix and verify the handler");
  });

  it("documents git_diff pagination with its output field names", async () => {
    const { tools } = await client.listTools();
    const description = tools.find((tool) => tool.name === "git_diff")?.description;
    expect(description).toContain("hasMore");
    expect(description).toContain("nextOffset");
    expect(description).not.toContain("has_more");
    expect(description).not.toContain("next_offset");
  });

  it("workspace_info returns identity and project detection", async () => {
    const result = await client.callTool({ name: "workspace_info", arguments: {} });
    const info = structuredJsonOf<{ workspaceId: string; projectType: string; frameworks: string[]; git: { isRepo: boolean; branch: string } }>(result);
    expect(info.workspaceId).toBe(bridge.workspace.id);
    expect(info.projectType).toBe("node");
    expect(info.frameworks).toContain("React");
    expect(info.git.isRepo).toBe(true);
    expect(info.git.branch).toBe("main");
  });

  it("read_file returns hello.txt", async () => {
    const result = await client.callTool({ name: "read_file", arguments: { path: "hello.txt" } });
    const file = structuredJsonOf<{ content: string; totalLines: number }>(result);
    expect(file.content).toContain("Hello from Codex with ChatGPT!");
  });

  it("read_file denies .env with ACCESS_DENIED_SENSITIVE_FILE and no content", async () => {
    const result = await client.callTool({ name: "read_file", arguments: { path: ".env" } });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("ACCESS_DENIED_SENSITIVE_FILE");
    expect(textOf(result)).not.toContain("supersecret");
  });

  it("read_file denies paths outside the workspace", async () => {
    const result = await client.callTool({ name: "read_file", arguments: { path: "../../etc/hosts" } });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("PATH_OUTSIDE_WORKSPACE");
  });

  it("list_directory lists the tree", async () => {
    const result = await client.callTool({ name: "list_directory", arguments: { path: ".", depth: 2 } });
    const listing = structuredJsonOf<{ entries: { path: string }[] }>(result);
    const paths = listing.entries.map((entry) => entry.path);
    expect(paths).toContain("hello.txt");
    expect(paths).toContain("src/index.ts");
    expect(paths).not.toContain(".env");
  });

  it("search_workspace finds matches", async () => {
    const result = await client.callTool({ name: "search_workspace", arguments: { query: "answer" } });
    const search = structuredJsonOf<{ matches: { path: string; line: number }[] }>(result);
    expect(search.matches.some((match) => match.path === "src/index.ts")).toBe(true);
  });

  it("git_status reports the dirty file", async () => {
    const result = await client.callTool({ name: "git_status", arguments: {} });
    const status = structuredJsonOf<{ isRepo: boolean; unstaged: { path: string }[] }>(result);
    expect(status.isRepo).toBe(true);
    expect(status.unstaged.some((entry) => entry.path === "src/index.ts")).toBe(true);
  });

  it("git_diff shows the change", async () => {
    const result = await client.callTool({ name: "git_diff", arguments: { mode: "unstaged" } });
    const diff = structuredJsonOf<{ diff: string; hasMore: boolean }>(result);
    expect(diff.diff).toContain("answer = 43");
    expect(diff.hasMore).toBe(false);
  });

  it("git_diff paginates large diffs", async () => {
    const big = Array.from({ length: 20000 }, (_, i) => `content line ${i}`).join("\n");
    write(root, "big-change.txt", big);
    git(root, "add", "big-change.txt");
    const first = structuredJsonOf<{ hasMore: boolean; nextOffset: number; totalBytes: number; returnedBytes: number }>(
      await client.callTool({ name: "git_diff", arguments: { mode: "staged", max_bytes: 4096 } })
    );
    expect(first.hasMore).toBe(true);
    expect(first.returnedBytes).toBeLessThanOrEqual(4096);
    const second = structuredJsonOf<{ offset: number; diff: string }>(
      await client.callTool({
        name: "git_diff",
        arguments: { mode: "staged", max_bytes: 4096, offset: first.nextOffset },
      })
    );
    expect(second.offset).toBe(first.nextOffset);
    expect(second.diff.length).toBeGreaterThan(0);
    git(root, "reset", "big-change.txt");
  });

  it("execution_summary and test_status read harness records", async () => {
    appendExecutionRecord(bridge.workspace.id, {
      taskId: "c2c_test1",
      iteration: 1,
      changedFiles: ["src/index.ts"],
      tests: "27 passed",
      exitStatus: "ok",
      timestamp: new Date().toISOString(),
    });
    const summary = structuredJsonOf<{ records: { taskId: string }[] }>(
      await client.callTool({ name: "execution_summary", arguments: {} })
    );
    expect(summary.records[0].taskId).toBe("c2c_test1");

    const status = structuredJsonOf<{ available: boolean; tests: string; outputAvailable: boolean; outputId: number | null }>(
      await client.callTool({ name: "test_status", arguments: {} })
    );
    expect(status.available).toBe(true);
    expect(status.tests).toBe("27 passed");
    expect(status.outputAvailable).toBe(false);
    expect(status.outputId).toBeNull();
  });

  it("bridge admin state uses the same state root as execution records", async () => {
    const response = await fetch(`${bridge.localBaseUrl()}/admin/info`, {
      headers: { authorization: `Bearer ${bridge.adminToken}` },
    });
    expect(response.ok).toBe(true);
    const info = (await response.json()) as { stateDir?: string };
    expect(info.stateDir).toBe(stateDir);

    appendExecutionRecord(bridge.workspace.id, {
      taskId: "state_root_shared",
      iteration: 1,
      changedFiles: 0,
      tests: "state root visible",
      exitStatus: "ok",
      timestamp: new Date().toISOString(),
    });

    const summary = structuredJsonOf<{ records: { taskId: string }[] }>(
      await client.callTool({ name: "execution_summary", arguments: { limit: 20 } })
    );
    expect(summary.records.some((record) => record.taskId === "state_root_shared")).toBe(true);
  });

  it("run_tests runs the configured test command and records output", async () => {
    const result = await client.callTool({ name: "run_tests", arguments: {} });
    const tests = structuredJsonOf<{ passed: boolean; exitCode: number; stdout: string; stderr: string }>(result);
    expect(tests.passed).toBe(true);
    expect(tests.exitCode).toBe(0);
    expect(tests.stdout).toContain("configured tests passed");

    const status = structuredJsonOf<{ available: boolean; taskId: string; tests: string; outputAvailable: boolean }>(
      await client.callTool({ name: "test_status", arguments: {} })
    );
    expect(status.available).toBe(true);
    expect(status.taskId).toBe("mcp_run_tests");
    expect(status.tests).toBe("passed");
    expect(status.outputAvailable).toBe(true);
  });

  it("build_project runs the configured build command and records output", async () => {
    const result = await client.callTool({ name: "build_project", arguments: {} });
    const build = structuredJsonOf<{ passed: boolean; exitCode: number; stdout: string; stderr: string }>(result);
    expect(build.passed).toBe(true);
    expect(build.exitCode).toBe(0);
    expect(build.stdout).toContain("configured build passed");

    const status = structuredJsonOf<{ available: boolean; taskId: string; tests: string; outputAvailable: boolean }>(
      await client.callTool({ name: "test_status", arguments: {} })
    );
    expect(status.available).toBe(true);
    expect(status.taskId).toBe("mcp_build_project");
    expect(status.tests).toBe("passed");
    expect(status.outputAvailable).toBe(true);
  });

  it("run_lint runs the configured lint command and records output", async () => {
    const result = await client.callTool({ name: "run_lint", arguments: {} });
    const lint = structuredJsonOf<{ passed: boolean; exitCode: number; stdout: string; stderr: string }>(result);
    expect(lint.passed).toBe(true);
    expect(lint.exitCode).toBe(0);
    expect(lint.stdout).toContain("configured lint passed");

    const status = structuredJsonOf<{ available: boolean; taskId: string; tests: string; outputAvailable: boolean }>(
      await client.callTool({ name: "test_status", arguments: {} })
    );
    expect(status.available).toBe(true);
    expect(status.taskId).toBe("mcp_run_lint");
    expect(status.tests).toBe("passed");
    expect(status.outputAvailable).toBe(true);
  });

  it("skips invalid persisted records when reporting execution status", async () => {
    appendExecutionRecord(bridge.workspace.id, {
      taskId: "c2c_valid_before_invalid",
      iteration: 2,
      changedFiles: 0,
      tests: "31 passed",
      exitStatus: "ok",
      timestamp: new Date().toISOString(),
    });
    fs.appendFileSync(
      path.join(stateDir, "executions", `${bridge.workspace.id}.jsonl`),
      JSON.stringify({
        taskId: "c2c_invalid",
        iteration: null,
        changedFiles: 0,
        tests: null,
        exitStatus: "ok",
        timestamp: new Date().toISOString(),
      }) + "\n"
    );

    const statusResult = await client.callTool({ name: "test_status", arguments: {} });
    expect(statusResult.isError ?? false).toBe(false);
    const status = structuredJsonOf<{ taskId: string; iteration: number }>(statusResult);
    expect(status.taskId).toBe("c2c_valid_before_invalid");
    expect(status.iteration).toBe(2);

    const summaryResult = await client.callTool({ name: "execution_summary", arguments: { limit: 1 } });
    expect(summaryResult.isError ?? false).toBe(false);
    const summary = structuredJsonOf<{ records: { taskId: string }[] }>(summaryResult);
    expect(summary.records.map((record) => record.taskId)).toEqual(["c2c_valid_before_invalid"]);
  });

  it("execution_output lists readable items and refuses restricted bodies", async () => {
    const readable = saveExecutionOutput(bridge.workspace.id, {
      command: "pnpm test",
      stdout: "FAIL src/a.test.ts",
      stderr: "AssertionError: expected true",
      exitCode: 1,
      validationType: "test",
    });
    const hidden = saveExecutionOutput(bridge.workspace.id, {
      command: "print-key",
      raw: "-----BEGIN RSA PRIVATE KEY-----\nsecret\n-----END RSA PRIVATE KEY-----",
      exitCode: 0,
    });
    const listResult = await client.callTool({
      name: "execution_output",
      arguments: { action: "list" },
    });
    const list = structuredJsonOf<{
      action: "list";
      items: { id: number; status: string; command: string; text?: string }[];
    }>(listResult);
    expect(list.action).toBe("list");
    expect(list.items.some((item) => item.id === readable.id && item.status === "readable")).toBe(true);
    expect(list.items.some((item) => item.id === hidden.id && item.status === "restricted")).toBe(true);
    expect(list.items.every((item) => item.text === undefined)).toBe(true);

    const readResult = await client.callTool({
      name: "execution_output",
      arguments: { action: "read", id: readable.id },
    });
    const body = structuredJsonOf<{ action: "read"; text: string; stdout: string; stderr: string; validationType: string }>(readResult);
    expect(body.action).toBe("read");
    expect(body.text).toContain("AssertionError");
    expect(body.stdout).toContain("FAIL src/a.test.ts");
    expect(body.stderr).toContain("AssertionError");
    expect(body.validationType).toBe("test");

    const denied = await client.callTool({
      name: "execution_output",
      arguments: { action: "read", id: hidden.id },
    });
    expect(denied.isError).toBe(true);
    expect(textOf(denied)).toContain("OUTPUT_RESTRICTED");
    expect(textOf(denied)).not.toContain("BEGIN RSA");

    const missing = await client.callTool({
      name: "execution_output",
      arguments: { action: "read", id: 999999 },
    });
    expect(missing.isError).toBe(true);
    expect(textOf(missing)).toContain("NOT_FOUND");
  });

  it("enforces scopes per tool", async () => {
    const limited = bridge.authStore.issueTokens({ clientId: "limited", scopes: ["workspace.read"] });
    const limitedClient = new Client({ name: "limited", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(`${bridge.localBaseUrl()}/mcp`), {
      requestInit: { headers: { authorization: `Bearer ${limited.accessToken}` } },
    });
    await limitedClient.connect(transport);
    const denied = await limitedClient.callTool({ name: "git_diff", arguments: {} });
    expect(denied.isError).toBe(true);
    expect(textOf(denied)).toContain("INSUFFICIENT_SCOPE");
    const outputDenied = await limitedClient.callTool({
      name: "execution_output",
      arguments: { action: "list" },
    });
    expect(outputDenied.isError).toBe(true);
    expect(textOf(outputDenied)).toContain("INSUFFICIENT_SCOPE");
    const runDenied = await limitedClient.callTool({ name: "run_tests", arguments: {} });
    expect(runDenied.isError).toBe(true);
    expect(textOf(runDenied)).toContain("INSUFFICIENT_SCOPE");
    const buildDenied = await limitedClient.callTool({ name: "build_project", arguments: {} });
    expect(buildDenied.isError).toBe(true);
    expect(textOf(buildDenied)).toContain("INSUFFICIENT_SCOPE");
    const lintDenied = await limitedClient.callTool({ name: "run_lint", arguments: {} });
    expect(lintDenied.isError).toBe(true);
    expect(textOf(lintDenied)).toContain("INSUFFICIENT_SCOPE");
    const allowed = await limitedClient.callTool({ name: "read_file", arguments: { path: "hello.txt" } });
    expect(allowed.isError ?? false).toBe(false);
    await limitedClient.close();
  });

  it("git_diff over MCP excludes sensitive files like .npmrc and service-account*.json", async () => {
    write(root, ".npmrc", "//registry.npmjs.org/:_authToken=supersecret-npm-token\n");
    write(root, "service-account-test.json", '{"private_key": "supersecret-sa-key"}\n');
    write(root, "src/visible.ts", "export const visible = 'safe-change';\n");

    git(root, "add", "-f", ".npmrc", "service-account-test.json", "src/visible.ts");

    const result = jsonOf<{ diff: string; isRepo: boolean }>(
      await client.callTool({ name: "git_diff", arguments: { mode: "staged" } })
    );

    expect(result.isRepo).toBe(true);
    expect(result.diff).toContain("safe-change");
    expect(result.diff).not.toContain("supersecret-npm-token");
    expect(result.diff).not.toContain("supersecret-sa-key");

    git(root, "rm", "-f", "--cached", ".npmrc", "service-account-test.json", "src/visible.ts");
  });

  it("git_diff over MCP blocks sensitive-to-safe renames from leaking original content", async () => {
    write(root, ".npmrc", "//registry.npmjs.org/:_authToken=mcp-secret-token-123\n");
    git(root, "add", "-f", ".npmrc");
    git(root, "commit", "-m", "add secret to rename");

    git(root, "mv", ".npmrc", "public_harmless.txt");

    const result = jsonOf<{ diff: string; isRepo: boolean }>(
      await client.callTool({ name: "git_diff", arguments: { mode: "staged" } })
    );

    expect(result.isRepo).toBe(true);
    expect(result.diff).not.toContain("mcp-secret-token-123");
    expect(result.diff).not.toContain("public_harmless.txt");

    git(root, "reset", "--hard", "HEAD");
  });

  it("git_diff over MCP with path='src' blocks cross-boundary rename leaks from root secrets", async () => {
    write(root, ".npmrc", "//registry.npmjs.org/:_authToken=root-mcp-scoped-secret\n");
    git(root, "add", "-f", ".npmrc");
    git(root, "commit", "-m", "add root secret for scoped test");

    // Rename root .npmrc to src/public.txt
    git(root, "mv", ".npmrc", "src/public.txt");

    const result = jsonOf<{ diff: string; isRepo: boolean }>(
      await client.callTool({
        name: "git_diff",
        arguments: { mode: "staged", path: "src" },
      })
    );

    expect(result.isRepo).toBe(true);
    expect(result.diff).not.toContain("root-mcp-scoped-secret");
    expect(result.diff).not.toContain("src/public.txt");

    git(root, "reset", "--hard", "HEAD");
  });
});
