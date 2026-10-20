import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { link, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { getStateDir } from "../../config/paths.js";
import type { ExecutionBrief } from "../execution-brief.js";
import type { ExecutionProposal } from "../phase2.js";
import { createExecutionProposal } from "../phase2.js";
import { getJevStop, verifyJevReceipt } from "./jev-receipts.js";
import { type PreflightInput, verifyPreflightReceipt } from "./preflight-receipts.js";

const ISSUER = "c2c-phase2-handoff";
export interface HandoffProof {
  version: 1 | 2; issuer: typeof ISSUER; workspaceId: string; executionLineId: string;
  proposalIdentity: string; briefDigest: string; jevReceiptId?: string;
  authorizationSource?: "NOT_REQUIRED"; authorizationReceiptId?: string;
  proposal?: ExecutionProposal; preflight?: PreflightInput;
  issuedAt: string; expiresAt: string;
}
const hex64 = /^[a-f0-9]{64}$/;
function keyFor(id: string): string {
  if (!/^[a-fA-F0-9]{12}$/.test(id)) throw new Error("Invalid workspace ID");
  return id.toLowerCase();
}
function folder(id: string): string { return path.join(getStateDir(), "handoff-proofs", keyFor(id)); }
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => [k, canonical(v)]));
  return value;
}
export function briefDigest(brief: ExecutionBrief): string {
  return createHash("sha256").update(JSON.stringify(canonical(brief))).digest("hex");
}
async function issuerKey(id: string): Promise<Buffer> {
  const dir = folder(id);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, "issuer.key");
  try { await writeFile(file, randomBytes(32), { flag: "wx", mode: 0o600 }); }
  catch (e) { if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e; }
  const key = await readFile(file);
  if (key.length !== 32) throw new Error("Invalid handoff issuer key");
  return key;
}
function mac(record: HandoffProof, key: Buffer): string {
  return createHmac("sha256", key).update(JSON.stringify(record)).digest("hex");
}
export async function readHandoffProof(id: string, brief: ExecutionBrief, now = new Date()): Promise<HandoffProof | null> {
  const workspaceId = keyFor(id), digest = briefDigest(brief), key = await issuerKey(id);
  let raw: string;
  try { raw = await readFile(path.join(folder(id), `${digest}.json`), "utf8"); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return null; throw e; }
  const envelope = JSON.parse(raw) as { record: HandoffProof; mac: string };
  if (!envelope?.record || typeof envelope.mac !== "string" || !hex64.test(envelope.mac)) throw new Error("Invalid handoff proof");
  if (!timingSafeEqual(Buffer.from(envelope.mac, "hex"), Buffer.from(mac(envelope.record, key), "hex"))) {
    throw new Error("Tampered handoff proof");
  }
  const proof = envelope.record;
  if (![1, 2].includes(proof.version) || proof.issuer !== ISSUER || proof.workspaceId !== workspaceId ||
    !proof.executionLineId || !hex64.test(proof.proposalIdentity) || proof.briefDigest !== digest ||
    (proof.version === 1 && !/^[a-f0-9]{48}$/.test(proof.jevReceiptId ?? ""))) throw new Error("Invalid handoff proof");
  const issued = Date.parse(proof.issuedAt), expires = Date.parse(proof.expiresAt);
  if (!Number.isFinite(issued) || !Number.isFinite(expires) || expires <= issued || expires - issued > 900_000) {
    throw new Error("Invalid handoff lifetime");
  }
  if (now.getTime() < issued || now.getTime() >= expires || await getJevStop(id, proof.executionLineId)) return null;
  if (proof.version === 1) {
    if (!proof.proposal || proof.proposal.executionLineId !== proof.executionLineId ||
      proof.proposal.identity !== proof.proposalIdentity ||
      createExecutionProposal(proof.proposal).identity !== proof.proposalIdentity ||
      proof.proposal.goal !== brief.goal || JSON.stringify(proof.proposal.scope) !== JSON.stringify(brief.scope) ||
      JSON.stringify(proof.proposal.approvedBasis) !== JSON.stringify(brief.approvedBasis)) {
      throw new Error("Invalid Jev handoff proof");
    }
    const receipt = await verifyJevReceipt(id, proof.proposal, proof.jevReceiptId!, undefined, now);
    if (!receipt || receipt.decision !== "proceed" || receipt.issuedAt !== proof.issuedAt ||
      receipt.expiresAt !== proof.expiresAt) return null;
  }
  if (proof.version === 2) {
    if (proof.authorizationSource !== "NOT_REQUIRED" || !proof.authorizationReceiptId || !proof.proposal || !proof.preflight ||
      proof.proposal.executionLineId !== proof.executionLineId || proof.proposal.identity !== proof.proposalIdentity ||
      proof.proposal.goal !== brief.goal || JSON.stringify(proof.proposal.scope) !== JSON.stringify(brief.scope) ||
      JSON.stringify(proof.proposal.approvedBasis) !== JSON.stringify(brief.approvedBasis)) throw new Error("Invalid preflight handoff proof");
    const receipt = await verifyPreflightReceipt(id, proof.proposal, proof.authorizationReceiptId, proof.preflight, now);
    if (!receipt || receipt.issuedAt !== proof.issuedAt || receipt.expiresAt !== proof.expiresAt) return null;
  }
  return proof;
}
export async function issueHandoffProof(
  id: string, proposal: ExecutionProposal, brief: ExecutionBrief, receiptId: string,
  preflight?: PreflightInput,
): Promise<HandoffProof> {
  let record: HandoffProof;
  if (preflight) {
    const receipt = await verifyPreflightReceipt(id, proposal, receiptId, preflight);
    if (!receipt) throw new Error("Handoff requires valid NOT_REQUIRED receipt");
    record = { version: 2, issuer: ISSUER, workspaceId: keyFor(id), executionLineId: proposal.executionLineId,
      proposalIdentity: proposal.identity, briefDigest: briefDigest(brief), authorizationSource: "NOT_REQUIRED",
      authorizationReceiptId: receipt.receiptId, proposal, preflight, issuedAt: receipt.issuedAt, expiresAt: receipt.expiresAt };
  } else {
    const receipt = await verifyJevReceipt(id, proposal, receiptId);
    if (!receipt || receipt.decision !== "proceed") throw new Error("Handoff requires valid Jev proceed receipt");
    record = { version: 1, issuer: ISSUER, workspaceId: keyFor(id), executionLineId: proposal.executionLineId,
      proposalIdentity: proposal.identity, briefDigest: briefDigest(brief), jevReceiptId: receipt.receiptId,
      proposal, issuedAt: receipt.issuedAt, expiresAt: receipt.expiresAt };
  }
  const key = await issuerKey(id), file = path.join(folder(id), `${record.briefDigest}.json`);
  const temp = `${file}.${randomBytes(12).toString("hex")}.tmp`;
  try {
    await writeFile(temp, JSON.stringify({ record, mac: mac(record, key) }), { flag: "wx", mode: 0o600 });
    try { await link(temp, file); }
    catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      const prior = await readHandoffProof(id, brief);
      if (!prior || JSON.stringify(prior) !== JSON.stringify(record)) throw new Error("Conflicting handoff proof");
    }
  } finally {
    try { await unlink(temp); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
  }
  return record;
}
