import { describe, it, expect } from "vitest";
import { EventEmitter } from "node:events";
import path from "node:path";
import { listen, startBridge } from "../src/bridge/server.js";
import { probeBridge } from "../src/bridge/runtime.js";
import { makeTmpDir, cleanup, write, isolateStateDir } from "./helpers.js";

describe("port collision handling", () => {
  it("falls back to a free port when the preferred one is taken", async () => {
    isolateStateDir();
    const rootA = makeTmpDir("port-a");
    const rootB = makeTmpDir("port-b");
    write(rootA, "a.txt", "a");
    write(rootB, "b.txt", "b");
    const preferred = 47000 + Math.floor(Math.random() * 1000);

    const bridgeA = await startBridge({
      workspaceRoot: rootA,
      port: preferred,
      persistRuntime: false,
      authStoreFile: path.join(makeTmpDir("auth"), "a.json"),
    });
    const bridgeB = await startBridge({
      workspaceRoot: rootB,
      port: preferred,
      persistRuntime: false,
      authStoreFile: path.join(makeTmpDir("auth"), "b.json"),
    });

    expect(bridgeA.port).toBe(preferred);
    expect(bridgeB.port).not.toBe(preferred);
    expect(bridgeB.port).toBeGreaterThan(0);

    // health identifies each bridge's workspace, so callers can detect reuse
    const healthA = await probeBridge(bridgeA.port);
    const healthB = await probeBridge(bridgeB.port);
    expect(healthA?.workspaceId).toBe(bridgeA.workspace.id);
    expect(healthB?.workspaceId).toBe(bridgeB.workspace.id);
    expect(healthA?.workspaceId).not.toBe(healthB?.workspaceId);

    await bridgeA.close();
    await bridgeB.close();
    cleanup(rootA);
    cleanup(rootB);
  });

  it("refuses to bind non-loopback hosts", async () => {
    const root = makeTmpDir("port-c");
    write(root, "c.txt", "c");
    await expect(
      startBridge({ workspaceRoot: root, host: "0.0.0.0", persistRuntime: false })
    ).rejects.toThrow(/loopback/);
    cleanup(root);
  });

  it.each(["EADDRINUSE", "EPERM"] as const)(
    "falls back to an ephemeral port when the preferred port returns %s",
    async (code) => {
      const attempts: Array<{ port: number; server: FakeServer }> = [];
      const app = {
        listen(port: number) {
          const server = new FakeServer();
          attempts.push({ port, server });
          queueMicrotask(() => {
            if (attempts.length === 1) server.emit("error", Object.assign(new Error(code), { code }));
            else {
              server.addressValue = { port: 49123 };
              server.emit("listening");
            }
          });
          return server;
        },
      } as unknown as Parameters<typeof listen>[0];

      const result = await listen(app, "127.0.0.1", 49000);

      expect(result.port).toBe(49123);
      expect(attempts.map(({ port }) => port)).toEqual([49000, 0]);
      expect(attempts[0].server.closed).toBe(true);
      expect(result.server).toBe(attempts[1].server);
    }
  );

  it("propagates unexpected listen errors without retrying", async () => {
    const first = new FakeServer();
    const app = {
      listen: () => {
        queueMicrotask(() => first.emit("error", Object.assign(new Error("boom"), { code: "EACCES" })));
        return first;
      },
    } as unknown as Parameters<typeof listen>[0];

    await expect(listen(app, "127.0.0.1", 49001)).rejects.toThrow("boom");
    expect(first.closed).toBe(false);
  });
});

class FakeServer extends EventEmitter {
  addressValue: { port: number } | null = null;
  closed = false;

  address(): { port: number } | null {
    return this.addressValue;
  }

  close(): this {
    this.closed = true;
    return this;
  }
}
