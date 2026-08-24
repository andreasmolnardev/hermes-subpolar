import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "bun:test";

import { createFilesystemTools, createShellTool } from "../src/index.ts";

async function workspace(): Promise<{ directory: string; root: string; outside: string }> {
  const directory = await mkdtemp(join(tmpdir(), "tool-runtime-filesystem-"));
  const root = join(directory, "workspace");
  const outside = join(directory, "outside");
  await mkdir(root);
  await mkdir(outside);
  return { directory, root, outside };
}

function tool(tools: readonly ReturnType<typeof createFilesystemTools>[number][], name: string) {
  const found = tools.find(item => item.name === `filesystem.${name}`);
  assert.ok(found && "handle" in found.executable);
  return found.executable.handle;
}

test("filesystem tools confine reads and writes to the canonical workspace", async () => {
  const paths = await workspace();
  try {
    await writeFile(join(paths.root, "note.txt"), "before\n", "utf8");
    const tools = createFilesystemTools({ workspaceRoot: paths.root });
    const read = tool(tools, "read");
    const write = tool(tools, "write");
    const edit = tool(tools, "edit");

    assert.deepEqual(await read.execute({ path: "note.txt" }), { path: "note.txt", content: "before\n" });
    assert.equal(tools.find(item => item.name === "filesystem.write")?.policy, "ask");
    await write.execute({ path: "new.txt", content: "created" });
    await edit.execute({ path: "note.txt", oldText: "before", newText: "after" });
    assert.equal(await readFile(join(paths.root, "note.txt"), "utf8"), "after\n");
    assert.equal(await readFile(join(paths.root, "new.txt"), "utf8"), "created");
  } finally {
    await rm(paths.directory, { recursive: true, force: true });
  }
});

test("filesystem tools reject traversal and symlink escapes for reads and writes", async () => {
  const paths = await workspace();
  try {
    await writeFile(join(paths.outside, "secret.txt"), "secret", "utf8");
    await symlink(paths.outside, join(paths.root, "outside-link"));
    await symlink(join(paths.outside, "secret.txt"), join(paths.root, "secret-link.txt"));
    const tools = createFilesystemTools({ workspaceRoot: paths.root });
    const read = tool(tools, "read");
    const write = tool(tools, "write");

    await assert.rejects(read.execute({ path: "../outside/secret.txt" }), /traversal|outside/);
    await assert.rejects(read.execute({ path: "outside-link/secret.txt" }), /outside/);
    await assert.rejects(read.execute({ path: "secret-link.txt" }), /outside/);
    await assert.rejects(write.execute({ path: "../outside/created.txt", content: "nope" }), /traversal|outside/);
    await assert.rejects(write.execute({ path: "outside-link/created.txt", content: "nope" }), /outside/);
    await assert.rejects(write.execute({ path: "secret-link.txt", content: "nope" }), /outside|symbolic/);
    assert.equal(await readFile(join(paths.outside, "secret.txt"), "utf8"), "secret");
  } finally {
    await rm(paths.directory, { recursive: true, force: true });
  }
});

test("filesystem operation selection is a fail-closed permission gate", async () => {
  const paths = await workspace();
  try {
    const tools = createFilesystemTools({ workspaceRoot: paths.root, allowedOperations: ["read", "ls"] });
    assert.deepEqual(tools.map(item => item.name), ["filesystem.read", "filesystem.ls"]);
    assert.equal(tools.every(item => item.policy === "allow"), true);
  } finally {
    await rm(paths.directory, { recursive: true, force: true });
  }
});

test("shell interpreters require explicit opt-in in addition to command allowlisting", async () => {
  const paths = await workspace();
  try {
    const bash = await Bun.$`realpath /bin/bash`.text().then(value => value.trim());
    const shell = createShellTool({
      policy: {
        allowedCommands: [{ executable: bash }],
        executableRoots: ["/usr/bin", "/bin"],
        cwdRoots: [paths.root],
        maxTimeoutMs: 1_000,
        maxOutputBytes: 128,
      },
    });
    assert.equal(shell.policy, "ask");
    assert.ok("handle" in shell.executable);
    await assert.rejects(shell.executable.handle.execute({ argv: [bash, "-c", "printf escaped"], cwd: paths.root }), /explicit enablement/);
  } finally {
    await rm(paths.directory, { recursive: true, force: true });
  }
});
