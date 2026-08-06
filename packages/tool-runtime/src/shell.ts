import { realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { createToolHandle, type ToolDefinition } from "tool-resolver";

export type ShellCommandRule = {
  readonly executable: string;
  readonly argumentPrefix?: readonly string[];
};

export type ShellPolicy = {
  readonly allowedCommands: readonly ShellCommandRule[];
  readonly deniedExecutables?: readonly string[];
  readonly executableRoots: readonly string[];
  readonly cwdRoots: readonly string[];
  readonly maxTimeoutMs: number;
  readonly maxOutputBytes: number;
  readonly environment?: Readonly<Record<string, string>>;
};

export type ShellToolOptions = {
  readonly policy: ShellPolicy;
  readonly name?: string;
  readonly description?: string;
};

type ShellInput = {
  readonly argv: readonly string[];
  readonly cwd?: string;
  readonly timeoutMs?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function inside(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

function requireStringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.length === 0 || value.some(item => typeof item !== "string" || !item)) {
    throw new TypeError(`${label} must be a non-empty string array`);
  }
  if (value.some(item => item.length > 4096 || /[\0\r\n]/.test(item))) {
    throw new TypeError(`${label} contains an unsafe argument`);
  }
  return value;
}

function parseInput(value: unknown): ShellInput {
  if (!isRecord(value)) throw new TypeError("Shell input must be an object");
  const argv = requireStringArray(value.argv, "argv");
  if (!isAbsolute(argv[0] ?? "")) throw new TypeError("Shell executable must be an absolute path");
  if (value.cwd !== undefined && (typeof value.cwd !== "string" || !isAbsolute(value.cwd))) {
    throw new TypeError("cwd must be an absolute path");
  }
  if (value.timeoutMs !== undefined &&
      (typeof value.timeoutMs !== "number" || !Number.isInteger(value.timeoutMs) || value.timeoutMs < 1)) {
    throw new TypeError("timeoutMs must be a positive integer");
  }
  return { argv, ...(typeof value.cwd === "string" ? { cwd: value.cwd } : {}),
    ...(typeof value.timeoutMs === "number" ? { timeoutMs: value.timeoutMs } : {}) };
}

async function canonicalWithin(path: string, roots: readonly string[], kind: string): Promise<string> {
  const canonical = await realpath(path);
  const canonicalRoots = await Promise.all(roots.map(root => realpath(root)));
  if (!canonicalRoots.some(root => inside(root, canonical))) {
    throw new Error(`${kind} is outside configured roots`);
  }
  return canonical;
}

type BoundedText = { readonly text: string; readonly truncated: boolean };

async function readBounded(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number,
  onLimit: () => void,
): Promise<BoundedText> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let truncated = false;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      const chunk = next.value;
      const remaining = maxBytes - size;
      if (remaining <= 0) {
        truncated = true;
        onLimit();
        void reader.cancel();
        break;
      }
      if (chunk.byteLength > remaining) {
        chunks.push(chunk.slice(0, remaining));
        size += remaining;
        truncated = true;
        onLimit();
        void reader.cancel();
        break;
      }
      chunks.push(chunk);
      size += chunk.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { text: new TextDecoder().decode(bytes), truncated };
}

function matchesRule(executable: string, argv: readonly string[], rules: readonly ShellCommandRule[]): boolean {
  return rules.some(rule => rule.executable === executable &&
    (rule.argumentPrefix === undefined || rule.argumentPrefix.every((item, index) => argv[index + 1] === item)));
}

async function executeShell(inputValue: unknown, policy: ShellPolicy, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const input = parseInput(inputValue);
  signal?.throwIfAborted();
  if (policy.allowedCommands.length === 0) throw new Error("No shell commands are allowed");
  const executable = await canonicalWithin(input.argv[0] ?? "", policy.executableRoots, "Executable");
  const executableInfo = await stat(executable);
  if (!executableInfo.isFile() || (executableInfo.mode & 0o111) === 0) throw new Error("Executable is not runnable");
  if (policy.deniedExecutables?.includes(executable)) throw new Error("Executable is denied");
  if (!matchesRule(executable, input.argv, policy.allowedCommands)) throw new Error("Command is not allowlisted");

  const cwd = await canonicalWithin(resolve(input.cwd ?? process.cwd()), policy.cwdRoots, "Working directory");
  const timeoutMs = Math.min(input.timeoutMs ?? policy.maxTimeoutMs, policy.maxTimeoutMs);
  signal?.throwIfAborted();
  const processHandle = Bun.spawn({
    cmd: [executable, ...input.argv.slice(1)],
    cwd,
    env: policy.environment ?? {},
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe"
  });
  let timedOut = false;
  const stop = () => {
    try { processHandle.kill(9); } catch { /* process already exited */ }
  };
  const timer = setTimeout(() => {
    timedOut = true;
    stop();
  }, timeoutMs);
  const abort = () => stop();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) stop();
  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      readBounded(processHandle.stdout, policy.maxOutputBytes, stop),
      readBounded(processHandle.stderr, policy.maxOutputBytes, stop),
      processHandle.exited
    ]);
    if (signal?.aborted) throw new DOMException("Shell command cancelled", "AbortError");
    if (timedOut) throw new Error("Shell command timed out");
    return { exitCode, stdout: stdout.text, stderr: stderr.text, truncated: stdout.truncated || stderr.truncated };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

export function createShellTool(options: ShellToolOptions): ToolDefinition {
  const { policy } = options;
  if (!Number.isInteger(policy.maxTimeoutMs) || policy.maxTimeoutMs < 1) throw new TypeError("maxTimeoutMs must be positive");
  if (!Number.isInteger(policy.maxOutputBytes) || policy.maxOutputBytes < 1) throw new TypeError("maxOutputBytes must be positive");
  if (policy.executableRoots.length === 0 || policy.cwdRoots.length === 0) throw new TypeError("Shell policy requires roots");
  return {
    name: options.name ?? "shell.exec",
    description: options.description ?? "Run one verified allowlisted command without a shell.",
    inputSchema: {
      type: "object",
      properties: {
        argv: { type: "array", items: { type: "string" }, minItems: 1 },
        cwd: { type: "string" },
        timeoutMs: { type: "integer", minimum: 1 }
      },
      required: ["argv"],
      additionalProperties: false
    },
    source: "tool-runtime:shell",
    capabilities: ["process"],
     executable: { handle: createToolHandle((input, signal) => executeShell(input, policy, signal instanceof AbortSignal ? signal : undefined)) },
    policy: "ask"
  };
}
