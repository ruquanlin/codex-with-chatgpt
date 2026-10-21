import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function readArtifact(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("C2C workflow artifact execution-reporting contract", () => {
  it("documents the global execution-record invariant in the execution policy", () => {
    const policy = readArtifact("docs/codex-execution-policy.md");

    expect(policy).toContain("## 2. Global Execution-Record Invariant");
    expect(policy).toContain(
      "execution reporting and finalization are part of the C2C execution contract"
    );
    expect(policy).toContain(
      "diagnosis-only, implementation, review, documentation, validation-only,\nno-change, and `changedFiles=0` tasks"
    );
    expect(policy).toContain(
      "must not be\nconsidered complete until the matching `(taskId, iteration)` execution\nmetadata is successfully persisted"
    );
  });

  it("promotes the same requirement to a global C2C Skill rule", () => {
    const skill = readArtifact("skill/SKILL.md");

    expect(skill).toContain("### Global C2C execution-record invariant");
    expect(skill).toContain(
      "Apply this automatically whenever\noperating under the C2C Skill, even when the concrete task prompt contains no\nwording about reporting, finalization, or execution records."
    );
    expect(skill).toContain(
      "existing `c2c record` or `c2c exec` path"
    );
    expect(skill).toContain(
      "Keep the existing EXECUTED guard\nsemantics"
    );
  });

  it("separates task prompts from protocol-owned reporting and finalization", () => {
    const protocol = readArtifact("docs/protocol.md");

    expect(protocol).toContain("## Prompt vs Protocol Envelope");
    expect(protocol).toContain(
      "The task prompt describes the concrete work Codex should perform. The C2C\nprotocol envelope owns execution reporting and finalization"
    );
    expect(protocol).toContain(
      "ChatGPT-generated Codex prompts do not need to repeat the reporting or\nfinalization requirement"
    );
    expect(protocol).toContain(
      "before the iteration is complete or\n`STATE: EXECUTED` is sent"
    );
  });

  it("requires PR delivery and connector review for delegated Codex Cloud work", () => {
    const protocol = readArtifact("docs/protocol.md");
    const skill = readArtifact("skill/SKILL.md");

    for (const handoff of [protocol, skill]) {
      expect(handoff).toContain("For delegated Codex Cloud work in a GitHub repository, request a PR");
      expect(handoff).toContain("short description of changes, validation results, and blockers or remaining");
      expect(handoff).toContain("Ask Codex Cloud to return its URL, then explicitly pass it to ChatGPT");
      expect(handoff).toContain("in the C2C control handoff. Use that URL to review the PR Diff and checks");
      expect(handoff).toContain("through the GitHub connector, not a pasted Codex report");
      expect(handoff).toContain("Do not assume\nautomatic PR notification or merge automatically");
      expect(handoff).toContain("Keep the matching C2C\nexecution record requirement");
      expect(handoff).toContain("For local workspace tools, use ONLY that connector. Use the GitHub connector");
    }
  });

  it("keeps Jev optional and advisory in policy, debugging workflow, and Skill", () => {
    const policy = readArtifact("docs/codex-execution-policy.md");
    const debugging = readArtifact("docs/efficient-debugging-workflow.md");
    const skill = readArtifact("skill/SKILL.md");

    expect(policy).toContain("## 2A. Optional Jev Advisory");
    expect(policy).toContain("only when the user explicitly requests consultation");
    expect(policy).toContain("cannot create\na new Stop Marker");
    expect(debugging).toContain("### Optional Jev advice");
    expect(debugging).toContain("Consult `jev_decision_gate` only when the user explicitly asks for Jev advice.");
    expect(skill).toContain("### Optional Jev Advisory");
    expect(skill).toContain("Jev may be consulted only when the user explicitly requests it.");
    expect(skill).toContain("They do not\nauthorize execution");
    expect(skill).toContain("Jev Receipt, or Stop Marker");
    expect(skill).not.toContain("### Mandatory Jev decision gate");
  });

  it("keeps generic workflow authority global and C2C policy additive", () => {
    const policy = readArtifact("docs/codex-execution-policy.md");
    const debugging = readArtifact("docs/efficient-debugging-workflow.md");
    expect(policy).toContain("active global workflow");
    expect(policy).toContain("C2C-specific");
    expect(debugging).toContain("Required Validation");
    expect(debugging).not.toContain("## Phase 4 — Full Validation");
  });

  it("documents the approved Phase 2 Jev and Execution Brief boundary", () => {
    const phase2 = readArtifact("docs/workflow/phases/phase-2-jev-execution-brief.md");
    expect(phase2).toContain("Jev(PROCEED)");
    expect(phase2).toContain("Jev(REFRAME)");
    expect(phase2).toContain("Jev(STOP)");
    expect(phase2).toContain("available = false");
    expect(phase2).toContain("docs/workflow/execution-briefs/");
    expect(phase2).toContain("WDR and Execution Brief are intentionally separate");
    expect(phase2).toContain("Phase 3 Prompt Compiler");
    expect(phase2).toContain("model selection");
    expect(phase2).toContain("Codex must not:");
  });

  it("makes Codex execution ownership conditional in protocol and Project templates", () => {
    const protocol = readArtifact("docs/protocol.md");
    const skill = readArtifact("skill/SKILL.md");
    expect(protocol).not.toContain("Codex owns execution.");
    expect(protocol).toContain("active global workflow chooses the execution owner");
    expect(protocol).toContain("only when Codex delegation is selected");
    expect(skill).not.toContain("You are the planning and review layer for one local workspace. Codex executes.");
    expect(skill).toContain("active global workflow chooses the execution owner");
  });

  it("keeps direct execution separate from direct workspace mutation authorization", () => {
    const policy = readArtifact("docs/codex-execution-policy.md");
    const protocol = readArtifact("docs/protocol.md");
    const skill = readArtifact("skill/SKILL.md");

    expect(policy).toContain("Direct execution does not imply permission to modify source code.");
    expect(policy).toContain("C2C mutation\ntools such as `apply_patch` may only be used when the active global workflow\nconfirms explicit user authorization for direct workspace mutation.");
    expect(policy).toContain("Selecting\ndirect execution is not itself direct-write authorization.");

    for (const template of [protocol, skill]) {
      expect(template).toContain("Direct execution does not itself authorize source-code changes");
      expect(template).toContain("C2C mutation tools such as `apply_patch`");
      expect(template).toContain("does not itself authorize source-code changes");
      expect(template).toContain("explicit user authorization for direct workspace mutation");
      expect(template).toContain("keep connector work read-only");
    }
  });
});
