import { createExecutionProposal, type ExecutionProposalInput } from "../phase2.js";

export type ValidationStatus = "PASSED" | "FAILED" | "MISSING";
export type ReviewStatus = "PENDING" | "PASSED" | "FAILED";
export type AcceptanceStatus = "NOT_REQUIRED" | "PENDING" | "ACCEPTED" | "REJECTED";

export type CompletionValidation =
  | { status: "MISSING" }
  | { status: "PASSED" | "FAILED"; evidence: string[] };
export type CompletionReview =
  | { status: "PENDING" }
  | { status: "PASSED" | "FAILED"; evidence: string[] };
export type CompletionAcceptance =
  | { required: false; status: "NOT_REQUIRED" }
  | { required: true; status: "PENDING" }
  | { required: true; status: "ACCEPTED" | "REJECTED"; evidence: string[] };

export interface CompletionInput {
  executionLineId: string;
  proposalIdentity: string;
  validation: CompletionValidation;
  review: CompletionReview;
  acceptance: CompletionAcceptance;
}

export type CompletionResult = {
  executionLineId: string;
  proposalIdentity: string;
} & (
  | { state: "BLOCKED"; outcome: "VERIFICATION_REQUIRED" | "FAILURE_RECORD_REQUIRED" }
  | { state: "REVIEW_PENDING"; outcome: "REVIEW_REQUIRED" }
  | { state: "ACCEPTANCE_PENDING"; outcome: "USER_ACCEPTANCE_REQUIRED" }
  | { state: "COMPLETED"; outcome: "CLOSED" }
);

function requireObject(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${name} must be an object`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): void {
  const keys = Object.keys(value);
  if (required.some((key) => !keys.includes(key)) || keys.some((key) => !required.includes(key) && !optional.includes(key))) {
    throw new Error("Object has missing or unsupported fields");
  }
}

function nonblank(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} must be a nonblank string`);
  return value.trim();
}

function evidence(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${name} must contain nonblank evidence`);
  return value.map((item, index) => nonblank(item, `${name}[${index}]`));
}

function validateProposal(value: ExecutionProposalInput): ReturnType<typeof createExecutionProposal> {
  const proposal = requireObject(value, "proposal");
  exactKeys(proposal, ["executionLineId", "goal", "scope", "approvedBasis", "implementationBasis", "jevRequired"], ["riskProfile"]);
  if (typeof proposal.executionLineId !== "string" || typeof proposal.goal !== "string" || typeof proposal.jevRequired !== "boolean") {
    throw new Error("proposal fields are invalid");
  }
  return createExecutionProposal(value);
}

function validateValidation(value: unknown): CompletionValidation {
  const validation = requireObject(value, "validation");
  if (validation.status === "MISSING") {
    exactKeys(validation, ["status"]);
    return { status: "MISSING" };
  }
  if (validation.status === "PASSED" || validation.status === "FAILED") {
    exactKeys(validation, ["status", "evidence"]);
    return { status: validation.status, evidence: evidence(validation.evidence, "validation.evidence") };
  }
  throw new Error("validation status is invalid");
}

function validateReview(value: unknown): CompletionReview {
  const review = requireObject(value, "review");
  if (review.status === "PENDING") {
    exactKeys(review, ["status"]);
    return { status: "PENDING" };
  }
  if (review.status === "PASSED" || review.status === "FAILED") {
    exactKeys(review, ["status", "evidence"]);
    return { status: review.status, evidence: evidence(review.evidence, "review.evidence") };
  }
  throw new Error("review status is invalid");
}

function validateAcceptance(value: unknown, review: CompletionReview): CompletionAcceptance {
  const acceptance = requireObject(value, "acceptance");
  if (typeof acceptance.required !== "boolean") throw new Error("acceptance.required must be boolean");
  if (!acceptance.required) {
    exactKeys(acceptance, ["required", "status"]);
    if (acceptance.status !== "NOT_REQUIRED") throw new Error("non-required acceptance must be NOT_REQUIRED");
    return { required: false, status: "NOT_REQUIRED" };
  }
  if (acceptance.status === "PENDING") {
    exactKeys(acceptance, ["required", "status"]);
    return { required: true, status: "PENDING" };
  }
  if (acceptance.status === "ACCEPTED" || acceptance.status === "REJECTED") {
    exactKeys(acceptance, ["required", "status", "evidence"]);
    if (review.status !== "PASSED") throw new Error("acceptance cannot be decided before review passes");
    return { required: true, status: acceptance.status, evidence: evidence(acceptance.evidence, "acceptance.evidence") };
  }
  throw new Error("required acceptance must be PENDING, ACCEPTED, or REJECTED");
}

export function routeCompletion(proposalInput: ExecutionProposalInput, input: CompletionInput): CompletionResult {
  const proposal = validateProposal(proposalInput);
  const completion = requireObject(input, "completion");
  exactKeys(completion, ["executionLineId", "proposalIdentity", "validation", "review", "acceptance"]);
  const executionLineId = nonblank(completion.executionLineId, "executionLineId");
  const proposalIdentity = nonblank(completion.proposalIdentity, "proposalIdentity");
  if (executionLineId !== proposalInput.executionLineId || proposalIdentity !== proposal.identity) {
    throw new Error("completion identity does not match the Phase 2 proposal");
  }
  const validation = validateValidation(completion.validation);
  const review = validateReview(completion.review);
  const acceptance = validateAcceptance(completion.acceptance, review);
  const identity = { executionLineId, proposalIdentity };

  if (validation.status === "MISSING") return { ...identity, state: "BLOCKED", outcome: "VERIFICATION_REQUIRED" };
  if (validation.status === "FAILED" || review.status === "FAILED" || acceptance.status === "REJECTED") {
    return { ...identity, state: "BLOCKED", outcome: "FAILURE_RECORD_REQUIRED" };
  }
  if (review.status === "PENDING") return { ...identity, state: "REVIEW_PENDING", outcome: "REVIEW_REQUIRED" };
  if (acceptance.status === "PENDING") return { ...identity, state: "ACCEPTANCE_PENDING", outcome: "USER_ACCEPTANCE_REQUIRED" };
  return { ...identity, state: "COMPLETED", outcome: "CLOSED" };
}
