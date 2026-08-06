import { strict as assert } from "node:assert";
import { test } from "bun:test";

import { createMcpToolDefinitions } from "../src/index.ts";

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
