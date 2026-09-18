import fs from "node:fs";
import path from "node:path";
import { ensureDir, getStateDir, readJsonIfExists, writeSecureJson } from "../config/paths.js";
import { redact } from "../logger/index.js";
import { sanitizeExecutionOutput } from "./sanitize.js";

export const MAX_OUTPUT_RECORDS = 40;

export interface ExecutionOutputMeta {
  id: number;
  command: string;
  exitCode: number | null;
  timestamp: string;
  taskId?: string;
  iteration?: number;
  validationType?: "test" | "lint" | "build" | "typecheck" | "other";
  allowed: boolean;
  restrictedReason?: string;
  truncated: boolean;
  sizeBytes: number;
}

interface OutputIndex {
  nextId: number;
  items: ExecutionOutputMeta[];
}

function outputDir(workspaceId: string): string {
  return ensureDir(path.join(getStateDir(), "execution-outputs", workspaceId));
}

function indexFile(workspaceId: string): string {
  return path.join(outputDir(workspaceId), "index.json");
}

function bodyFile(workspaceId: string, id: number): string {
  return path.join(outputDir(workspaceId), "bodies", `${id}.txt`);
}

interface OutputBody {
  text: string;
  stdout?: string;
  stderr?: string;
}

function readIndex(workspaceId: string): OutputIndex {
  return (
    readJsonIfExists<OutputIndex>(indexFile(workspaceId)) ?? {
      nextId: 1,
      items: [],
    }
  );
}

function writeIndex(workspaceId: string, index: OutputIndex): void {
  writeSecureJson(indexFile(workspaceId), index);
}

export interface SaveOutputInput {
  command: string;
  raw?: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  taskId?: string;
  iteration?: number;
  validationType?: ExecutionOutputMeta["validationType"];
}

export function saveExecutionOutput(workspaceId: string, input: SaveOutputInput): ExecutionOutputMeta {
  const raw =
    input.raw ??
    [
      input.stdout ? `[stdout]\n${input.stdout}` : "",
      input.stderr ? `[stderr]\n${input.stderr}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  const sanitized = sanitizeExecutionOutput(raw);
  const stdoutSanitized = input.stdout === undefined ? undefined : sanitizeExecutionOutput(input.stdout);
  const stderrSanitized = input.stderr === undefined ? undefined : sanitizeExecutionOutput(input.stderr);
  const stdoutAllowed = stdoutSanitized?.allowed ?? true;
  const stderrAllowed = stderrSanitized?.allowed ?? true;
  const allowed =
    sanitized.allowed &&
    stdoutAllowed &&
    stderrAllowed;
  const index = readIndex(workspaceId);
  const id = index.nextId;
  const timestamp = new Date().toISOString();
  const text = allowed ? sanitized.text : "";
  const stdout = allowed && stdoutSanitized?.allowed ? stdoutSanitized.text : undefined;
  const stderr = allowed && stderrSanitized?.allowed ? stderrSanitized.text : undefined;
  const truncated = allowed
    ? sanitized.truncated ||
      Boolean(stdoutSanitized?.allowed ? stdoutSanitized.truncated : false) ||
      Boolean(stderrSanitized?.allowed ? stderrSanitized.truncated : false)
    : false;
  const meta: ExecutionOutputMeta = {
    id,
    command: redact(input.command).slice(0, 200),
    exitCode: input.exitCode ?? null,
    timestamp,
    taskId: input.taskId,
    iteration: input.iteration,
    validationType: input.validationType,
    allowed,
    restrictedReason: allowed
      ? undefined
      : !sanitized.allowed
        ? sanitized.reason
        : stdoutSanitized && !stdoutSanitized.allowed
          ? stdoutSanitized.reason
          : stderrSanitized && !stderrSanitized.allowed
            ? stderrSanitized.reason
            : "restricted",
    truncated,
    sizeBytes: Buffer.byteLength(text, "utf8"),
  };
  if (allowed && text) {
    const file = bodyFile(workspaceId, id);
    ensureDir(path.dirname(file));
    const body: OutputBody = { text, stdout, stderr };
    fs.writeFileSync(file, JSON.stringify(body), { mode: 0o600 });
    try {
      fs.chmodSync(file, 0o600);
    } catch {
      /* ignore */
    }
  }
  index.nextId = id + 1;
  index.items.push(meta);
  while (index.items.length > MAX_OUTPUT_RECORDS) {
    const dropped = index.items.shift();
    if (dropped) {
      fs.rmSync(bodyFile(workspaceId, dropped.id), { force: true });
    }
  }
  writeIndex(workspaceId, index);
  return meta;
}

export function listExecutionOutputs(workspaceId: string, limit = 20): ExecutionOutputMeta[] {
  const items = readIndex(workspaceId).items;
  return items.slice(-Math.max(1, Math.min(50, limit)));
}

export function readExecutionOutput(
  workspaceId: string,
  id: number
):
  | { ok: true; meta: ExecutionOutputMeta; text: string; stdout?: string; stderr?: string }
  | { ok: false; error: "NOT_FOUND" | "OUTPUT_RESTRICTED" } {
  const meta = readIndex(workspaceId).items.find((item) => item.id === id);
  if (!meta) return { ok: false, error: "NOT_FOUND" };
  if (!meta.allowed) return { ok: false, error: "OUTPUT_RESTRICTED" };
  const file = bodyFile(workspaceId, id);
  const body = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  try {
    const parsed = JSON.parse(body) as Partial<OutputBody>;
    return {
      ok: true,
      meta,
      text: typeof parsed.text === "string" ? parsed.text : "",
      stdout: typeof parsed.stdout === "string" ? parsed.stdout : undefined,
      stderr: typeof parsed.stderr === "string" ? parsed.stderr : undefined,
    };
  } catch {
    return { ok: true, meta, text: body };
  }
}
