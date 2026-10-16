import { createExecutionBrief, type ExecutionBrief } from "../execution-brief.js";
import { classifyModelTier, recommendModel } from "./model-router.js";
import { routeValidation, validationIssues } from "./validation-router.js";
import type { Phase3Result } from "./types.js";

const GENERIC_CHANGE = /^(fix (it|this|the issue)|change (it|this)|implement (it|this)|update (it|this)|tbd|to be determined)$/i;

function uniqueLines(lines: string[]): string[] {
  const seen = new Set<string>();
  return lines.map((line) => line.trim()).filter((line) => {
    const key = line.toLowerCase().replace(/[.!]$/, "");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function section(name: string, lines: string[]): string {
  return `## ${name}\n\n${lines.join("\n")}`;
}

function relevantFact(fact: string): boolean {
  return /\b(confirmed|located|location|file|function|root cause|verified|exists|already|implementation|hot loop)\b|\.[cm]?[jt]sx?\b|\b[a-z-]+\.css\b/i.test(fact);
}

export function compileExecutionBrief(input: ExecutionBrief): Phase3Result {
  let brief: ExecutionBrief;
  try {
    brief = createExecutionBrief(input);
  } catch (error) {
    return { status: "REJECTED_INSUFFICIENT_BRIEF", issues: [error instanceof Error ? error.message : String(error)] };
  }

  const issues = validationIssues(brief);
  if (brief.mustChange.every((change) => GENERIC_CHANGE.test(change.trim()))) {
    issues.unshift("mustChange does not identify an executable implementation boundary");
  }
  if (issues.length) return { status: "REJECTED_INSUFFICIENT_BRIEF", issues };

  const validationPlan = routeValidation(brief);
  const modelRecommendation = recommendModel(classifyModelTier(brief));
  const facts = uniqueLines([
    ...(brief.approvedBasis.type === "root_cause" ? [brief.approvedBasis.summary] : []),
    ...brief.knownFacts.filter(relevantFact),
  ]);
  const scope = uniqueLines([
    ...brief.mustChange,
    ...brief.scope.inScope,
    ...(brief.approvedBasis.type === "approved_design" ? [brief.approvedBasis.summary] : []),
    ...brief.acceptanceCriteria.map((criterion) => `Acceptance: ${criterion}`),
  ]);
  const boundaries = uniqueLines([
    ...brief.scope.outOfScope.map((item) => `Do not change ${item.replace(/^do not change\s+/i, "")}`),
    ...brief.mustNotChange.map((item) => `Do not change ${item.replace(/^do not change\s+/i, "")}`),
  ]);
  const blocks = [section("Task", [brief.goal.trim()])];
  if (scope.length || facts.length) blocks.push(section("Scope", [...scope, ...facts.map((fact) => `Known: ${fact}`)]));
  if (boundaries.length) blocks.push(section("Boundaries", boundaries));
  if (validationPlan.checks.length) blocks.push(section("Validate", validationPlan.checks));
  blocks.push("Report:\n- what changed\n- focused validation performed\n- any blocking issue");

  return { status: "READY", package: { prompt: blocks.join("\n\n"), modelRecommendation, validationPlan } };
}
