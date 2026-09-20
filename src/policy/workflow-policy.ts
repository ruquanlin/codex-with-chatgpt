import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { packageRoot } from "../config/package-root.js";
import { VERSION } from "../version.js";

const POLICY_FILES = [
  { key: "global", path: "docs/codex-execution-policy.md" },
  { key: "debugging", path: "docs/efficient-debugging-workflow.md" },
] as const;

export interface WorkflowPolicySource {
  path: string;
  sha256: string;
  sizeBytes: number;
}

export interface WorkflowPolicy {
  version: string;
  policyHash: string;
  sources: WorkflowPolicySource[];
  policy: {
    global: string;
    debugging: string;
  };
}

export function readWorkflowPolicy(): WorkflowPolicy {
  const root = packageRoot();
  const files = POLICY_FILES.map((file) => {
    const content = fs.readFileSync(path.join(root, file.path), "utf8");
    return {
      ...file,
      content,
      sha256: createHash("sha256").update(file.path).update("\0").update(content).digest("hex"),
      sizeBytes: Buffer.byteLength(content, "utf8"),
    };
  });

  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file.path).update("\0").update(file.content).update("\0");
  }

  return {
    version: VERSION,
    policyHash: hash.digest("hex"),
    sources: files.map((file) => ({ path: file.path, sha256: file.sha256, sizeBytes: file.sizeBytes })),
    policy: {
      global: files.find((file) => file.key === "global")?.content ?? "",
      debugging: files.find((file) => file.key === "debugging")?.content ?? "",
    },
  };
}
