import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getStateDir } from "../../config/paths.js";
import type { ExecutionProposal } from "../phase2.js";
import { getJevStop } from "./jev-receipts.js";

const ISSUER = "c2c-conditional-preflight";
const VERSION = 3;
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
  version: 3; issuer: typeof ISSUER; receiptId: string; workspaceId: string;
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
export function assessPreflight(proposal: ExecutionProposal, input: PreflightInput): { state: PreflightState; reasonCodes: string[] } {
  const material = [proposal.goal, proposal.riskProfile ?? "", proposal.approvedBasis.summary,
    ...proposal.scope.inScope, ...proposal.implementationBasis, ...input.taskEvidence].join(" ");
  const mandatory = signals.filter((signal) => input[signal] === true);
  if (proposal.jevRequired === true) mandatory.push("jevRequired" as PreflightSignal);
  if (/\b(unclear|unknown cause|difficult bug|hard bug)\b/i.test(material)) mandatory.push("difficultOrUnclearBug");
  if (/(困难|棘手|疑难).{0,12}(漏洞|故障|错误|问题|[Bb]ug)|原因(不明|不清|未知).{0,12}(漏洞|故障|错误|问题|[Bb]ug)/.test(material)) mandatory.push("difficultOrUnclearBug");
  if (/\b(production incident|runtime incident|outage|production outage)\b/i.test(material)) mandatory.push("productionOrRuntimeIncident");
  if (/(生产(环境)?|线上|运行时).{0,12}(事故|故障|宕机|中断)/.test(material)) mandatory.push("productionOrRuntimeIncident");
  if (/\b(follow.?up|continue (the )?(diagnosis|investigation|fix)|reinvestigat|after (the )?(diagnosis|investigation)|same issue)\b/i.test(material)) mandatory.push("completedPriorDiagnosisAndFollowupCodex");
  if (/(已完成|完成|上一轮|前一轮|此前).{0,12}(诊断|调查).{0,20}(继续|再次|后续|接着|跟进|修复|再查)/.test(material)) mandatory.push("completedPriorDiagnosisAndFollowupCodex");
  if (/\b(repeated investigation|repeatedly investigating|no progress|still unresolved)\b/i.test(material)) mandatory.push("repetitiveInvestigationWithoutProgress");
  if (/(反复|重复|多次).{0,12}(调查|排查|诊断).{0,20}(无进展|没有进展|未有进展|无实质进展|没有实质进展|仍未解决)/.test(material)) mandatory.push("repetitiveInvestigationWithoutProgress");
  if (mandatory.length) return { state: "REQUIRES_JEV", reasonCodes: [...new Set(mandatory)] };
  if (!proposal.goal.trim() || !proposal.scope.inScope.length || !proposal.implementationBasis.length ||
    !input.acceptanceCriteria.length || !input.taskEvidence.length) {
    return { state: "NEEDS_TASK_DETAILS", reasonCodes: ["INSUFFICIENT_TASK_DETAILS"] };
  }
  return { state: "NOT_REQUIRED", reasonCodes: ["BOUNDED_ORDINARY_TASK"] };
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
    receipt.decision !== "NOT_REQUIRED" || JSON.stringify(receipt.reasonCodes) !== JSON.stringify(["BOUNDED_ORDINARY_TASK"]) ||
    !Number.isFinite(issued) || !Number.isFinite(expires) || expires <= issued || expires - issued > MAX_AGE_MS) {
    throw new Error("Invalid preflight receipt");
  }
  if (now.getTime() < issued || now.getTime() >= expires) return null;
  return receipt;
}
