import { strict as assert } from "node:assert";
import { test } from "bun:test";

import {
  createGateway,
  createGatewayEventMapper,
  createTransportEventMapper,
  executeRequest,
  GatewayTurnLeaseError,
  GatewayTurnLeaseManager,
  GatewayUnsupportedToolError,
  normalizeGatewayRequest,
  type GatewayProtocolEvent
} from "../src/index.ts";
import type { ProviderRequest, ProviderResult } from "chat-provider-interface";
import { HarnessProviderError } from "harness";
import { createToolHandle } from "tool-resolver";

const completion: ProviderResult = {
  message: { role: "assistant", content: "safe" },
  usage: { inputTokens: 1, outputTokens: 1 }
};

test("gateway preserves policy snapshots and validates request boundaries", () => {
  assert.throws(() => normalizeGatewayRequest({
    model: " ",
    messages: [],
    toolPolicies: []
  }), /model must be a non-empty string/);
  assert.throws(() => normalizeGatewayRequest({
    model: "fake",
    messages: [{ role: "user", content: 42 } as never],
    toolPolicies: []
  }), /must be a string or content parts/);
  assert.throws(() => normalizeGatewayRequest({
    model: "fake",
    messages: [{ role: "user", content: "hello" }],
    toolPolicies: [{ toolName: "x", policy: "invalid" } as never]
  }), /toolPolicies\[0\] is invalid/);
  assert.deepEqual(normalizeGatewayRequest({
    model: "fake",
    messages: [{ role: "user", content: "hello" }],
    toolPolicies: [{ toolName: "shell.exec", policy: "deny" }]
  }).tools, []);
});

test("session CWD is isolated through the injected store", async () => {
  const values = new Map<string, string>();
  const gateway = createGateway({
    sessionCwdStore: {
      load: sessionId => values.get(sessionId),
      save: (sessionId, cwd) => { values.set(sessionId, cwd); },
      clear: sessionId => {
        if (sessionId === undefined) values.clear();
        else values.delete(sessionId);
      }
    }
  });
  await gateway.setSessionCwd("session-a", "/workspace/a");
  await gateway.setSessionCwd("session-b", "/workspace/b");
  assert.deepEqual([...values.entries()], [["session-a", "/workspace/a"], ["session-b", "/workspace/b"]]);

  await gateway.clearSessionCwd("session-a");
  assert.equal(values.get("session-a"), undefined);
});

test("harness executes native ToolHandle descriptors", async () => {
  let providerCalls = 0;
  let toolCalls = 0;
  const result = await createGateway().executeRequest({
    model: "fake",
    requestId: "native-request",
    sessionId: "native-session",
    messages: [{ role: "user", content: "lookup" }],
    toolPolicies: [{
      name: "search",
      description: "Search safely",
      inputSchema: { type: "object", required: ["query"], properties: { query: { type: "string" } } },
      source: "native",
      executable: {
        handle: createToolHandle(async argumentsValue => {
          toolCalls += 1;
          assert.deepEqual(argumentsValue, { query: "one" });
          return { content: "found" };
        })
      },
      policy: "allow"
    }]
  }, {
    async complete(request) {
      providerCalls += 1;
      if (providerCalls === 1) {
        assert.equal(request.tools[0]?.name, "search");
        return {
          message: {
            role: "assistant",
            content: "",
            toolCalls: [{ id: "call-1", name: "search", arguments: JSON.stringify({ query: "one" }) }]
          },
          usage: { inputTokens: 1, outputTokens: 1 }
        };
      }
      assert.equal(request.messages.at(-1)?.role, "tool");
      return completion;
    }
  });

  assert.equal(toolCalls, 1);
  assert.equal(providerCalls, 2);
  assert.equal(result.message.content, "safe");
});

test("unresolved reference executables fail closed before provider effects", async () => {
  let providerCalls = 0;
  const request = {
    model: "fake",
    sessionId: "reference-session",
    messages: [{ role: "user" as const, content: "lookup" }],
    toolPolicies: [{
      name: "search",
      description: "Search",
      inputSchema: { type: "object" },
      source: "plugin",
      executable: { reference: "plugin.search" },
      policy: "allow" as const
    }]
  };
  const provider = {
    async complete() {
      providerCalls += 1;
      return completion;
    },
    async *stream() {
      providerCalls += 1;
      yield { type: "start" as const };
    }
  };

  await assert.rejects(() => createGateway().executeRequest(request, provider), error => {
    assert(error instanceof GatewayUnsupportedToolError);
    assert.equal(error.toolName, "search");
    assert.equal(error.reference, "plugin.search");
    assert.match(error.message, /unresolved tool reference/);
    return true;
  });
  assert.equal(providerCalls, 0);
});

