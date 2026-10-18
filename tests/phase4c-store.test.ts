import { mkdtemp, readFile, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readProjectProfile, updateProjectProfile, ProfileStoreError, ProfileVersionConflictError } from "../src/workflow/phase4c/store.js";
import type { ProjectProfile } from "../src/workflow/phase4c/profile.js";

const syncFailure = vi.hoisted(() => ({ code: null as string | null, stage: "directory" as "directory" | "file" }));
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    open: async (...args: Parameters<typeof actual.open>) => {
      const handle = await actual.open(...args);
      const expectedFlag = syncFailure.stage === "file" ? "wx" : "r";
      if (args[1] !== expectedFlag || syncFailure.code === null) return handle;
      return new Proxy(handle, {
        get(target, property) {
          if (property === "sync") return async () => { throw Object.assign(new Error("simulated directory sync error"), { code: syncFailure.code }); };
          const value = Reflect.get(target, property, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
    },
  };
});

const workspace = "abcdef123456";
const otherWorkspace = "123456abcdef";
const originalStateDir = process.env.C2C_STATE_DIR;
let stateDir: string;

function profile(name = "C2C", workspaceId = workspace): ProjectProfile {
  return {
    schemaVersion: 1,
    workspaceId,
    workspaceName: { value: name, provenance: { kind: "observed", source: "connector", verifiedAt: "2026-10-18T10:00:00.000Z" } },
    projectType: { value: "TypeScript", provenance: { kind: "observed", source: "package.json", verifiedAt: "2026-10-18T10:00:00.000Z" } },
    frameworks: { value: ["Express", "Vitest"], provenance: { kind: "user_confirmed", source: "user", verifiedAt: "2026-10-18T10:00:00.000Z" } },
  };
}

function profileFile(id = workspace): string {
  return join(stateDir, "project-profiles", id.toLowerCase(), "profile.json");
}

describe("Phase 4C workspace profile store", () => {
  beforeEach(async () => {
    stateDir = await mkdtemp(join(tmpdir(), "c2c-phase4c-store-"));
    process.env.C2C_STATE_DIR = stateDir;
  });
  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (originalStateDir === undefined) delete process.env.C2C_STATE_DIR;
    else process.env.C2C_STATE_DIR = originalStateDir;
    await rm(stateDir, { recursive: true, force: true });
  });

  it("returns not_found without creating state, then creates an owner-only version 1 record", async () => {
    expect(await readProjectProfile(workspace)).toEqual({ status: "not_found" });
    expect(await updateProjectProfile(workspace, profile(), null)).toEqual({ recordVersion: 1, profile: profile() });
    expect(JSON.parse(await readFile(profileFile(), "utf8"))).toEqual({ recordVersion: 1, profile: profile() });
    if (process.platform !== "win32") {
      expect((await stat(join(stateDir, "project-profiles"))).mode & 0o777).toBe(0o700);
      expect((await stat(profileFile())).mode & 0o777).toBe(0o600);
    }
  });

  it("increments versions only on a successful compare-and-swap update", async () => {
    const first = await updateProjectProfile(workspace, profile(), null);
    expect(await updateProjectProfile(workspace, profile("Renamed"), first.recordVersion)).toEqual({ recordVersion: 2, profile: profile("Renamed") });
    await expect(updateProjectProfile(workspace, profile("Lost update"), 1)).rejects.toBeInstanceOf(ProfileVersionConflictError);
    expect((await readProjectProfile(workspace)).status).toBe("current");
  });

  it("rejects create/update expectation conflicts without writing", async () => {
    await expect(updateProjectProfile(workspace, profile(), 1)).rejects.toBeInstanceOf(ProfileVersionConflictError);
    await updateProjectProfile(workspace, profile(), null);
    await expect(updateProjectProfile(workspace, profile("wrong"), null)).rejects.toBeInstanceOf(ProfileVersionConflictError);
    expect(JSON.parse(await readFile(profileFile(), "utf8")).recordVersion).toBe(1);
  });

  it("allows only one concurrent writer with the same expected version", async () => {
    await updateProjectProfile(workspace, profile(), null);
    const results = await Promise.allSettled([
      updateProjectProfile(workspace, profile("A"), 1),
      updateProjectProfile(workspace, profile("B"), 1),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.status === "rejected" && rejected.reason).toBeInstanceOf(ProfileVersionConflictError);
    expect((await readProjectProfile(workspace)).recordVersion).toBe(2);
  });

  it("fails closed with STORE_BUSY when a lock remains through the five second deadline", async () => {
    await updateProjectProfile(workspace, profile(), null);
    await mkdir(join(stateDir, "project-profiles", workspace, "profile.lock"));
    await expect(updateProjectProfile(workspace, profile("blocked"), 1)).rejects.toMatchObject({ code: "STORE_BUSY" });
    expect((await readProjectProfile(workspace)).recordVersion).toBe(1);
  });

  it("treats malformed JSON, unsupported record keys, and invalid embedded profiles as corruption", async () => {
    await updateProjectProfile(workspace, profile(), null);
    await writeFile(profileFile(), "{");
    await expect(readProjectProfile(workspace)).rejects.toBeInstanceOf(ProfileStoreError);
    await writeFile(profileFile(), JSON.stringify({ recordVersion: 1, profile: profile(), extra: true }));
    await expect(readProjectProfile(workspace)).rejects.toBeInstanceOf(ProfileStoreError);
    await writeFile(profileFile(), JSON.stringify({ recordVersion: 1, profile: profile("wrong", otherWorkspace) }));
    await expect(readProjectProfile(workspace)).rejects.toBeInstanceOf(ProfileStoreError);
    await expect(updateProjectProfile(workspace, profile("replace"), 1)).rejects.toBeInstanceOf(ProfileStoreError);
  });

  it("isolates records by normalized connector workspace ID", async () => {
    await updateProjectProfile(workspace, profile("first"), null);
    await updateProjectProfile(otherWorkspace, profile("second", otherWorkspace), null);
    expect((await readProjectProfile(workspace)).profile.workspaceName.value).toBe("first");
    expect((await readProjectProfile(otherWorkspace)).profile.workspaceName.value).toBe("second");
    expect(await readProjectProfile("ABCDEF123456")).toMatchObject({ status: "current", profile: { workspaceName: { value: "first" } } });
  });

  it("compares only supplied live facts and returns sorted stale fact names", async () => {
    await updateProjectProfile(workspace, profile(), null);
    const before = await readFile(profileFile(), "utf8");
    expect(await readProjectProfile(workspace, { workspaceName: "C2C", projectType: "TypeScript" })).toMatchObject({ status: "current" });
    expect(await readProjectProfile(workspace, { frameworks: ["Vitest", "Express"], packageManager: "pnpm" })).toMatchObject({
      status: "stale", staleFacts: ["frameworks", "packageManager"], recordVersion: 1,
    });
    expect(await readProjectProfile(workspace, { packageManager: "pnpm" })).toMatchObject({ status: "stale", staleFacts: ["packageManager"] });
    expect(await readProjectProfile(workspace)).toMatchObject({ status: "current" });
    expect(await readProjectProfile(workspace, { workspaceName: "C2C" })).toMatchObject({ status: "current" });
    expect(await readFile(profileFile(), "utf8")).toBe(before);
  });

  it.each([
    ["workspaceName", ["C2C"]],
    ["projectType", null],
    ["packageManager", ["pnpm"]],
    ["deploymentCharacteristic", null],
    ["frameworks", "Vitest"],
    ["frameworks", null],
    ["focusedValidationCommands", null],
    ["browserProductionCaveats", "browser note"],
  ])("rejects invalid live fact type for %s", async (name, value) => {
    await updateProjectProfile(workspace, profile(), null);
    await expect(readProjectProfile(workspace, { [name]: value })).rejects.toThrow(`liveFacts.${name}`);
  });

  it("ignores recognized unsupported directory sync errors", async () => {
    syncFailure.stage = "directory";
    syncFailure.code = "EINVAL";
    try { await expect(updateProjectProfile(workspace, profile(), null)).resolves.toMatchObject({ recordVersion: 1 }); }
    finally { syncFailure.code = null; syncFailure.stage = "directory"; }
  });

  it("preserves the old record and cleans up when a pre-rename file flush fails", async () => {
    await updateProjectProfile(workspace, profile(), null);
    syncFailure.stage = "file";
    syncFailure.code = "EIO";
    try { await expect(updateProjectProfile(workspace, profile("uncommitted"), 1)).rejects.toMatchObject({ code: "STORE_ERROR" }); }
    finally { syncFailure.code = null; syncFailure.stage = "directory"; }
    expect(await readProjectProfile(workspace)).toMatchObject({ status: "current", recordVersion: 1, profile: { workspaceName: { value: "C2C" } } });
    expect(await readdir(join(stateDir, "project-profiles", workspace))).toEqual(["profile.json"]);
  });

  it("reports unexpected directory sync errors after atomic replacement and cleans temporary files", async () => {
    await updateProjectProfile(workspace, profile(), null);
    syncFailure.stage = "directory";
    syncFailure.code = "EIO";
    try {
      await expect(updateProjectProfile(workspace, profile("replacement"), 1)).rejects.toMatchObject({
        code: "STORE_COMMIT_UNCERTAIN",
        message: expect.stringContaining("re-read the profile and recordVersion"),
      });
    } finally { syncFailure.code = null; syncFailure.stage = "directory"; }
    expect(await readProjectProfile(workspace)).toMatchObject({ status: "current", recordVersion: 2, profile: { workspaceName: { value: "replacement" } } });
    expect(await readdir(join(stateDir, "project-profiles", workspace))).toEqual(["profile.json"]);
  });

  it("does not replace the previous record when the state root prevents writing", async () => {
    await updateProjectProfile(workspace, profile(), null);
    const previous = await readFile(profileFile(), "utf8");
    const blockedRoot = join(stateDir, "blocked-root");
    await writeFile(blockedRoot, "not a directory");
    process.env.C2C_STATE_DIR = join(blockedRoot, "child");
    await expect(updateProjectProfile(workspace, profile("unwritten"), 1)).rejects.toThrow();
    process.env.C2C_STATE_DIR = stateDir;
    expect(await readFile(profileFile(), "utf8")).toBe(previous);
  });
});
