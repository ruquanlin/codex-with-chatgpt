import type { ExecutionProposal, Phase2State } from "../phase2.js";
import { getJevStop, verifyJevReceipt } from "./jev-receipts.js";
import { parsePreflightInput, verifyPreflightReceipt } from "./preflight-receipts.js";

export interface Phase2Authorization {
  state: Phase2State;
  receiptId?: string;
  source?: "JEV_PROCEED" | "NOT_REQUIRED";
}

// Caller-authored Jev decisions carry no authority. Only the server-issued
// receipt reference can unlock readiness after local verification.
export async function verifyPhase2Authorization(
  workspaceId: string, proposal: ExecutionProposal, bound: unknown,
): Promise<Phase2Authorization> {
  if (await getJevStop(workspaceId, proposal.executionLineId, proposal)) {
    return { state: { state: "STOPPED", proposal } };
  }
  const input = bound && typeof bound === "object" && !Array.isArray(bound)
    ? bound as Record<string, unknown> : null;
  if (input && Object.keys(input).length === 2 && typeof input.preflightReceiptId === "string" &&
    Object.hasOwn(input, "preflight")) {
    if (typeof proposal.jevRequired !== "boolean" ||
      Object.keys(proposal).some((key) => !["executionLineId", "goal", "scope", "approvedBasis", "implementationBasis", "riskProfile", "jevRequired", "identity"].includes(key))) {
      return { state: { state: "EXECUTION_PROPOSED", proposal } };
    }
    try {
      const evidence = parsePreflightInput(input.preflight);
      const receipt = await verifyPreflightReceipt(workspaceId, proposal, input.preflightReceiptId, evidence);
      if (receipt) return { state: { state: "READY_FOR_EXECUTION", proposal },
        receiptId: receipt.receiptId, source: "NOT_REQUIRED" };
    } catch { /* Invalid or tampered evidence cannot authorize readiness. */ }
    return { state: { state: "EXECUTION_PROPOSED", proposal } };
  }
  const receiptId = input && Object.keys(input).length === 1 && typeof input.receiptId === "string"
    ? input.receiptId : undefined;
  if (!receiptId) return { state: { state: "EXECUTION_PROPOSED", proposal } };
  const receipt = await verifyJevReceipt(workspaceId, proposal, receiptId);
  if (!receipt) return { state: { state: "EXECUTION_PROPOSED", proposal } };
  const state = receipt.decision === "proceed" ? "READY_FOR_EXECUTION"
    : receipt.decision === "reframe" ? "REFRAME_REQUIRED" : "STOPPED";
  return { state: { state, proposal, jevResult: { available: true, decision: receipt.decision } },
    receiptId, source: receipt.decision === "proceed" ? "JEV_PROCEED" : undefined };
}
