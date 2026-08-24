import { constants } from "node:fs";
import { open, readdir, realpath, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { createToolHandle, type JsonSchema, type ToolDefinition } from "tool-resolver";

export type FilesystemOperation = "read" | "write" | "edit" | "grep" | "find" | "ls";

export type FilesystemToolOptions = {
  /** The only directory visible to the returned tools. */
  readonly workspaceRoot: string;
  /** Operations not listed here are not exposed at all. Defaults to every operation. */
  readonly allowedOperations?: readonly FilesystemOperation[];
  readonly maxReadBytes?: number;
  readonly maxWriteBytes?: number;
  readonly maxResults?: number;
  /** Mutating tools remain approval-gated unless the caller explicitly opts into allow. */
  readonly writePolicy?: "allow" | "ask";
};

type FilesystemInput = Record<string, unknown>;
type ResolvedPath = { readonly root: string; readonly path: string };

const ALL_OPERATIONS: readonly FilesystemOperation[] = ["read", "write", "edit", "grep", "find", "ls"];
const NOFOLLOW = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;

function isRecord(value: unknown): value is FilesystemInput {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringInput(value: unknown, label: string, allowEmpty = false, maxLength = 4096): string {
  if (typeof value !== "string" || (!allowEmpty && value.length === 0) || value.length > maxLength || value.includes("\0")) {
    throw new TypeError(`${label} must be a valid path string`);
  }
  return value;
}

function input(value: unknown): FilesystemInput {
  if (!isRecord(value)) throw new TypeError("Filesystem input must be an object");
  return value;
}

function ensureRelativePath(value: unknown, label = "path", allowRoot = false): string {
  const path = stringInput(value, label, allowRoot);
  if (path === "." && allowRoot) return path;
  if (isAbsolute(path)) throw new Error("Filesystem paths must be relative to the workspace");
  const segments = path.split(/[\\/]+/);
  if (segments.some(segment => segment === "..")) throw new Error("Filesystem path traversal is not allowed");
  if (segments.some(segment => segment.length === 0 || segment === ".")) {
    throw new Error("Filesystem paths contain an invalid segment");
  }
  return path;
}

function inside(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

async function canonicalRoot(workspaceRoot: string): Promise<string> {
  const root = await realpath(workspaceRoot);
  const info = await stat(root);
  if (!info.isDirectory()) throw new Error("Filesystem workspace root is not a directory");
  return root;
}

async function resolveExisting(workspaceRoot: string, value: unknown, label = "path", allowRoot = false): Promise<ResolvedPath> {
  const root = await canonicalRoot(workspaceRoot);
  const path = ensureRelativePath(value, label, allowRoot);
  const candidate = path === "." ? root : resolve(root, path);
  const canonical = await realpath(candidate);
  if (!inside(root, canonical)) throw new Error("Filesystem path is outside the workspace");
  return { root, path: canonical };
}

async function resolveWritable(workspaceRoot: string, value: unknown): Promise<ResolvedPath> {
  const root = await canonicalRoot(workspaceRoot);
  const path = ensureRelativePath(value);
  const candidate = resolve(root, path);
  const parent = await realpath(dirname(candidate));
  if (!inside(root, parent)) throw new Error("Filesystem path is outside the workspace");
  const target = join(parent, basename(candidate));
  try {
    const canonical = await realpath(target);
    if (!inside(root, canonical)) throw new Error("Filesystem path is outside the workspace");
    return { root, path: canonical };
  } catch (error) {
    if (!(error instanceof Error) || !/ENOENT/.test(error.message)) throw error;
    return { root, path: target };
  }
}

function boundedLimit(value: number | undefined, fallback: number, label: string): number {
  const limit = value ?? fallback;
  if (!Number.isInteger(limit) || limit < 1) throw new TypeError(`${label} must be positive`);
  return limit;
}

async function readBounded(path: string, maxBytes: number): Promise<string> {
  const info = await stat(path);
  if (!info.isFile()) throw new Error("Filesystem target is not a regular file");
  if (info.size > maxBytes) throw new Error("Filesystem file exceeds the read limit");
  const handle = await open(path, constants.O_RDONLY | NOFOLLOW);
  try {
    const bytes = Buffer.allocUnsafe(maxBytes + 1);
    let offset = 0;
    while (offset < bytes.byteLength) {
      const result = await handle.read(bytes, offset, bytes.byteLength - offset, offset);
      if (result.bytesRead === 0) break;
      offset += result.bytesRead;
    }
    if (offset > maxBytes) throw new Error("Filesystem file exceeds the read limit");
    return bytes.subarray(0, offset).toString("utf8");
  } finally {
    await handle.close();
  }
}

async function writeConstrained(path: string, content: string, maxBytes: number): Promise<void> {
  const bytes = Buffer.byteLength(content, "utf8");
  if (bytes > maxBytes) throw new Error("Filesystem content exceeds the write limit");
  const handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | NOFOLLOW, 0o600);
  try {
    await handle.writeFile(content, "utf8");
  } finally {
    await handle.close();
  }
}

async function listEntries(workspaceRoot: string, value: unknown, maxResults: number): Promise<readonly Record<string, unknown>[]> {
  const target = await resolveExisting(workspaceRoot, value, "path", true);
  const info = await stat(target.path);
  if (!info.isDirectory()) throw new Error("Filesystem ls target is not a directory");
  const entries = await readdir(target.path, { withFileTypes: true });
  if (entries.length > maxResults) throw new Error("Filesystem result limit exceeded");
  return entries
    .sort((left, right) => left.name.localeCompare(right.name))
    .map(entry => ({ name: entry.name, type: entry.isDirectory() ? "directory" : entry.isFile() ? "file" : "other" }));
}

async function walk(workspaceRoot: string, value: unknown, maxResults: number): Promise<readonly string[]> {
  const target = await resolveExisting(workspaceRoot, value, "path", true);
  const found: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const candidate = join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      const canonical = await realpath(candidate);
      if (!inside(target.root, canonical)) throw new Error("Filesystem path is outside the workspace");
      found.push(relative(target.root, canonical));
      if (found.length > maxResults) throw new Error("Filesystem result limit exceeded");
      if (entry.isDirectory()) await visit(canonical);
    }
  };
  const info = await stat(target.path);
  if (info.isDirectory()) await visit(target.path);
  else found.push(relative(target.root, target.path));
  return found;
}

