import { describe, expect, it } from "vitest";
import { createExecutionProposal, type ExecutionProposalInput } from "../src/workflow/phase2.js";
import { routeCompletion, type CompletionInput } from "../src/workflow/phase4b/completion.js";

const proposal: ExecutionProposalInput = {
  executionLineId: "completion-line-1",
  goal: "Fix the handler",
  scope: { inScope: ["handler"], outOfScope: ["redesign"] },
  approvedBasis: { type: "approved_design", summary: "Approved narrow fix" },
  implementationBasis: ["preserve the API"],
  jevRequired: true,
};
const identity = createExecutionProposal(proposal).identity;

function input(overrides: Partial<CompletionInput> = {}): CompletionInput {
  return {
    executionLineId: proposal.executionLineId,
    proposalIdentity: identity,
    validation: { status: "PASSED", evidence: ["Focused test passed"] },
    review: { status: "PENDING" },
    acceptance: { required: false, status: "NOT_REQUIRED" },
    ...overrides,
  };
}

describe("Phase 4B pure completion routing", () => {
  it("requires verification and does not complete when validation is missing", () => {
    expect(routeCompletion(proposal, input({ validation: { status: "MISSING" } }))).toEqual({
      state: "BLOCKED", outcome: "VERIFICATION_REQUIRED",
      executionLineId: proposal.executionLineId, proposalIdentity: identity,
    });
  });

  it("hands failed validation to Phase 4A without closing", () => {
    expect(routeCompletion(proposal, input({ validation: { status: "FAILED", evidence: ["Focused test failed"] } }))).toMatchObject({
      state: "BLOCKED", outcome: "FAILURE_RECORD_REQUIRED",
    });
  });

  it("requires review after passing validation even if Codex reports completion", () => {
    expect(routeCompletion(proposal, input())).toMatchObject({ state: "REVIEW_PENDING", outcome: "REVIEW_REQUIRED" });
  });

  it("hands a failed review to Phase 4A", () => {
    expect(routeCompletion(proposal, input({
      review: { status: "FAILED", evidence: ["Review found an unmet criterion"] },
    }))).toMatchObject({ state: "BLOCKED", outcome: "FAILURE_RECORD_REQUIRED" });
  });

  it("closes after review passes when acceptance is explicitly not required", () => {
    expect(routeCompletion(proposal, input({
      review: { status: "PASSED", evidence: ["Review approved"] },
      acceptance: { required: false, status: "NOT_REQUIRED" },
    }))).toMatchObject({ state: "COMPLETED", outcome: "CLOSED" });
  });

  it("keeps required user acceptance pending instead of inferring acceptance", () => {
    expect(routeCompletion(proposal, input({
      review: { status: "PASSED", evidence: ["Review approved"] },
      acceptance: { required: true, status: "PENDING" },
    }))).toMatchObject({ state: "ACCEPTANCE_PENDING", outcome: "USER_ACCEPTANCE_REQUIRED" });
  });

  it("closes only after explicit required acceptance with evidence", () => {
    expect(routeCompletion(proposal, input({
      review: { status: "PASSED", evidence: ["Review approved"] },
      acceptance: { required: true, status: "ACCEPTED", evidence: ["User accepted the result"] },
    }))).toMatchObject({ state: "COMPLETED", outcome: "CLOSED" });
  });

  it("hands rejected required acceptance to Phase 4A", () => {
    expect(routeCompletion(proposal, input({
      review: { status: "PASSED", evidence: ["Review approved"] },
      acceptance: { required: true, status: "REJECTED", evidence: ["User rejected the result"] },
    }))).toMatchObject({ state: "BLOCKED", outcome: "FAILURE_RECORD_REQUIRED" });
  });

  it("rejects acceptance decisions before review passes", () => {
    for (const status of ["ACCEPTED", "REJECTED"] as const) {
      expect(() => routeCompletion(proposal, input({
        review: { status: "PENDING" },
        acceptance: { required: true, status, evidence: ["Decision evidence"] },
      }))).toThrow();
    }
  });

  it("rejects mismatched execution lines and recomputed proposal identities", () => {
    expect(() => routeCompletion(proposal, input({ executionLineId: "another-line" }))).toThrow();
    expect(() => routeCompletion(proposal, input({ proposalIdentity: "0".repeat(64) }))).toThrow();
    expect(() => routeCompletion({ ...proposal, goal: "Changed goal" }, input())).toThrow();
  });

  it("rejects missing decision evidence and evidence on states without a decision", () => {
    expect(() => routeCompletion(proposal, input({ validation: { status: "PASSED", evidence: [] } }))).toThrow();
    expect(() => routeCompletion(proposal, input({ validation: { status: "FAILED", evidence: [" "] } }))).toThrow();
    expect(() => routeCompletion(proposal, input({ validation: { status: "MISSING", evidence: ["not allowed"] } }))).toThrow();
    expect(() => routeCompletion(proposal, input({ review: { status: "PASSED", evidence: [] } }))).toThrow();
    expect(() => routeCompletion(proposal, input({ review: { status: "PENDING", evidence: ["claim"] } }))).toThrow();
    expect(() => routeCompletion(proposal, input({
      review: { status: "PASSED", evidence: ["Review approved"] },
      acceptance: { required: true, status: "ACCEPTED", evidence: [" "] },
    }))).toThrow();
  });

  it("rejects inconsistent acceptance requirements and unsupported input fields", () => {
    expect(() => routeCompletion(proposal, input({ acceptance: { required: false, status: "PENDING" } }))).toThrow();
    expect(() => routeCompletion(proposal, input({ acceptance: { required: true, status: "NOT_REQUIRED" } }))).toThrow();
    expect(() => routeCompletion(proposal, input({ acceptance: { required: false, status: "ACCEPTED", evidence: ["accepted"] } }))).toThrow();
    expect(() => routeCompletion(proposal, { ...input(), codexDone: true } as CompletionInput)).toThrow();
  });
});
