import { createToolHandle, type JsonSchema, type ToolDefinition, validateJsonSchema } from "tool-resolver";

export const MCP_MODERN_PROTOCOL_VERSION = "2026-07-28";
export type McpProtocol = "modern" | "legacy";

/** The client owns correlation IDs. Transports only frame this exact request. */
export type McpWireRequest = {
  readonly id: string | number;
  readonly method: string;
  readonly params?: unknown;
  readonly protocol: McpProtocol;
  readonly name?: string;
};

export type McpTransport = {
  request(request: McpWireRequest, signal?: AbortSignal): Promise<unknown>;
  notify?(request: Omit<McpWireRequest, "id">): Promise<void>;
  close?: () => void | Promise<void>;
};

export type McpHttpTransportOptions = {
  readonly endpoint: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly fetch?: typeof fetch;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function validateEndpoint(value: string, label: string): URL {
  const endpoint = new URL(value);
  if (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(endpoint.hostname))) {
    throw new TypeError(`${label} must use HTTPS`);
  }
  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new TypeError(`${label} must not contain credentials or query state`);
  return endpoint;
}

function validateHeaders(headers: Readonly<Record<string, string>> | undefined, label: string): void {
  for (const [name, value] of Object.entries(headers ?? {})) {
    if (!name || /[\r\n]/.test(name) || /[\r\n]/.test(value)) throw new TypeError(`${label} are invalid`);
  }
}

function responseData(response: Response, text: string): unknown {
  if (text.trim().length === 0) return {};
  if (response.headers.get("content-type")?.includes("text/event-stream")) {
    const data = text.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trim()).filter(Boolean).at(-1);
    if (data === undefined) throw new Error("MCP stream response is invalid");
    return JSON.parse(data) as unknown;
  }
  return JSON.parse(text) as unknown;
}

