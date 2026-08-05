import type { HarnessJsonObject, HarnessToolExecution, HarnessToolExecutor, HarnessToolResult } from "harness";

export const PYTHON_TOOL_BRIDGE_PROTOCOL_VERSION = 1;

type JsonValue = null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export type PythonToolBridgeRequest = {
  readonly protocolVersion: typeof PYTHON_TOOL_BRIDGE_PROTOCOL_VERSION;
  readonly type: "tool.call";
  readonly requestId: string;
  readonly toolCallId: string;
  readonly tool: { readonly name: string; readonly reference: string };
  readonly arguments: HarnessJsonObject;
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  /** Unix epoch milliseconds. */
  readonly deadline: number;
};

export type PythonToolBridgeSuccess = {
  readonly protocolVersion: typeof PYTHON_TOOL_BRIDGE_PROTOCOL_VERSION;
  readonly type: "tool.result";
  readonly requestId: string;
  readonly toolCallId: string;
  readonly content: string;
  readonly isError?: boolean;
};

export type PythonToolBridgeFailure = {
  readonly protocolVersion: typeof PYTHON_TOOL_BRIDGE_PROTOCOL_VERSION;
  readonly type: "error";
  readonly requestId: string;
  readonly toolCallId: string;
  readonly error: {
    readonly code: string;
    readonly message?: string;
    readonly retryable?: boolean;
  };
};

export type PythonToolBridgeResponse = PythonToolBridgeSuccess | PythonToolBridgeFailure;

export type PythonToolBridgeTransport = {
  send(
    request: PythonToolBridgeRequest,
    options: { readonly signal: AbortSignal }
  ): Promise<unknown>;
};

export type PythonToolBridgeErrorCode =
  | "cancelled"
  | "deadline_exceeded"
  | "invalid_response"
  | "protocol_mismatch"
  | "tool_not_allowlisted"
  | "transport_error"
  | "worker_error";

export class PythonToolBridgeError extends Error {
  readonly code: PythonToolBridgeErrorCode;
  readonly requestId: string;
  readonly toolCallId: string;

  constructor(code: PythonToolBridgeErrorCode, requestId: string, toolCallId: string) {
    super(`Python tool bridge ${code}`);
    this.name = "PythonToolBridgeError";
    this.code = code;
    this.requestId = requestId;
    this.toolCallId = toolCallId;
  }
}

export type PythonToolBridgeCall = Omit<PythonToolBridgeRequest, "protocolVersion" | "type">;

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isJsonValue(value: unknown, active = new Set<object>()): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (!isRecord(value) && !Array.isArray(value)) return false;
  if (active.has(value)) return false;
  active.add(value);
  const valid = Array.isArray(value)
    ? value.every(item => isJsonValue(item, active))
    : Object.values(value).every(item => isJsonValue(item, active));
  active.delete(value);
  return valid;
}

function isJsonObject(value: unknown): value is HarnessJsonObject {
  return isRecord(value) && isJsonValue(value);
}

function isSafeIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256 && !/[\r\n]/.test(value);
}

function isAbsolutePath(value: string): boolean {
  return value.length > 0 && !value.includes("\u0000") &&
    (value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value));
}

