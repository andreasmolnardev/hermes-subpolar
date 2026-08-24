import { realpath, stat } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve } from "node:path";
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
  /** Interpreters are denied unless the caller explicitly opts into shell execution. */
  readonly allowShell?: boolean;
};

export type ShellProcess = {
  readonly stdout: ReadableStream<Uint8Array>;
  readonly stderr: ReadableStream<Uint8Array>;
  readonly exited: Promise<number>;
  readonly pid?: number;
  readonly kill?: (signal?: number) => void;
};

export type ShellSpawnOptions = {
  readonly cmd: readonly string[];
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  readonly stdin: "ignore";
  readonly stdout: "pipe";
  readonly stderr: "pipe";
};

export type ShellProcessPort = {
  readonly spawn: (options: ShellSpawnOptions) => ShellProcess;
  /** Terminate the complete process group, not just the immediate child. */
  readonly terminate: (process: ShellProcess, signal?: number) => void;
};

export type ShellAuditCategory =
  | "validation_failed"
  | "spawned"
  | "completed"
  | "cancelled"
  | "timed_out"
  | "output_limited";

export type ShellAuditEvent = { readonly category: ShellAuditCategory };
export type ShellAuditSink = (event: ShellAuditEvent) => void;

export type ShellToolOptions = {
  readonly policy: ShellPolicy;
  readonly name?: string;
  readonly description?: string;
  readonly process?: ShellProcessPort;
  readonly processPort?: ShellProcessPort;
  readonly audit?: ShellAuditSink;
};

type ShellInput = {
  readonly argv: readonly string[];
  readonly cwd?: string;
  readonly timeoutMs?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function audit(sink: ShellAuditSink | undefined, category: ShellAuditCategory): void {
  try {
    sink?.({ category });
  } catch {
    // Auditing must not change tool execution or expose sink errors.
  }
}

const DANGEROUS_ENVIRONMENT = /^(?:LD_[A-Z0-9_]*|DYLD_[A-Z0-9_]*|BASH_ENV|ENV|CDPATH|GCONV_PATH|PYTHON(?:HOME|PATH|INSPECT|BREAKPOINT|STARTUP|WARNINGS|USERBASE|EXECUTABLE|IOENCODING)|PERL(?:5LIB|LIB|5OPT)|RUBY(?:LIB|OPT)|GEM_PATH|NODE_(?:OPTIONS|PATH|EXTRA_CA_CERTS)|JAVA_TOOL_OPTIONS|_JAVA_OPTIONS|JDK_JAVA_OPTIONS|CLASSPATH|DOTNET_STARTUP_HOOKS|COMPlus_[A-Z0-9_]*|COREHOST_[A-Z0-9_]*|NPM_CONFIG_[A-Z0-9_]*|npm_config_[A-Za-z0-9_]*)$/i;

function validateEnvironment(environment: Readonly<Record<string, string>> | undefined): void {
  for (const [key, value] of Object.entries(environment ?? {})) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || DANGEROUS_ENVIRONMENT.test(key)) {
      throw new TypeError("Shell environment contains a forbidden variable");
    }
    if (typeof value !== "string" || /\0/.test(value) || value.length > 65536) {
      throw new TypeError("Shell environment contains an invalid value");
    }
  }
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

const SHELL_INTERPRETERS = new Set(["ash", "bash", "dash", "fish", "ksh", "sh", "tcsh", "zsh", "pwsh", "powershell"]);

