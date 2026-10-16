import { expect, it } from "vitest";
import type { Phase3Result } from "../src/workflow/phase3/types.js";
import { MODEL_TIERS } from "../src/workflow/phase3/types.js";

it("exposes the compact ready package and fail-closed result shapes", () => {
  expect(MODEL_TIERS).toEqual(["LOW", "STANDARD", "HIGH", "EXTREME"]);
  const ready: Phase3Result = {
    status: "READY",
    package: {
      prompt: "## Task\n\nFix the handler.",
      modelRecommendation: { tier: "STANDARD", model: "gpt-6-sol", reason: "Ordinary logic change" },
      validationPlan: { checks: ["Run focused regression"], browserRequired: false, productionEvidenceRequired: false },
    },
  };
  const rejected: Phase3Result = { status: "REJECTED_INSUFFICIENT_BRIEF", issues: ["mustChange is insufficient"] };
  expect(Object.keys(ready.package)).toEqual(["prompt", "modelRecommendation", "validationPlan"]);
  expect(rejected).toEqual({ status: "REJECTED_INSUFFICIENT_BRIEF", issues: ["mustChange is insufficient"] });
});
