import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { makeTmpDir, cleanup } from "./helpers.js";

describe("npm package contents", () => {
  it("includes canonical workflow policy docs", () => {
    const cache = makeTmpDir("npm-cache");
    try {
      const result = spawnSync("npm", ["pack", "--dry-run", "--json"], {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...process.env, npm_config_cache: cache },
      });
      expect(result.status).toBe(0);
      const packs = JSON.parse(result.stdout) as { files: { path: string }[] }[];
      const paths = new Set(packs[0]?.files.map((file) => file.path) ?? []);
      expect(paths.has("docs/codex-execution-policy.md")).toBe(true);
      expect(paths.has("docs/efficient-debugging-workflow.md")).toBe(true);
    } finally {
      cleanup(cache);
    }
  });
});
