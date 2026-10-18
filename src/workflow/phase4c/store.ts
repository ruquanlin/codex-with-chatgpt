import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rmdir, unlink, chmod } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import path from "node:path";
import { getStateDir } from "../../config/paths.js";
import { validateProjectProfile, type ProjectProfile } from "./profile.js";

export interface LiveProjectFacts {
  workspaceName?: string;
  projectType?: string;
  frameworks?: string[];
  packageManager?: string;
  focusedValidationCommands?: string[];
  deploymentCharacteristic?: string;
  browserProductionCaveats?: string[];
}

export type ProjectProfileReadResult =
  | { status: "not_found" }
  | { status: "current"; recordVersion: number; profile: ProjectProfile }
  | { status: "stale"; recordVersion: number; profile: ProjectProfile; staleFacts: string[] };

export interface ProjectProfileUpdateResult {
  recordVersion: number;
  profile: ProjectProfile;
}

export class ProfileStoreError extends Error {
  readonly code: string;

  constructor(message: string, options?: ErrorOptions, code = "STORE_ERROR") {
    super(message, options);
    this.name = "ProfileStoreError";
    this.code = code;
  }
}

export class ProfileVersionConflictError extends Error {
  constructor() {
    super("Project profile version conflict");
    this.name = "ProfileVersionConflictError";
  }
}

const FACT_NAMES = ["workspaceName", "projectType", "frameworks", "packageManager", "focusedValidationCommands", "deploymentCharacteristic", "browserProductionCaveats"] as const;
const STRING_FACT_NAMES = new Set(["workspaceName", "projectType", "packageManager", "deploymentCharacteristic"]);
const ARRAY_FACT_NAMES = new Set(["frameworks", "focusedValidationCommands", "browserProductionCaveats"]);

function validateWorkspaceId(id: string): string {
  if (typeof id !== "string" || !/^[a-fA-F0-9]{12}$/.test(id)) throw new Error("currentWorkspaceId must contain exactly 12 hexadecimal characters");
  return id.toLowerCase();
}

function workspaceDir(id: string): string {
  return path.join(getStateDir(), "project-profiles", id);
}

function exactRecord(value: unknown, id: string): { recordVersion: number; profile: ProjectProfile } {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("record must be an object");
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== 2 || !Object.hasOwn(record, "recordVersion") || !Object.hasOwn(record, "profile")) {
    throw new Error("record has missing or unsupported keys");
  }
  if (!Number.isSafeInteger(record.recordVersion) || (record.recordVersion as number) < 1) throw new Error("recordVersion must be a positive safe integer");
  return { recordVersion: record.recordVersion as number, profile: validateProjectProfile(record.profile, id) };
}

