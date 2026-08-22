import { strict as assert } from "node:assert";
import { test } from "bun:test";

import { createMcpHttpTransport, createMcpStdioTransport, createMcpToolDefinitions, requestMcp } from "../src/index.ts";

async function executeTool(tool: Awaited<ReturnType<typeof createMcpToolDefinitions>>[number], input: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
  if (!("handle" in tool.executable)) throw new Error("test tool is not executable");
  return tool.executable.handle.execute(input, ...(signal === undefined ? [] : [signal]));
}

test("modern MCP HTTP is stateless, self-describing, and correlates multiple calls", async () => {
  const requests: { body: Record<string, unknown>; headers: Headers }[] = [];
  const transport = createMcpHttpTransport({
    endpoint: "https://mcp.example.test/mcp",
    headers: { "x-test": "ok" },
    fetch: (async input => {
      const request = input instanceof Request ? input : new Request(input);
      const body = await request.json() as Record<string, unknown>;
      requests.push({ body, headers: request.headers });
      const method = body.method;
      const result = method === "tools/list" ? { tools: [{ name: "search", inputSchema: { type: "object" } }] } : { content: [{ type: "text", text: String((body.params as Record<string, unknown>)?.name) }] };
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }), { headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  });
  const tools = await createMcpToolDefinitions({ serverName: "docs", transport });
  assert.equal(tools.length, 1);
  await executeTool(tools[0]!, { query: "one" });
  await executeTool(tools[0]!, { query: "two" });
  assert.deepEqual(requests.map(item => item.body.id), [1, 2, 3]);
  assert.deepEqual(requests.map(item => item.body.method), ["tools/list", "tools/call", "tools/call"]);
  assert.equal(requests[0]!.headers.get("mcp-protocol-version"), "2026-07-28");
  assert.equal(requests[0]!.headers.get("mcp-method"), "tools/list");
  assert.equal(requests[1]!.headers.get("mcp-name"), "search");
  assert.equal(requests[1]!.headers.get("mcp-session-id"), null);
  assert.equal((requests[0]!.body.params as Record<string, unknown>)._meta !== undefined, true);
});

test("legacy MCP HTTP performs initialize/initialized and only then uses its session", async () => {
  const requests: Request[] = [];
  const transport = createMcpHttpTransport({
    endpoint: "https://mcp.example.test/mcp",
    fetch: (async input => {
      const request = input instanceof Request ? input : new Request(input);
      requests.push(request);
      const body = await request.clone().json() as Record<string, unknown>;
      const result = body.method === "initialize" ? { protocolVersion: "2025-11-25" } : body.method === "tools/list" ? { tools: [] } : { content: [] };
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }), { headers: { "content-type": "application/json", "mcp-session-id": "legacy-1" } });
    }) as typeof fetch,
  });
  await requestMcp(transport, { id: "init", method: "initialize", protocol: "legacy", params: {} });
  await transport.notify?.({ method: "notifications/initialized", protocol: "legacy", params: {} });
  await requestMcp(transport, { id: 2, method: "tools/list", protocol: "legacy", params: {} });
  assert.equal(requests[0]!.headers.get("mcp-protocol-version"), null);
  assert.equal(requests[1]!.headers.get("mcp-session-id"), "legacy-1");
  assert.equal((await requests[1]!.clone().json() as Record<string, unknown>).id, undefined);
  assert.equal(requests[2]!.headers.get("mcp-session-id"), "legacy-1");
});

test("MCP discovery creates correlated native tool handles", async () => {
  const calls: unknown[] = [];
  const tools = await createMcpToolDefinitions({
    serverName: "docs server",
    transport: {
      async request(request) {
        calls.push([request.method, request.params, request.id]);
        const result = request.method === "tools/list" ? { tools: [{ name: "search", description: "Search documentation", inputSchema: { type: "object" } }] } : { content: [{ type: "text", text: "found" }] };
        return { jsonrpc: "2.0", id: request.id, result };
      },
    },
  });
  assert.equal(tools[0]?.name, "mcp__docs_server__search");
  await executeTool(tools[0]!, { query: "harness" });
  assert.deepEqual(calls.map(item => (item as unknown[])[0]), ["tools/list", "tools/call"]);
  assert.deepEqual(calls.map(item => (item as unknown[])[2]), [1, 2]);
});

test("MCP rejects sanitized tool collisions", async () => {
  await assert.rejects(createMcpToolDefinitions({ serverName: "server", transport: { async request(request) { return { jsonrpc: "2.0", id: request.id, result: { tools: [{ name: "a/b" }, { name: "a?b" }] } }; } } }), /collision/);
});

test("MCP validates response correlation and closes on cancellation", async () => {
  const tools = await createMcpToolDefinitions({ serverName: "server", transport: { async request(request) { return { jsonrpc: "2.0", id: request.method === "tools/list" ? request.id : 99, result: request.method === "tools/list" ? { tools: [{ name: "search", inputSchema: { type: "object" } }] } : { content: [] } }; } } });
  await assert.rejects(executeTool(tools[0]!, {}), /MCP request failed|correlation/);
  let closed = 0; const controller = new AbortController();
  const cancellable = await createMcpToolDefinitions({ serverName: "server", transport: { async request(request) { if (request.method === "tools/list") return { jsonrpc: "2.0", id: request.id, result: { tools: [{ name: "search" }] } }; return new Promise(() => undefined); }, close: () => { closed++; } } });
  const pending = executeTool(cancellable[0]!, {}, controller.signal); controller.abort();
  await assert.rejects(pending, { name: "AbortError" }); assert.equal(closed, 1);
});

test("MCP stdio correlates discovery and two sequential calls with caller IDs", async () => {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const seen: Record<string, unknown>[] = [];
  const frame = (value: unknown) => { const text = JSON.stringify(value); return new TextEncoder().encode(`Content-Length: ${new TextEncoder().encode(text).length}\r\n\r\n${text}`); };
  const transport = createMcpStdioTransport({ command: "fake", spawn: (_command, options) => ({
    stdin: { write: async chunk => { const text = new TextDecoder().decode(chunk); const payload = text.slice(text.indexOf("\r\n\r\n") + 4); const request = JSON.parse(payload) as Record<string, unknown>; seen.push(request); const result = request.method === "tools/list" ? { tools: [{ name: "search" }] } : { content: [{ type: "text", text: "ok" }] }; controller.enqueue(frame({ jsonrpc: "2.0", id: request.id, result })); return chunk.length; } },
    stdout: new ReadableStream<Uint8Array>({ start(value) { controller = value; } }), kill() { /* test process */ },
  }) });
  const tools = await createMcpToolDefinitions({ serverName: "stdio", transport });
  await executeTool(tools[0]!, {}); await executeTool(tools[0]!, {}); await transport.close?.();
  assert.deepEqual(seen.map(item => item.id), [1, 2, 3]);
});
