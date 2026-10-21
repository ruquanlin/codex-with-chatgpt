import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { link, mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { getStateDir } from "../../config/paths.js";
import type { JevGateInput, JevGateResult } from "../../decision/jev-gate.js";
import type { ExecutionProposal } from "../phase2.js";

const VERSION = 1;
const MAX_AGE_MS = 900_000;
const ISSUER = "c2c-jev-decision-gate";
const hex64 = /^[a-f0-9]{64}$/;
const receiptIdPattern = /^[a-f0-9]{48}$/;

export interface JevReceipt {
  contractVersion: 1;
  receiptId: string;
  workspaceId: string;
  executionLineId: string;
  proposalIdentity: string;
  materialEvidenceDigest: string;
  jevRequestDigest: string;
  issuer: typeof ISSUER;
  available: true;
  decision: "proceed" | "reframe" | "stop";
  issuedAt: string;
  expiresAt: string;
}

interface Signed<T> { record: T; mac: string }
type StopMarker = Pick<JevReceipt, "contractVersion" | "workspaceId" | "executionLineId" | "receiptId" | "issuedAt"> & { issuer: typeof ISSUER; decision: "stop"; investigationFingerprint?: string };

function workspaceKey(workspaceId: string): string {
  if (!/^[a-fA-F0-9]{12}$/.test(workspaceId)) throw new Error("Invalid workspace ID");
  return workspaceId.toLowerCase();
}

function dir(workspaceId: string): string {
  return path.join(getStateDir(), "jev-receipts", workspaceKey(workspaceId));
}

function lineKey(lineId: string): string {
  if (typeof lineId !== "string" || !lineId.trim()) throw new Error("Invalid execution line ID");
  return createHash("sha256").update(lineId.trim()).digest("hex");
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

// Task 1 currently has no separate preflight envelope. Bind the available
// material proposal identity; Task 3 can replace this when that envelope exists.
export function materialEvidenceDigest(proposal: ExecutionProposal): string {
  return digest([VERSION, proposal.identity]);
}

export function jevRequestDigest(input: JevGateInput): string {
  return digest([input.task, input.evidence ?? [], input.attempts ?? []]);
}

async function secret(workspaceId: string): Promise<Buffer> {
  const folder = dir(workspaceId);
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const file = path.join(folder, "issuer.key");
  try {
    await writeFile(file, randomBytes(32), { flag: "wx", mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  const key = await readFile(file);
  if (key.length !== 32) throw new Error("Invalid Jev receipt issuer key");
  return key;
}

async function existingSecret(workspaceId: string): Promise<Buffer | null> {
  const file = path.join(dir(workspaceId), "issuer.key");
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error("Invalid Jev receipt issuer key");
    const key = await readFile(file);
    if (key.length !== 32) throw new Error("Invalid Jev receipt issuer key");
    return key;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function sign<T>(record: T, key: Buffer): Signed<T> {
  return { record, mac: createHmac("sha256", key).update(JSON.stringify(record)).digest("hex") };
}

async function readSigned<T>(file: string, key: Buffer): Promise<T | null> {
  let contents: string;
  try {
    contents = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  const envelope = JSON.parse(contents) as Signed<T>;
  if (!envelope || typeof envelope !== "object" || !envelope.record || typeof envelope.mac !== "string" || !hex64.test(envelope.mac)) {
    throw new Error("Invalid Jev receipt storage");
  }
  const actual = Buffer.from(envelope.mac, "hex");
  const expected = Buffer.from(sign(envelope.record, key).mac, "hex");
  if (!timingSafeEqual(actual, expected)) throw new Error("Tampered Jev receipt storage");
  return envelope.record;
}

async function writeExclusive(file: string, value: unknown): Promise<void> {
  const temporary = `${file}.${randomBytes(12).toString("hex")}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(value), { flag: "wx", mode: 0o600 });
    await link(temporary, file);
  } finally {
    try { await unlink(temporary); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

function stopPath(workspaceId: string, lineId: string): string {
  return path.join(dir(workspaceId), `stop-${lineKey(lineId)}.json`);
}

function investigationFingerprint(proposal: ExecutionProposal): string {
  return digest({
    goal: proposal.goal.trim(),
    scope: { inScope: [...proposal.scope.inScope].sort(), outOfScope: [...proposal.scope.outOfScope].sort() },
    approvedBasis: proposal.approvedBasis,
    implementationBasis: [...proposal.implementationBasis].sort(),
    riskProfile: proposal.riskProfile?.trim() ?? "",
  });
}

function investigationStopPath(workspaceId: string, fingerprint: string): string {
  return path.join(dir(workspaceId), `stop-investigation-${fingerprint}.json`);
}

function validateStop(marker: StopMarker, workspaceId: string): void {
  if (marker.contractVersion !== VERSION || marker.workspaceId !== workspaceKey(workspaceId) ||
    typeof marker.executionLineId !== "string" || !marker.executionLineId.trim() ||
    marker.issuer !== ISSUER || marker.decision !== "stop" ||
    !receiptIdPattern.test(marker.receiptId) || !Number.isFinite(Date.parse(marker.issuedAt)) ||
    (marker.investigationFingerprint !== undefined && !hex64.test(marker.investigationFingerprint))) {
    throw new Error("Invalid Jev stop marker");
  }
}

export async function getJevStop(workspaceId: string, lineId: string, proposal?: ExecutionProposal): Promise<StopMarker | null> {
  const namespace = workspaceKey(workspaceId);
  const lineFile = stopPath(namespace, lineId);
  const fingerprint = proposal ? investigationFingerprint(proposal) : undefined;
  const investigationFile = fingerprint ? investigationStopPath(namespace, fingerprint) : undefined;
  if (proposal && proposal.executionLineId !== lineId) throw new Error("Invalid Jev stop lookup");
  const [lineExists, investigationExists] = await Promise.all([
    stat(lineFile).then(() => true, (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return false;
      throw error;
    }),
    investigationFile ? stat(investigationFile).then(() => true, (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return false;
      throw error;
    }) : Promise.resolve(false),
  ]);
  if (!lineExists && !investigationExists) return null;
  const key = await existingSecret(namespace);
  if (!key) throw new Error("Jev stop marker exists without an issuer key");
  const lineMarker = await readSigned<StopMarker>(lineFile, key);
  if (lineMarker) {
    validateStop(lineMarker, workspaceId);
    if (lineMarker.executionLineId !== lineId) throw new Error("Invalid Jev stop marker");
  }
  if (!proposal) return lineMarker;
  const investigationMarker = await readSigned<StopMarker>(investigationFile!, key);
  if (investigationMarker) {
    validateStop(investigationMarker, workspaceId);
    if (investigationMarker.investigationFingerprint !== fingerprint) throw new Error("Invalid Jev stop marker");
  }
  if (lineMarker && investigationMarker && lineMarker.receiptId !== investigationMarker.receiptId) {
    throw new Error("Conflicting Jev stop markers");
  }
  return lineMarker ?? investigationMarker;
}

export async function issueJevReceipt(workspaceId: string, proposal: ExecutionProposal, request: JevGateInput, result: JevGateResult, now = new Date()): Promise<JevReceipt> {
  if (!result.available || !result.decision || !["proceed", "reframe", "stop"].includes(result.decision)) {
    throw new Error("Unavailable Jev cannot issue a receipt");
  }
  const namespace = workspaceKey(workspaceId);
  const key = await secret(namespace);
  if (await getJevStop(namespace, proposal.executionLineId, proposal)) throw new Error("Execution line has a Jev stop marker");
  const receipt: JevReceipt = {
    contractVersion: VERSION, receiptId: randomBytes(24).toString("hex"), workspaceId: namespace,
    executionLineId: proposal.executionLineId, proposalIdentity: proposal.identity,
    materialEvidenceDigest: materialEvidenceDigest(proposal), jevRequestDigest: jevRequestDigest(request),
    issuer: ISSUER, available: true, decision: result.decision,
    issuedAt: now.toISOString(), expiresAt: new Date(now.getTime() + MAX_AGE_MS).toISOString(),
  };
  if (receipt.decision === "stop") {
    const marker: StopMarker = { contractVersion: VERSION, workspaceId: namespace, executionLineId: receipt.executionLineId,
      receiptId: receipt.receiptId, issuedAt: receipt.issuedAt, issuer: ISSUER, decision: "stop",
      investigationFingerprint: investigationFingerprint(proposal) };
    await writeExclusive(investigationStopPath(namespace, marker.investigationFingerprint!), sign(marker, key));
    await writeExclusive(stopPath(namespace, receipt.executionLineId), sign(marker, key));
  }
  await writeExclusive(path.join(dir(namespace), `${receipt.receiptId}.json`), sign(receipt, key));
  return receipt;
}

export async function verifyJevReceipt(workspaceId: string, proposal: ExecutionProposal, receiptId: string, request?: JevGateInput, now = new Date()): Promise<JevReceipt | null> {
  const namespace = workspaceKey(workspaceId);
  if (!receiptIdPattern.test(receiptId)) return null;
  const key = await secret(namespace);
  const receipt = await readSigned<JevReceipt>(path.join(dir(namespace), `${receiptId}.json`), key);
  if (!receipt) return null;
  if (receipt.contractVersion !== VERSION || receipt.issuer !== ISSUER || receipt.receiptId !== receiptId ||
    receipt.workspaceId !== namespace || receipt.executionLineId !== proposal.executionLineId ||
    receipt.proposalIdentity !== proposal.identity || receipt.materialEvidenceDigest !== materialEvidenceDigest(proposal) ||
    !hex64.test(receipt.jevRequestDigest) || (request && receipt.jevRequestDigest !== jevRequestDigest(request)) ||
    receipt.available !== true || !["proceed", "reframe", "stop"].includes(receipt.decision) ||
    !Number.isFinite(Date.parse(receipt.issuedAt)) || !Number.isFinite(Date.parse(receipt.expiresAt))) {
    throw new Error("Invalid Jev receipt");
  }
  const issued = Date.parse(receipt.issuedAt);
  const expires = Date.parse(receipt.expiresAt);
  if (expires <= issued || expires - issued > MAX_AGE_MS || now.getTime() < issued || now.getTime() >= expires) return null;
  const stop = await getJevStop(namespace, proposal.executionLineId, proposal);
  if (receipt.decision === "stop" && stop?.receiptId !== receipt.receiptId) return null;
  if (stop && receipt.decision !== "stop") return null;
  return receipt;
}
