import { describe, expect, it } from "vitest";
import type { ExecutionBrief } from "../src/workflow/execution-brief.js";
import { classifyModelTier, recommendModel } from "../src/workflow/phase3/model-router.js";

const base: ExecutionBrief = {
  goal: "Update static HTML copy", knownFacts: ["Location confirmed"],
  approvedBasis: { type: "explicit_instruction", summary: "Replace existing text" },
  scope: { inScope: ["home.html"], outOfScope: [] }, mustChange: ["Replace one heading"],
  mustNotChange: ["Layout"], acceptanceCriteria: ["Heading reads correctly"],
  validationExpectation: ["Inspect changed file"], riskNotes: ["Low risk"], persistence: { mode: "ephemeral" },
};
const task = (goal: string, mustChange = [goal]): ExecutionBrief => ({ ...base, goal, mustChange });

describe("Phase 3 model routing", () => {
  it.each(["Update static HTML copy", "Adjust simple CSS", "Set config value", "Apply one-file mechanical rename"])("routes %s to LOW", (goal) => {
    expect(classifyModelTier(task(goal))).toBe("LOW");
  });
  it.each(["Fix business logic", "Update API handler", "Correct parser", "Implement approved multi-file feature"])("routes %s to STANDARD", (goal) => {
    expect(classifyModelTier(task(goal))).toBe("STANDARD");
  });
  it.each(["Fix complex runtime race condition", "Optimize performance hotspot", "Repair lifecycle state coordination", "Implement architecture-heavy change"])("routes %s to HIGH", (goal) => {
    expect(classifyModelTier(task(goal))).toBe("HIGH");
  });
  it.each(["Implement critical migration logic", "Solve exceptionally difficult architecture reasoning"])("routes %s to EXTREME", (goal) => {
    expect(classifyModelTier(task(goal))).toBe("EXTREME");
  });
  it("ignores project complexity and prior failure alone", () => {
    const brief = { ...base, knownFacts: ["Huge monorepo", "Prior attempt failed"], riskNotes: ["Complex project"] };
    expect(classifyModelTier(brief)).toBe("LOW");
  });
  it("ignores architecture complexity mentioned only as project background", () => {
    expect(classifyModelTier({ ...base, approvedBasis: { type: "explicit_instruction", summary: "Large architecture-heavy project; replace heading only" } })).toBe("LOW");
  });
  it("maps tiers to current models independently of task classification", () => {
    expect(recommendModel("LOW")).toMatchObject({ tier: "LOW", model: "gpt-6-luna" });
    expect(recommendModel("STANDARD")).toMatchObject({ tier: "STANDARD", model: "gpt-6-sol" });
    expect(recommendModel("HIGH")).toMatchObject({ tier: "HIGH", model: "gpt-6-sol" });
    expect(recommendModel("EXTREME")).toMatchObject({ tier: "EXTREME", model: "gpt-6-astra" });
  });
});
