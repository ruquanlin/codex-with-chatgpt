import { describe, expect, it } from "vitest";
import type { ExecutionBrief } from "../src/workflow/execution-brief.js";
import { routeValidation, validationIssues } from "../src/workflow/phase3/validation-router.js";

const brief: ExecutionBrief = {
  goal: "Change button copy", knownFacts: ["Button is in home.html"],
  approvedBasis: { type: "explicit_instruction", summary: "Change the label only" },
  scope: { inScope: ["home.html"], outOfScope: [] }, mustChange: ["Replace button label"],
  mustNotChange: ["Button behavior"], acceptanceCriteria: ["New label is present"],
  validationExpectation: ["Inspect changed HTML"], riskNotes: ["Low risk"], persistence: { mode: "ephemeral" },
};
const withBrief = (changes: Partial<ExecutionBrief>): ExecutionBrief => ({ ...brief, ...changes });

describe("Phase 3 validation routing", () => {
  it("keeps static changes to focused inspection with browser off", () => {
    expect(routeValidation(brief)).toEqual({ checks: ["Inspect changed HTML"], browserRequired: false, productionEvidenceRequired: false });
  });
  it("selects a focused regression for deterministic logic", () => {
    const result = routeValidation(withBrief({ goal: "Fix calculation logic", mustChange: ["Correct total calculation"], validationExpectation: ["Focused regression test"] }));
    expect(result.checks).toEqual(["Focused regression test"]);
  });
  it("selects a targeted test for parser and API work", () => {
    const result = routeValidation(withBrief({ goal: "Fix API response parser", mustChange: ["Normalize malformed response"], validationExpectation: ["Targeted unit test"] }));
    expect(result.checks).toEqual(["Targeted unit test"]);
  });
  it.each(["drag", "touch", "scroll", "3D", "responsive", "iframe"])("enables browser for %s acceptance", (interaction) => {
    const result = routeValidation(withBrief({ goal: `Fix ${interaction} interaction`, acceptanceCriteria: [`Verify ${interaction} interaction in browser`], validationExpectation: ["Verify affected interaction in browser"] }));
    expect(result.browserRequired).toBe(true);
  });
  it("enables browser for an interaction acceptance criterion without the word browser", () => {
    expect(routeValidation(withBrief({ goal: "Fix drag behavior", acceptanceCriteria: ["Drag remains smooth on touch screens"], validationExpectation: ["Check affected interaction"] })).browserRequired).toBe(true);
  });
  it("requires telemetry evidence for a production runtime task", () => {
    const result = routeValidation(withBrief({ goal: "Fix production runtime latency", mustChange: ["Remove hot-path work"], validationExpectation: ["Run focused regression", "Inspect production telemetry"] }));
    expect(result).toEqual({ checks: ["Run focused regression", "Inspect production telemetry"], browserRequired: false, productionEvidenceRequired: true });
  });
  it("does not invent broad validation", () => {
    const result = routeValidation(withBrief({ goal: "Fix calculation logic", validationExpectation: ["Run focused test"] }));
    expect(result.checks.join(" ")).not.toMatch(/full (suite|build)/i);
  });
  it("reports explicit validation that conflicts with acceptance", () => {
    const conflicting = withBrief({ goal: "Fix drag interaction", acceptanceCriteria: ["Verify drag in browser"], validationExpectation: ["Unit tests only; do not use browser"] });
    expect(validationIssues(conflicting)).toEqual(expect.arrayContaining([expect.stringContaining("validationExpectation conflicts with acceptanceCriteria")]));
  });
  it("does not enable browser for an interaction named only as a preservation boundary", () => {
    const result = routeValidation(withBrief({ acceptanceCriteria: ["No changes to 3D interaction logic"], validationExpectation: ["Inspect changed HTML only"] }));
    expect(result.browserRequired).toBe(false);
    expect(validationIssues(withBrief({ acceptanceCriteria: ["No changes to 3D interaction logic"], validationExpectation: ["Inspect changed HTML only"] }))).toEqual([]);
  });
  it("reports production-evidence contradictions instead of adding telemetry", () => {
    const result = validationIssues(withBrief({ goal: "Fix production runtime latency", acceptanceCriteria: ["Confirm production telemetry recovers"], validationExpectation: ["Local regression only; do not inspect production"] }));
    expect(result).toEqual(expect.arrayContaining([expect.stringContaining("validationExpectation conflicts with acceptanceCriteria")]));
  });
});
