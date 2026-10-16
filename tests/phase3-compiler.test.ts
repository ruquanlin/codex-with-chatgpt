import { describe, expect, it } from "vitest";
import type { ExecutionBrief } from "../src/workflow/execution-brief.js";
import { compileExecutionBrief } from "../src/workflow/phase3/compiler.js";

const portfolio: ExecutionBrief = {
  goal: "Move the mobile hotspot description slightly upward", knownFacts: ["Description positioning is in mobile-hotspot.css", "Project began in 2020"],
  approvedBasis: { type: "explicit_instruction", summary: "Adjust the existing mobile positioning" },
  scope: { inScope: ["Existing mobile hotspot description positioning"], outOfScope: ["Desktop layout"] },
  mustChange: ["Adjust the mobile hotspot description positioning"], mustNotChange: ["Hotspot behavior", "3D interaction logic"],
  acceptanceCriteria: ["Affected mobile layout is correct"], validationExpectation: ["Inspect affected mobile layout"],
  riskNotes: ["Generic low risk"], persistence: { mode: "ephemeral" },
};
const pendlio: ExecutionBrief = {
  goal: "Remove repeated station-resolution work from the departure merge hot path",
  knownFacts: ["Confirmed: resolveMunichStationByEva rebuilds alias sets in the hot loop", "Team uses weekly meetings"],
  approvedBasis: { type: "root_cause", summary: "Use precomputed EVA-to-station lookup" },
  scope: { inScope: ["Affected departure merge path"], outOfScope: ["Other timetable behavior"] },
  mustChange: ["Use the approved precomputed EVA-to-station lookup in departure merge"],
  mustNotChange: ["Direction logic"], acceptanceCriteria: ["Canonical station regression passes"],
  validationExpectation: ["Run focused db-timetables regression"], riskNotes: ["Production runtime hot path"], persistence: { mode: "ephemeral" },
};

describe("Phase 3 compiler", () => {
  it("emits one concise Markdown prompt preserving task, scope, boundaries, and report", () => {
    const result = compileExecutionBrief(portfolio);
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(result.package.prompt).toMatch(/^## Task\n\n/);
    expect(result.package.prompt).toContain("## Scope");
    expect(result.package.prompt).toContain("## Boundaries");
    expect(result.package.prompt).toContain("## Validate");
    expect(result.package.prompt).toContain("Desktop layout");
    expect(result.package.prompt).toContain("3D interaction logic");
    expect(result.package.prompt).toContain("mobile-hotspot.css");
    expect(result.package.prompt).not.toContain("Project began in 2020");
    expect(result.package.prompt).not.toContain("Generic low risk");
    expect(result.package.prompt).not.toMatch(/full suite|full build|cleanup|refactor|open the browser/i);
    expect(result.package.prompt).toMatch(/Report:\n- what changed\n- focused validation performed\n- any blocking issue$/);
    expect(result.package.modelRecommendation.tier).toBe("LOW");
    expect(result.package.validationPlan.browserRequired).toBe(false);
  });
  it("uses a confirmed root cause and approved solution without reopening diagnosis", () => {
    const result = compileExecutionBrief(pendlio);
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(result.package.prompt).toContain("resolveMunichStationByEva rebuilds alias sets");
    expect(result.package.prompt).toContain("precomputed EVA-to-station lookup");
    expect(result.package.prompt).not.toContain("Team uses weekly meetings");
    expect(result.package.prompt).not.toMatch(/investigate|determine the best solution/i);
  });
  it("preserves the approved root cause even when knownFacts has no duplicate", () => {
    const result = compileExecutionBrief({ ...pendlio, knownFacts: ["Handler is in src/merge.ts"], approvedBasis: { type: "root_cause", summary: "Alias sets are rebuilt inside resolveMunichStationByEva" } });
    expect(result.status).toBe("READY");
    if (result.status === "READY") expect(result.package.prompt).toContain("Alias sets are rebuilt inside resolveMunichStationByEva");
  });
  it("fails closed when the implementation boundary is generic", () => {
    const result = compileExecutionBrief({ ...portfolio, mustChange: ["Fix it"] });
    expect(result).toMatchObject({ status: "REJECTED_INSUFFICIENT_BRIEF", issues: [expect.stringContaining("mustChange")] });
  });
  it("fails closed when a generic implementation boundary ends in punctuation", () => {
    expect(compileExecutionBrief({ ...portfolio, mustChange: ["Fix it."] })).toMatchObject({ status: "REJECTED_INSUFFICIENT_BRIEF" });
  });
  it("preserves implementation-relevant explicit basis and risk boundaries", () => {
    const result = compileExecutionBrief({
      ...portfolio,
      approvedBasis: { type: "explicit_instruction", summary: "Use the existing CSS variable for mobile offset" },
      riskNotes: ["Preserve the legacy cache key", "Low risk"],
    });
    expect(result.status).toBe("READY");
    if (result.status === "READY") {
      expect(result.package.prompt).toContain("Use the existing CSS variable for mobile offset");
      expect(result.package.prompt).toContain("Preserve the legacy cache key");
      expect(result.package.prompt).not.toContain("Low risk");
    }
  });
  it("omits project history even when phrased as confirmed or already", () => {
    const result = compileExecutionBrief({ ...portfolio, knownFacts: ["Confirmed: team meets weekly", "Project already existed in 2020", "Description positioning is in mobile-hotspot.css"] });
    expect(result.status).toBe("READY");
    if (result.status === "READY") {
      expect(result.package.prompt).not.toContain("team meets weekly");
      expect(result.package.prompt).not.toContain("existed in 2020");
    }
  });
  it("fails closed on contradictory validation expectations", () => {
    const result = compileExecutionBrief({ ...portfolio, acceptanceCriteria: ["Verify drag interaction in browser"], validationExpectation: ["Unit tests only; do not use browser"] });
    expect(result).toMatchObject({ status: "REJECTED_INSUFFICIENT_BRIEF", issues: [expect.stringContaining("validationExpectation conflicts")] });
  });
  it("fails closed on a noncanonical brief instead of throwing", () => {
    expect(compileExecutionBrief({ ...portfolio, goal: "" })).toMatchObject({ status: "REJECTED_INSUFFICIENT_BRIEF", issues: [expect.stringContaining("goal")] });
  });
});
