import type {
  ProviderContent,
  ProviderMessage,
  ProviderModelOptions,
  ProviderResult,
  ProviderStreamEvent,
  ProviderTool,
  ProviderCacheHints,
  ProviderMetadata,
  ProviderRequestIdentity
} from "chat-provider-interface";
import { validateProviderRequest, validateProviderResult, validateProviderStreamEvent } from "chat-provider-interface";
import { validateSessionCwd } from "./session-cwd";

export const PYTHON_RUNTIME_BRIDGE_PROTOCOL_VERSION = 1;

export type PythonRuntimeJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly PythonRuntimeJsonValue[]
  | { readonly [key: string]: PythonRuntimeJsonValue };

export type PythonRuntimeBridgeMessage = ProviderMessage;

export type PythonRuntimeBridgeTool = {
  readonly name: string;
  readonly description?: string;
  readonly inputSchema?: boolean | { readonly [key: string]: PythonRuntimeJsonValue };
  readonly source?: string;
  readonly capabilities?: PythonRuntimeJsonValue;
  readonly executable?: { readonly reference: string };
};

export type PythonRuntimeBridgePolicy = {
  readonly toolName: string;
  readonly policy: "allow" | "ask" | "auto" | "deny";
};

export type PythonRuntimeBridgeCancellation = {
  readonly requested: boolean;
  readonly reason?: "caller" | "deadline";
};

export type PythonRuntimeBridgeRequest = {
  readonly protocolVersion: typeof PYTHON_RUNTIME_BRIDGE_PROTOCOL_VERSION;
  readonly type: "runtime.turn";
  readonly requestId: string;
  readonly sessionId: string;
  readonly model: string;
  readonly messages: readonly PythonRuntimeBridgeMessage[];
  readonly tools: readonly PythonRuntimeBridgeTool[];
  readonly policies: readonly PythonRuntimeBridgePolicy[];
  readonly cwd: string;
  /** Only explicitly allowlisted values are included. */
  readonly environment: Readonly<Record<string, string>>;
  /** Opaque references understood by the Python runtime, never secret values. */
  readonly credentialHandles: readonly string[];
  /** Unix epoch milliseconds. */
  readonly deadline: number;
  readonly cancellation: PythonRuntimeBridgeCancellation;
  readonly identity?: ProviderRequestIdentity;
  readonly options?: ProviderModelOptions;
  readonly cacheHints?: ProviderCacheHints;
  readonly metadata?: ProviderMetadata;
};

export type PythonRuntimeBridgeEvent = {
  readonly protocolVersion: typeof PYTHON_RUNTIME_BRIDGE_PROTOCOL_VERSION;
  readonly type: "runtime.event";
  readonly requestId: string;
  readonly sessionId: string;
  readonly event:
    | { readonly type: "started" }
    | { readonly type: "text.delta"; readonly text: string }
    | { readonly type: "reasoning.delta"; readonly text: string }
    | { readonly type: "tool-call.delta"; readonly id?: string; readonly name?: string; readonly arguments?: string }
    | { readonly type: "tool-call"; readonly id: string; readonly name: string; readonly arguments: string }
    | { readonly type: "tool-result"; readonly toolCallId: string; readonly content: ProviderContent; readonly isError?: boolean }
     | { readonly type: "usage"; readonly usage: ProviderResult["usage"]; readonly metadata?: ProviderResult["metadata"] }
     | {
       readonly type: "finished";
       readonly usage?: ProviderResult["usage"];
       readonly finishReason?: ProviderResult["finishReason"];
       readonly metadata?: ProviderResult["metadata"];
       readonly requestId?: string;
     }
    | { readonly type: "failed"; readonly category?: string };
};

export type PythonRuntimeBridgeSuccess = {
  readonly protocolVersion: typeof PYTHON_RUNTIME_BRIDGE_PROTOCOL_VERSION;
  readonly type: "runtime.result";
  readonly requestId: string;
  readonly sessionId: string;
  readonly result: ProviderResult;
};

export type PythonRuntimeBridgeFailure = {
  readonly protocolVersion: typeof PYTHON_RUNTIME_BRIDGE_PROTOCOL_VERSION;
  readonly type: "error";
  readonly requestId: string;
  readonly sessionId: string;
  readonly error: {
    readonly code: string;
    /** This is for worker logs only and is never exposed by the adapter. */
    readonly message?: string;
    readonly retryable?: boolean;
  };
};

