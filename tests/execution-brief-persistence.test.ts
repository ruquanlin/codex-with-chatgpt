import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createExecutionBrief } from "../src/workflow/execution-brief.js";
import { persistExecutionBrief } from "../src/workflow/execution-brief-persistence.js";

const brief = (mode: "ephemeral" | "persisted") => createExecutionBrief({
  goal: "Fix the handler", knownFacts: ["Failure reproduced"],
  approvedBasis: { type: "root_cause", summary: "Cause established" },
  scope: { inScope: ["handler"], outOfScope: ["redesign"] }, mustChange: ["Correct handler"],
  mustNotChange: ["API"], acceptanceCriteria: ["Regression test passes"],
  validationExpectation: ["Run focused test"], riskNotes: ["Low blast radius"], persistence: { mode },
});

describe("Execution Brief persistence", () => {
  let root = "";
  afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); root = ""; });
  async function makeRoot() { root = await mkdtemp(join(tmpdir(), "c2c-brief-")); return root; }

  it("does not write ephemeral briefs", async () => {
    const workspaceRoot = await makeRoot();
    const result = await persistExecutionBrief(brief("ephemeral"), { workspaceRoot, taskSlug: "handler-fix", executionLineId: "line-1", date: "2026-10-16" });
    expect(result.path).toBeUndefined();
    await expect(stat(join(workspaceRoot, "docs"))).rejects.toThrow();
  });

  it("writes canonical fields only under the brief directory", async () => {
    const workspaceRoot = await makeRoot();
    const result = await persistExecutionBrief(brief("persisted"), { workspaceRoot, taskSlug: "handler-fix", executionLineId: "line-1", date: "2026-10-16" });
    const rel = relative(workspaceRoot, result.path!);
    expect(rel.split(sep).slice(0, 3)).toEqual(["docs", "workflow", "execution-briefs"]);
    expect(rel).toMatch(/^docs\/workflow\/execution-briefs\/2026-10-16-handler-fix-[a-f0-9]{8}\.md$/);
    const contents = await readFile(result.path!, "utf8");
    for (const field of ["Goal", "Known Facts", "Approved Basis", "Scope", "Must Change", "Must Not Change", "Acceptance Criteria", "Validation Expectation", "Risk Notes"]) expect(contents).toContain(`## ${field}`);
    expect(contents).not.toContain("WDR");
  });

  it("updates the same execution line in place and assigns a new artifact for a new identity", async () => {
    const workspaceRoot = await makeRoot();
    const options = { workspaceRoot, taskSlug: "handler-fix", date: "2026-10-16" };
    const first = await persistExecutionBrief(brief("persisted"), { ...options, executionLineId: "line-1" });
    const update = await persistExecutionBrief(createExecutionBrief({ ...brief("persisted"), goal: "Updated handler fix" }), { ...options, executionLineId: "line-1" });
    const other = await persistExecutionBrief(brief("persisted"), { ...options, executionLineId: "line-2" });
    expect(update.path).toBe(first.path);
    expect(other.path).not.toBe(first.path);
  });

  it("rejects traversal and invalid slugs", async () => {
    const workspaceRoot = await makeRoot();
    await expect(persistExecutionBrief(brief("persisted"), { workspaceRoot, taskSlug: "../../outside", executionLineId: "line-1", date: "2026-10-16" })).rejects.toThrow(/slug/i);
    await expect(persistExecutionBrief(brief("persisted"), { workspaceRoot, taskSlug: "safe", executionLineId: "line-1", date: "20261016" })).rejects.toThrow(/date/i);
  });
});
