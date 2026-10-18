import { describe, expect, it } from "vitest";
import { validateProjectProfile, type ProjectProfile, type ProfileFact } from "../src/workflow/phase4c/profile.js";

const workspaceId = "51442efa88b2";
const provenance = { kind: "observed" as const, source: "connector workspace info", verifiedAt: "2026-10-18T09:30:00.000Z" };
const fact = <T>(value: T, changes: Partial<typeof provenance> = {}): ProfileFact<T> => ({ value, provenance: { ...provenance, ...changes } });

function validProfile(overrides: Record<string, unknown> = {}): ProjectProfile {
  return {
    schemaVersion: 1,
    workspaceId,
    workspaceName: fact("codex-with-chatgpt"),
    ...overrides,
  } as ProjectProfile;
}

describe("Phase 4C Project Profile validation", () => {
  it("accepts the required workspace fact and preserves its data", () => {
    const input = validProfile();
    expect(validateProjectProfile(input, workspaceId)).toEqual(input);
  });

  it("accepts all approved optional facts and both provenance kinds", () => {
    const input: ProjectProfile = {
      ...validProfile(),
      projectType: fact("web application", { kind: "user_confirmed" }),
      frameworks: fact(["Express", "Vitest"]),
      packageManager: fact("pnpm"),
      focusedValidationCommands: fact(["pnpm exec vitest run tests/unit.test.ts", "pnpm exec tsc --noEmit"]),
      deploymentCharacteristic: fact("Cloudflare Workers"),
      browserProductionCaveats: fact(["Validate the deployed route in a browser"]),
    };
    expect(validateProjectProfile(input, workspaceId)).toEqual(input);
  });

  it("allows omitted optional facts and legitimate relative paths and command hints", () => {
    const input = {
      ...validProfile(),
      focusedValidationCommands: fact(["pnpm exec vitest run tests/phase4c-profile.test.ts", "node scripts/check.js"]),
      browserProductionCaveats: fact(["Check the health endpoint via the browser"]),
    };
    expect(validateProjectProfile(input, workspaceId)).toEqual(input);
  });

  it("matches the current connector workspace ID case-insensitively", () => {
    const input = validProfile({ workspaceId: workspaceId.toUpperCase() });
    expect(validateProjectProfile(input, workspaceId)).toEqual(input);
    expect(() => validateProjectProfile(input, "000000000000")).toThrow(/does not match/);
  });

  it("rejects malformed current or profile workspace IDs", () => {
    for (const id of ["", "123", "51442efa88bZ", " 51442efa88b2"]) {
      expect(() => validateProjectProfile(validProfile(), id)).toThrow(/currentWorkspaceId/);
      expect(() => validateProjectProfile(validProfile({ workspaceId: id }), workspaceId)).toThrow(/workspaceId/);
    }
  });

  it("rejects unknown keys at profile, fact, and provenance levels", () => {
    expect(() => validateProjectProfile({ ...validProfile(), extra: true }, workspaceId)).toThrow(/unsupported key/);
    expect(() => validateProjectProfile(validProfile({ workspaceName: { ...fact("name"), extra: true } }), workspaceId)).toThrow(/unsupported key/);
    const extraProvenance = { ...provenance, extra: "x" };
    expect(() => validateProjectProfile(validProfile({ workspaceName: { value: "name", provenance: extraProvenance } }), workspaceId)).toThrow(/unsupported key/);
  });

  it("rejects missing keys and invalid schema versions", () => {
    const { workspaceName: _workspaceName, ...missingName } = validProfile();
    expect(() => validateProjectProfile(missingName, workspaceId)).toThrow(/workspaceName is required/);
    for (const version of [0, "1", 2, null]) {
      expect(() => validateProjectProfile(validProfile({ schemaVersion: version }), workspaceId)).toThrow(/schemaVersion/);
    }
  });

  it("rejects blank, padded, sentinel, null, and wrong-type values", () => {
    for (const value of ["", "   ", " name", "name ", "unknown", null, 42]) {
      expect(() => validateProjectProfile(validProfile({ workspaceName: fact(value) }), workspaceId)).toThrow();
    }
    for (const value of [null, "unknown", [], ["pnpm", "pnpm"], ["pnpm", " pnpm"]]) {
      expect(() => validateProjectProfile(validProfile({ frameworks: fact(value) }), workspaceId)).toThrow();
    }
  });

  it("requires exact provenance fields and valid provenance kinds", () => {
    for (const kind of ["manual", "OBSERVED", null]) {
      const invalidProvenance = { ...provenance, kind };
      expect(() => validateProjectProfile(validProfile({ workspaceName: { value: "name", provenance: invalidProvenance } }), workspaceId)).toThrow(/kind/);
    }
    expect(() => validateProjectProfile(validProfile({ workspaceName: { value: "name" } }), workspaceId)).toThrow(/provenance/);
  });

  it("accepts only canonical real UTC ISO timestamps", () => {
    for (const verifiedAt of ["2024-02-29T23:59:59.999Z", "2026-10-18T00:00:00.000Z"]) {
      expect(() => validateProjectProfile(validProfile({ workspaceName: fact("name", { verifiedAt }) }), workspaceId)).not.toThrow();
    }
    for (const verifiedAt of [
      "2026-10-18T09:30:00Z",
      "2026-10-18T09:30:00.000+00:00",
      "2026-02-29T09:30:00.000Z",
      "2026-13-01T09:30:00.000Z",
      "2026-10-18T25:30:00.000Z",
    ]) {
      expect(() => validateProjectProfile(validProfile({ workspaceName: fact("name", { verifiedAt }) }), workspaceId)).toThrow(/verifiedAt/);
    }
  });

  it("rejects secret-like assignments in every textual field", () => {
    const unsafeProfiles = [
      validProfile({ workspaceName: fact("API_KEY=abc123") }),
      validProfile({ projectType: fact("PASSWORD: hunter2") }),
      validProfile({ frameworks: fact(["Express", "ACCESS_TOKEN=abc"]) }),
      validProfile({ focusedValidationCommands: fact(["pnpm test", "PRIVATE_KEY=secret"]) }),
      validProfile({ workspaceName: fact("name", { source: "TOKEN=abc" }) }),
    ];
    for (const profile of unsafeProfiles) expect(() => validateProjectProfile(profile, workspaceId)).toThrow(/secret-like/);
  });

  it("rejects POSIX, Windows, and UNC absolute paths but accepts relative paths", () => {
    for (const absolutePath of ["/Users/alice/project", "C:\\Users\\alice\\project", "\\\\server\\share\\project"]) {
      expect(() => validateProjectProfile(validProfile({ projectType: fact(`repo ${absolutePath}`) }), workspaceId)).toThrow(/absolute filesystem path/);
    }
    expect(() => validateProjectProfile(validProfile({ focusedValidationCommands: fact(["pnpm exec vitest run tests/foo.test.ts"]) }), workspaceId)).not.toThrow();
  });

  it("rejects absolute paths embedded after punctuation while preserving URLs", () => {
    for (const embeddedPath of [
      "repo:/Users/alice/project",
      "workspace:C:\\Users\\alice",
      "source=[/private/data]",
      "mount=(\\\\server\\share\\data)",
    ]) {
      expect(() => validateProjectProfile(validProfile({ projectType: fact(embeddedPath) }), workspaceId)).toThrow(/absolute filesystem path/);
    }

    for (const allowed of [
      "https://example.com/docs/path",
      "pnpm exec vitest run tests/phase4c-profile.test.ts",
      "repo:src/workflow/profile.ts",
      "source=[relative/data]",
    ]) {
      expect(() => validateProjectProfile(validProfile({ projectType: fact(allowed) }), workspaceId)).not.toThrow();
    }
  });

  it("returns validated snapshots without making command hints executable", () => {
    const command = "pnpm exec vitest run tests/phase4c-profile.test.ts";
    const result = validateProjectProfile(validProfile({ focusedValidationCommands: fact([command]) }), workspaceId);
    expect(result.focusedValidationCommands?.value).toEqual([command]);
  });
});