/** Streamable HTTP. Legacy sessions are retained only after legacy negotiation. */
export function createMcpHttpTransport(options: McpHttpTransportOptions): McpTransport {
  const endpoint = validateEndpoint(options.endpoint, "MCP HTTP endpoint");
  validateHeaders(options.headers, "MCP headers");
  let legacySessionId: string | undefined;
  const send = async (request: McpWireRequest, signal?: AbortSignal): Promise<unknown> => {
    const modern = request.protocol === "modern";
    const headers: Record<string, string> = {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      ...options.headers,
      ...(modern ? {
        "mcp-protocol-version": MCP_MODERN_PROTOCOL_VERSION,
        "mcp-method": request.method,
        ...(request.name === undefined ? {} : { "mcp-name": request.name }),
      } : legacySessionId === undefined ? {} : { "mcp-session-id": legacySessionId }),
    };
    const body = { jsonrpc: "2.0", id: request.id, method: request.method, params: request.params ?? {} };
    const response = await (options.fetch ?? fetch)(endpoint, {
      method: "POST", headers, body: JSON.stringify(body), redirect: "error",
      ...(signal === undefined ? {} : { signal }),
    });
    if (response.redirected) throw new Error("MCP HTTP redirects are not allowed");
    if (!response.ok) throw new Error(`MCP HTTP request failed (${response.status})`);
    if (!modern) legacySessionId = response.headers.get("mcp-session-id") ?? legacySessionId;
    return responseData(response, await response.text());
  };
  return {
    request: send,
    async notify(request) {
      const modern = request.protocol === "modern";
      const headers: Record<string, string> = {
        accept: "application/json, text/event-stream", "content-type": "application/json", ...options.headers,
        ...(modern ? {
          "mcp-protocol-version": MCP_MODERN_PROTOCOL_VERSION,
          "mcp-method": request.method,
          ...(request.name === undefined ? {} : { "mcp-name": request.name }),
        } : legacySessionId === undefined ? {} : { "mcp-session-id": legacySessionId }),
      };
      const response = await (options.fetch ?? fetch)(endpoint, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", method: request.method, params: request.params ?? {} }), redirect: "error" });
      if (response.redirected) throw new Error("MCP HTTP redirects are not allowed");
      if (!response.ok) throw new Error(`MCP HTTP notification failed (${response.status})`);
      if (!modern) legacySessionId = response.headers.get("mcp-session-id") ?? legacySessionId;
    },
  };
}

export type McpStdioTransportOptions = {
  readonly command: string;
  readonly args?: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
  readonly spawn?: (command: string, options: McpStdioSpawnOptions) => McpStdioProcess;
};

export type McpStdioSpawnOptions = {
  readonly stdin: "pipe";
  readonly stdout: "pipe";
  readonly stderr: "ignore";
  readonly env: Readonly<Record<string, string | undefined>>;
};

type McpStdioProcess = {
  readonly stdin: { write(chunk: Uint8Array): number | Promise<unknown> };
  readonly stdout: ReadableStream<Uint8Array>;
  kill(): unknown;
};

/** MCP stdio framing. IDs remain owned by the caller, including across calls. */
export function createMcpStdioTransport(options: McpStdioTransportOptions): McpTransport {
  if (!options.command.trim() || /[\r\n]/.test(options.command)) throw new TypeError("MCP command is invalid");
  const child = (options.spawn ?? ((command, spawnOptions) => Bun.spawn([command, ...(options.args ?? [])], spawnOptions as never) as unknown as McpStdioProcess))(options.command, {
    stdin: "pipe", stdout: "pipe", stderr: "ignore", env: { ...globalThis.process?.env, ...options.env },
  });
  const reader = child.stdout.getReader();
  const writer = child.stdin;
  let buffer = new Uint8Array();
  const pending = new Map<string | number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  let reading = false;
  let closed = false;
  const append = (chunk: Uint8Array) => { const next = new Uint8Array(buffer.length + chunk.length); next.set(buffer); next.set(chunk, buffer.length); buffer = next; };
  const take = (): unknown | undefined => {
    const text = new TextDecoder().decode(buffer);
    const separator = text.indexOf("\r\n\r\n");
    if (separator < 0 && /^content-length\s*:/i.test(text)) return undefined;
    if (separator >= 0 && text.slice(0, separator).toLowerCase().includes("content-length:")) {
      const length = Number(/content-length:\s*(\d+)/i.exec(text.slice(0, separator))?.[1]);
      const start = separator + 4;
      const encoded = new TextEncoder().encode(text.slice(start));
      if (!Number.isFinite(length) || encoded.length < length) return undefined;
      const payload = new TextDecoder().decode(encoded.slice(0, length));
      buffer = encoded.slice(length);
      return JSON.parse(payload) as unknown;
    }
    const newline = text.indexOf("\n");
    if (newline < 0) return undefined;
    const payload = text.slice(0, newline).trim();
    buffer = new TextEncoder().encode(text.slice(newline + 1));
    return payload.length === 0 ? take() : JSON.parse(payload) as unknown;
  };
  const rejectAll = (error: Error) => { for (const item of pending.values()) item.reject(error); pending.clear(); };
  const readLoop = async (): Promise<void> => {
    if (reading || closed) return;
    reading = true;
    try {
      while (!closed) {
        const next = take();
        if (next !== undefined) {
          if (isRecord(next) && (typeof next.id === "number" || typeof next.id === "string")) pending.get(next.id)?.resolve(next);
          continue;
        }
        const chunk = await reader.read();
        if (chunk.done) throw new Error("MCP stdio server disconnected");
        append(chunk.value);
      }
    } catch (error) { rejectAll(error instanceof Error ? error : new Error("MCP stdio request failed")); }
    finally { reading = false; }
  };
  const write = async (payload: Record<string, unknown>): Promise<void> => {
    if (closed) throw new Error("MCP stdio transport is closed");
    const text = JSON.stringify(payload);
    const bytes = new TextEncoder().encode(text);
    await writer.write(new TextEncoder().encode(`Content-Length: ${bytes.length}\r\n\r\n${text}`));
  };
  return {
    async request(request, signal) {
      if (signal?.aborted) throw new DOMException("MCP request cancelled", "AbortError");
      const result = new Promise<unknown>((resolve, reject) => pending.set(request.id, { resolve, reject }));
      try { await write({ jsonrpc: "2.0", id: request.id, method: request.method, params: request.params ?? {} }); }
      catch (error) { pending.delete(request.id); throw error; }
      void readLoop();
      let onAbort: (() => void) | undefined;
      try {
        if (signal !== undefined) {
          onAbort = () => { pending.delete(request.id); rejectAll(new DOMException("MCP request cancelled", "AbortError")); };
          signal.addEventListener("abort", onAbort, { once: true });
        }
        return await result;
      } finally { if (onAbort !== undefined) signal?.removeEventListener("abort", onAbort); }
    },
    async notify(request) { await write({ jsonrpc: "2.0", method: request.method, params: request.params ?? {} }); },
    async close() { if (closed) return; closed = true; rejectAll(new Error("MCP transport closed")); child.kill(); try { await reader.cancel(); } catch { /* best effort */ } reader.releaseLock(); },
  };
}

export type McpTool = { readonly name: string; readonly description?: string; readonly inputSchema?: JsonSchema };

export type McpToolOptions = {
  readonly serverName: string;
  readonly transport: McpTransport;
  readonly transportFactory?: () => Promise<McpTransport>;
  readonly protocol?: McpProtocol;
  readonly discoveredTools?: readonly McpTool[];
  readonly capabilityPrefix?: string;
  readonly integrationId?: string;
  readonly integrationName?: string;
  readonly integrationType?: string;
  readonly policy?: "allow" | "ask" | "auto" | "deny";
  readonly mutating?: boolean;
  readonly maxMessageBytes?: number;
  readonly signal?: AbortSignal;
};

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
  const encoded = JSON.stringify(value);
  if (new TextEncoder().encode(encoded).byteLength > maxBytes) throw new Error("MCP message exceeds the configured limit");
}

function abortError(): DOMException { return new DOMException("MCP request cancelled", "AbortError"); }

