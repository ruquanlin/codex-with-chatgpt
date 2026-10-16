import type { ExecutionBrief } from "../execution-brief.js";
import type { ModelRecommendation, ModelTier } from "./types.js";

const MODEL_BY_TIER: Record<ModelTier, { model: string; reason: string }> = {
  LOW: { model: "gpt-6-luna", reason: "Bounded mechanical or static change" },
  STANDARD: { model: "gpt-6-sol", reason: "Ordinary implementation within an approved boundary" },
  HIGH: { model: "gpt-6-sol", reason: "Complex runtime or architecture work needs high reasoning" },
  EXTREME: { model: "gpt-6-astra", reason: "Exceptional migration or reasoning demand" },
};

export function classifyModelTier(brief: ExecutionBrief): ModelTier {
  const task = [brief.goal, ...brief.mustChange].join(" ");
  if (/\b(critical migration|exceptionally difficult|extreme reasoning|unusually complex debugging)\b/i.test(task)) return "EXTREME";
  if (/\b(race condition|performance hotspot|hot.path|complex runtime|lifecycle|architecture.heavy|difficult state coordination|high.risk behavior)\b/i.test(task)) return "HIGH";
  if (/\b(static html|copy|simple css|config(?:uration)? value|mechanical|one.file|single.file|bounded css|description positioning)\b/i.test(task)
    && !/\b(api|parser|business logic|state transition|runtime)\b/i.test(task)) return "LOW";
  return "STANDARD";
}

export function recommendModel(tier: ModelTier): ModelRecommendation {
  return { tier, ...MODEL_BY_TIER[tier] };
}
