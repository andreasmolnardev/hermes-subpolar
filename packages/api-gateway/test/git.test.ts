import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "bun:test";

import { createEmptyWorkspace, createNativeGitTools, gitDiff, gitStatus, validateExistingWorkspace } from "../src/git.ts";

async function command(cwd: string, ...args: string[]): Promise<void> {
  const process = Bun.spawn([Bun.which("git")!, ...args], { cwd, stdout: "ignore", stderr: "pipe" });
  const stderr = await process.stderr.text();
  const code = await process.exited;
  if (code !== 0) throw new Error(stderr);
}

test("project workspaces stay under the configured root and Git status/diff expose agent changes", async () => {
  const directory = mkdtempSync(join(tmpdir(), "subpolar-git-test-"));
  const root = join(directory, "workspaces");
  mkdirSync(root);
  try {
    const workspace = await createEmptyWorkspace(root, "project-1");
    await command(workspace, "init", "-b", "main");
    writeFileSync(join(workspace, "README.md"), "hello\n");
    const status = await gitStatus(workspace);
    assert.equal(status.clean, false);
    assert.equal(status.entries[0]?.path, "README.md");
    assert.match(await gitDiff(workspace, "README.md"), /README\.md/);
    await assert.rejects(() => validateExistingWorkspace(root, join(root, "..", "outside")));
    const gitTool = createNativeGitTools(workspace).find(tool => tool.name === "git.status");
    assert.equal(gitTool?.policy, "allow");
    assert.equal(createNativeGitTools(workspace).find(tool => tool.name === "git.push")?.policy, "ask");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
