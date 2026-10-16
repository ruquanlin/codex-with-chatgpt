import { describe, expect, it } from "vitest";
import { createExecutionBrief } from "../src/workflow/execution-brief.js";

const validInput = {
  goal: "Implement the approved change",
  knownFacts: ["The failure is reproducible"],
  approvedBasis: { type: "root_cause", summary: "The cause is established" },
  scope: { inScope: ["Fix the handler"], outOfScope: ["Redesign the service"] },
  mustChange: ["Correct the handler"],
  mustNotChange: ["Public API"],
  acceptanceCriteria: ["Focused regression test passes"],
  validationExpectation: ["Run the focused test"],
  riskNotes: ["Low blast radius"],
  persistence: { mode: "ephemeral" },
} as const;

describe("Execution Brief", () => {
  it.each(["root_cause", "approved_design", "explicit_instruction"] as const)(
    "accepts approved basis %s",
    (type) => {
      const brief = createExecutionBrief({ ...validInput, approvedBasis: { type, summary: "Approved basis" } });
      expect(brief.approvedBasis.type).toBe(type);
    }
  );

  it("requires confirmed execution fields and persistence mode", () => {
    expect(() => createExecutionBrief({ ...validInput, goal: " " })).toThrow(/goal/i);
    expect(() => createExecutionBrief({ ...validInput, knownFacts: [] })).toThrow(/knownFacts/i);
    expect(() => createExecutionBrief({ ...validInput, scope: { inScope: [], outOfScope: [] } })).toThrow(/inScope/i);
    expect(() => createExecutionBrief({ ...validInput, mustChange: [] })).toThrow(/mustChange/i);
    expect(() => createExecutionBrief({ ...validInput, mustNotChange: [] })).toThrow(/mustNotChange/i);
    expect(() => createExecutionBrief({ ...validInput, acceptanceCriteria: [] })).toThrow(/acceptanceCriteria/i);
    expect(() => createExecutionBrief({ ...validInput, validationExpectation: [] })).toThrow(/validationExpectation/i);
    expect(() => createExecutionBrief({ ...validInput, riskNotes: [] })).toThrow(/riskNotes/i);
    expect(() => createExecutionBrief({ ...validInput, persistence: { mode: "sometimes" } })).toThrow(/persistence/i);
  });

  it("preserves optional persistence reference and canonical fields", () => {
    const brief = createExecutionBrief({ ...validInput, persistence: { mode: "persisted", reference: "docs/workflow/execution-briefs/2026-10-16-task.md" } });
    expect(brief).toMatchObject({ ...validInput, persistence: { mode: "persisted", reference: "docs/workflow/execution-briefs/2026-10-16-task.md" } });
  });

  it("rejects fields outside the canonical Phase 2 schema", () => {
    expect(() => createExecutionBrief({ ...validInput, model: "not part of Phase 2" } as never)).toThrow(/unsupported field/i);
  });
});
