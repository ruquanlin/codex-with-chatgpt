import type { ExecutionBrief } from "../execution-brief.js";
import type { ValidationPlan } from "./types.js";

const INTERACTION = /\b(drag|touch|scroll|3d|animation|iframe|pointer|gesture)\b/i;
const LAYOUT = /\b(responsive|rendering|layout)\b/i;
const BROWSER = /\b(browser|real interaction|actual rendering|visual|viewport)\b/i;
const NO_BROWSER = /\b(no browser|do not use browser|without browser|unit tests? only|static inspection only)\b/i;
const PRODUCTION = /\b(production|prod runtime|worker runtime)\b/i;
const RUNTIME = /\b(runtime|latency|performance|hot.path|telemetry|incident)\b/i;

export function validationIssues(brief: ExecutionBrief): string[] {
  const acceptance = brief.acceptanceCriteria.join(" ");
  const expectation = brief.validationExpectation.join(" ");
  if (needsBrowser(acceptance) && NO_BROWSER.test(expectation)) {
    return ["validationExpectation conflicts with acceptanceCriteria: browser verification is required by acceptance"];
  }
  return [];
}

function needsBrowser(acceptance: string): boolean {
  return INTERACTION.test(acceptance) || (LAYOUT.test(acceptance) && BROWSER.test(acceptance));
}

export function routeValidation(brief: ExecutionBrief): ValidationPlan {
  const task = [brief.goal, ...brief.mustChange, ...brief.scope.inScope].join(" ");
  const acceptance = brief.acceptanceCriteria.join(" ");
  const explicit = brief.validationExpectation.map((check) => check.trim()).filter(Boolean);
  const browserRequired = needsBrowser(acceptance);
  const productionEvidenceRequired = PRODUCTION.test(task) && RUNTIME.test(task);
  let checks = [...new Set(explicit)];
  if (checks.length === 0) {
    const fallback = /\b(parser|parsing|api|response|normaliz)/i.test(task)
      ? "Run targeted unit/integration test"
      : /\b(logic|calculation|state|bug|fix|handler)/i.test(task)
        ? "Run focused regression test"
        : "Inspect affected change";
    checks = [fallback];
  }
  if (browserRequired && !checks.some((check) => BROWSER.test(check))) checks.push("Verify affected interaction in browser");
  if (productionEvidenceRequired && !checks.some((check) => /\b(telemetry|production evidence|runtime evidence)\b/i.test(check))) {
    checks.push("Inspect production runtime evidence");
  }
  return { checks, browserRequired, productionEvidenceRequired };
}
