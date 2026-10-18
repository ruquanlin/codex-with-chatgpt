import { createHash } from "node:crypto";
import { createExecutionProposal, type ExecutionProposalInput } from "../phase2.js";

export type FailureType = "EXECUTION_FAILURE" | "VALIDATION_FAILURE" | "REVIEW_FAILURE" | "ACCEPTANCE_FAILURE";
export type FailureStage = "EXECUTION" | "VALIDATION" | "REVIEW" | "ACCEPTANCE";
export type FailureNextRoute = "SYSTEMATIC_DEBUGGING" | "VALIDATION_REROUTE" | "ROUTER_REGRILL" | "ROUTER_RECLASSIFY";

export interface FailureInput {
  executionLineId: string;
  proposalIdentity: string;
  failureType: FailureType;
  failedAtStage: FailureStage;
  summary: string;
  evidence: string[];
  nextRoute: FailureNextRoute;
}
export interface FailureRecord extends FailureInput {
  failureId: string;
  createdAt: string;
}

const inputKeys = ["executionLineId", "proposalIdentity", "failureType", "failedAtStage", "summary", "evidence", "nextRoute"] as const;
const allowed: Record<FailureType, ReadonlyArray<readonly [FailureStage, FailureNextRoute]>> = {
  EXECUTION_FAILURE: [["EXECUTION", "SYSTEMATIC_DEBUGGING"]],
  VALIDATION_FAILURE: [["VALIDATION", "SYSTEMATIC_DEBUGGING"], ["VALIDATION", "VALIDATION_REROUTE"]],
  REVIEW_FAILURE: [["REVIEW", "ROUTER_REGRILL"]],
  ACCEPTANCE_FAILURE: [["ACCEPTANCE", "ROUTER_RECLASSIFY"]],
};

function nonblank(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} must be a nonblank string`);
  return value.trim();
}

function validateWorkspaceId(workspaceId: string): void {
  if (typeof workspaceId !== "string" || !/^[a-fA-F0-9]{12}$/.test(workspaceId)) throw new Error("workspaceId must be 12 hexadecimal characters");
}

export function failureIdFor(workspaceId: string, executionLineId: string): string {
  validateWorkspaceId(workspaceId);
  const lineId = nonblank(executionLineId, "executionLineId");
  return createHash("sha256").update(JSON.stringify([workspaceId.toLowerCase(), lineId])).digest("hex");
}

function validateInput(input: FailureInput): FailureInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("failure input must be an object");
  const keys = Object.keys(input);
  if (keys.length !== inputKeys.length || keys.some((key) => !(inputKeys as readonly string[]).includes(key))) throw new Error("failure input has missing or unsupported fields");
  const executionLineId = nonblank(input.executionLineId, "executionLineId");
  const proposalIdentity = nonblank(input.proposalIdentity, "proposalIdentity");
  const summary = nonblank(input.summary, "summary");
  if (!Array.isArray(input.evidence) || input.evidence.length === 0) throw new Error("evidence must contain at least one nonblank item");
  const evidence = input.evidence.map((item, index) => nonblank(item, `evidence[${index}]`));
  if (!(input.failureType in allowed)) throw new Error("unsupported failureType");
  const failureType = input.failureType as FailureType;
  const failedAtStage = input.failedAtStage;
  const nextRoute = input.nextRoute;
  if (!allowed[failureType].some(([stage, route]) => stage === failedAtStage && route === nextRoute)) throw new Error("invalid failure type, stage, and route combination");
  return { executionLineId, proposalIdentity, failureType, failedAtStage, summary, evidence, nextRoute };
}

export function createFailureRecord(workspaceId: string, proposal: ExecutionProposalInput, input: FailureInput, createdAt = new Date()): FailureRecord {
  validateWorkspaceId(workspaceId);
  const clean = validateInput(input);
  if (!proposal || typeof proposal !== "object" || Array.isArray(proposal) || proposal.executionLineId !== clean.executionLineId) throw new Error("proposal executionLineId does not match failure input");
  const proposalKeys = ["executionLineId", "goal", "scope", "approvedBasis", "implementationBasis", "riskProfile", "jevRequired"];
  if (Object.keys(proposal).some((key) => !proposalKeys.includes(key)) || proposalKeys.some((key) => key !== "riskProfile" && !(key in proposal))) throw new Error("proposal has missing or unsupported fields");
  const recomputed = createExecutionProposal(proposal);
  if (recomputed.identity !== clean.proposalIdentity) throw new Error("proposal identity does not match failure input");
  if (!(createdAt instanceof Date) || !Number.isFinite(createdAt.getTime())) throw new Error("createdAt must be a valid Date");
  return { ...clean, failureId: failureIdFor(workspaceId, clean.executionLineId), createdAt: createdAt.toISOString() };
}

export function failureOutcome(record: FailureRecord): { state: "FAILED"; outcome: "NEW_DECISION_REQUIRED"; failure: FailureRecord } {
  return { state: "FAILED", outcome: "NEW_DECISION_REQUIRED", failure: record };
}