export type PythonRuntimeBridgeResponse = PythonRuntimeBridgeSuccess | PythonRuntimeBridgeFailure;

export type PythonRuntimeBridgeTransport = {
  send(
    request: PythonRuntimeBridgeRequest,
    options: {
      readonly signal: AbortSignal;
      readonly onEvent?: (event: PythonRuntimeBridgeEvent) => void | Promise<void>;
    }
  ): Promise<unknown>;
};

export type PythonRuntimeBridgeErrorCode =
  | "cancelled"
  | "deadline_exceeded"
  | "invalid_response"
  | "protocol_mismatch"
  | "transport_error"
  | "worker_error";

export class PythonRuntimeBridgeError extends Error {
  readonly code: PythonRuntimeBridgeErrorCode;
  readonly requestId: string;
  readonly sessionId: string;

  constructor(code: PythonRuntimeBridgeErrorCode, requestId: string, sessionId: string) {
    super(`Python runtime bridge ${code}`);
    this.name = "PythonRuntimeBridgeError";
    this.code = code;
    this.requestId = requestId;
    this.sessionId = sessionId;
  }
}

export type PythonRuntimeBridgeCall = Omit<PythonRuntimeBridgeRequest, "protocolVersion" | "type">;

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isJsonValue(value: unknown, active = new Set<object>()): value is PythonRuntimeJsonValue {
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

function isSafeIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256 && !/[\r\n\u0000]/.test(value);
}

