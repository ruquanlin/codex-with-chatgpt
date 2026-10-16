export type ApprovedBasisType = "root_cause" | "approved_design" | "explicit_instruction";

export interface ExecutionBriefInput {
  goal: string;
  knownFacts: string[];
  approvedBasis: { type: ApprovedBasisType; summary: string };
  scope: { inScope: string[]; outOfScope: string[] };
  mustChange: string[];
  mustNotChange: string[];
  acceptanceCriteria: string[];
  validationExpectation: string[];
  riskNotes: string[];
  persistence: { mode: "ephemeral" | "persisted"; reference?: string };
}

export type ExecutionBrief = Readonly<ExecutionBriefInput>;

function requireText(label: string, value: unknown): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} must be a non-empty string`);
}

function requireTextList(label: string, value: unknown): asserts value is string[] {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== "string" || item.trim().length === 0)) {
    throw new Error(`${label} must contain at least one non-empty string`);
  }
}

function requireKeys(label: string, value: unknown, allowed: string[]): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const extra = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extra.length) throw new Error(`${label} contains unsupported field: ${extra[0]}`);
}

export function createExecutionBrief(input: ExecutionBriefInput): ExecutionBrief {
  requireKeys("Execution Brief", input, ["goal", "knownFacts", "approvedBasis", "scope", "mustChange", "mustNotChange", "acceptanceCriteria", "validationExpectation", "riskNotes", "persistence"]);
  requireText("goal", input?.goal);
  requireTextList("knownFacts", input?.knownFacts);
  requireKeys("approvedBasis", input.approvedBasis, ["type", "summary"]);
  if (!input.approvedBasis || !["root_cause", "approved_design", "explicit_instruction"].includes(input.approvedBasis.type)) {
    throw new Error("approvedBasis.type is invalid");
  }
  requireText("approvedBasis.summary", input.approvedBasis.summary);
  requireKeys("scope", input.scope, ["inScope", "outOfScope"]);
  requireTextList("scope.inScope", input.scope?.inScope);
  if (!Array.isArray(input.scope?.outOfScope) || input.scope.outOfScope.some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error("scope.outOfScope must be a list of non-empty strings");
  }
  requireTextList("mustChange", input.mustChange);
  requireTextList("mustNotChange", input.mustNotChange);
  requireTextList("acceptanceCriteria", input.acceptanceCriteria);
  requireTextList("validationExpectation", input.validationExpectation);
  requireTextList("riskNotes", input.riskNotes);
  requireKeys("persistence", input.persistence, ["mode", "reference"]);
  if (!input.persistence || !["ephemeral", "persisted"].includes(input.persistence.mode)) throw new Error("persistence.mode is invalid");
  if (input.persistence.reference !== undefined) requireText("persistence.reference", input.persistence.reference);
  return structuredClone(input);
}
