import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { packageRootFromImportMeta } from "../src/config/package-root.js";

describe("packageRootFromImportMeta", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

  it("resolves package root from a dev src path", () => {
    const url = pathToFileURL(path.join(root, "src", "mcp", "server.ts")).href;
    expect(packageRootFromImportMeta(url)).toBe(root);
  });

  it("resolves package root from a built dist path", () => {
    const url = pathToFileURL(path.join(root, "dist", "mcp", "server.js")).href;
    expect(packageRootFromImportMeta(url)).toBe(root);
  });
});
