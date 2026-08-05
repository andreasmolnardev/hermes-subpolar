import { strict as assert } from "node:assert";
import { test } from "bun:test";

import {
  clearPinnedRuntime,
  executeRequest,
  normalizeGatewayRequest
} from "../src/index.ts";
import {
  createGatewayEventMapper,
  type GatewayProtocolEvent
} from "../src/client.ts";
import type { ProviderRequest } from "chat-provider-interface";

const completion = {
  message: { role: "assistant" as const, content: "safe" },
  usage: { inputTokens: 1, outputTokens: 1 }
};

test("gateway preserves legacy ChatMessage and policy snapshot inputs", async () => {
  const result = await executeRequest({
    model: "fake",
    messages: [{ role: "user", content: "hello" }],
    toolPolicies: [{ toolName: "shell.exec", policy: "deny" }]
  }, {
    async complete(request) {
      assert.equal(request.model, "fake");
      assert.deepEqual(request.messages, [{ role: "user", content: "hello" }]);
      assert.deepEqual(request.tools, []);
      return completion;
    }
  });

  assert.equal(result.message.content, "safe");
});

test("gateway validates and normalizes request boundaries", () => {
  assert.throws(() => normalizeGatewayRequest({
    model: " ",
    messages: [],
    toolPolicies: []
  }), /model must be a non-empty string/);
  assert.throws(() => normalizeGatewayRequest({
    model: "fake",
    messages: [{ role: "user", content: 42 } as never],
    toolPolicies: []
  }), /content must be a string/);
  assert.throws(() => normalizeGatewayRequest({
    model: "fake",
    messages: [{ role: "user", content: "hello" }],
    toolPolicies: [{ toolName: "x", policy: "invalid" } as never]
  }), /toolPolicies\[0\] is invalid/);
});

test("descriptor path preserves schema and metadata through harness adapter", async () => {
  clearPinnedRuntime("descriptor-session");
  const schema = { type: "object", properties: { query: { type: "string" } } } as const;
  const result = await executeRequest({
    model: "fake",
    sessionId: "descriptor-session",
    runtime: "harness",
    messages: [{ role: "user", content: "hello" }],
    toolPolicies: [{
      name: "search",
      description: "Search safely",
      inputSchema: schema,
      source: "plugin.search",
      capabilities: { network: true },
      executable: { reference: "plugin.search" },
      policy: "allow"
    }]
  }, {
    async complete(request) {
      const tool = request.tools[0] as unknown as Record<string, unknown>;
      assert.deepEqual(tool.parameters, schema);
      assert.deepEqual(tool.inputSchema, schema);
      assert.equal(tool.source, "plugin.search");
      assert.deepEqual(tool.capabilities, { network: true });
      assert.equal(tool.description, "Search safely");
      return completion;
    }
  });

  assert.equal(result.message.content, "safe");
});

test("mapped harness events stay ordered, deduplicate terminal, and redact diagnostics", async () => {
  clearPinnedRuntime("events-session");
  const events: GatewayProtocolEvent[] = [];
  await executeRequest({
    model: "fake",
    sessionId: "events-session",
    runtime: "harness",
    messages: [{ role: "user", content: "hello" }],
    toolPolicies: [],
    eventSink: event => events.push(event)
  }, { async complete() { return completion; } });

  assert.deepEqual(events.map(event => event.type), [
    "message.start",
    "status.update",
    "status.update",
    "message.complete"
  ]);

  const sinkEvents: GatewayProtocolEvent[] = [];
  const map = createGatewayEventMapper(event => sinkEvents.push(event));
  const terminal = {
    id: "event-1",
    requestId: "request-1",
    sessionId: "session-1",
    at: 1,
    type: "terminal" as const,
    outcome: "provider_failure" as const,
    message: "secret provider diagnostics"
  };
  await map(terminal);
  await map({ ...terminal, id: "event-2", at: 2 });
  assert.equal(sinkEvents.length, 1);
  assert.deepEqual(sinkEvents[0], {
    type: "error",
    session_id: "session-1",
    payload: { code: "harness.provider_failure", message: "Request failed" }
  });
  assert.equal(JSON.stringify(sinkEvents).includes("secret provider diagnostics"), false);
});

test("runtime selection remains pinned for session", async () => {
  clearPinnedRuntime("pinned-session");
  const requestShapes: Array<{ signal: boolean; cancellation: boolean }> = [];
  const provider = {
    async complete(request: ProviderRequest) {
      requestShapes.push({ signal: request.signal !== undefined, cancellation: request.cancellation !== undefined });
      return completion;
    }
  };

  await executeRequest({
    model: "fake",
    sessionId: "pinned-session",
    runtime: "harness",
    messages: [{ role: "user", content: "one" }],
    toolPolicies: []
  }, provider);
  await executeRequest({
    model: "fake",
    sessionId: "pinned-session",
    runtime: "python",
    messages: [{ role: "user", content: "two" }],
    toolPolicies: []
  }, provider);

  assert.deepEqual(requestShapes, [
    { signal: true, cancellation: true },
    { signal: true, cancellation: true }
  ]);
});

test("unsupported harness descriptor retains explicit Python fallback without duplicate call", async () => {
  clearPinnedRuntime("fallback-session");
  let calls = 0;
  const result = await executeRequest({
    model: "fake",
    sessionId: "fallback-session",
    runtime: "harness",
    messages: [{ role: "user", content: "hello" }],
    toolPolicies: [{
      name: "boolean-schema",
      description: "legacy",
      inputSchema: true,
      source: "python",
      executable: { reference: "python:boolean-schema" },
      policy: "allow"
    }]
  }, {
    async complete(request) {
      calls += 1;
      const tool = request.tools[0] as unknown as Record<string, unknown>;
      assert.equal(tool.inputSchema, true);
      assert.equal(request.signal, undefined);
      return completion;
    }
  });

  assert.equal(calls, 1);
  assert.equal(result.message.content, "safe");
});
