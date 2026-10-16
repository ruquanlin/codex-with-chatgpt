import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { ExecutionBrief } from "./execution-brief.js";

export interface PersistExecutionBriefOptions {
  workspaceRoot: string;
  taskSlug: string;
  executionLineId: string;
  date: string;
}

export interface PersistExecutionBriefResult { path?: string; reference?: string }

function renderBrief(brief: ExecutionBrief): string {
  const list = (items: string[]) => items.map((item) => `- ${item}`).join("\n");
  return [
    "# Execution Brief",
    `\n## Goal\n${brief.goal}`,
    `\n## Known Facts\n${list(brief.knownFacts)}`,
    `\n## Approved Basis\nType: ${brief.approvedBasis.type}\n\n${brief.approvedBasis.summary}`,
    `\n## Scope\n### In Scope\n${list(brief.scope.inScope)}\n\n### Out of Scope\n${brief.scope.outOfScope.length ? list(brief.scope.outOfScope) : "- None specified"}`,
    `\n## Must Change\n${list(brief.mustChange)}`,
    `\n## Must Not Change\n${list(brief.mustNotChange)}`,
    `\n## Acceptance Criteria\n${list(brief.acceptanceCriteria)}`,
    `\n## Validation Expectation\n${list(brief.validationExpectation)}`,
    `\n## Risk Notes\n${list(brief.riskNotes)}`,
    `\n## Persistence\nMode: ${brief.persistence.mode}`,
    "",
  ].join("\n");
}

export async function persistExecutionBrief(brief: ExecutionBrief, options: PersistExecutionBriefOptions): Promise<PersistExecutionBriefResult> {
  if (brief.persistence.mode === "ephemeral") return {};
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(options.taskSlug)) throw new Error("Invalid task slug");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.date) || Number.isNaN(Date.parse(`${options.date}T00:00:00Z`))) throw new Error("Invalid date");
  if (!options.executionLineId.trim()) throw new Error("executionLineId is required");
  const hash = createHash("sha256").update(options.executionLineId).digest("hex").slice(0, 8);
  const workspaceRoot = resolve(options.workspaceRoot);
  const directory = resolve(workspaceRoot, "docs", "workflow", "execution-briefs");
  const target = resolve(directory, `${options.date}-${options.taskSlug}-${hash}.md`);
  const rel = relative(directory, target);
  if (!rel || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error("Execution Brief path escaped its directory");
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, renderBrief(brief), "utf8");
  return { path: target, reference: relative(workspaceRoot, target).split(sep).join("/") };
}
