import { randomUUID } from "node:crypto";
import { link, mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { getStateDir } from "../../config/paths.js";
import { failureIdFor, type FailureRecord } from "./failure.js";

const recordKeys = ["executionLineId", "proposalIdentity", "failureType", "failedAtStage", "summary", "evidence", "nextRoute", "failureId", "createdAt"] as const;
const legalRoutes = new Set([
  "EXECUTION_FAILURE:EXECUTION:SYSTEMATIC_DEBUGGING",
  "VALIDATION_FAILURE:VALIDATION:SYSTEMATIC_DEBUGGING",
  "VALIDATION_FAILURE:VALIDATION:VALIDATION_REROUTE",
  "REVIEW_FAILURE:REVIEW:ROUTER_REGRILL",
  "ACCEPTANCE_FAILURE:ACCEPTANCE:ROUTER_RECLASSIFY",
]);

export class FailureRecordConflictError extends Error {
  constructor() {
    super("A different failure record already exists for this execution line");
    this.name = "FailureRecordConflictError";
  }
}

function validateWorkspaceId(workspaceId: string): void {
  if (typeof workspaceId !== "string" || !/^[a-fA-F0-9]{12}$/.test(workspaceId)) {
    throw new Error("workspaceId must be 12 hexadecimal characters");
  }
}

function canonicalText(value: unknown, name: string): void {
  if (typeof value !== "string" || !value.trim() || value !== value.trim()) {
    throw new Error(`${name} must be a canonical nonblank string`);
  }
}

function validateRecord(workspaceId: string, value: unknown): FailureRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid failure record");
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== recordKeys.length || keys.some((key) => !(recordKeys as readonly string[]).includes(key))) {
    throw new Error("Failure record has missing or unsupported fields");
  }
  for (const key of ["executionLineId", "proposalIdentity", "summary"] as const) canonicalText(record[key], key);
  if (!Array.isArray(record.evidence) || record.evidence.length === 0) throw new Error("Failure evidence is invalid");
  record.evidence.forEach((item, index) => canonicalText(item, `evidence[${index}]`));
  if (!legalRoutes.has(`${record.failureType}:${record.failedAtStage}:${record.nextRoute}`)) throw new Error("Failure route is invalid");
  if (typeof record.failureId !== "string" || !/^[a-f0-9]{64}$/.test(record.failureId) ||
      record.failureId !== failureIdFor(workspaceId, record.executionLineId as string)) {
    throw new Error("Failure ID does not match workspace and execution line");
  }
  if (typeof record.createdAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(record.createdAt) ||
      !Number.isFinite(Date.parse(record.createdAt)) || new Date(record.createdAt).toISOString() !== record.createdAt) {
    throw new Error("Failure timestamp is invalid");
  }
  return value as FailureRecord;
}

function failureDir(workspaceId: string): string {
  return path.join(getStateDir(), "failures", workspaceId);
}

function failurePath(workspaceId: string, failureId: string): string {
  return path.join(failureDir(workspaceId), `${failureId}.json`);
}

async function readRecord(workspaceId: string, failureId: string): Promise<FailureRecord | null> {
  let contents: string;
  try {
    contents = await readFile(failurePath(workspaceId, failureId), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  const record = validateRecord(workspaceId, JSON.parse(contents));
  if (record.failureId !== failureId) throw new Error("Failure file ID does not match its record");
  return record;
}

function sameFailure(a: FailureRecord, b: FailureRecord): boolean {
  return a.executionLineId === b.executionLineId &&
    a.proposalIdentity === b.proposalIdentity &&
    a.failureType === b.failureType &&
    a.failedAtStage === b.failedAtStage &&
    a.summary === b.summary &&
    a.nextRoute === b.nextRoute &&
    a.failureId === b.failureId &&
    a.evidence.length === b.evidence.length && a.evidence.every((item, index) => item === b.evidence[index]);
}

export async function persistFailureRecord(workspaceId: string, record: FailureRecord): Promise<FailureRecord> {
  validateWorkspaceId(workspaceId);
  const canonical = validateRecord(workspaceId, record);
  const dir = failureDir(workspaceId);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const target = failurePath(workspaceId, canonical.failureId);
  const temporary = path.join(dir, `.${canonical.failureId}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, JSON.stringify(canonical), { flag: "wx", mode: 0o600 });
    try {
      await link(temporary, target);
      return canonical;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const existing = await readRecord(workspaceId, canonical.failureId);
      if (!existing) throw new Error("Existing failure record disappeared");
      if (!sameFailure(existing, canonical)) throw new FailureRecordConflictError();
      return existing;
    }
  } finally {
    try {
      await unlink(temporary);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

export async function getFailureByExecutionLine(workspaceId: string, executionLineId: string): Promise<FailureRecord | null> {
  validateWorkspaceId(workspaceId);
  return readRecord(workspaceId, failureIdFor(workspaceId, executionLineId));
}

export async function listRecentFailures(workspaceId: string, limit = 10): Promise<FailureRecord[]> {
  validateWorkspaceId(workspaceId);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error("limit must be an integer from 1 to 50");
  let names: string[];
  try {
    names = await readdir(failureDir(workspaceId));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const records = await Promise.all(names.filter((name) => name.endsWith(".json")).map(async (name) => {
    const failureId = name.slice(0, -5);
    if (!/^[a-f0-9]{64}$/.test(failureId)) throw new Error("Invalid failure filename");
    const record = await readRecord(workspaceId, failureId);
    if (!record) throw new Error("Failure record disappeared during listing");
    return record;
  }));
  return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.failureId.localeCompare(b.failureId)).slice(0, limit);
}
