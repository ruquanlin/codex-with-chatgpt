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
  it("fails closed for caller-selected Jev bypasses and unverified results", () => {
    expect(transitionExecutionProposal(createExecutionProposal({ ...proposalInput, jevRequired: false })).state).toBe("EXECUTION_PROPOSED");
    const proposal = createExecutionProposal(proposalInput);
    expect(transitionExecutionProposal(proposal, bound(proposal, proceed)).state).toBe("EXECUTION_PROPOSED");
    expect(transitionExecutionProposal(proposal).state).toBe("EXECUTION_PROPOSED");
  });

  it("does not accept caller-supplied reframe, stop, or unavailable results as gate outcomes", () => {
    const proposal = createExecutionProposal(proposalInput);
    expect(transitionExecutionProposal(proposal, bound(proposal, { available: true, decision: "reframe" })).state).toBe("EXECUTION_PROPOSED");
    expect(transitionExecutionProposal(proposal, bound(proposal, { available: true, decision: "stop" })).state).toBe("EXECUTION_PROPOSED");
    expect(transitionExecutionProposal(proposal, bound(proposal, { available: false, error: "offline" })).state).toBe("EXECUTION_PROPOSED");
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
    expect(transitionExecutionProposal(original, bound(original, proceed)).state).toBe("EXECUTION_PROPOSED");
  });

  it("prevents untrusted inputs from creating an approved Execution Brief", () => {
    const details = {
      knownFacts: ["The approved design is recorded"], mustChange: ["Update handler"], mustNotChange: ["API"],
      acceptanceCriteria: ["Focused test passes"], validationExpectation: ["Run focused test"], riskNotes: ["Low risk"],
      persistence: { mode: "ephemeral" },
    };
    const bypassProposal = createExecutionProposal({ ...proposalInput, jevRequired: false });
    const bypassState = transitionExecutionProposal(bypassProposal);
    expect(bypassState.state).toBe("EXECUTION_PROPOSED");
    expect(() => createReadyExecutionBrief(bypassState, details)).toThrow(/READY_FOR_EXECUTION/);

    const gatedProposal = createExecutionProposal(proposalInput);
    const forgedProceed = transitionExecutionProposal(gatedProposal, bound(gatedProposal, proceed));
    expect(forgedProceed.state).toBe("EXECUTION_PROPOSED");
    expect(() => createReadyExecutionBrief(forgedProceed, details)).toThrow(/READY_FOR_EXECUTION/);
  });
});
