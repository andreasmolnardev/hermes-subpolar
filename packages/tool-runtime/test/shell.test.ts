import { strict as assert } from "node:assert";
import { mkdtemp, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "bun:test";

import { createShellTool } from "../src/index.ts";

test("shell tool executes a verified argv allowlist without ambient environment", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "tool-runtime-"));
  const executable = await realpath("/usr/bin/printf");
  const tool = createShellTool({
    policy: {
      allowedCommands: [{ executable, argumentPrefix: ["safe"] }],
      executableRoots: ["/usr/bin"],
      cwdRoots: [cwd],
      maxTimeoutMs: 1_000,
      maxOutputBytes: 128,
      environment: { PATH: "/usr/bin" }
    }
  });
  assert.ok("handle" in tool.executable);
  const result = await tool.executable.handle.execute({ argv: [executable, "safe"] , cwd });
  assert.deepEqual(result, { exitCode: 0, stdout: "safe", stderr: "", truncated: false });
});

test("shell tool denies an argument outside the exact allowlist", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "tool-runtime-"));
  const executable = await realpath("/usr/bin/printf");
  const tool = createShellTool({
    policy: {
      allowedCommands: [{ executable, argumentPrefix: ["safe"] }],
      executableRoots: ["/usr/bin"],
      cwdRoots: [cwd],
      maxTimeoutMs: 1_000,
      maxOutputBytes: 128
    }
  });
  assert.ok("handle" in tool.executable);
  await assert.rejects(tool.executable.handle.execute({ argv: [executable, "unsafe"], cwd }), /allowlisted/);
});

test("shell tool bounds output by bytes and responds to cancellation", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "tool-runtime-"));
  const printf = await realpath("/usr/bin/printf");
  const tool = createShellTool({
    policy: {
      allowedCommands: [{ executable: printf }],
      executableRoots: ["/usr/bin"],
      cwdRoots: [cwd],
      maxTimeoutMs: 5_000,
      maxOutputBytes: 32,
    },
  });
  assert.ok("handle" in tool.executable);
  const bounded = await tool.executable.handle.execute({ argv: [printf, "x".repeat(1024)], cwd }) as { stdout: string; truncated: boolean };
  assert.equal(new TextEncoder().encode(bounded.stdout).byteLength, 32);
  assert.equal(bounded.truncated, true);

  const sleep = await realpath("/usr/bin/sleep");
  const cancellable = createShellTool({
    policy: {
      allowedCommands: [{ executable: sleep }],
      executableRoots: ["/usr/bin"],
      cwdRoots: [cwd],
      maxTimeoutMs: 5_000,
      maxOutputBytes: 32,
    },
  });
  assert.ok("handle" in cancellable.executable);
  const controller = new AbortController();
  const pending = cancellable.executable.handle.execute({ argv: [sleep, "10"], cwd }, controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
});
