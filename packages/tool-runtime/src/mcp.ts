import { createToolHandle, type JsonSchema, type ToolDefinition, validateJsonSchema } from "tool-resolver";

export type McpTransport = {
  request(method: string, params: unknown, signal?: AbortSignal): Promise<unknown>;
  close?: () => void | Promise<void>;
};

export type McpToolOptions = {
  readonly serverName: string;
  readonly transport: McpTransport;
  readonly policy?: "allow" | "ask" | "auto" | "deny";
  /** MCP has no universal trustworthy mutability flag; callers may attest a read-only server/tool set. */
  readonly mutating?: boolean;
  readonly maxMessageBytes?: number;
  readonly signal?: AbortSignal;
};

type McpTool = { readonly name: string; readonly description?: string; readonly inputSchema?: JsonSchema };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function toolName(server: string, name: string): string {
  const sanitize = (value: string) => value.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 64);
  const result = `mcp__${sanitize(server)}__${sanitize(name)}`;
  if (result === "mcp____") throw new TypeError("MCP tool name is invalid");
  return result;
}

function isJsonValue(value: unknown, seen = new Set<object>()): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.every(item => isJsonValue(item, seen));
  if (!isRecord(value)) return false;
  return Object.entries(value).every(([key, item]) => key.length > 0 && isJsonValue(item, seen));
}

function assertMessage(value: unknown, maxBytes: number): void {
  if (!isJsonValue(value)) throw new Error("MCP message is invalid");
  let encoded: string;
  try { encoded = JSON.stringify(value); } catch { throw new Error("MCP message is invalid"); }
  if (new TextEncoder().encode(encoded).byteLength > maxBytes) throw new Error("MCP message exceeds the configured limit");
}

function abortError(): DOMException {
  return new DOMException("MCP request cancelled", "AbortError");
}

async function requestRpc(
  transport: McpTransport,
  method: string,
  params: Record<string, unknown>,
  id: number,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<unknown> {
  const request = { jsonrpc: "2.0", id, method, params };
  assertMessage(request, maxBytes);
  if (signal?.aborted) {
    try { void transport.close?.(); } catch { /* close is best effort */ }
    throw abortError();
  }
  let abort: (() => void) | undefined;
  const cancellation = new Promise<never>((_, reject) => {
    abort = () => {
      try { void transport.close?.(); } catch { /* close is best effort */ }
      reject(abortError());
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
  try {
    const response = await Promise.race([transport.request(method, params, signal), cancellation]);
    assertMessage(response, maxBytes);
    if (isRecord(response) && ("jsonrpc" in response || "id" in response || "result" in response || "error" in response)) {
      if (response.jsonrpc !== "2.0" || response.id !== id || !("result" in response) || "error" in response) {
        throw new Error("MCP response is invalid");
      }
      return response.result;
    }
    return response;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new Error("MCP request failed");
  } finally {
    if (abort !== undefined) signal?.removeEventListener("abort", abort);
  }
}

function toolsFromResponse(response: unknown, maxBytes: number): readonly McpTool[] {
  assertMessage(response, maxBytes);
  if (!isRecord(response) || !Array.isArray(response.tools) || response.tools.length > 1024) throw new Error("MCP tools/list response is invalid");
  return response.tools.map(item => {
    if (!isRecord(item) || typeof item.name !== "string" || item.name.length === 0 || item.name.length > 128) {
      throw new Error("MCP tool metadata is invalid");
    }
    if (item.description !== undefined && (typeof item.description !== "string" || item.description.length > 4096)) {
      throw new Error("MCP tool metadata is invalid");
    }
    let inputSchema: JsonSchema | undefined;
    if (item.inputSchema !== undefined) {
      if (!isRecord(item.inputSchema) || item.inputSchema.type !== "object") throw new Error("MCP tool schema is invalid");
      inputSchema = validateJsonSchema(item.inputSchema, "MCP tool");
    }
    return { name: item.name, ...(typeof item.description === "string" ? { description: item.description } : {}),
      ...(inputSchema === undefined ? {} : { inputSchema }) };
  });
}

export async function createMcpToolDefinitions(options: McpToolOptions): Promise<readonly ToolDefinition[]> {
  const maxBytes = options.maxMessageBytes ?? 65536;
  if (!Number.isInteger(maxBytes) || maxBytes < 1) throw new TypeError("maxMessageBytes must be positive");
  let nextId = 1;
  const list = await requestRpc(options.transport, "tools/list", {}, nextId++, maxBytes, options.signal);
  const tools = toolsFromResponse(list, maxBytes);
  const names = new Set<string>();
  return tools.map(tool => {
    const name = toolName(options.serverName, tool.name);
    if (names.has(name)) throw new TypeError("MCP tool name collision");
    names.add(name);
    return {
      name,
      capabilityId: `mcp:${options.serverName}:${tool.name}`,
      description: tool.description ?? `MCP tool ${tool.name}`,
      inputSchema: tool.inputSchema ?? { type: "object", properties: {} },
      source: `tool-runtime:mcp:${options.serverName}`,
      capabilities: { mcp: true, mutating: options.mutating ?? true },
      executable: { handle: createToolHandle(async (argumentsValue, signal) => {
        if (!isRecord(argumentsValue)) throw new TypeError("MCP tool arguments must be an object");
        assertMessage(argumentsValue, maxBytes);
        const result = await requestRpc(
          options.transport,
          "tools/call",
          { name: tool.name, arguments: argumentsValue },
          nextId++,
          maxBytes,
          signal instanceof AbortSignal ? signal : undefined,
        );
        assertMessage(result, maxBytes);
        if (!isRecord(result) || !Array.isArray(result.content)) throw new Error("MCP tool response is invalid");
        return result;
      }) },
      policy: options.policy ?? "ask"
    };
  });
}
