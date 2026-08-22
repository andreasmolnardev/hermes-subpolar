import { chmod, mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { createToolHandle, type ToolDefinition } from "tool-resolver";
import type { GitCredentialInput, ProjectRepositoryConfig } from "data-layer";

type GitStatusEntry = {
  readonly path: string;
  readonly status: string;
  readonly staged: boolean;
  readonly unstaged: boolean;
  readonly added: boolean;
  readonly modified: boolean;
  readonly deleted: boolean;
  readonly untracked: boolean;
};

export type GitWorkspaceStatus = {
  readonly branch: string;
  readonly entries: readonly GitStatusEntry[];
  readonly clean: boolean;
};

function inside(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

function safeRepositoryUrl(value: string): string {
  const url = value.trim();
  if (!url || /[\0\r\n]/.test(url) || url.includes("@") && url.startsWith("http")) throw new Error("repository URL is invalid");
  if (url.startsWith("-") || url.length > 4096) throw new Error("repository URL is invalid");
  if (!url.startsWith("http://") && !url.startsWith("https://") && !url.startsWith("ssh://") && !/^[^/\s]+@[^:]+:.+$/.test(url)) throw new Error("repository URL scheme is unsupported");
  if (url.startsWith("http://") || url.startsWith("https://")) {
    const parsed = new URL(url);
    if (parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error("repository URL must not contain credentials or query state");
  }
  return url;
}

function safeRelativePath(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value || isAbsolute(value) || /[\0\r\n]/.test(value) || value.split(/[\\/]/).some(part => part === "..")) throw new Error("git path is invalid");
  return value;
}

export async function canonicalWorkspaceRoot(root: string): Promise<string> {
  await mkdirp(root);
  return realpath(root);
}

async function mkdirp(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export async function createEmptyWorkspace(root: string, projectId: string): Promise<string> {
  const canonicalRoot = await canonicalWorkspaceRoot(root);
  const workspace = resolve(canonicalRoot, projectId);
  if (!inside(canonicalRoot, workspace) || basename(workspace) !== projectId) throw new Error("workspace path is invalid");
  await mkdir(workspace, { recursive: false });
  await Bun.write(join(workspace, ".subpolar-workspace"), "");
  await rm(join(workspace, ".subpolar-workspace"), { force: true });
  return realpath(workspace);
}

export async function validateExistingWorkspace(root: string, requested: string): Promise<string> {
  if (!isAbsolute(requested) || /[\0\r\n]/.test(requested)) throw new Error("workspace path must be absolute");
  const canonicalRoot = await canonicalWorkspaceRoot(root);
  const canonicalWorkspace = await realpath(requested);
  const info = await stat(canonicalWorkspace);
  if (!info.isDirectory() || !inside(canonicalRoot, canonicalWorkspace)) throw new Error("workspace path is outside configured roots");
  return canonicalWorkspace;
}

async function runGit(args: readonly string[], cwd: string, credential: GitCredentialInput | undefined, signal?: AbortSignal): Promise<{ readonly stdout: string; readonly stderr: string; readonly code: number }> {
  const executable = Bun.which("git");
  if (executable === null) throw new Error("git is not installed on the server");
  const temp = await mkdtemp(join(tmpdir(), "subpolar-git-"));
  let askpass: string | undefined;
  let sshKey: string | undefined;
  try {
    const env: Record<string, string> = { ...process.env as Record<string, string>, GIT_TERMINAL_PROMPT: "0" };
    if (credential?.token !== undefined || credential?.password !== undefined) {
      askpass = join(temp, "askpass");
      await writeFile(askpass, "#!/bin/sh\ncase \"$1\" in *Username*) printf '%s' \"$GIT_USERNAME\" ;; *) printf '%s' \"$GIT_PASSWORD\" ;; esac\n", { mode: 0o700 });
      await chmod(askpass, 0o700);
      env.GIT_ASKPASS = askpass;
      env.GIT_USERNAME = credential.username ?? "git";
      env.GIT_PASSWORD = credential.token ?? credential.password ?? "";
    }
    if (credential?.privateKey !== undefined) {
      sshKey = join(temp, "id_git");
      await writeFile(sshKey, credential.privateKey, { mode: 0o600 });
      await chmod(sshKey, 0o600);
      env.GIT_SSH_COMMAND = `ssh -i ${sshKey} -o IdentitiesOnly=yes`;
    }
    const child = Bun.spawn([executable, ...args], { cwd, env, stdout: "pipe", stderr: "pipe" });
    const abort = () => child.kill();
    signal?.addEventListener("abort", abort, { once: true });
    const [stdout, stderr, code] = await Promise.all([child.stdout.text(), child.stderr.text(), child.exited]);
    signal?.removeEventListener("abort", abort);
    if (signal?.aborted) throw new Error("git operation was cancelled");
    return { stdout, stderr, code };
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

function resultOrThrow(result: { readonly stdout: string; readonly stderr: string; readonly code: number }, operation: string): string {
  if (result.code !== 0) throw new Error(`${operation} failed: ${result.stderr.trim().slice(0, 2000)}`);
  return result.stdout;
}

export async function cloneRepository(workspace: string, repository: ProjectRepositoryConfig, credential: GitCredentialInput | undefined, signal?: AbortSignal): Promise<void> {
  const url = safeRepositoryUrl(repository.url);
  const args = ["clone", "--origin", repository.remoteName || "origin"];
  if (repository.defaultBranch !== undefined) args.push("--branch", repository.defaultBranch);
  args.push(url, workspace);
  resultOrThrow(await runGit(args, dirnameForClone(workspace), credential, signal), "git clone");
}

function dirnameForClone(workspace: string): string {
  return resolve(workspace, "..");
}

async function gitOutput(workspace: string, args: readonly string[], credential?: GitCredentialInput, signal?: AbortSignal): Promise<string> {
  return resultOrThrow(await runGit(args, workspace, credential, signal), `git ${args[0] ?? "operation"}`);
}

export async function gitStatus(workspace: string, signal?: AbortSignal): Promise<GitWorkspaceStatus> {
  const branch = (await gitOutput(workspace, ["branch", "--show-current"], undefined, signal)).trim() || "HEAD";
  const raw = await gitOutput(workspace, ["status", "--porcelain=v1", "-z"], undefined, signal);
  const entries: GitStatusEntry[] = [];
  for (let index = 0; index < raw.length;) {
    const end = raw.indexOf("\0", index);
    const item = raw.slice(index, end === -1 ? raw.length : end);
    index = end === -1 ? raw.length : end + 1;
    if (!item) continue;
    const code = item.slice(0, 2);
    const path = item.slice(3);
    const staged = code[0] !== " " && code[0] !== "?";
    const unstaged = code[1] !== " " && code[1] !== "?";
    entries.push({ path, status: code, staged, unstaged, added: code.includes("A") || code === "??", modified: code.includes("M"), deleted: code.includes("D"), untracked: code === "??" });
  }
  return { branch, entries, clean: entries.length === 0 };
}

export async function gitDiff(workspace: string, path?: string, staged = false, signal?: AbortSignal): Promise<string> {
  const safePath = safeRelativePath(path);
  const args = ["diff", ...(staged ? ["--cached"] : []), "--no-ext-diff", "--", ...(safePath === undefined ? [] : [safePath])];
  const output = await runGit(args, workspace, undefined, signal);
  if (output.code === 0) return output.stdout;
  if (safePath !== undefined && output.stderr.trim() === "") {
    const file = resolve(workspace, safePath);
    if (inside(await realpath(workspace), await realpath(file))) {
      const content = await readFile(file, "utf8");
      return `diff --git a/${safePath} b/${safePath}\nnew file\n--- /dev/null\n+++ b/${safePath}\n@@ -0,0 +1,${content.split("\n").length}\n+${content.replaceAll("\n", "\n+")}`;
    }
  }
  throw new Error(`git diff failed: ${output.stderr.trim().slice(0, 2000)}`);
}

export async function gitLog(workspace: string): Promise<string> { return gitOutput(workspace, ["log", "--oneline", "--decorate", "-20"]); }

export async function gitBranches(workspace: string): Promise<readonly string[]> {
  return (await gitOutput(workspace, ["branch", "--format=%(refname:short)"])).split("\n").map(value => value.trim()).filter(Boolean);
}

export async function gitBranchCreate(workspace: string, name: string): Promise<string> {
  if (!/^[A-Za-z0-9._/-]{1,256}$/.test(name) || name.includes("..") || name.endsWith("/") || name.startsWith("/")) throw new Error("branch name is invalid");
  return gitOutput(workspace, ["switch", "-c", name]);
}

export async function gitCommit(workspace: string, message: string): Promise<string> {
  if (!message.trim() || message.length > 5000 || /[\0\r]/.test(message)) throw new Error("commit message is invalid");
  return gitOutput(workspace, ["commit", "-m", message]);
}

export async function gitPush(workspace: string, remote = "origin", branch?: string, credential?: GitCredentialInput): Promise<string> {
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(remote)) throw new Error("remote name is invalid");
  if (branch !== undefined && !/^[A-Za-z0-9._/-]{1,256}$/.test(branch)) throw new Error("branch name is invalid");
  return gitOutput(workspace, ["push", remote, ...(branch === undefined ? [] : [branch])], credential);
}

export async function gitPull(workspace: string, remote = "origin", branch?: string, credential?: GitCredentialInput): Promise<string> {
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(remote)) throw new Error("remote name is invalid");
  return gitOutput(workspace, ["pull", "--ff-only", remote, ...(branch === undefined ? [] : [branch])], credential);
}

function jsonInput(args: unknown): Record<string, unknown> {
  if (typeof args !== "object" || args === null || Array.isArray(args)) throw new Error("git arguments must be an object");
  return args as Record<string, unknown>;
}

export function createNativeGitTools(workspace: string, credential?: GitCredentialInput): readonly ToolDefinition[] {
  const tool = (name: string, description: string, inputSchema: Record<string, unknown>, policy: "allow" | "ask", mutating: boolean, execute: (input: Record<string, unknown>, signal?: AbortSignal) => Promise<unknown>): ToolDefinition => ({
    name, capabilityId: name, description, inputSchema, source: "git", capabilities: { mutating }, policy, executable: { handle: createToolHandle((input: unknown, signal?: AbortSignal) => execute(jsonInput(input), signal)) },
  });
  return [
    tool("git.status", "Show changed files and staged or unstaged state.", { type: "object", properties: {} }, "allow", false, async (_input, signal) => gitStatus(workspace, signal)),
    tool("git.diff", "Show the diff for the current workspace or one changed file.", { type: "object", properties: { path: { type: "string" }, staged: { type: "boolean" } } }, "allow", false, async (input, signal) => gitDiff(workspace, input.path, input.staged === true, signal)),
    tool("git.log", "Show recent commits.", { type: "object", properties: {} }, "allow", false, async () => gitLog(workspace)),
    tool("git.branch.list", "List local branches.", { type: "object", properties: {} }, "allow", false, async () => gitBranches(workspace)),
    tool("git.branch.create", "Create and switch to a local branch.", { type: "object", required: ["name"], properties: { name: { type: "string" } } }, "ask", true, async input => gitBranchCreate(workspace, String(input.name ?? ""))),
    tool("git.commit", "Commit staged changes.", { type: "object", required: ["message"], properties: { message: { type: "string" } } }, "ask", true, async input => gitCommit(workspace, String(input.message ?? ""))),
    tool("git.push", "Push commits to the configured remote.", { type: "object", properties: { remote: { type: "string" }, branch: { type: "string" } } }, "ask", true, async input => gitPush(workspace, String(input.remote ?? "origin"), input.branch === undefined ? undefined : String(input.branch), credential)),
    tool("git.pull", "Fast-forward pull from the configured remote.", { type: "object", properties: { remote: { type: "string" }, branch: { type: "string" } } }, "ask", true, async input => gitPull(workspace, String(input.remote ?? "origin"), input.branch === undefined ? undefined : String(input.branch), credential)),
  ];
}
