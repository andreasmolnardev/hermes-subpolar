import { strict as assert } from "node:assert";
import { test } from "bun:test";

import { createMcpHttpTransport, createMcpToolDefinitions } from "../src/index.ts";

test("MCP HTTP transport preserves server sessions and accepts JSON responses", async () => {
  const requests: Request[] = [];
  let call = 0;
  const transport = createMcpHttpTransport({
    endpoint: "https://mcp.example.test/mcp",
    headers: { "x-test": "ok" },
    fetch: async input => {
      const request = input instanceof Request ? input : new Request(input);
      requests.push(request);
      call += 1;
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { tools: [] } }), { headers: { "content-type": "application/json", "mcp-session-id": "session-1" } });
    },
  });
  await transport.request("initialize", {});
  await transport.request("tools/list", {});
  assert.equal(requests[0]?.headers.get("x-test"), "ok");
  assert.equal(requests[1]?.headers.get("mcp-session-id"), "session-1");
  assert.equal(call, 2);
});

test("MCP discovery creates correlated native tool handles", async () => {
  const calls: unknown[] = [];
  const tools = await createMcpToolDefinitions({
    serverName: "docs server",
    transport: {
      async request(method, params) {
        calls.push([method, params]);
        if (method === "tools/list") {
          return { tools: [{ name: "search", description: "Search documentation", inputSchema: { type: "object" } }] };
        }
        return { content: [{ type: "text", text: "found" }] };
      }
    }
  });

  assert.equal(tools[0]?.name, "mcp__docs_server__search");
  assert.ok(tools[0] && "handle" in tools[0].executable);
  const result = await tools[0]!.executable.handle.execute({ query: "harness" });
  assert.deepEqual(result, { content: [{ type: "text", text: "found" }] });
  assert.deepEqual(calls, [
    ["tools/list", {}],
    ["tools/call", { name: "search", arguments: { query: "harness" } }]
  ]);
});

test("MCP discovery rejects sanitized tool collisions", async () => {
  await assert.rejects(
    createMcpToolDefinitions({
      serverName: "server",
      transport: { async request() { return { tools: [{ name: "a/b" }, { name: "a?b" }] }; } }
    }),
    /collision/
  );
});

test("MCP validates response correlation and closes on cancellation", async () => {
  const tools = await createMcpToolDefinitions({
    serverName: "server",
    transport: { async request(method) {
      if (method === "tools/list") return { tools: [{ name: "search", inputSchema: { type: "object" } }] };
      return { jsonrpc: "2.0", id: 99, result: { content: [] } };
    } }
  });
  assert.ok(tools[0] && "handle" in tools[0].executable);
  await assert.rejects(tools[0].executable.handle.execute({}), /MCP request failed/);

  let closed = 0;
  const controller = new AbortController();
  const cancellable = await createMcpToolDefinitions({
    serverName: "server",
    transport: {
      async request(method) {
        if (method === "tools/list") return { tools: [{ name: "search" }] };
        return new Promise(() => undefined);
      },
      close: () => { closed++; }
    }
  });
  assert.ok(cancellable[0] && "handle" in cancellable[0].executable);
  const pending = cancellable[0].executable.handle.execute({}, controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(closed, 1);
});
