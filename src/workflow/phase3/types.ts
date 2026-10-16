export const MODEL_TIERS = ["LOW", "STANDARD", "HIGH", "EXTREME"] as const;
export type ModelTier = (typeof MODEL_TIERS)[number];

export interface ModelRecommendation {
  tier: ModelTier;
  model: string;
  reason: string;
}

export interface ValidationPlan {
  checks: string[];
  browserRequired: boolean;
  productionEvidenceRequired: boolean;
}

export interface CompiledExecutionPackage {
  prompt: string;
  modelRecommendation: ModelRecommendation;
  validationPlan: ValidationPlan;
}

export type Phase3Result =
  | { status: "READY"; package: CompiledExecutionPackage }
  | { status: "REJECTED_INSUFFICIENT_BRIEF"; issues: string[] };
