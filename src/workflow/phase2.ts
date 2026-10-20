import { createHash } from "node:crypto";
import type { JevGateResult } from "../decision/jev-gate.js";
import { createExecutionBrief, type ExecutionBrief, type ExecutionBriefInput, type ApprovedBasisType } from "./execution-brief.js";

export interface ExecutionProposalInput {
  executionLineId: string;
  goal: string;
  scope: { inScope: string[]; outOfScope: string[] };
  approvedBasis: { type: ApprovedBasisType; summary: string };
  implementationBasis: string[];
  riskProfile?: string;
  jevRequired: boolean;
}

export interface ExecutionProposal extends ExecutionProposalInput { identity: string }
export type Phase2StateName = "EXECUTION_PROPOSED" | "READY_FOR_EXECUTION" | "REFRAME_REQUIRED" | "STOPPED" | "BLOCKED";
export interface Phase2State { state: Phase2StateName; proposal: ExecutionProposal; jevResult?: JevGateResult }
export interface BoundJevResult { proposalIdentity: string; result: JevGateResult }

function stableIdentity(input: ExecutionProposalInput): string {
  const normalized = {
    executionLineId: input.executionLineId.trim(),
    goal: input.goal.trim(),
    scope: { inScope: [...input.scope.inScope].sort(), outOfScope: [...input.scope.outOfScope].sort() },
    approvedBasis: input.approvedBasis,
    implementationBasis: [...input.implementationBasis].sort(),
    riskProfile: input.riskProfile?.trim() ?? "",
  };
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

export function createExecutionProposal(input: ExecutionProposalInput): ExecutionProposal {
  if (!input.executionLineId.trim() || !input.goal.trim()) throw new Error("executionLineId and goal are required");
  return { ...structuredClone(input), identity: stableIdentity(input) };
}

export function transitionExecutionProposal(proposal: ExecutionProposal, boundResult?: BoundJevResult): Phase2State {
  // READY requires a server-issued Jev receipt, which Phase 2 does not yet
  // implement. Caller-controlled flags and results cannot authorize execution.
  void boundResult;
  return { state: "EXECUTION_PROPOSED", proposal };
}

export type ReadyBriefDetails = Pick<ExecutionBriefInput, "knownFacts" | "mustChange" | "mustNotChange" | "acceptanceCriteria" | "validationExpectation" | "riskNotes" | "persistence">;

export function createReadyExecutionBrief(state: Phase2State, details: ReadyBriefDetails): ExecutionBrief {
  if (state.state !== "READY_FOR_EXECUTION") throw new Error("Execution Brief requires READY_FOR_EXECUTION");
  return createExecutionBrief({
    goal: state.proposal.goal,
    knownFacts: details.knownFacts,
    approvedBasis: state.proposal.approvedBasis,
    scope: state.proposal.scope,
    mustChange: details.mustChange,
    mustNotChange: details.mustNotChange,
    acceptanceCriteria: details.acceptanceCriteria,
    validationExpectation: details.validationExpectation,
    riskNotes: details.riskNotes,
    persistence: details.persistence,
  });
}
