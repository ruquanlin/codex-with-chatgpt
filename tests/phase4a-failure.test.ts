import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createExecutionProposal, type ExecutionProposalInput } from "../src/workflow/phase2.js";
import { createFailureRecord, failureIdFor, failureOutcome, type FailureInput } from "../src/workflow/phase4a/failure.js";

const proposalInput: ExecutionProposalInput = {
  executionLineId: "line-1", goal: "Implement narrow fix", scope: { inScope: ["handler"], outOfScope: ["redesign"] },
  approvedBasis: { type: "approved_design", summary: "Approved design" }, implementationBasis: ["preserve API"], jevRequired: true,
};
const proposal = createExecutionProposal(proposalInput);
const validInput: FailureInput = {
  executionLineId: proposal.executionLineId, proposalIdentity: proposal.identity, failureType: "EXECUTION_FAILURE",
  failedAtStage: "EXECUTION", summary: "Focused implementation command failed", evidence: ["exit code 1"], nextRoute: "SYSTEMATIC_DEBUGGING",
};
const cases: Array<[FailureInput["failureType"], FailureInput["failedAtStage"], FailureInput["nextRoute"]]> = [
  ["EXECUTION_FAILURE", "EXECUTION", "SYSTEMATIC_DEBUGGING"],
  ["VALIDATION_FAILURE", "VALIDATION", "SYSTEMATIC_DEBUGGING"],
  ["VALIDATION_FAILURE", "VALIDATION", "VALIDATION_REROUTE"],
  ["REVIEW_FAILURE", "REVIEW", "ROUTER_REGRILL"],
  ["ACCEPTANCE_FAILURE", "ACCEPTANCE", "ROUTER_RECLASSIFY"],
];

describe("Phase 4A canonical failure contract", () => {
  it.each(cases)("accepts %s at %s with %s", (failureType, failedAtStage, nextRoute) => {
    expect(() => createFailureRecord("abcdef123456", proposalInput, { ...validInput, failureType, failedAtStage, nextRoute })).not.toThrow();
  });

  it.each([
    { failureType: "EXECUTION_FAILURE", failedAtStage: "EXECUTION", nextRoute: "VALIDATION_REROUTE" },
    { failureType: "VALIDATION_FAILURE", failedAtStage: "EXECUTION", nextRoute: "SYSTEMATIC_DEBUGGING" },
    { failureType: "REVIEW_FAILURE", failedAtStage: "REVIEW", nextRoute: "SYSTEMATIC_DEBUGGING" },
    { failureType: "ACCEPTANCE_FAILURE", failedAtStage: "ACCEPTANCE", nextRoute: "ROUTER_REGRILL" },
  ])("rejects invalid type/stage/route mapping %#", (combination) => {
    expect(() => createFailureRecord("abcdef123456", proposalInput, { ...validInput, ...combination } as FailureInput)).toThrow();
  });

  it("rejects a validation failure without an explicit next route", () => {
    const { nextRoute: _omitted, ...inputWithoutRoute } = { ...validInput, failureType: "VALIDATION_FAILURE" as const, failedAtStage: "VALIDATION" as const };
    expect(() => createFailureRecord("abcdef123456", proposalInput, inputWithoutRoute as FailureInput)).toThrow();
  });

  it("rejects unknown properties, blank required values, malformed workspace IDs and missing evidence", () => {
    expect(() => createFailureRecord("abcdef123456", proposalInput, { ...validInput, extra: true } as FailureInput)).toThrow();
    for (const key of ["executionLineId", "proposalIdentity", "summary"] as const) {
      expect(() => createFailureRecord("abcdef123456", proposalInput, { ...validInput, [key]: "  " })).toThrow();
    }
    expect(() => createFailureRecord("abcdef123456", proposalInput, { ...validInput, evidence: [] })).toThrow();
    expect(() => createFailureRecord("abcdef123456", proposalInput, { ...validInput, evidence: [" "] })).toThrow();
    expect(() => failureIdFor("not-a-workspace", "line-1")).toThrow();
  });

  it("rejects mismatched proposal execution line and recomputed proposal identity", () => {
    expect(() => createFailureRecord("abcdef123456", proposalInput, { ...validInput, executionLineId: "line-2" })).toThrow();
    expect(() => createFailureRecord("abcdef123456", { ...proposalInput, identity: "0".repeat(64) } as ExecutionProposalInput, validInput)).toThrow();
    expect(() => createFailureRecord("abcdef123456", { ...proposalInput, goal: "Different goal" }, validInput)).toThrow();
    expect(() => createFailureRecord("abcdef123456", { ...proposalInput, scope: { inScope: ["other"], outOfScope: ["redesign"] } }, validInput)).toThrow();
  });

  it("creates stable workspace-and-line IDs and distinct IDs for distinct lines", () => {
    expect(failureIdFor("abcdef123456", "line-1")).toBe(failureIdFor("abcdef123456", "line-1"));
    expect(failureIdFor("abcdef123456", "line-1")).not.toBe(failureIdFor("abcdef123456", "line-2"));
    expect(failureIdFor("abcdef123456", "line-1")).toBe(createHash("sha256").update(JSON.stringify(["abcdef123456", "line-1"])).digest("hex"));
  });

  it("normalizes values and returns the exact terminal outcome", () => {
    const record = createFailureRecord("abcdef123456", proposalInput, { ...validInput, summary: "  failed  ", evidence: ["  error output  "] }, new Date("2026-10-17T12:00:00.000Z"));
    expect(record.summary).toBe("failed");
    expect(record.evidence).toEqual(["error output"]);
    expect(record.createdAt).toBe("2026-10-17T12:00:00.000Z");
    expect(failureOutcome(record)).toEqual({ state: "FAILED", outcome: "NEW_DECISION_REQUIRED", failure: record });
  });
});
