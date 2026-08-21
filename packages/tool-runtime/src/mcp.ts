import { createToolHandle, type JsonSchema, type ToolDefinition, validateJsonSchema } from "tool-resolver";

export type McpTransport = {
  request(method: string, params: unknown, signal?: AbortSignal): Promise<unknown>;
  close?: () => void | Promise<void>;
};

export type McpHttpTransportOptions = {
  readonly endpoint: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly fetch?: typeof fetch;
};

/** A small Streamable HTTP transport. It deliberately accepts JSON and SSE responses. */
export function createMcpHttpTransport(options: McpHttpTransportOptions): McpTransport {
  const endpoint = new URL(options.endpoint);
  if (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(endpoint.hostname))) {
    throw new TypeError("MCP HTTP endpoint must use HTTPS");
  }
  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new TypeError("MCP endpoint must not contain credentials or query state");
  for (const [name, value] of Object.entries(options.headers ?? {})) {
    if (!name || /[\r\n]/.test(name) || /[\r\n]/.test(value)) throw new TypeError("MCP headers are invalid");
  }
  let sessionId: string | undefined;
  return {
    async request(method, params, signal) {
      const response = await (options.fetch ?? fetch)(endpoint, {
        method: "POST",
        headers: { accept: "application/json, text/event-stream", "content-type": "application/json", ...options.headers, ...(sessionId === undefined ? {} : { "mcp-session-id": sessionId }) },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        redirect: "error",
        ...(signal === undefined ? {} : { signal }),
      });
      if (!response.ok) throw new Error(`MCP HTTP request failed (${response.status})`);
      sessionId = response.headers.get("mcp-session-id") ?? sessionId;
      const text = await response.text();
      if (text.trim().length === 0) return {};
      if (response.headers.get("content-type")?.includes("text/event-stream")) {
        const data = text.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trim()).filter(Boolean).at(-1);
        if (data === undefined) throw new Error("MCP stream response is invalid");
        return JSON.parse(data) as unknown;
      }
      return JSON.parse(text) as unknown;
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

/** JSON-lines plus Content-Length framing, for MCP stdio servers. */
export function createMcpStdioTransport(options: McpStdioTransportOptions): McpTransport {
  if (!options.command.trim() || /[\r\n]/.test(options.command)) throw new TypeError("MCP command is invalid");
  const child = (options.spawn ?? ((command, spawnOptions) => Bun.spawn([command, ...(options.args ?? [])], spawnOptions as never) as unknown as McpStdioProcess))(options.command, {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "ignore",
    env: { ...globalThis.process?.env, ...options.env },
  });
  const reader = child.stdout.getReader();
  const writer = child.stdin;
  let buffer = new Uint8Array();
  let nextId = 1;
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  let reading = false;
  const append = (chunk: Uint8Array) => { const next = new Uint8Array(buffer.length + chunk.length); next.set(buffer); next.set(chunk, buffer.length); buffer = next; };
  const take = (): unknown | undefined => {
    const text = new TextDecoder().decode(buffer);
    const separator = text.indexOf("\r\n\r\n");
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
  const readLoop = async (): Promise<void> => {
    if (reading) return;
    reading = true;
    try {
      while (true) {
        const next = take();
        if (next !== undefined) {
          if (isRecord(next) && typeof next.id === "number") pending.get(next.id)?.resolve(next);
          continue;
        }
        const chunk = await reader.read();
        if (chunk.done) throw new Error("MCP stdio server disconnected");
        append(chunk.value);
      }
    } catch (error) {
      for (const item of pending.values()) item.reject(error instanceof Error ? error : new Error("MCP stdio request failed"));
      pending.clear();
    } finally { reading = false; }
  };
  return {
    async request(method, params, signal) {
      const id = nextId++;
      const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params });
      const bytes = new TextEncoder().encode(payload);
      await writer.write(new TextEncoder().encode(`Content-Length: ${bytes.length}\r\n\r\n${payload}`));
      const result = new Promise<unknown>((resolve, reject) => pending.set(id, { resolve, reject }));
      void readLoop();
      if (signal === undefined) return result;
      return Promise.race([result, new Promise<never>((_, reject) => signal.addEventListener("abort", () => reject(new DOMException("MCP request cancelled", "AbortError")), { once: true }))]);
    },
    async close() { for (const item of pending.values()) item.reject(new Error("MCP transport closed")); pending.clear(); child.kill(); reader.releaseLock(); },
  };
}

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