export async function requestMcp(transport: McpTransport, request: McpWireRequest, maxBytes = 65536, signal?: AbortSignal): Promise<unknown> {
  const wire = { jsonrpc: "2.0", id: request.id, method: request.method, params: request.params ?? {} };
  assertMessage(wire, maxBytes);
  if (signal?.aborted) throw abortError();
  let onAbort: (() => void) | undefined;
  const cancellation = new Promise<never>((_, reject) => { onAbort = () => { void transport.close?.(); reject(abortError()); }; signal?.addEventListener("abort", onAbort, { once: true }); });
  try {
    const response = await Promise.race([transport.request(request, signal), cancellation]);
    assertMessage(response, maxBytes);
    if (isRecord(response) && ("jsonrpc" in response || "id" in response || "result" in response || "error" in response)) {
      if (response.jsonrpc !== "2.0" || response.id !== request.id) throw new Error("MCP response correlation failed");
      if ("error" in response) throw new Error("MCP server returned a protocol error");
      if (!("result" in response)) throw new Error("MCP response is invalid");
      return response.result;
    }
    return response;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw error instanceof Error && error.message === "MCP server returned a protocol error" ? error : new Error("MCP request failed");
  } finally { if (onAbort !== undefined) signal?.removeEventListener("abort", onAbort); }
}

export function parseMcpTools(response: unknown, maxBytes = 65536): readonly McpTool[] {
  assertMessage(response, maxBytes);
  if (!isRecord(response) || !Array.isArray(response.tools) || response.tools.length > 1024) throw new Error("MCP tools/list response is invalid");
  return response.tools.map(item => {
    if (!isRecord(item) || typeof item.name !== "string" || item.name.length === 0 || item.name.length > 128) throw new Error("MCP tool metadata is invalid");
    if (item.description !== undefined && (typeof item.description !== "string" || item.description.length > 4096)) throw new Error("MCP tool metadata is invalid");
    let inputSchema: JsonSchema | undefined;
    if (item.inputSchema !== undefined) {
      if (!isRecord(item.inputSchema) || item.inputSchema.type !== "object") throw new Error("MCP tool schema is invalid");
      inputSchema = validateJsonSchema(item.inputSchema, "MCP tool");
    }
    return { name: item.name, ...(typeof item.description === "string" ? { description: item.description } : {}), ...(inputSchema === undefined ? {} : { inputSchema }) };
  });
}

export async function createMcpToolDefinitions(options: McpToolOptions): Promise<readonly ToolDefinition[]> {
  const maxBytes = options.maxMessageBytes ?? 65536;
  if (!Number.isInteger(maxBytes) || maxBytes < 1) throw new TypeError("maxMessageBytes must be positive");
  const protocol = options.protocol ?? "modern";
  let nextId = 1;
  const tools = options.discoveredTools ?? parseMcpTools(await requestMcp(options.transport, { id: nextId++, method: "tools/list", params: protocol === "modern" ? { _meta: modernMeta() } : {}, protocol }, maxBytes, options.signal), maxBytes);
  const names = new Set<string>();
  return tools.map(tool => {
    const name = toolName(options.serverName, tool.name);
    if (names.has(name)) throw new TypeError("MCP tool name collision");
    names.add(name);
    const capabilityId = options.capabilityPrefix === undefined ? `mcp:${options.serverName}:${tool.name}` : `${options.capabilityPrefix}${tool.name}`;
    return {
      name, capabilityId, description: tool.description ?? `MCP tool ${tool.name}`, inputSchema: tool.inputSchema ?? { type: "object", properties: {} },
      source: `tool-runtime:mcp:${options.integrationId ?? options.serverName}`,
      ...(options.integrationId === undefined ? {} : { integrationId: options.integrationId }),
      integrationName: options.integrationName ?? options.serverName,
      integrationType: options.integrationType ?? "mcp",
      nativeName: tool.name,
      displayName: tool.description ?? tool.name,
      capabilities: { mcp: true, mutating: options.mutating ?? true },
      executable: { handle: createToolHandle(async (argumentsValue, signal) => {
        if (!isRecord(argumentsValue)) throw new TypeError("MCP tool arguments must be an object");
        assertMessage(argumentsValue, maxBytes);
        const transport = options.transportFactory === undefined ? options.transport : await options.transportFactory();
        try {
          const result = await requestMcp(transport, { id: nextId++, method: "tools/call", name: tool.name, protocol, params: { name: tool.name, arguments: argumentsValue, ...(protocol === "modern" ? { _meta: modernMeta() } : {}) } }, maxBytes, signal instanceof AbortSignal ? signal : undefined);
          assertMessage(result, maxBytes);
          if (!isRecord(result) || !Array.isArray(result.content)) throw new Error("MCP tool response is invalid");
          return result;
        } finally { if (options.transportFactory !== undefined) await transport.close?.(); }
      }) },
      policy: options.policy ?? "ask",
    };
  });
}

export function modernMeta(): Record<string, unknown> {
  return { "io.modelcontextprotocol/protocolVersion": MCP_MODERN_PROTOCOL_VERSION, "io.modelcontextprotocol/clientInfo": { name: "hermes-subpolar", version: "1.0" }, "io.modelcontextprotocol/clientCapabilities": {} };
}
