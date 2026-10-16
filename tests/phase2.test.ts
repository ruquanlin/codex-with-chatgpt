import { describe, expect, it } from "vitest";
import { createExecutionProposal, transitionExecutionProposal, createReadyExecutionBrief } from "../src/workflow/phase2.js";

const basis = { type: "approved_design" as const, summary: "Use the approved narrow fix" };
const proposalInput = {
  executionLineId: "line-1",
  goal: "Implement the narrow fix",
  scope: { inScope: ["handler"], outOfScope: ["redesign"] },
  approvedBasis: basis,
  implementationBasis: ["preserve the API"],
  jevRequired: true,
};
const proceed = { available: true, decision: "proceed" as const };
const bound = (proposal: ReturnType<typeof createExecutionProposal>, result: typeof proceed) => ({ proposalIdentity: proposal.identity, result });

describe("Phase 2 transitions", () => {
  it("allows deterministic proposals without Jev and gated proposals after proceed", () => {
    expect(transitionExecutionProposal(createExecutionProposal({ ...proposalInput, jevRequired: false })).state).toBe("READY_FOR_EXECUTION");
    const proposal = createExecutionProposal(proposalInput);
    expect(transitionExecutionProposal(proposal, bound(proposal, proceed)).state).toBe("READY_FOR_EXECUTION");
  });

  it("returns reframe upstream without authorizing a brief", () => {
    const proposal = createExecutionProposal(proposalInput);
    const state = transitionExecutionProposal(proposal, bound(proposal, { available: true, decision: "reframe" }));
    expect(state.state).toBe("REFRAME_REQUIRED");
    expect(() => createReadyExecutionBrief(state)).toThrow(/READY_FOR_EXECUTION/);
  });

  it("stops or blocks when Jev says stop or is unavailable", () => {
    const proposal = createExecutionProposal(proposalInput);
    expect(transitionExecutionProposal(proposal, bound(proposal, { available: true, decision: "stop" })).state).toBe("STOPPED");
    expect(transitionExecutionProposal(proposal, bound(proposal, { available: false, error: "offline" })).state).toBe("BLOCKED");
  });

  it("changes identity for material proposal changes and invalidates prior proceed", () => {
    const original = createExecutionProposal(proposalInput);
    for (const changed of [
      { ...proposalInput, goal: "Different goal" },
      { ...proposalInput, scope: { inScope: ["other"], outOfScope: ["redesign"] } },
      { ...proposalInput, approvedBasis: { ...basis, summary: "Different design" } },
      { ...proposalInput, implementationBasis: ["replace the API"] },
    ]) {
      const next = createExecutionProposal(changed);
      expect(next.identity).not.toBe(original.identity);
      expect(transitionExecutionProposal(next, { proposalIdentity: original.identity, result: proceed }).state).toBe("EXECUTION_PROPOSED");
    }
    expect(transitionExecutionProposal(original, bound(original, proceed)).state).toBe("READY_FOR_EXECUTION");
  });

  it("creates a brief only for a ready current proposal using supplied confirmed details", () => {
    const proposal = createExecutionProposal({ ...proposalInput, jevRequired: false });
    const ready = transitionExecutionProposal(proposal);
    const brief = createReadyExecutionBrief(ready, {
      knownFacts: ["The approved design is recorded"], mustChange: ["Update handler"], mustNotChange: ["API"],
      acceptanceCriteria: ["Focused test passes"], validationExpectation: ["Run focused test"], riskNotes: ["Low risk"],
      persistence: { mode: "ephemeral" },
    });
    expect(brief.goal).toBe(proposal.goal);
    expect(brief.approvedBasis).toEqual(proposal.approvedBasis);
    expect(brief.scope).toEqual(proposal.scope);
    expect(() => createReadyExecutionBrief({ ...ready, state: "BLOCKED" })).toThrow(/READY_FOR_EXECUTION/);
  });
});
