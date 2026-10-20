import { afterEach, describe, expect, it } from "vitest";
import { createExecutionProposal } from "../src/workflow/phase2.js";
import { createExecutionBrief } from "../src/workflow/execution-brief.js";
import { assessPreflight, issuePreflightReceipt } from "../src/workflow/phase2/preflight-receipts.js";
import { issueHandoffProof, readHandoffProof } from "../src/workflow/phase2/handoff-proof.js";
import { issueJevReceipt } from "../src/workflow/phase2/jev-receipts.js";
import { cleanup, isolateStateDir } from "./helpers.js";

const workspaceId = "abcdef123456";
const proposalInput = {
  executionLineId: "line-a", goal: "修复导出处理器",
  scope: { inScope: ["导出处理器"], outOfScope: ["其他格式"] },
  approvedBasis: { type: "approved_design" as const, summary: "修复已知导出问题" },
  implementationBasis: ["保留现有 API"], riskProfile: "局部修改", jevRequired: false,
};
const preflight = { acceptanceCriteria: ["导出结果正确"], taskEvidence: ["当前任务材料"] };
const request = { task: "修复导出处理器", evidence: ["已复现"], attempts: [] };
let stateDir: string | undefined;

afterEach(() => {
  delete process.env.C2C_STATE_DIR;
  if (stateDir) cleanup(stateDir);
  stateDir = undefined;
});

describe("Phase 2 authorization gaps", () => {
  it.each([
    ["difficultOrUnclearBug", "调查原因不明的 Bug"],
    ["difficultOrUnclearBug", "排查疑难故障"],
    ["productionOrRuntimeIncident", "处理生产环境运行时事故"],
    ["productionOrRuntimeIncident", "处理生产事故"],
    ["completedPriorDiagnosisAndFollowupCodex", "完成上一轮诊断后继续修复同一问题"],
    ["completedPriorDiagnosisAndFollowupCodex", "此前已诊断，继续修复同一问题"],
    ["repetitiveInvestigationWithoutProgress", "同一问题反复调查仍无实质进展"],
    ["repetitiveInvestigationWithoutProgress", "反复排查仍没有实质进展"],
  ] as const)("recognizes Chinese %s evidence", async (reason, evidence) => {
    stateDir = isolateStateDir();
    const proposal = createExecutionProposal(proposalInput);
    const input = { ...preflight, taskEvidence: [evidence] };
    expect(assessPreflight(proposal, input))
      .toMatchObject({ state: "REQUIRES_JEV", reasonCodes: expect.arrayContaining([reason]) });
    await expect(issuePreflightReceipt(workspaceId, proposal, input)).rejects.toThrow("Preflight is not NOT_REQUIRED");
  });

  it("invalidates a v1 proof for a related cross-line Stop", async () => {
    stateDir = isolateStateDir();
    const proposal = createExecutionProposal(proposalInput);
    const brief = createExecutionBrief({
      goal: proposal.goal, scope: proposal.scope, approvedBasis: proposal.approvedBasis,
      knownFacts: ["问题已复现"], mustChange: ["修复导出"], mustNotChange: ["其他格式"],
      acceptanceCriteria: ["导出正确"], validationExpectation: ["运行定向测试"],
      riskNotes: ["保留 API"], persistence: { mode: "ephemeral" },
    });
    const proceed = await issueJevReceipt(workspaceId, proposal, request, { available: true, decision: "proceed" });
    const proof = await issueHandoffProof(workspaceId, proposal, brief, proceed.receiptId);
    expect(proof.proposal).toEqual(proposal);
    expect(await readHandoffProof(workspaceId, brief)).not.toBeNull();

    const unrelated = createExecutionProposal({ ...proposalInput, executionLineId: "line-unrelated", goal: "修复独立的解析器" });
    await issueJevReceipt(workspaceId, unrelated, request, { available: true, decision: "stop" });
    expect(await readHandoffProof(workspaceId, brief)).not.toBeNull();

    const related = createExecutionProposal({ ...proposalInput, executionLineId: "line-related" });
    await issueJevReceipt(workspaceId, related, request, { available: true, decision: "stop" });
    expect(await readHandoffProof(workspaceId, brief)).toBeNull();
  });
});