async function readRecord(id: string): Promise<{ recordVersion: number; profile: ProjectProfile } | null> {
  let contents: string;
  try {
    contents = await readFile(path.join(workspaceDir(id), "profile.json"), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new ProfileStoreError("Unable to read project profile", { cause: error });
  }
  try {
    return exactRecord(JSON.parse(contents), id);
  } catch (error) {
    throw new ProfileStoreError("Stored project profile is corrupt", { cause: error });
  }
}

function staleNames(profile: ProjectProfile, liveFacts: LiveProjectFacts | undefined): string[] {
  if (liveFacts === undefined) return [];
  if (!liveFacts || typeof liveFacts !== "object" || Array.isArray(liveFacts)) throw new Error("liveFacts must be an object");
  for (const key of Object.keys(liveFacts)) if (!(FACT_NAMES as readonly string[]).includes(key)) throw new Error(`Unsupported live fact '${key}'`);
  const stale: string[] = [];
  for (const name of FACT_NAMES) {
    if (!Object.hasOwn(liveFacts, name)) continue;
    const live = liveFacts[name];
    if (live === undefined) throw new Error(`liveFacts.${name} must not be undefined`);
    if (STRING_FACT_NAMES.has(name)) {
      if (typeof live !== "string") throw new Error(`liveFacts.${name} must be a string`);
      if (!live.trim() || live !== live.trim()) throw new Error(`liveFacts.${name} must be a canonical nonblank string`);
    } else if (ARRAY_FACT_NAMES.has(name)) {
      if (!Array.isArray(live) || live.length === 0 || live.some((item) => typeof item !== "string" || !item.trim() || item !== item.trim()) || new Set(live).size !== live.length) {
        throw new Error(`liveFacts.${name} must be a nonempty string array`);
      }
    }
    const stored = profile[name];
    if (stored === undefined || !sameValue(stored.value, live)) stale.push(name);
  }
  return stale.sort();
}

function sameValue(left: string | string[], right: unknown): boolean {
  if (Array.isArray(left)) return Array.isArray(right) && left.length === right.length && left.every((item, index) => item === right[index]);
  return typeof right === "string" && left === right;
}

export async function readProjectProfile(currentWorkspaceId: string, liveFacts?: LiveProjectFacts): Promise<ProjectProfileReadResult> {
  const id = validateWorkspaceId(currentWorkspaceId);
  const record = await readRecord(id);
  if (!record) return { status: "not_found" };
  const staleFacts = staleNames(record.profile, liveFacts);
  return staleFacts.length
    ? { status: "stale", ...record, staleFacts }
    : { status: "current", ...record };
}

async function acquireLock(dir: string): Promise<string> {
  const lock = path.join(dir, "profile.lock");
  const started = performance.now();
  while (true) {
    try {
      await mkdir(lock, { mode: 0o700 });
      return lock;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (performance.now() - started >= 5_000) throw new ProfileStoreError("Project profile lock timed out", undefined, "STORE_BUSY");
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
}

async function writeAtomic(dir: string, record: { recordVersion: number; profile: ProjectProfile }): Promise<void> {
  const target = path.join(dir, "profile.json");
  const temporary = path.join(dir, `.profile.${randomUUID()}.tmp`);
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(JSON.stringify(record));
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, target);
    try {
      const directory = await open(dir, "r");
      try { await directory.sync(); } finally { await directory.close(); }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      const unsupported = code === "EINVAL" || code === "ENOTSUP" || code === "EISDIR" ||
        (process.platform === "win32" && code === "EPERM");
      if (!unsupported) {
        throw new ProfileStoreError(
          "Project profile commit is uncertain after atomic rename; re-read the profile and recordVersion before considering another update",
          { cause: error },
          "STORE_COMMIT_UNCERTAIN",
        );
      }
    }
  } finally {
    if (handle) await handle.close();
    try { await unlink(temporary); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

export async function updateProjectProfile(
  currentWorkspaceId: string,
  profile: unknown,
  expectedRecordVersion: number | null,
): Promise<ProjectProfileUpdateResult> {
  const id = validateWorkspaceId(currentWorkspaceId);
  const canonical = validateProjectProfile(profile, currentWorkspaceId);
  if (expectedRecordVersion !== null && (!Number.isSafeInteger(expectedRecordVersion) || expectedRecordVersion < 1)) {
    throw new Error("expectedRecordVersion must be null or a positive safe integer");
  }
  const dir = workspaceDir(id);
  try {
    await mkdir(dir, { recursive: true, mode: 0o700 });
    if (process.platform !== "win32") {
      await chmod(path.dirname(dir), 0o700);
      await chmod(dir, 0o700);
    }
  } catch (error) {
    throw new ProfileStoreError("Unable to prepare private project profile directory", { cause: error });
  }
  let lock: string;
  try { lock = await acquireLock(dir); }
  catch (error) {
    if (error instanceof ProfileStoreError) throw error;
    throw new ProfileStoreError("Unable to acquire project profile lock", { cause: error });
  }
  try {
    const current = await readRecord(id);
    if ((current === null && expectedRecordVersion !== null) ||
        (current !== null && expectedRecordVersion !== current.recordVersion)) {
      throw new ProfileVersionConflictError();
    }
    if (current?.recordVersion === Number.MAX_SAFE_INTEGER) throw new ProfileStoreError("Project profile version cannot be incremented safely");
    const next = { recordVersion: current ? current.recordVersion + 1 : 1, profile: canonical };
    await writeAtomic(dir, next);
    return next;
  } catch (error) {
    if (error instanceof ProfileVersionConflictError || error instanceof ProfileStoreError) throw error;
    throw new ProfileStoreError("Unable to update project profile", { cause: error });
  } finally {
    await rmdir(lock).catch((error) => { throw new ProfileStoreError("Unable to release project profile lock", { cause: error }); });
  }
}
