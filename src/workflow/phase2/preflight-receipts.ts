import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getStateDir } from "../../config/paths.js";
import type { ExecutionProposal } from "../phase2.js";
import { getJevStop } from "./jev-receipts.js";

const ISSUER = "c2c-conditional-preflight";
const VERSION = 4;
const MAX_AGE_MS = 900_000;
const hex48 = /^[a-f0-9]{48}$/;
const hex64 = /^[a-f0-9]{64}$/;
const signals = ["difficultOrUnclearBug", "productionOrRuntimeIncident", "completedPriorDiagnosisAndFollowupCodex", "repetitiveInvestigationWithoutProgress"] as const;
export type PreflightSignal = typeof signals[number];
export type PreflightState = "NOT_REQUIRED" | "REQUIRES_JEV" | "STOPPED" | "NEEDS_TASK_DETAILS" | "BLOCKED_VALIDATION";
export interface PreflightInput {
  acceptanceCriteria: string[];
  taskEvidence: string[];
  difficultOrUnclearBug?: boolean;
  productionOrRuntimeIncident?: boolean;
  completedPriorDiagnosisAndFollowupCodex?: boolean;
  repetitiveInvestigationWithoutProgress?: boolean;
}
export interface PreflightReceipt {
  version: 4; issuer: typeof ISSUER; receiptId: string; workspaceId: string;
  executionLineId: string; proposalIdentity: string; materialDigest: string;
  decision: "NOT_REQUIRED"; reasonCodes: string[]; issuedAt: string; expiresAt: string;
}
function workspaceKey(id: string): string {
  if (!/^[a-fA-F0-9]{12}$/.test(id)) throw new Error("Invalid workspace ID");
  return id.toLowerCase();
}
function folder(id: string): string { return path.join(getStateDir(), "preflight-receipts", workspaceKey(id)); }
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]));
  return value;
}
export function parsePreflightInput(value: unknown): PreflightInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid preflight evidence");
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !["acceptanceCriteria", "taskEvidence", ...signals].includes(key))) {
    throw new Error("Unsupported preflight evidence");
  }
  for (const key of ["acceptanceCriteria", "taskEvidence"] as const) {
    const values = input[key];
    if (!Array.isArray(values) || values.some((item) => typeof item !== "string" || !item.trim())) {
      throw new Error(`Invalid ${key}`);
    }
  }
  if (signals.some((signal) => input[signal] !== undefined && typeof input[signal] !== "boolean")) {
    throw new Error("Invalid preflight signal");
  }
  return structuredClone(input) as unknown as PreflightInput;
}
export function preflightMaterialDigest(proposal: ExecutionProposal, input: PreflightInput): string {
  const material = {
    proposal: { executionLineId: proposal.executionLineId, goal: proposal.goal, scope: proposal.scope,
      approvedBasis: proposal.approvedBasis, implementationBasis: proposal.implementationBasis,
      riskProfile: proposal.riskProfile, jevRequired: proposal.jevRequired,
      jevRequiredPresent: Object.hasOwn(proposal, "jevRequired"), identity: proposal.identity },
    preflight: input,
  };
  return createHash("sha256").update(JSON.stringify(canonical(material))).digest("hex");
}
const placeholder = /^(?:approved|approved fix|done|todo|tbd|n\/a|none|unknown|same as above|the user (?:only )?approved (?:this task|it)|已批准|批准|完成|待定|暂无|无|当前任务材料|任务材料)$/i;
function isConcrete(value: string): boolean {
  const normalized = value.trim().replace(/[.。!?！？\s]+$/g, "").toLowerCase();
  return normalized.length >= 4 && !placeholder.test(normalized);
}
function hasConcreteItems(values: string[]): boolean {
  return values.length > 0 && values.every(isConcrete);
}
function hasConcreteCriteria(values: string[]): boolean {
  return hasConcreteItems(values) && values.every((value) =>
    !/\b(?:confirm|verify|test|check)\s+(?:that\s+)?(?:everything|it|the task)\s+(?:works|passes|is okay|is safe)\b/i.test(value) &&
    !/(一切正常|全部正常|确认完成|验证通过即可)/.test(value));
}
function unsafeRequestedAction(value: string): boolean {
  const positive = value
    .replace(/\b(?:do not|don't|never|without|avoid|prevent|must not|should not)\b[^.;!?。！？]*/gi, "")
    .replace(/(?:不要|不得|禁止|避免|不可以|不可).{0,16}(?:绕过|关闭|禁用)[^，。；;！？!?]*/g, "");
  return /\b(?:bypass|disable authentication|disable authorization|ignore (?:the )?stop marker|override (?:the )?stop)\b/i.test(positive) ||
    /(绕过|关闭|禁用).{0,8}(认证|授权|Stop|停止标记)/i.test(positive);
}
function assessMaterials(proposal: ExecutionProposal, input: PreflightInput): { state: PreflightState; reasonCodes: string[] } | null {
  if (!proposal.goal.trim() || !hasConcreteItems(proposal.scope.inScope) ||
    !isConcrete(proposal.approvedBasis.summary) || !hasConcreteItems(proposal.implementationBasis) ||
    !hasConcreteItems(input.taskEvidence) || !hasConcreteCriteria(input.acceptanceCriteria)) {
    return { state: "NEEDS_TASK_DETAILS", reasonCodes: ["INSUFFICIENT_TASK_DETAILS"] };
  }
  const taskMaterial = [proposal.goal, proposal.approvedBasis.summary, proposal.riskProfile ?? "", ...proposal.scope.inScope,
    ...proposal.scope.outOfScope, ...proposal.implementationBasis, ...input.taskEvidence, ...input.acceptanceCriteria].join(" ");
  if ([proposal.goal, proposal.approvedBasis.summary, ...proposal.scope.inScope].some(unsafeRequestedAction)) {
    return { state: "BLOCKED_VALIDATION", reasonCodes: ["UNSAFE_AUTHORIZATION_REQUEST"] };
  }
  const riskScanMaterial = taskMaterial
    .replace(/\b(?:do not|don't|never|must not|should not)\b[^.;!?。！？]*(?:\bdeploy(?:ment)?\b|\bproduction\b|\bdelete(?:ion)?\b)/gi, "")
    .replace(/\b(?:stop if|stop when|unless)\b[^.;!?。！？]*(?:\bdeploy(?:ment|ing)?\b|\bproduction\b|\bdelete(?:ing|ion)?\b)/gi, "")
    .replace(/\b(?:without|avoid|prevent)\b[^.;!?。！？]*(?:\bdeploy(?:ment|ing)?\b|\bproduction\b|\bdelet(?:e|ing|ion)\b)/gi, "")
    .replace(/(?:不要|不得|禁止|避免|不可以|不可)[^，。；;！？!?]*(?:生产部署|部署|生产变更|删除)/g, "");
  const highRisk = /\b(production|security|authorization|authentication|data integrity|irreversible|delete|deletion|deploy|deployment|external side effect|customer data)\b/i.test(riskScanMaterial) ||
    /(生产|安全|授权|认证|数据完整性|不可逆|删除|部署|外部副作用|客户数据)/.test(riskScanMaterial) ||
    input.productionOrRuntimeIncident === true;
  if (highRisk) {
    const riskText = [proposal.riskProfile ?? "", ...proposal.scope.inScope, ...proposal.scope.outOfScope, ...proposal.implementationBasis, ...input.taskEvidence,
      ...input.acceptanceCriteria].join(" ");
    const explicitBoundary = /\b(read.only|limited to|only\s+(?:read|inspect|review|query|collect|compare)|permitted actions? (?:are|is|:)|allowed actions? (?:are|is|:))\b/i.test(riskText) ||
      /(允许.{0,12}(仅|只读)|仅限|只读|限制范围|操作边界)/.test(riskText);
    const explicitStopOrValidation = /\b(stop if|stop when|stop condition|rollback|revert|verify|validation|test|confirm|check)\b/i.test(riskText) ||
      /(停止条件|如果.{0,8}停止|回退|回滚|验证|确认|检查|测试)/.test(riskText);
    if (!proposal.riskProfile || !isConcrete(proposal.riskProfile) || !proposal.scope.outOfScope.length ||
      !hasConcreteItems(proposal.scope.outOfScope) || !explicitBoundary || !explicitStopOrValidation) {
      return { state: "NEEDS_TASK_DETAILS", reasonCodes: ["RISK_BOUNDARY_OR_STOP_CONDITION_MISSING"] };
    }
  }
  const unknownCause = /\b(unknown cause|root cause unknown|cause is unknown|cause is unclear)\b/i.test(taskMaterial) ||
    /(原因(不明|不清|未知)|根因(未知|不明|不清))/.test(taskMaterial);
  if (unknownCause) {
    const noCodeChange = proposal.scope.outOfScope.some((item) => /\b(?:do not|no|without)\s+(?:modify|change|write)\s+(?:(?:any|the)\s+)?(?:code|source|data|production|application|configuration|config)\b|\b(?:read.only|no code changes)\b/i.test(item) ||
      /不修改.{0,10}(代码|数据|配置)|禁止修改.{0,10}(代码|数据|配置)|不得修改.{0,10}(代码|数据|配置)|只读/.test(item));
    const readOnlyActions = proposal.scope.inScope.every((item) =>
      /\b(read.only|read|inspect|review|query|collect|compare|view)\b/i.test(item) &&
      !/\b(modify|change|write|delete|deploy|restart)\w*\b/i.test(item) &&
      !/(修改|变更|写入|删除|部署|重启)/.test(item));
    const boundedEvidence = input.taskEvidence.some((item) => /\b(logs?|traces?|evidence|investigat\w*|inspect\w*|reads?)\b/i.test(item) || /(日志|跟踪|证据|调查|检查|读取)/.test(item)) &&
      input.taskEvidence.some((item) => /\b(stop|halt|until|after identifying)\b/i.test(item) || /(停止|止于|直到|确认后结束)/.test(item));
    if (!noCodeChange || !readOnlyActions || !boundedEvidence) {
      return { state: "NEEDS_TASK_DETAILS", reasonCodes: ["READ_ONLY_DIAGNOSTIC_BOUNDARY_MISSING"] };
    }
  }
  return null;
}
export function assessPreflight(proposal: ExecutionProposal, input: PreflightInput): { state: PreflightState; reasonCodes: string[] } {
  return assessMaterials(proposal, input) ?? { state: "NOT_REQUIRED", reasonCodes: ["DETERMINISTIC_PREFLIGHT_PASSED"] };
}
async function keyFor(id: string): Promise<Buffer> {
  const dir = folder(id); await mkdir(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, "issuer.key");
  try { await writeFile(file, randomBytes(32), { flag: "wx", mode: 0o600 }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  const key = await readFile(file);
  if (key.length !== 32) throw new Error("Invalid preflight issuer key");
  return key;
}
function mac(record: PreflightReceipt, key: Buffer): string {
  return createHmac("sha256", key).update(JSON.stringify(record)).digest("hex");
}
export async function issuePreflightReceipt(id: string, proposal: ExecutionProposal, input: PreflightInput, now = new Date()): Promise<PreflightReceipt> {
  if (await getJevStop(id, proposal.executionLineId, proposal)) throw new Error("Stopped preflight");
  const decision = assessPreflight(proposal, input);
  if (decision.state !== "NOT_REQUIRED") throw new Error("Preflight is not NOT_REQUIRED");
  const record: PreflightReceipt = { version: VERSION, issuer: ISSUER, receiptId: randomBytes(24).toString("hex"),
    workspaceId: workspaceKey(id), executionLineId: proposal.executionLineId, proposalIdentity: proposal.identity,
    materialDigest: preflightMaterialDigest(proposal, input), decision: "NOT_REQUIRED", reasonCodes: decision.reasonCodes,
    issuedAt: now.toISOString(), expiresAt: new Date(now.getTime() + MAX_AGE_MS).toISOString() };
  const key = await keyFor(id);
  await writeFile(path.join(folder(id), `${record.receiptId}.json`), JSON.stringify({ record, mac: mac(record, key) }), { flag: "wx", mode: 0o600 });
  return record;
}
export async function verifyPreflightReceipt(id: string, proposal: ExecutionProposal, receiptId: string, input: PreflightInput, now = new Date()): Promise<PreflightReceipt | null> {
  if (!hex48.test(receiptId) || assessPreflight(proposal, input).state !== "NOT_REQUIRED") return null;
  if (await getJevStop(id, proposal.executionLineId, proposal)) return null;
  const key = await keyFor(id);
  let raw: string;
  try { raw = await readFile(path.join(folder(id), `${receiptId}.json`), "utf8"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  const envelope = JSON.parse(raw) as { record: PreflightReceipt; mac: string };
  if (!envelope?.record || typeof envelope.mac !== "string" || !hex64.test(envelope.mac) ||
    !timingSafeEqual(Buffer.from(envelope.mac, "hex"), Buffer.from(mac(envelope.record, key), "hex"))) {
    throw new Error("Tampered preflight receipt");
  }
  const receipt = envelope.record, issued = Date.parse(receipt.issuedAt), expires = Date.parse(receipt.expiresAt);
  if (receipt.version !== VERSION || receipt.issuer !== ISSUER || receipt.receiptId !== receiptId ||
    receipt.workspaceId !== workspaceKey(id) || receipt.executionLineId !== proposal.executionLineId ||
    receipt.proposalIdentity !== proposal.identity || receipt.materialDigest !== preflightMaterialDigest(proposal, input) ||
    receipt.decision !== "NOT_REQUIRED" || JSON.stringify(receipt.reasonCodes) !== JSON.stringify(["DETERMINISTIC_PREFLIGHT_PASSED"]) ||
    !Number.isFinite(issued) || !Number.isFinite(expires) || expires <= issued || expires - issued > MAX_AGE_MS) {
    throw new Error("Invalid preflight receipt");
  }
  if (now.getTime() < issued || now.getTime() >= expires) return null;
  return receipt;
}