function isEnvironmentName(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

function validateCall(call: PythonToolBridgeCall): void {
  if (!isSafeIdentifier(call.requestId) || !isSafeIdentifier(call.toolCallId) ||
    !isSafeIdentifier(call.tool.name) || !isSafeIdentifier(call.tool.reference)) {
    throw new TypeError("Python tool bridge identifiers are invalid");
  }
  if (!isAbsolutePath(call.cwd)) throw new TypeError("Python tool bridge cwd must be absolute");
  if (!Number.isFinite(call.deadline)) throw new TypeError("Python tool bridge deadline must be finite");
  if (!isJsonObject(call.arguments)) throw new TypeError("Python tool bridge arguments must be a JSON object");
  for (const [name, value] of Object.entries(call.env)) {
    if (!isEnvironmentName(name) || typeof value !== "string" || value.includes("\u0000")) {
      throw new TypeError("Python tool bridge environment is invalid");
    }
  }
}

function isBridgeResponse(value: unknown): value is PythonToolBridgeResponse {
  if (!isRecord(value) || value.protocolVersion !== PYTHON_TOOL_BRIDGE_PROTOCOL_VERSION ||
    !isSafeIdentifier(value.requestId) || !isSafeIdentifier(value.toolCallId) ||
    typeof value.type !== "string") return false;
  if (value.type === "tool.result") {
    return typeof value.content === "string" &&
      (value.isError === undefined || typeof value.isError === "boolean");
  }
  if (value.type !== "error" || !isRecord(value.error) || !isSafeIdentifier(value.error.code)) return false;
  return value.error.message === undefined || typeof value.error.message === "string";
}

function responseError(
  response: PythonToolBridgeResponse,
  request: PythonToolBridgeRequest
): PythonToolBridgeError {
  if (response.type === "error") {
    const knownCodes = new Set<PythonToolBridgeErrorCode>([
      "cancelled", "deadline_exceeded", "invalid_response", "protocol_mismatch",
      "tool_not_allowlisted", "transport_error", "worker_error"
    ]);
    const code = knownCodes.has(response.error.code as PythonToolBridgeErrorCode)
      ? response.error.code as PythonToolBridgeErrorCode
      : "worker_error";
    return new PythonToolBridgeError(code, request.requestId, request.toolCallId);
  }
  return new PythonToolBridgeError("invalid_response", request.requestId, request.toolCallId);
}

function bridgeErrorFromAbort(signal: AbortSignal, request: PythonToolBridgeRequest): PythonToolBridgeError {
  return new PythonToolBridgeError(
    request.deadline <= Date.now() ? "deadline_exceeded" : "cancelled",
    request.requestId,
    request.toolCallId
  );
}

export class PythonToolBridge {
  constructor(private readonly transport: PythonToolBridgeTransport) {}

  async execute(call: PythonToolBridgeCall, signal?: AbortSignal): Promise<HarnessToolResult> {
    validateCall(call);
    const request: PythonToolBridgeRequest = {
      protocolVersion: PYTHON_TOOL_BRIDGE_PROTOCOL_VERSION,
      type: "tool.call",
      ...call
    };
    if (signal?.aborted === true) throw bridgeErrorFromAbort(signal, request);

    const controller = new AbortController();
    const abortFromParent = () => controller.abort();
    signal?.addEventListener("abort", abortFromParent, { once: true });
    const delay = request.deadline - Date.now();
    const deadlineTimer = delay <= 0 ? undefined : setTimeout(() => controller.abort(), delay);
    if (delay <= 0) controller.abort();
    let response: unknown;
    let onAbort: (() => void) | undefined;
    try {
      if (controller.signal.aborted) throw bridgeErrorFromAbort(controller.signal, request);
      const aborted = new Promise<never>((_, reject) => {
        const abortHandler = () => reject(new PythonToolBridgeError("cancelled", request.requestId, request.toolCallId));
        onAbort = abortHandler;
        controller.signal.addEventListener("abort", abortHandler, { once: true });
      });
      response = await Promise.race([this.transport.send(request, { signal: controller.signal }), aborted]);
    } catch (error) {
      if (controller.signal.aborted) throw bridgeErrorFromAbort(controller.signal, request);
      if (error instanceof PythonToolBridgeError) throw error;
      throw new PythonToolBridgeError("transport_error", request.requestId, request.toolCallId);
    } finally {
      if (onAbort !== undefined) controller.signal.removeEventListener("abort", onAbort);
      if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
      signal?.removeEventListener("abort", abortFromParent);
    }
    if (!isBridgeResponse(response)) {
      throw new PythonToolBridgeError("protocol_mismatch", request.requestId, request.toolCallId);
    }
    if (response.requestId !== request.requestId || response.toolCallId !== request.toolCallId) {
      throw new PythonToolBridgeError("invalid_response", request.requestId, request.toolCallId);
    }
    if (response.type === "error") throw responseError(response, request);
    return { content: response.content, ...(response.isError === undefined ? {} : { isError: response.isError }) };
  }
}

export type PythonToolBridgeProcess = {
  readonly stdin: {
    write(chunk: string): number | Promise<number>;
    end?(): void | Promise<void>;
  };
  readonly stdout: AsyncIterable<string | Uint8Array>;
  kill(): void;
};

export type PythonToolBridgeSpawnOptions = {
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
};

export type PythonToolBridgeSpawner = (
  command: readonly string[],
  options: PythonToolBridgeSpawnOptions
) => PythonToolBridgeProcess;

export function createPythonToolBridgeSubprocessTransport(
  spawn: PythonToolBridgeSpawner,
  command: readonly string[]
): PythonToolBridgeTransport {
  if (command.length === 0 || command.some(part => typeof part !== "string" || part.length === 0)) {
    throw new TypeError("Python tool bridge command must be a non-empty argument list");
  }
  return {
    async send(request, { signal }) {
      let process: PythonToolBridgeProcess;
      try {
        process = spawn(command, { cwd: request.cwd, env: request.env });
      } catch {
        throw new PythonToolBridgeError("transport_error", request.requestId, request.toolCallId);
      }
      let stopped = false;
      const stop = () => {
        if (stopped) return;
        stopped = true;
        process.kill();
      };
      if (signal.aborted) {
        stop();
        throw new PythonToolBridgeError("cancelled", request.requestId, request.toolCallId);
      }
      signal.addEventListener("abort", stop, { once: true });
      try {
        await process.stdin.write(`${JSON.stringify(request)}\n`);
        await process.stdin.end?.();
        const iterator = process.stdout[Symbol.asyncIterator]();
        let buffer = "";
        while (true) {
          if (signal.aborted) throw new PythonToolBridgeError("cancelled", request.requestId, request.toolCallId);
          let onAbort: (() => void) | undefined;
          const abort = new Promise<never>((_, reject) => {
            const abortHandler = () => reject(new PythonToolBridgeError("cancelled", request.requestId, request.toolCallId));
            onAbort = abortHandler;
            signal.addEventListener("abort", abortHandler, { once: true });
          });
          let item: IteratorResult<string | Uint8Array>;
          try {
            item = await Promise.race([iterator.next(), abort]);
          } finally {
            if (onAbort !== undefined) signal.removeEventListener("abort", onAbort);
          }
          if (item.done) break;
          buffer += typeof item.value === "string" ? item.value : new TextDecoder().decode(item.value);
          const newline = buffer.indexOf("\n");
          if (newline < 0) continue;
          const line = buffer.slice(0, newline).trim();
          if (buffer.slice(newline + 1).trim().length > 0) {
            throw new PythonToolBridgeError("invalid_response", request.requestId, request.toolCallId);
          }
          if (line.length === 0) throw new PythonToolBridgeError("invalid_response", request.requestId, request.toolCallId);
          try {
            return JSON.parse(line) as unknown;
          } catch {
            throw new PythonToolBridgeError("invalid_response", request.requestId, request.toolCallId);
          }
        }
        throw new PythonToolBridgeError("transport_error", request.requestId, request.toolCallId);
      } catch (error) {
        if (error instanceof PythonToolBridgeError) throw error;
        if (signal.aborted) throw new PythonToolBridgeError("cancelled", request.requestId, request.toolCallId);
        throw new PythonToolBridgeError("transport_error", request.requestId, request.toolCallId);
      } finally {
        signal.removeEventListener("abort", stop);
        stop();
      }
    }
  };
}

export function createAllowlistedEnvironment(
  source: Readonly<Record<string, string>>,
  allowlist: readonly string[]
): Readonly<Record<string, string>> {
  if (allowlist.some(name => !isEnvironmentName(name))) {
    throw new TypeError("Python tool bridge environment allowlist is invalid");
  }
  const allowed = new Set(allowlist);
  const result: Record<string, string> = {};
  for (const name of allowed) {
    const value = source[name];
    if (value !== undefined) {
      if (typeof value !== "string" || value.includes("\u0000")) {
        throw new TypeError("Python tool bridge environment is invalid");
      }
      Object.defineProperty(result, name, { value, enumerable: true, writable: false, configurable: false });
    }
  }
  return Object.freeze(result);
}

export type PythonToolBridgeTool = {
  readonly name: string;
  readonly reference: string;
};

export type PythonToolBridgeExecutorOptions = {
  readonly bridge: PythonToolBridge;
  readonly tools: readonly PythonToolBridgeTool[];
  readonly cwd: string | ((execution: HarnessToolExecution) => string);
  readonly environment?: Readonly<Record<string, string>>;
  readonly environmentAllowlist?: readonly string[];
  readonly deadline?: number | ((execution: HarnessToolExecution) => number);
  readonly now?: () => number;
  readonly defaultDeadlineMs?: number;
};

export function createPythonToolBridgeExecutor(options: PythonToolBridgeExecutorOptions): HarnessToolExecutor {
  const tools = new Map(options.tools.map(tool => [tool.name, tool.reference]));
  const now = options.now ?? (() => Date.now());
  const defaultDeadlineMs = options.defaultDeadlineMs ?? 30_000;
  if (!Number.isFinite(defaultDeadlineMs) || defaultDeadlineMs <= 0) {
    throw new TypeError("Python tool bridge default deadline must be positive");
  }
  return async execution => {
    const reference = tools.get(execution.call.name);
    if (reference === undefined) {
      throw new PythonToolBridgeError("tool_not_allowlisted", execution.requestId, execution.call.id);
    }
    const cwd = typeof options.cwd === "function" ? options.cwd(execution) : options.cwd;
    const environment = createAllowlistedEnvironment(options.environment ?? {}, options.environmentAllowlist ?? []);
    const deadline = typeof options.deadline === "function"
      ? options.deadline(execution)
      : options.deadline ?? now() + defaultDeadlineMs;
    return options.bridge.execute({
      requestId: execution.requestId,
      toolCallId: execution.call.id,
      tool: { name: execution.call.name, reference },
      arguments: execution.arguments,
      cwd,
      env: environment,
      deadline
    }, execution.signal);
  };
}