function isEnvironmentName(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

function isProviderResult(value: unknown): value is ProviderResult {
  if (!isRecord(value) || !isRecord(value.message) || !isRecord(value.usage)) return false;
  try {
    validateProviderResult(value as ProviderResult);
    return true;
  } catch {
    return false;
  }
}

function isRuntimeEvent(value: unknown): value is PythonRuntimeBridgeEvent {
  if (!isRecord(value) || value.protocolVersion !== PYTHON_RUNTIME_BRIDGE_PROTOCOL_VERSION ||
    value.type !== "runtime.event" || !isSafeIdentifier(value.requestId) || !isSafeIdentifier(value.sessionId) ||
    !isRecord(value.event) || typeof value.event.type !== "string") return false;
  const event = value.event as PythonRuntimeBridgeEvent["event"];
  if (event.type === "started" || event.type === "failed") {
    return event.type !== "failed" || event.category === undefined || typeof event.category === "string";
  }
  if (event.type === "text.delta" || event.type === "reasoning.delta") return typeof event.text === "string";
  if (event.type === "tool-call.delta") {
    return (event.id === undefined || isSafeIdentifier(event.id)) &&
      (event.name === undefined || isSafeIdentifier(event.name)) &&
      (event.arguments === undefined || typeof event.arguments === "string");
  }
  if (event.type === "tool-call") {
    return isSafeIdentifier(event.id) && isSafeIdentifier(event.name) && typeof event.arguments === "string";
  }
  if (event.type === "tool-result") {
    try {
      validateProviderStreamEvent(event as ProviderStreamEvent);
      return isSafeIdentifier(event.toolCallId);
    } catch {
      return false;
    }
  }
  if (event.type === "usage") {
    if (event.metadata !== undefined && !isJsonValue(event.metadata)) return false;
    try {
      validateProviderStreamEvent(event as ProviderStreamEvent);
      return true;
    } catch {
      return false;
    }
  }
  if (event.type === "finished") {
    if (event.requestId !== undefined && !isSafeIdentifier(event.requestId)) return false;
    if (event.finishReason !== undefined && typeof event.finishReason !== "string") return false;
    if (event.metadata !== undefined && !isJsonValue(event.metadata)) return false;
    if (event.usage === undefined) return true;
    try {
      validateProviderStreamEvent({ type: "finish", finishReason: "stop", usage: event.usage });
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

function isRuntimeResponse(value: unknown): value is PythonRuntimeBridgeResponse {
  if (!isRecord(value) || value.protocolVersion !== PYTHON_RUNTIME_BRIDGE_PROTOCOL_VERSION ||
    !isSafeIdentifier(value.requestId) || !isSafeIdentifier(value.sessionId) || typeof value.type !== "string") {
    return false;
  }
  if (value.type === "runtime.result") return isProviderResult(value.result);
  return value.type === "error" && isRecord(value.error) && isSafeIdentifier(value.error.code) &&
    (value.error.message === undefined || typeof value.error.message === "string") &&
    (value.error.retryable === undefined || typeof value.error.retryable === "boolean");
}

function validateCall(call: PythonRuntimeBridgeCall): void {
  if (!isSafeIdentifier(call.requestId) || !isSafeIdentifier(call.sessionId) ||
    typeof call.model !== "string" || call.model.trim().length === 0 || !Array.isArray(call.messages) ||
    !Array.isArray(call.tools) || !Array.isArray(call.policies) || !isSafeIdentifier(call.cwd) ||
    !Number.isFinite(call.deadline) || !isRecord(call.environment) || !Array.isArray(call.credentialHandles) ||
    !isRecord(call.cancellation) || call.cancellation.requested !== false ||
    !isJsonValue(call.messages) || !isJsonValue(call.tools) || !isJsonValue(call.policies) ||
    !isJsonValue(call.environment) || !isJsonValue(call.credentialHandles)) {
    throw new TypeError("Python runtime bridge request is invalid");
  }
  try {
    validateSessionCwd(call.cwd);
  } catch {
    throw new TypeError("Python runtime bridge cwd is invalid");
  }
  for (const [name, value] of Object.entries(call.environment)) {
    if (!isEnvironmentName(name) || typeof value !== "string" || value.includes("\u0000")) {
      throw new TypeError("Python runtime bridge environment is invalid");
    }
  }
  for (const handle of call.credentialHandles) {
    if (!isSafeIdentifier(handle)) throw new TypeError("Python runtime bridge credential handle is invalid");
  }
  for (const tool of call.tools) {
    if (!isRecord(tool) || !isSafeIdentifier(tool.name) ||
      (tool.description !== undefined && typeof tool.description !== "string") ||
      (tool.inputSchema !== undefined && !isJsonValue(tool.inputSchema)) ||
      (tool.source !== undefined && !isSafeIdentifier(tool.source)) ||
      (tool.capabilities !== undefined && !isJsonValue(tool.capabilities)) ||
      (tool.executable !== undefined && (!isRecord(tool.executable) || !isSafeIdentifier(tool.executable.reference)))) {
      throw new TypeError("Python runtime bridge tool is invalid");
    }
  }
  for (const policy of call.policies) {
    if (!isRecord(policy) || !isSafeIdentifier(policy.toolName) || typeof policy.policy !== "string" ||
      !["allow", "ask", "auto", "deny"].includes(policy.policy)) {
      throw new TypeError("Python runtime bridge policy is invalid");
    }
  }
  try {
    validateProviderRequest({
      model: call.model,
      messages: call.messages,
      tools: [],
      requestId: call.requestId,
      ...(call.identity === undefined ? {} : { identity: call.identity }),
      ...(call.options === undefined ? {} : { options: call.options }),
      ...(call.cacheHints === undefined ? {} : { cacheHints: call.cacheHints }),
      ...(call.metadata === undefined ? {} : { metadata: call.metadata })
    });
  } catch {
    throw new TypeError("Python runtime bridge request content is invalid");
  }
}

function errorFromResponse(
  response: PythonRuntimeBridgeFailure,
  request: PythonRuntimeBridgeRequest
): PythonRuntimeBridgeError {
  const known = new Set<PythonRuntimeBridgeErrorCode>([
    "cancelled", "deadline_exceeded", "invalid_response", "protocol_mismatch", "transport_error", "worker_error"
  ]);
  const code = known.has(response.error.code as PythonRuntimeBridgeErrorCode)
    ? response.error.code as PythonRuntimeBridgeErrorCode
    : "worker_error";
  return new PythonRuntimeBridgeError(code, request.requestId, request.sessionId);
}

function errorFromAbort(request: PythonRuntimeBridgeRequest): PythonRuntimeBridgeError {
  return new PythonRuntimeBridgeError(
    request.deadline <= Date.now() ? "deadline_exceeded" : "cancelled",
    request.requestId,
    request.sessionId
  );
}

export class PythonRuntimeBridge {
  constructor(private readonly transport: PythonRuntimeBridgeTransport) {}

  async execute(
    call: PythonRuntimeBridgeCall,
    signal?: AbortSignal,
    onEvent?: (event: PythonRuntimeBridgeEvent) => void | Promise<void>
  ): Promise<ProviderResult> {
    validateCall(call);
    const request: PythonRuntimeBridgeRequest = {
      protocolVersion: PYTHON_RUNTIME_BRIDGE_PROTOCOL_VERSION,
      type: "runtime.turn",
      ...call
    };
    if (signal?.aborted === true) throw errorFromAbort(request);

    const controller = new AbortController();
    const abortFromParent = () => controller.abort();
    signal?.addEventListener("abort", abortFromParent, { once: true });
    const delay = request.deadline - Date.now();
    const deadlineTimer = delay > 0 ? setTimeout(() => controller.abort(), delay) : undefined;
    if (delay <= 0) controller.abort();
    let onAbort: (() => void) | undefined;
    try {
      if (controller.signal.aborted) throw errorFromAbort(request);
      const aborted = new Promise<never>((_, reject) => {
        const handler = () => reject(errorFromAbort(request));
        onAbort = handler;
        controller.signal.addEventListener("abort", handler, { once: true });
      });
      const receiveEvent = async (event: PythonRuntimeBridgeEvent): Promise<void> => {
        if (!isRuntimeEvent(event) || event.requestId !== request.requestId || event.sessionId !== request.sessionId) {
          throw new PythonRuntimeBridgeError("invalid_response", request.requestId, request.sessionId);
        }
        await onEvent?.(event);
      };
      const response = await Promise.race([
        this.transport.send(request, {
          signal: controller.signal,
          onEvent: receiveEvent
        }),
        aborted
      ]);
      const responses = Array.isArray(response) ? response : [response];
      let terminal: PythonRuntimeBridgeResponse | undefined;
      for (const item of responses) {
        if (isRuntimeEvent(item)) {
          if (item.requestId !== request.requestId || item.sessionId !== request.sessionId) {
            throw new PythonRuntimeBridgeError("invalid_response", request.requestId, request.sessionId);
          }
          await onEvent?.(item);
          continue;
        }
        if (!isRuntimeResponse(item)) {
          throw new PythonRuntimeBridgeError("protocol_mismatch", request.requestId, request.sessionId);
        }
        if (terminal !== undefined || item.requestId !== request.requestId || item.sessionId !== request.sessionId) {
          throw new PythonRuntimeBridgeError("invalid_response", request.requestId, request.sessionId);
        }
        terminal = item;
      }
      if (terminal === undefined) throw new PythonRuntimeBridgeError("invalid_response", request.requestId, request.sessionId);
      if (terminal.type === "error") throw errorFromResponse(terminal, request);
      return terminal.result;
    } catch (error) {
      if (controller.signal.aborted) throw errorFromAbort(request);
      if (error instanceof PythonRuntimeBridgeError) throw error;
      throw new PythonRuntimeBridgeError("transport_error", request.requestId, request.sessionId);
    } finally {
      if (onAbort !== undefined) controller.signal.removeEventListener("abort", onAbort);
      if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
      signal?.removeEventListener("abort", abortFromParent);
    }
  }
}

export type PythonRuntimeBridgeProcess = {
  readonly stdin: {
    write(chunk: string): number | Promise<number>;
    end?(): void | Promise<void>;
  };
  readonly stdout: AsyncIterable<string | Uint8Array>;
  kill(): void;
};

export type PythonRuntimeBridgeSpawnOptions = {
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
};

export type PythonRuntimeBridgeSpawner = (
  command: readonly string[],
  options: PythonRuntimeBridgeSpawnOptions
) => PythonRuntimeBridgeProcess;

export function createPythonRuntimeBridgeSubprocessTransport(
  spawn: PythonRuntimeBridgeSpawner,
  command: readonly string[]
): PythonRuntimeBridgeTransport {
  if (command.length === 0 || command.some(part => typeof part !== "string" || part.length === 0)) {
    throw new TypeError("Python runtime bridge command must be a non-empty argument list");
  }
  return {
    async send(request, { signal, onEvent }) {
      let process: PythonRuntimeBridgeProcess;
      try {
        process = spawn(command, { cwd: request.cwd, env: request.environment });
      } catch {
        throw new PythonRuntimeBridgeError("transport_error", request.requestId, request.sessionId);
      }
      let stopped = false;
      const stop = () => {
        if (stopped) return;
        stopped = true;
        process.kill();
      };
      if (signal.aborted) {
        stop();
        throw new PythonRuntimeBridgeError("cancelled", request.requestId, request.sessionId);
      }
      signal.addEventListener("abort", stop, { once: true });
      try {
        const awaitWithAbort = async <T>(operation: () => T | Promise<T>): Promise<T> => {
          let onAbort: (() => void) | undefined;
          const abort = new Promise<never>((_, reject) => {
            const handler = () => reject(new PythonRuntimeBridgeError("cancelled", request.requestId, request.sessionId));
            onAbort = handler;
            signal.addEventListener("abort", handler, { once: true });
          });
          try {
            return await Promise.race([Promise.resolve().then(operation), abort]);
          } finally {
            if (onAbort !== undefined) signal.removeEventListener("abort", onAbort);
          }
        };
        await awaitWithAbort(() => process.stdin.write(`${JSON.stringify(request)}\n`));
        if (process.stdin.end !== undefined) await awaitWithAbort(() => process.stdin.end!());
        const iterator = process.stdout[Symbol.asyncIterator]();
        const decoder = new TextDecoder();
        let buffer = "";
        let terminal: unknown;
        while (true) {
          let onAbort: (() => void) | undefined;
          const abort = new Promise<never>((_, reject) => {
            const handler = () => reject(new PythonRuntimeBridgeError("cancelled", request.requestId, request.sessionId));
            onAbort = handler;
            signal.addEventListener("abort", handler, { once: true });
          });
          let item: IteratorResult<string | Uint8Array>;
          try {
            item = await Promise.race([iterator.next(), abort]);
          } finally {
            if (onAbort !== undefined) signal.removeEventListener("abort", onAbort);
          }
          if (item.done) {
            buffer += decoder.decode();
            if (buffer.length !== 0) throw new PythonRuntimeBridgeError("invalid_response", request.requestId, request.sessionId);
            break;
          }
          buffer += typeof item.value === "string" ? item.value : decoder.decode(item.value, { stream: true });
          while (true) {
            const newline = buffer.indexOf("\n");
            if (newline < 0) break;
            const line = buffer.slice(0, newline);
            buffer = buffer.slice(newline + 1);
            if (line.trim().length === 0) throw new PythonRuntimeBridgeError("invalid_response", request.requestId, request.sessionId);
            let value: unknown;
            try {
              value = JSON.parse(line) as unknown;
            } catch {
              throw new PythonRuntimeBridgeError("invalid_response", request.requestId, request.sessionId);
            }
            if (isRuntimeEvent(value)) {
              if (terminal !== undefined) {
                throw new PythonRuntimeBridgeError("invalid_response", request.requestId, request.sessionId);
              }
              await onEvent?.(value);
            } else {
              if (terminal !== undefined) throw new PythonRuntimeBridgeError("invalid_response", request.requestId, request.sessionId);
              terminal = value;
            }
          }
        }
        if (terminal === undefined) throw new PythonRuntimeBridgeError("transport_error", request.requestId, request.sessionId);
        return terminal;
      } catch (error) {
        if (error instanceof PythonRuntimeBridgeError) throw error;
        if (signal.aborted) throw new PythonRuntimeBridgeError("cancelled", request.requestId, request.sessionId);
        throw new PythonRuntimeBridgeError("transport_error", request.requestId, request.sessionId);
      } finally {
        signal.removeEventListener("abort", stop);
        stop();
      }
    }
  };
}

export function createPythonRuntimeAllowlistedEnvironment(
  source: Readonly<Record<string, string>>,
  allowlist: readonly string[]
): Readonly<Record<string, string>> {
  if (allowlist.some(name => !isEnvironmentName(name))) {
    throw new TypeError("Python runtime bridge environment allowlist is invalid");
  }
  const result: Record<string, string> = {};
  for (const name of new Set(allowlist)) {
    const value = source[name];
    if (value !== undefined) {
      if (typeof value !== "string" || value.includes("\u0000")) {
        throw new TypeError("Python runtime bridge environment is invalid");
      }
      Object.defineProperty(result, name, { value, enumerable: true, writable: false, configurable: false });
    }
  }
  return Object.freeze(result);
}
