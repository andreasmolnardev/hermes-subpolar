import { strict as assert } from "node:assert";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "bun:test";

import { createFilesystemTools, createShellTool } from "../src/index.ts";

type Paths = {
  readonly directory: string;
  readonly projectA: string;
  readonly projectB: string;
  readonly outside: string;
};

async function createPaths(): Promise<Paths> {
  const directory = await mkdtemp(join(tmpdir(), "tool-runtime-security-"));
  const projectA = join(directory, "project-a");
  const projectB = join(directory, "project-b");
  const outside = join(directory, "outside");
  await mkdir(projectA, { recursive: true });
  await mkdir(projectB, { recursive: true });
  await mkdir(outside, { recursive: true });
  return { directory, projectA, projectB, outside };
}

function handle(tools: readonly ReturnType<typeof createFilesystemTools>[number][], name: string) {
  const definition = tools.find((item) => item.name === `filesystem.${name}`);
  assert.ok(definition && "handle" in definition.executable);
  return definition.executable.handle;
}

test("native filesystem tools cannot cross a sibling project or an absolute path", async () => {
  const paths = await createPaths();
  try {
    await writeFile(join(paths.projectA, "local.txt"), "local", "utf8");
    await writeFile(join(paths.projectB, "secret.txt"), "project-b-secret", "utf8");
    const tools = createFilesystemTools({ workspaceRoot: paths.projectA });
    const read = handle(tools, "read");
    const write = handle(tools, "write");
    const edit = handle(tools, "edit");

    for (const path of ["../project-b/secret.txt", join(paths.projectB, "secret.txt")]) {
      await assert.rejects(read.execute({ path }), /relative|traversal|outside/);
    }
    await assert.rejects(write.execute({ path: "../project-b/created.txt", content: "must not exist" }), /traversal|outside/);
    await assert.rejects(edit.execute({ path: "../project-b/secret.txt", oldText: "project-b-secret", newText: "changed" }), /traversal|outside/);

    assert.equal(await readFile(join(paths.projectB, "secret.txt"), "utf8"), "project-b-secret");
    await assert.rejects(readFile(join(paths.projectB, "created.txt"), "utf8"));
  } finally {
    await rm(paths.directory, { recursive: true, force: true });
  }
});

test("every filesystem operation rejects a symlink into another project", async () => {
  const paths = await createPaths();
  try {
    await writeFile(join(paths.projectB, "secret.txt"), "secret", "utf8");
    await symlink(paths.projectB, join(paths.projectA, "linked-project"));
    await symlink(join(paths.projectB, "secret.txt"), join(paths.projectA, "linked-secret.txt"));
    const tools = createFilesystemTools({ workspaceRoot: paths.projectA });

    await assert.rejects(handle(tools, "read").execute({ path: "linked-secret.txt" }), /outside/);
    await assert.rejects(handle(tools, "read").execute({ path: "linked-project/secret.txt" }), /outside/);
    await assert.rejects(handle(tools, "write").execute({ path: "linked-project/new.txt", content: "escape" }), /outside/);
    await assert.rejects(handle(tools, "write").execute({ path: "linked-secret.txt", content: "escape" }), /outside|symbolic/);
    await assert.rejects(handle(tools, "edit").execute({ path: "linked-secret.txt", oldText: "secret", newText: "escape" }), /outside/);
    await assert.rejects(handle(tools, "ls").execute({ path: "linked-project" }), /outside/);
    await assert.rejects(handle(tools, "find").execute({ path: "linked-project" }), /outside/);
    await assert.rejects(handle(tools, "grep").execute({ path: "linked-project", pattern: "secret" }), /outside/);
    assert.equal(await readFile(join(paths.projectB, "secret.txt"), "utf8"), "secret");
  } finally {
    await rm(paths.directory, { recursive: true, force: true });
  }
});

test("shell execution rejects symlinked executables and working directories", async () => {
  const paths = await createPaths();
  try {
    const printf = await Bun.$`realpath /usr/bin/printf`.text().then((value) => value.trim());
    const linkedExecutable = join(paths.projectA, "printf-link");
    const linkedCwd = join(paths.projectA, "cwd-link");
    await symlink(printf, linkedExecutable);
    await symlink(paths.projectB, linkedCwd);
    const tool = createShellTool({
      policy: {
        allowedCommands: [{ executable: printf }],
        executableRoots: [paths.projectA],
        cwdRoots: [paths.projectA],
        maxTimeoutMs: 1_000,
        maxOutputBytes: 128,
      },
    });
    assert.ok("handle" in tool.executable);
    await assert.rejects(tool.executable.handle.execute({ argv: [linkedExecutable, "escaped"], cwd: paths.projectA }), /outside|allowlisted|changed/);
    await assert.rejects(tool.executable.handle.execute({ argv: [printf, "escaped"], cwd: linkedCwd }), /outside|changed/);
  } finally {
    await rm(paths.directory, { recursive: true, force: true });
  }
});

test("shell interpreters require explicit opt-in even when allowlisted, and opt-in is bounded", async () => {
  const paths = await createPaths();
  try {
    const bash = await Bun.$`realpath /bin/bash`.text().then((value) => value.trim());
    const denied = createShellTool({
      policy: {
        allowedCommands: [{ executable: bash }],
        executableRoots: ["/usr/bin", "/bin"],
        cwdRoots: [paths.projectA],
        maxTimeoutMs: 1_000,
        maxOutputBytes: 128,
      },
    });
    assert.ok("handle" in denied.executable);
    await assert.rejects(denied.executable.handle.execute({ argv: [bash, "-c", "printf hidden"], cwd: paths.projectA }), /explicit enablement/);

    const allowed = createShellTool({
      policy: {
        allowedCommands: [{ executable: bash, argumentPrefix: ["-c", "printf safe"] }],
        executableRoots: ["/usr/bin", "/bin"],
        cwdRoots: [paths.projectA],
        maxTimeoutMs: 1_000,
        maxOutputBytes: 16,
        allowShell: true,
      },
    });
    assert.ok("handle" in allowed.executable);
    const result = await allowed.executable.handle.execute({ argv: [bash, "-c", "printf safe"], cwd: paths.projectA });
    assert.deepEqual(result, { exitCode: 0, stdout: "safe", stderr: "", truncated: false });
    await assert.rejects(allowed.executable.handle.execute({ argv: [bash, "-c", "printf hidden"], cwd: paths.projectA }), /allowlisted/);
  } finally {
    await rm(paths.directory, { recursive: true, force: true });
  }
});
