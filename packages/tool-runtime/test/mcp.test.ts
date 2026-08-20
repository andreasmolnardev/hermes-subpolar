import { strict as assert } from "node:assert";
import { test } from "bun:test";

import { createMcpToolDefinitions } from "../src/index.ts";

test("MCP discovery creates correlated native tool handles", async () => {
  const calls: unknown[] = [];
  let closed = false;
  const tools = await createMcpToolDefinitions({
    serverName: "docs server",
    transport: {
      async send(message) {
        calls.push(message);
        if (message.method === "initialize") return { jsonrpc: "2.0", id: message.id, result: { protocolVersion: "2025-03-26" } };
        if (message.method === "notifications/initialized") return undefined;
        if (message.method === "tools/list") {
          return { jsonrpc: "2.0", id: message.id, result: { tools: [{ name: "search", description: "Search documentation", inputSchema: { type: "object" } }] } };
        }
        return { jsonrpc: "2.0", id: message.id, result: { content: [{ type: "text", text: "found" }] } };
      },
      close() { closed = true; }
    }
  });

  assert.equal(tools[0]?.name, "mcp__docs_server__search");
  assert.ok(tools[0] && "handle" in tools[0].executable);
  const result = await tools[0]!.executable.handle.execute({ query: "harness" });
  assert.deepEqual(result, { content: [{ type: "text", text: "found" }] });
  assert.deepEqual(calls, [
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "hermes-tool-runtime", version: "1" } } },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
    { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "search", arguments: { query: "harness" } } }
  ]);
  assert.equal(closed, false);
});

test("MCP discovery rejects sanitized tool collisions", async () => {
  await assert.rejects(
    createMcpToolDefinitions({
      serverName: "server",
      transport: {
        async send(message) {
          if (message.method === "initialize") return { jsonrpc: "2.0", id: message.id, result: { protocolVersion: "2025-03-26" } };
          if (message.method === "notifications/initialized") return undefined;
          return { jsonrpc: "2.0", id: message.id, result: { tools: [{ name: "a/b" }, { name: "a?b" }] } };
        },
        close() {}
      }
    }),
    /collision/
  );
});

test("MCP rejects a mismatched JSON-RPC id and closes the operator transport", async () => {
  let closed = false;
  await assert.rejects(createMcpToolDefinitions({
    serverName: "server",
    transport: {
      async send(message) { return { jsonrpc: "2.0", id: message.method === "initialize" ? 99 : message.id, result: {} }; },
      close() { closed = true; }
    }
  }), /invalid JSON-RPC/);
  assert.equal(closed, true);
});

test("MCP rejects duplicate JSON-RPC responses", async () => {
  await assert.rejects(createMcpToolDefinitions({
    serverName: "server",
    transport: {
      async send(message) {
        if (message.method === "initialize") return [
          { jsonrpc: "2.0", id: message.id, result: { protocolVersion: "2025-03-26" } },
          { jsonrpc: "2.0", id: message.id, result: { protocolVersion: "2025-03-26" } }
        ];
        return undefined;
      },
      close() {}
    }
  }), /invalid JSON-RPC/);
});

test("MCP bounds arguments and closes a transport cancelled during a call", async () => {
  let closed = false;
  const tools = await createMcpToolDefinitions({
    serverName: "server",
    maxArgumentsBytes: 8,
    transport: {
      async send(message, signal) {
        if (message.method === "initialize") return { jsonrpc: "2.0", id: message.id, result: { protocolVersion: "2025-03-26" } };
        if (message.method === "notifications/initialized") return undefined;
        if (message.method === "tools/list") return { jsonrpc: "2.0", id: message.id, result: { tools: [{ name: "run" }] } };
        await new Promise<void>((_, reject) => signal?.addEventListener("abort", () => reject(new DOMException("cancelled", "AbortError")), { once: true }));
        return { jsonrpc: "2.0", id: message.id, result: {} };
      },
      close() { closed = true; }
    }
  });
  assert.ok(tools[0] && "handle" in tools[0].executable);
  await assert.rejects(tools[0]!.executable.handle.execute({ value: "too large" }), /argument.*limit/);
  const controller = new AbortController();
  const pending = tools[0]!.executable.handle.execute({}, controller.signal);
  controller.abort();
  await assert.rejects(pending, /cancelled/);
  assert.equal(closed, true);
});
