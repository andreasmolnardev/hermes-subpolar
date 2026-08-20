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

export type ShellProcess = {
  readonly stdout: ReadableStream<Uint8Array>;
  readonly stderr: ReadableStream<Uint8Array>;
  readonly exited: Promise<number>;
  kill(signal?: number): void;
};

export type ShellProcessPort = {
  spawn(options: {
    readonly cmd: readonly string[];
    readonly cwd: string;
    readonly env: Readonly<Record<string, string>>;
    readonly stdin: "ignore";
    readonly stdout: "pipe";
    readonly stderr: "pipe";
  }): ShellProcess;
};

export type ShellToolOptions = {
  readonly policy: ShellPolicy;
  readonly name?: string;
  readonly description?: string;
  readonly process?: ShellProcessPort;
};

type ShellInput = {
  readonly argv: readonly string[];
  readonly cwd?: string;
  readonly timeoutMs?: number;
};

export type ShellRuntimeErrorCategory = "validation" | "authorization" | "cancellation" | "timeout" | "bounds" | "execution";

export class ShellRuntimeError extends Error {
  readonly category: ShellRuntimeErrorCategory;
  readonly code: string;
  readonly auditCategory: string;

  constructor(category: ShellRuntimeErrorCategory, code: string, message: string) {
    super(message);
    this.name = category === "cancellation" ? "AbortError" : "ShellRuntimeError";
    this.category = category;
    this.code = code;
    this.auditCategory = `shell.${category}`;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function inside(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

function requireStringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.length === 0 || value.some(item => typeof item !== "string" || !item)) {
    throw new ShellRuntimeError("validation", "INVALID_ARGUMENTS", `${label} must be a non-empty string array`);
  }
  if (value.some(item => item.length > 4096 || /[\0\r\n]/.test(item))) {
    throw new ShellRuntimeError("validation", "UNSAFE_ARGUMENT", `${label} contains an unsafe argument`);
  }
  return value;
}

function parseInput(value: unknown): ShellInput {
  if (!isRecord(value)) throw new ShellRuntimeError("validation", "INVALID_ARGUMENTS", "Shell input must be an object");
  const argv = requireStringArray(value.argv, "argv");
  if (!isAbsolute(argv[0] ?? "")) throw new ShellRuntimeError("validation", "INVALID_EXECUTABLE", "Shell executable must be an absolute path");
  if (value.cwd !== undefined && (typeof value.cwd !== "string" || !isAbsolute(value.cwd))) {
    throw new ShellRuntimeError("validation", "INVALID_CWD", "cwd must be an absolute path");
  }
  if (value.timeoutMs !== undefined &&
      (typeof value.timeoutMs !== "number" || !Number.isInteger(value.timeoutMs) || value.timeoutMs < 1)) {
    throw new ShellRuntimeError("validation", "INVALID_TIMEOUT", "timeoutMs must be a positive integer");
  }
  return { argv, ...(typeof value.cwd === "string" ? { cwd: value.cwd } : {}),
    ...(typeof value.timeoutMs === "number" ? { timeoutMs: value.timeoutMs } : {}) };
}

async function canonicalWithin(path: string, roots: readonly string[], kind: string): Promise<string> {
  let canonical: string;
  let canonicalRoots: readonly string[];
  try {
    canonical = await realpath(path);
    canonicalRoots = await Promise.all(roots.map(root => realpath(root)));
  } catch {
    throw new ShellRuntimeError("authorization", "PATH_NOT_ALLOWED", `${kind} is not available in configured roots`);
  }
  if (!canonicalRoots.some(root => inside(root, canonical))) {
    throw new ShellRuntimeError("authorization", "PATH_NOT_ALLOWED", `${kind} is outside configured roots`);
  }
  return canonical;
}

type BoundedText = { readonly text: string; readonly truncated: boolean };

async function readBounded(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number,
  budget: { used: number; limited: boolean },
  stop: () => void,
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
      const remaining = maxBytes - budget.used;
      if (remaining <= 0) {
        truncated = true;
        budget.limited = true;
        stop();
        void reader.cancel();
        break;
      }
      if (chunk.byteLength > remaining) {
        chunks.push(chunk.slice(0, remaining));
        size += remaining;
        budget.used += remaining;
        truncated = true;
        budget.limited = true;
        stop();
        void reader.cancel();
        break;
      }
      chunks.push(chunk);
      size += chunk.byteLength;
      budget.used += chunk.byteLength;
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

async function executeShell(inputValue: unknown, policy: ShellPolicy, processPort: ShellProcessPort, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const input = parseInput(inputValue);
  if (signal?.aborted) throw new ShellRuntimeError("cancellation", "CANCELLED", "Shell command cancelled");
  if (policy.allowedCommands.length === 0) throw new ShellRuntimeError("authorization", "NO_COMMANDS_ALLOWED", "No shell commands are allowed");
  const executable = await canonicalWithin(input.argv[0] ?? "", policy.executableRoots, "Executable");
  let executableInfo: Awaited<ReturnType<typeof stat>>;
  try {
    executableInfo = await stat(executable);
  } catch {
    throw new ShellRuntimeError("authorization", "EXECUTABLE_NOT_RUNNABLE", "Executable is not runnable");
  }
  if (!executableInfo.isFile() || (executableInfo.mode & 0o111) === 0) throw new ShellRuntimeError("authorization", "EXECUTABLE_NOT_RUNNABLE", "Executable is not runnable");
  if (policy.deniedExecutables?.includes(executable)) throw new ShellRuntimeError("authorization", "EXECUTABLE_DENIED", "Executable is denied");
  if (!matchesRule(executable, input.argv, policy.allowedCommands)) throw new ShellRuntimeError("authorization", "COMMAND_NOT_ALLOWLISTED", "Command is not allowlisted");

  const cwd = await canonicalWithin(resolve(input.cwd ?? process.cwd()), policy.cwdRoots, "Working directory");
  const timeoutMs = Math.min(input.timeoutMs ?? policy.maxTimeoutMs, policy.maxTimeoutMs);
  if (signal?.aborted) throw new ShellRuntimeError("cancellation", "CANCELLED", "Shell command cancelled");
  let processHandle: ShellProcess;
  try {
    processHandle = processPort.spawn({ cmd: [executable, ...input.argv.slice(1)], cwd, env: policy.environment ?? {}, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  } catch {
    throw new ShellRuntimeError("execution", "SPAWN_FAILED", "Shell command could not be started");
  }
  let timedOut = false;
  let cancelled = false;
  const budget = { used: 0, limited: false };
  let rejectTermination: ((error: ShellRuntimeError) => void) | undefined;
  const termination = new Promise<never>((_, reject) => { rejectTermination = reject; });
  const stop = () => {
    try { processHandle.kill(9); } catch { /* process already exited */ }
  };
  const timer = setTimeout(() => {
    timedOut = true;
    stop();
    rejectTermination?.(new ShellRuntimeError("timeout", "TIMEOUT", "Shell command timed out"));
  }, timeoutMs);
  const abort = () => {
    cancelled = true;
    stop();
    rejectTermination?.(new ShellRuntimeError("cancellation", "CANCELLED", "Shell command cancelled"));
  };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const completion = Promise.all([
      readBounded(processHandle.stdout, policy.maxOutputBytes, budget, stop),
      readBounded(processHandle.stderr, policy.maxOutputBytes, budget, stop),
      processHandle.exited
    ]);
    const [stdout, stderr, exitCode] = await Promise.race([completion, termination]);
    if (cancelled || signal?.aborted) throw new ShellRuntimeError("cancellation", "CANCELLED", "Shell command cancelled");
    if (timedOut) throw new ShellRuntimeError("timeout", "TIMEOUT", "Shell command timed out");
    return { exitCode, stdout: stdout.text, stderr: stderr.text, truncated: stdout.truncated || stderr.truncated };
  } catch (error) {
    if (error instanceof ShellRuntimeError) throw error;
    throw new ShellRuntimeError("execution", "PROCESS_FAILED", "Shell command failed");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

export function createShellTool(options: ShellToolOptions): ToolDefinition {
  const { policy } = options;
  if (!Number.isInteger(policy.maxTimeoutMs) || policy.maxTimeoutMs < 1) throw new ShellRuntimeError("validation", "INVALID_POLICY", "maxTimeoutMs must be positive");
  if (!Number.isInteger(policy.maxOutputBytes) || policy.maxOutputBytes < 1) throw new ShellRuntimeError("validation", "INVALID_POLICY", "maxOutputBytes must be positive");
  if (policy.executableRoots.length === 0 || policy.cwdRoots.length === 0) throw new ShellRuntimeError("validation", "INVALID_POLICY", "Shell policy requires roots");
  for (const [key, value] of Object.entries(policy.environment ?? {})) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || /[\0\r\n]/.test(value)) throw new ShellRuntimeError("validation", "INVALID_ENVIRONMENT", "Shell environment is invalid");
  }
  const processPort: ShellProcessPort = options.process ?? {
    spawn: spawnOptions => Bun.spawn({
      ...spawnOptions,
      cmd: [...spawnOptions.cmd],
      env: { ...spawnOptions.env }
    }) as unknown as ShellProcess
  };
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
     executable: { handle: createToolHandle((input, signal) => executeShell(input, policy, processPort, signal instanceof AbortSignal ? signal : undefined)) },
    policy: "ask"
  };
}
