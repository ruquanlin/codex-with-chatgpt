export interface ProfileProvenance {
  kind: "observed" | "user_confirmed";
  source: string;
  verifiedAt: string;
}

export interface ProfileFact<T> {
  value: T;
  provenance: ProfileProvenance;
}

export interface ProjectProfile {
  schemaVersion: 1;
  workspaceId: string;
  workspaceName: ProfileFact<string>;
  projectType?: ProfileFact<string>;
  frameworks?: ProfileFact<string[]>;
  packageManager?: ProfileFact<string>;
  focusedValidationCommands?: ProfileFact<string[]>;
  deploymentCharacteristic?: ProfileFact<string>;
  browserProductionCaveats?: ProfileFact<string[]>;
}

const PROFILE_REQUIRED_KEYS = ["schemaVersion", "workspaceId", "workspaceName"] as const;
const PROFILE_OPTIONAL_KEYS = [
  "projectType",
  "frameworks",
  "packageManager",
  "focusedValidationCommands",
  "deploymentCharacteristic",
  "browserProductionCaveats",
] as const;
const FACT_KEYS = ["value", "provenance"] as const;
const PROVENANCE_KEYS = ["kind", "source", "verifiedAt"] as const;
const WORKSPACE_ID_PATTERN = /^[a-fA-F0-9]{12}$/;
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const SECRET_ASSIGNMENT_PATTERN = /\b[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|(?:API|ACCESS|PRIVATE|ENCRYPTION|SIGNING)?[_-]?KEY|CREDENTIAL)[A-Z0-9_]*\s*[:=]\s*\S+/i;
const ABSOLUTE_PATH_PATTERN = /(?:^|[\s"'=:([,])(?:\/|[A-Za-z]:[\\/]|\\\\)[^\s"'<>()[\]]*/;
const HTTP_URL_PATTERN = /https?:\/\/[^\s"'<>()[\]]+/gi;

function record(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
  name: string,
): void {
  for (const key of required) {
    if (!Object.hasOwn(value, key)) throw new Error(`${name}.${key} is required`);
  }
  for (const key of Object.keys(value)) {
    if (!required.includes(key) && !optional.includes(key)) {
      throw new Error(`${name} contains unsupported key '${key}'`);
    }
  }
}

function validateText(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0 || value.trim().length === 0) {
    throw new Error(`${name} must be a nonblank string`);
  }
  if (value !== value.trim()) throw new Error(`${name} must not have leading or trailing whitespace`);
  if (value.toLowerCase() === "unknown") throw new Error(`${name} must omit unknown facts instead of using a sentinel`);
  if (SECRET_ASSIGNMENT_PATTERN.test(value)) throw new Error(`${name} must not contain secret-like assignments`);
  const withoutHttpUrls = value.replace(HTTP_URL_PATTERN, "");
  if (ABSOLUTE_PATH_PATTERN.test(withoutHttpUrls)) throw new Error(`${name} must not contain an absolute filesystem path`);
  return value;
}

function validateTimestamp(value: unknown, name: string): string {
  if (typeof value !== "string" || !TIMESTAMP_PATTERN.test(value)) {
    throw new Error(`${name} must be a canonical UTC ISO timestamp`);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error(`${name} must be a real canonical UTC date and time`);
  }
  return value;
}

function validateStringArray(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${name} must be a nonempty array`);
  }
  const items = value.map((item, index) => validateText(item, `${name}[${index}]`));
  if (new Set(items).size !== items.length) throw new Error(`${name} items must be unique`);
  return items;
}

function validateProvenance(value: unknown, name: string): ProfileProvenance {
  const provenance = record(value, name);
  exactKeys(provenance, PROVENANCE_KEYS, [], name);
  if (provenance.kind !== "observed" && provenance.kind !== "user_confirmed") {
    throw new Error(`${name}.kind must be 'observed' or 'user_confirmed'`);
  }
  return {
    kind: provenance.kind,
    source: validateText(provenance.source, `${name}.source`),
    verifiedAt: validateTimestamp(provenance.verifiedAt, `${name}.verifiedAt`),
  };
}

function validateFact<T>(
  value: unknown,
  name: string,
  validateValue: (value: unknown, name: string) => T,
): ProfileFact<T> {
  const fact = record(value, name);
  exactKeys(fact, FACT_KEYS, [], name);
  return {
    value: validateValue(fact.value, `${name}.value`),
    provenance: validateProvenance(fact.provenance, `${name}.provenance`),
  };
}

function validateWorkspaceId(value: unknown, name: string): string {
  if (typeof value !== "string" || !WORKSPACE_ID_PATTERN.test(value)) {
    throw new Error(`${name} must contain exactly 12 hexadecimal characters`);
  }
  return value;
}

/** Validate an untrusted profile snapshot against the current connector workspace. */
export function validateProjectProfile(value: unknown, currentWorkspaceId: string): ProjectProfile {
  const currentId = validateWorkspaceId(currentWorkspaceId, "currentWorkspaceId");
  const input = record(value, "profile");
  exactKeys(input, PROFILE_REQUIRED_KEYS, PROFILE_OPTIONAL_KEYS, "profile");
  if (input.schemaVersion !== 1) throw new Error("profile.schemaVersion must be 1");

  const workspaceId = validateWorkspaceId(input.workspaceId, "profile.workspaceId");
  if (workspaceId.toLowerCase() !== currentId.toLowerCase()) {
    throw new Error("profile.workspaceId does not match the current connector workspace");
  }

  const profile: ProjectProfile = {
    schemaVersion: 1,
    workspaceId,
    workspaceName: validateFact(input.workspaceName, "profile.workspaceName", validateText),
  };
  if (Object.hasOwn(input, "projectType")) {
    profile.projectType = validateFact(input.projectType, "profile.projectType", validateText);
  }
  if (Object.hasOwn(input, "frameworks")) {
    profile.frameworks = validateFact(input.frameworks, "profile.frameworks", validateStringArray);
  }
  if (Object.hasOwn(input, "packageManager")) {
    profile.packageManager = validateFact(input.packageManager, "profile.packageManager", validateText);
  }
  if (Object.hasOwn(input, "focusedValidationCommands")) {
    profile.focusedValidationCommands = validateFact(input.focusedValidationCommands, "profile.focusedValidationCommands", validateStringArray);
  }
  if (Object.hasOwn(input, "deploymentCharacteristic")) {
    profile.deploymentCharacteristic = validateFact(input.deploymentCharacteristic, "profile.deploymentCharacteristic", validateText);
  }
  if (Object.hasOwn(input, "browserProductionCaveats")) {
    profile.browserProductionCaveats = validateFact(input.browserProductionCaveats, "profile.browserProductionCaveats", validateStringArray);
  }
  return profile;
}
