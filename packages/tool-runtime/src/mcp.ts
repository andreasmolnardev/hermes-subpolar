import { createToolHandle, type JsonSchema, type ToolDefinition, validateJsonSchema } from "tool-resolver";

export type McpJsonRpcRequest = {
  readonly jsonrpc: "2.0";
  readonly id: number;
  readonly method: string;
  readonly params?: unknown;
};

export type McpJsonRpcNotification = {
  readonly jsonrpc: "2.0";
  readonly method: string;
  readonly params?: unknown;
};

export type McpTransport = {
  send(message: McpJsonRpcRequest | McpJsonRpcNotification, signal?: AbortSignal): Promise<unknown>;
  close(): Promise<void> | void;
};

export type McpToolOptions = {
  readonly serverName: string;
  readonly transport: McpTransport;
  readonly policy?: "allow" | "ask" | "auto" | "deny";
  readonly maxMessageBytes?: number;
  readonly maxTools?: number;
  readonly maxToolNameBytes?: number;
  readonly maxDescriptionBytes?: number;
  readonly maxArgumentsBytes?: number;
  readonly maxResultBytes?: number;
  readonly timeoutMs?: number;
};

export type McpRuntimeErrorCategory = "validation" | "authorization" | "cancellation" | "timeout" | "bounds" | "protocol" | "execution";

export class McpRuntimeError extends Error {
  readonly category: McpRuntimeErrorCategory;
  readonly code: string;
  readonly auditCategory: string;

  constructor(category: McpRuntimeErrorCategory, code: string, message: string) {
    super(message);
    this.name = category === "cancellation" ? "AbortError" : "McpRuntimeError";
    this.category = category;
    this.code = code;
    this.auditCategory = `mcp.${category}`;
  }
}

type McpTool = { readonly name: string; readonly description?: string; readonly inputSchema?: JsonSchema };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonBytes(value: unknown, code: string): number {
  let encoded: string | undefined;
  try { encoded = JSON.stringify(value); } catch { throw new McpRuntimeError("validation", code, "MCP message is not valid JSON"); }
  if (encoded === undefined) throw new McpRuntimeError("validation", code, "MCP message is not valid JSON");
  return new TextEncoder().encode(encoded).byteLength;
}

function positiveLimit(value: number | undefined, fallback: number, name: string): number {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result < 1) throw new McpRuntimeError("validation", "INVALID_LIMIT", `${name} must be positive`);
  return result;
}

function toolName(server: string, name: string): string {
  const sanitize = (value: string) => value.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 64);
  const result = `mcp__${sanitize(server)}__${sanitize(name)}`;
  if (result === "mcp____") throw new McpRuntimeError("validation", "INVALID_TOOL_NAME", "MCP tool name is invalid");
  return result;
}

function assertResponse(response: unknown, id: number, maxMessageBytes: number): Record<string, unknown> {
  if (jsonBytes(response, "INVALID_RESPONSE") > maxMessageBytes || !isRecord(response) || response.jsonrpc !== "2.0" || response.id !== id) {
    throw new McpRuntimeError("protocol", "INVALID_RESPONSE", "MCP server returned an invalid JSON-RPC response");
  }
  if (Object.hasOwn(response, "error")) throw new McpRuntimeError("execution", "REMOTE_ERROR", "MCP server returned an error");
  if (!Object.hasOwn(response, "result")) throw new McpRuntimeError("protocol", "INVALID_RESPONSE", "MCP server returned an invalid JSON-RPC response");
  return response;
}