function operationTool(
  name: string,
  operation: FilesystemOperation,
  description: string,
  inputSchema: JsonSchema,
  execute: (value: unknown) => Promise<unknown>,
  policy: "allow" | "ask",
): ToolDefinition {
  return {
    name: `filesystem.${name}`,
    capabilityId: `filesystem.${operation}`,
    description,
    inputSchema,
    source: "tool-runtime:filesystem",
    capabilities: ["filesystem"],
    executable: { handle: createToolHandle(execute) },
    policy,
  };
}

export function createFilesystemTools(options: FilesystemToolOptions): readonly ToolDefinition[] {
  if (typeof options.workspaceRoot !== "string" || !isAbsolute(options.workspaceRoot)) {
    throw new TypeError("Filesystem workspaceRoot must be absolute");
  }
  const allowed = new Set(options.allowedOperations ?? ALL_OPERATIONS);
  for (const operation of allowed) if (!ALL_OPERATIONS.includes(operation)) throw new TypeError("Unknown filesystem operation");
  const maxReadBytes = boundedLimit(options.maxReadBytes, 1_048_576, "maxReadBytes");
  const maxWriteBytes = boundedLimit(options.maxWriteBytes, 1_048_576, "maxWriteBytes");
  const maxResults = boundedLimit(options.maxResults, 1_000, "maxResults");
  const writePolicy = options.writePolicy ?? "ask";
  const tools: ToolDefinition[] = [];

  if (allowed.has("read")) tools.push(operationTool("read", "read", "Read a bounded UTF-8 file inside the workspace.", {
    type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false,
  }, async value => {
    const fields = input(value); const target = await resolveExisting(options.workspaceRoot, fields.path);
    return { path: relative(target.root, target.path), content: await readBounded(target.path, maxReadBytes) };
  }, "allow"));

  if (allowed.has("write")) tools.push(operationTool("write", "write", "Write a bounded UTF-8 file inside the workspace.", {
    type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"], additionalProperties: false,
  }, async value => {
    const fields = input(value); const content = stringInput(fields.content, "content", true, maxWriteBytes); const target = await resolveWritable(options.workspaceRoot, fields.path);
    await writeConstrained(target.path, content, maxWriteBytes);
    return { path: relative(target.root, target.path), bytes: Buffer.byteLength(content, "utf8") };
  }, writePolicy));

  if (allowed.has("edit")) tools.push(operationTool("edit", "edit", "Replace one exact bounded text occurrence inside the workspace.", {
    type: "object", properties: { path: { type: "string" }, oldText: { type: "string" }, newText: { type: "string" } }, required: ["path", "oldText", "newText"], additionalProperties: false,
  }, async value => {
    const fields = input(value); const oldText = stringInput(fields.oldText, "oldText", true, maxReadBytes); const newText = stringInput(fields.newText, "newText", true, maxWriteBytes);
    if (oldText.length === 0) throw new Error("oldText must not be empty");
    const target = await resolveExisting(options.workspaceRoot, fields.path); const current = await readBounded(target.path, maxReadBytes);
    const occurrences = current.split(oldText).length - 1;
    if (occurrences !== 1) throw new Error("Edit requires exactly one matching occurrence");
    const updated = current.replace(oldText, newText);
    await writeConstrained(target.path, updated, maxWriteBytes);
    return { path: relative(target.root, target.path), bytes: Buffer.byteLength(updated, "utf8") };
  }, writePolicy));

  if (allowed.has("ls")) tools.push(operationTool("ls", "ls", "List bounded entries inside the workspace.", {
    type: "object", properties: { path: { type: "string" } }, additionalProperties: false,
  }, async value => {
    const fields = input(value); return { entries: await listEntries(options.workspaceRoot, fields.path ?? ".", maxResults) };
  }, "allow"));

  if (allowed.has("find")) tools.push(operationTool("find", "find", "Find bounded paths without following symlinks inside the workspace.", {
    type: "object", properties: { path: { type: "string" } }, additionalProperties: false,
  }, async value => {
    const fields = input(value); return { paths: await walk(options.workspaceRoot, fields.path ?? ".", maxResults) };
  }, "allow"));

  if (allowed.has("grep")) tools.push(operationTool("grep", "grep", "Search bounded files inside the workspace without following symlinks.", {
    type: "object", properties: { path: { type: "string" }, pattern: { type: "string" } }, required: ["pattern"], additionalProperties: false,
  }, async value => {
    const fields = input(value); const pattern = stringInput(fields.pattern, "pattern");
    const target = fields.path === undefined ? "." : fields.path; const paths = await walk(options.workspaceRoot, target, maxResults);
    const matches: Record<string, unknown>[] = [];
    for (const path of paths) {
      const absolute = resolve(options.workspaceRoot, path);
      const info = await stat(absolute);
      if (!info.isFile() || info.size > maxReadBytes) continue;
      const content = await readBounded(absolute, maxReadBytes);
      const lines = content.split(/\r?\n/).flatMap((line, index) => line.includes(pattern) ? [{ path, line: index + 1, text: line }] : []);
      matches.push(...lines);
      if (matches.length > maxResults) throw new Error("Filesystem result limit exceeded");
    }
    return { matches };
  }, "allow"));

  return tools;
}