async function executeShell(
  inputValue: unknown,
  policy: ShellPolicy,
  processPort: ShellProcessPort,
  auditSink: ShellAuditSink | undefined,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const input = parseInput(inputValue);
  signal?.throwIfAborted();
  if (policy.allowedCommands.length === 0) throw new Error("No shell commands are allowed");
  const executable = await canonicalWithin(input.argv[0] ?? "", policy.executableRoots, "Executable");
  const executableInfo = await stat(executable);
  if (!executableInfo.isFile() || (executableInfo.mode & 0o111) === 0) throw new Error("Executable is not runnable");
  if (!policy.allowShell && SHELL_INTERPRETERS.has(basename(executable).toLowerCase())) throw new Error("Shell interpreters require explicit enablement");
  if (policy.deniedExecutables?.includes(executable)) throw new Error("Executable is denied");
  if (!matchesRule(executable, input.argv, policy.allowedCommands)) throw new Error("Command is not allowlisted");

  const cwd = await canonicalWithin(resolve(input.cwd ?? process.cwd()), policy.cwdRoots, "Working directory");
  const timeoutMs = Math.min(input.timeoutMs ?? policy.maxTimeoutMs, policy.maxTimeoutMs);
  signal?.throwIfAborted();
  const finalExecutable = await canonicalWithin(input.argv[0] ?? "", policy.executableRoots, "Executable");
  const finalExecutableInfo = await stat(finalExecutable);
  const finalCwd = await canonicalWithin(resolve(input.cwd ?? process.cwd()), policy.cwdRoots, "Working directory");
  if (finalExecutable !== executable || finalCwd !== cwd || !finalExecutableInfo.isFile() ||
      (finalExecutableInfo.mode & 0o111) === 0 || policy.deniedExecutables?.includes(finalExecutable) ||
      (!policy.allowShell && SHELL_INTERPRETERS.has(basename(finalExecutable).toLowerCase())) ||
      !matchesRule(finalExecutable, input.argv, policy.allowedCommands)) {
    throw new Error("Shell executable or working directory changed during validation");
  }
  signal?.throwIfAborted();
  let processHandle: ShellProcess;
  try {
    processHandle = processPort.spawn({
      cmd: [finalExecutable, ...input.argv.slice(1)],
      cwd: finalCwd,
      env: { ...(policy.environment ?? {}) },
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe"
    });
  } catch {
    throw new Error("Shell command could not be started");
  }
  audit(auditSink, "spawned");
  let timedOut = false;
  const stop = () => {
    try { processPort.terminate(processHandle, 9); } catch { /* process already exited */ }
  };
  const timer = setTimeout(() => {
    timedOut = true;
    audit(auditSink, "timed_out");
    stop();
  }, timeoutMs);
  const abort = () => {
    audit(auditSink, "cancelled");
    stop();
  };
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
    if (stdout.truncated || stderr.truncated) audit(auditSink, "output_limited");
    audit(auditSink, "completed");
    return { exitCode, stdout: stdout.text, stderr: stderr.text, truncated: stdout.truncated || stderr.truncated };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

const defaultProcessPort: ShellProcessPort = {
  spawn(options) {
    return Bun.spawn({ ...options, cmd: [...options.cmd], env: { ...options.env }, detached: true }) as unknown as ShellProcess;
  },
  terminate(processHandle, signal = 9) {
    if (typeof processHandle.pid === "number" && process.platform !== "win32") {
      try {
        process.kill(-processHandle.pid, signal);
        return;
      } catch {
        // Fall back to the direct child when a process group is unavailable.
      }
    }
    try { processHandle.kill?.(signal); } catch { /* process already exited */ }
  }
};

export function createShellTool(options: ShellToolOptions): ToolDefinition {
  const { policy } = options;
  if (!Number.isInteger(policy.maxTimeoutMs) || policy.maxTimeoutMs < 1) throw new TypeError("maxTimeoutMs must be positive");
  if (!Number.isInteger(policy.maxOutputBytes) || policy.maxOutputBytes < 1) throw new TypeError("maxOutputBytes must be positive");
  if (policy.executableRoots.length === 0 || policy.cwdRoots.length === 0) throw new TypeError("Shell policy requires roots");
  validateEnvironment(policy.environment);
  const processPort = options.processPort ?? options.process ?? defaultProcessPort;
  const auditSink = options.audit;
  return {
    name: options.name ?? "shell.exec",
    capabilityId: "shell.execute",
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
     executable: { handle: createToolHandle((input, signal) => {
       return executeShell(input, policy, processPort, auditSink, signal instanceof AbortSignal ? signal : undefined);
     }) },
    policy: "ask"
  };
}