function toolsFromResponse(response: Record<string, unknown>, maxTools: number, maxToolNameBytes: number, maxDescriptionBytes: number): readonly McpTool[] {
  const result = response.result;
  if (!isRecord(result) || !Array.isArray(result.tools) || result.tools.length > maxTools) throw new McpRuntimeError("bounds", "TOOL_LIMIT", "MCP tools/list exceeded the configured limit");
  const tools = result.tools.map(item => {
    if (!isRecord(item) || typeof item.name !== "string" || !item.name || new TextEncoder().encode(item.name).byteLength > maxToolNameBytes) throw new McpRuntimeError("validation", "INVALID_TOOL_METADATA", "MCP tool metadata is invalid");
    if (item.description !== undefined && (typeof item.description !== "string" || new TextEncoder().encode(item.description).byteLength > maxDescriptionBytes)) throw new McpRuntimeError("validation", "INVALID_DESCRIPTION", "MCP tool description is invalid");
    return { name: item.name, ...(typeof item.description === "string" ? { description: item.description } : {}), ...(item.inputSchema !== undefined ? { inputSchema: validateJsonSchema(item.inputSchema, item.name) } : {}) };
  });
  return tools;
}

export async function createMcpToolDefinitions(options: McpToolOptions): Promise<readonly ToolDefinition[]> {
  const maxMessageBytes = positiveLimit(options.maxMessageBytes, 262144, "maxMessageBytes");
  const maxTools = positiveLimit(options.maxTools, 128, "maxTools");
  const maxToolNameBytes = positiveLimit(options.maxToolNameBytes, 256, "maxToolNameBytes");
  const maxDescriptionBytes = positiveLimit(options.maxDescriptionBytes, 8192, "maxDescriptionBytes");
  const maxArgumentsBytes = positiveLimit(options.maxArgumentsBytes, 65536, "maxArgumentsBytes");
  const maxResultBytes = positiveLimit(options.maxResultBytes, 262144, "maxResultBytes");
  const timeoutMs = positiveLimit(options.timeoutMs, 30000, "timeoutMs");
  let nextId = 1;
  const ids = new Set<number>();
  let closed = false;
  const close = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    try { await options.transport.close(); } catch { /* close is best effort after cancellation */ }
  };
  const request = async (method: string, params: unknown, parentSignal?: AbortSignal): Promise<Record<string, unknown>> => {
    if (closed) throw new McpRuntimeError("execution", "TRANSPORT_CLOSED", "MCP transport is closed");
    const id = nextId++;
    if (ids.has(id)) throw new McpRuntimeError("protocol", "DUPLICATE_ID", "MCP JSON-RPC request ID was reused");
    ids.add(id);
    if (parentSignal?.aborted) {
      await close();
      throw new McpRuntimeError("cancellation", "CANCELLED", "MCP request cancelled");
    }
    const message: McpJsonRpcRequest = { jsonrpc: "2.0", id, method, params };
    if (jsonBytes(message, "INVALID_REQUEST") > maxMessageBytes) throw new McpRuntimeError("bounds", "MESSAGE_LIMIT", "MCP request exceeded the configured limit");
    const controller = new AbortController();
    let rejectAbort: ((error: McpRuntimeError) => void) | undefined;
    const abortPromise = new Promise<never>((_, reject) => { rejectAbort = reject; });
    const abort = () => {
      controller.abort();
      void close();
      rejectAbort?.(new McpRuntimeError(parentSignal?.aborted ? "cancellation" : "timeout", parentSignal?.aborted ? "CANCELLED" : "TIMEOUT", parentSignal?.aborted ? "MCP request cancelled" : "MCP request timed out"));
    };
    parentSignal?.addEventListener("abort", abort, { once: true });
    const timeout = () => { controller.abort(); void close(); rejectAbort?.(new McpRuntimeError("timeout", "TIMEOUT", "MCP request timed out")); };
    const timeoutTimer = setTimeout(timeout, timeoutMs);
    try {
      let response: unknown;
      try { response = await Promise.race([options.transport.send(message, controller.signal), abortPromise]); }
      catch (error) {
        if (parentSignal?.aborted) throw new McpRuntimeError("cancellation", "CANCELLED", "MCP request cancelled");
        if (controller.signal.aborted) throw new McpRuntimeError("timeout", "TIMEOUT", "MCP request timed out");
        throw new McpRuntimeError("execution", "TRANSPORT_FAILED", "MCP transport request failed");
      }
      if (controller.signal.aborted) throw new McpRuntimeError(parentSignal?.aborted ? "cancellation" : "timeout", parentSignal?.aborted ? "CANCELLED" : "TIMEOUT", parentSignal?.aborted ? "MCP request cancelled" : "MCP request timed out");
      return assertResponse(response, id, maxMessageBytes);
    } finally {
      clearTimeout(timeoutTimer);
      parentSignal?.removeEventListener("abort", abort);
    }
  };
  const notify = async (message: McpJsonRpcNotification): Promise<void> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => { controller.abort(); void close(); }, timeoutMs);
    let rejectTimeout: ((error: McpRuntimeError) => void) | undefined;
    const timeoutRejection = new Promise<never>((_, reject) => { rejectTimeout = reject; });
    const timeoutRejectionTimer = setTimeout(() => rejectTimeout?.(new McpRuntimeError("timeout", "TIMEOUT", "MCP notification timed out")), timeoutMs);
    try {
      await Promise.race([
        options.transport.send(message, controller.signal),
        timeoutRejection
      ]);
    } catch (error) {
      if (error instanceof McpRuntimeError) throw error;
      throw new McpRuntimeError("execution", "TRANSPORT_FAILED", "MCP transport notification failed");
    } finally { clearTimeout(timeout); clearTimeout(timeoutRejectionTimer); }
  };

  let initialized: Record<string, unknown>;
  try {
    initialized = await request("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "hermes-tool-runtime", version: "1" } });
    if (!isRecord(initialized.result) || typeof initialized.result.protocolVersion !== "string") throw new McpRuntimeError("protocol", "INVALID_INIT", "MCP initialize response is invalid");
    const initializedNotification: McpJsonRpcNotification = { jsonrpc: "2.0", method: "notifications/initialized" };
    if (jsonBytes(initializedNotification, "INVALID_REQUEST") > maxMessageBytes) throw new McpRuntimeError("bounds", "MESSAGE_LIMIT", "MCP notification exceeded the configured limit");
    await notify(initializedNotification);
    const listed = await request("tools/list", {});
    const tools = toolsFromResponse(listed, maxTools, maxToolNameBytes, maxDescriptionBytes);
    const names = new Set<string>();
    return tools.map(tool => {
      const name = toolName(options.serverName, tool.name);
      if (names.has(name)) throw new McpRuntimeError("validation", "TOOL_COLLISION", `MCP tool name collision: ${name}`);
      names.add(name);
      return {
        name,
        description: tool.description ?? `MCP tool ${tool.name}`,
        inputSchema: tool.inputSchema ?? { type: "object", properties: {} },
        source: `tool-runtime:mcp:${options.serverName}`,
        capabilities: ["mcp"],
        executable: { handle: createToolHandle(async (argumentsValue, signal) => {
          if (!isRecord(argumentsValue)) throw new McpRuntimeError("validation", "INVALID_ARGUMENTS", "MCP tool arguments must be an object");
          if (jsonBytes(argumentsValue, "INVALID_ARGUMENTS") > maxArgumentsBytes) throw new McpRuntimeError("bounds", "ARGUMENT_LIMIT", "MCP tool arguments exceed the configured limit");
          const response = await request("tools/call", { name: tool.name, arguments: argumentsValue }, signal instanceof AbortSignal ? signal : undefined);
          const result = response.result;
          if (jsonBytes(result, "INVALID_RESULT") > maxResultBytes) throw new McpRuntimeError("bounds", "RESULT_LIMIT", "MCP tool result exceeds the configured limit");
          return result;
        }) },
        policy: options.policy ?? "ask"
      };
    });
  } catch (error) {
    await close();
    if (error instanceof McpRuntimeError) throw error;
    throw new McpRuntimeError("protocol", "INITIALIZATION_FAILED", "MCP initialization failed");
  }
}