test("mapped harness events stay ordered and redact diagnostics", async () => {
  const events: GatewayProtocolEvent[] = [];
  await executeRequest({
    model: "fake",
    sessionId: "events-session",
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

test("gateway preserves provider request and result fidelity", async () => {
  const controller = new AbortController();
  const options = { temperature: 0.25, maxOutputTokens: 128, reasoningEffort: "high" as const, responseFormat: "json" as const };
  const cacheHints = { key: "prompt-v1", read: true, write: true, ttlMs: 60_000 };
  const metadata = { traceId: "trace-request", labels: ["gateway"] };
  const identity = { requestId: "fidelity-request", attempt: 4, parentRequestId: "parent-1" };
  const deadline = Date.now() + 4_000;
  const providerResult: ProviderResult = {
    ...completion,
    message: { role: "assistant", content: [{ type: "text", text: "answer" }, { type: "reasoning", text: "because" }], reasoning: "because" },
    usage: { inputTokens: 11, outputTokens: 7, totalTokens: 18 },
    finishReason: "stop",
    reasoning: "because",
    requestId: "provider-request",
    identity,
    metadata: { traceId: "trace-provider" }
  };
  let seen: ProviderRequest | undefined;
  const result = await createGateway().executeRequest({
    model: "fidelity-model",
    sessionId: "fidelity-session",
    requestId: "fidelity-request",
    identity,
    messages: [{ role: "user", content: "hello" }],
    toolPolicies: [],
    signal: controller.signal,
    timeoutMs: 5_000,
    deadline,
    options,
    cacheHints,
    metadata
  }, {
    async complete(request) {
      seen = request;
      return providerResult;
    }
  });

  assert.ok(seen);
  assert.deepEqual(seen.options, options);
  assert.deepEqual(seen.cacheHints, cacheHints);
  assert.deepEqual(seen.metadata, metadata);
  assert.equal(seen.requestId, "fidelity-request");
  assert.deepEqual(seen.identity, identity);
  assert.equal(seen.signal, seen.cancellation);
  assert.equal(seen.timeoutMs, 5_000);
  assert.equal(seen.deadline, deadline);
  assert.deepEqual(result, providerResult);
});

test("gateway forwards provider streams and projects deltas", async () => {
  const gatewayEvents: GatewayProtocolEvent[] = [];
  const transportEvents: unknown[] = [];
  const result = await createGateway().executeRequest({
    model: "stream-model",
    requestId: "projection-request",
    sessionId: "projection-session",
    messages: [{ role: "user", content: "hello" }],
    toolPolicies: [],
    eventSink: event => gatewayEvents.push(event),
    transportEventSink: event => transportEvents.push(event)
  }, {
    async *stream() {
      yield { type: "start" as const };
      yield { type: "text-delta" as const, text: "hello" };
      yield { type: "reasoning-delta" as const, text: "because" };
      yield { type: "usage" as const, usage: { inputTokens: 1, outputTokens: 1 } };
      yield { type: "finish" as const, finishReason: "stop" as const, requestId: "provider-projection-request" };
    },
    async complete() {
      throw new Error("stream should be selected");
    }
  });

  assert.deepEqual(gatewayEvents.map(event => event.type), [
    "message.start", "status.update", "status.update", "message.delta",
    "reasoning.delta", "status.update", "status.update", "status.update", "message.complete"
  ]);
  assert.deepEqual((transportEvents as Array<{ type: string }>).map(event => event.type), [
    "session.started", "message.delta", "usage.updated", "usage.updated"
  ]);
  assert.deepEqual(result.message.content, "hello");
});

test("gateway increments provider identity attempts across retries", async () => {
  const requests: ProviderRequest[] = [];
  let calls = 0;
  await executeRequest({
    model: "retry-model",
    sessionId: "attempt-session",
    requestId: "attempt-request",
    identity: { requestId: "attempt-request", attempt: 3, parentRequestId: "parent-request" },
    messages: [{ role: "user", content: "retry" }],
    toolPolicies: [],
    retryPolicy: { maxAttempts: 2 }
  }, {
    async complete(request) {
      requests.push(request);
      calls += 1;
      if (calls === 1) throw new HarnessProviderError("busy", { category: "overloaded" });
      return completion;
    }
  });

  assert.deepEqual(requests.map(request => request.identity), [
    { requestId: "attempt-request", attempt: 3, parentRequestId: "parent-request" },
    { requestId: "attempt-request", attempt: 4, parentRequestId: "parent-request" }
  ]);
});

test("gateway serializes concurrent turns for one session", async () => {
  const gateway = createGateway({ turnLease: { defaultWaitTimeoutMs: 1_000 } });
  let releaseFirst!: () => void;
  let firstStarted!: () => void;
  const started = new Promise<void>(resolve => { firstStarted = resolve; });
  const provider = {
    async complete() {
      if (releaseFirst === undefined) {
        firstStarted();
        await new Promise<void>(resolve => { releaseFirst = resolve; });
      }
      return completion;
    }
  };
  const request = (message: string) => ({
    model: "fake",
    sessionId: "serialized-session",
    messages: [{ role: "user" as const, content: message }],
    toolPolicies: []
  });

  const first = gateway.executeRequest(request("one"), provider);
  await started;
  const second = gateway.executeRequest(request("two"), provider);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(releaseFirst !== undefined, true);
  releaseFirst();
  await Promise.all([first, second]);
});

test("gateway reports bounded lease timeout and cancellation", async () => {
  const gateway = createGateway({ turnLease: { defaultWaitTimeoutMs: 1_000 } });
  let release!: () => void;
  let started!: () => void;
  const firstStarted = new Promise<void>(resolve => { started = resolve; });
  const provider = {
    async complete() {
      started();
      await new Promise<void>(resolve => { release = resolve; });
      return completion;
    }
  };
  const request = (overrides: Record<string, unknown> = {}) => ({
    model: "fake",
    sessionId: "lease-diagnostics-session",
    messages: [{ role: "user" as const, content: "hello" }],
    toolPolicies: [],
    ...overrides
  });

  const first = gateway.executeRequest(request(), provider);
  await firstStarted;
  await assert.rejects(gateway.executeRequest(request({ turnLeaseTimeoutMs: 5 }), provider), error => {
    assert(error instanceof GatewayTurnLeaseError);
    assert.equal(error.code, "wait_timeout");
    return true;
  });

  const controller = new AbortController();
  const cancelled = gateway.executeRequest(request({ signal: controller.signal }), provider);
  controller.abort();
  await assert.rejects(cancelled, error => {
    assert(error instanceof GatewayTurnLeaseError);
    assert.equal(error.code, "cancelled");
    return true;
  });
  release();
  await first;
});

test("turn lease release is generation-safe", async () => {
  const manager = new GatewayTurnLeaseManager({ defaultWaitTimeoutMs: 10 });
  const first = await manager.acquire("generation-session");
  const secondPending = manager.acquire("generation-session");
  assert.equal(first.release(), true);
  const second = await secondPending;
  assert.equal(manager.release("generation-session", first.generation), false);
  await assert.rejects(manager.acquire("generation-session", { waitTimeoutMs: 1 }), error => {
    assert(error instanceof GatewayTurnLeaseError);
    assert.equal(error.code, "wait_timeout");
    return true;
  });
  assert.equal(second.release(), true);
});

test("provider terminal projections are deduplicated", async () => {
  const projected: GatewayProtocolEvent[] = [];
  const map = createGatewayEventMapper(event => projected.push(event));
  const terminal = {
    id: "terminal-one",
    requestId: "projection-request",
    sessionId: "projection-session",
    at: 1,
    type: "terminal" as const,
    outcome: "completed" as const
  };
  await map(terminal);
  await map({ ...terminal, id: "terminal-two", at: 2 });
  assert.equal(projected.length, 1);

  const transport: unknown[] = [];
  const transportMap = createTransportEventMapper(event => transport.push(event));
  await transportMap({ ...terminal, outcome: "provider_failure" });
  await transportMap({ ...terminal, id: "terminal-three", outcome: "provider_failure" });
  assert.equal((transport as Array<{ type: string }>).filter(event => event.type === "error").length, 1);
});
