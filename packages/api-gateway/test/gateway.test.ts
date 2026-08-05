import { strict as assert } from "node:assert";
import { test } from "bun:test";

import {
  clearPinnedRuntime,
  createGateway,
  executeRequest,
  normalizeGatewayRequest,
  PythonToolBridge,
  PythonRuntimeBridge,
  PYTHON_TOOL_BRIDGE_PROTOCOL_VERSION,
  PYTHON_RUNTIME_BRIDGE_PROTOCOL_VERSION,
  GatewayPythonRuntimeBridgeNotConfiguredError,
  GatewayTurnLeaseError,
  GatewayTurnLeaseManager,
  type GatewayRuntimeAdapter,
  type GatewaySessionRepository,
  type PythonToolBridgeRequest
} from "../src/index.ts";
import {
  createGatewayEventMapper,
  createTransportEventMapper,
  type GatewayProtocolEvent
} from "../src/client.ts";
import type { ProviderRequest, ProviderResult } from "chat-provider-interface";
import { HarnessProviderError, type HarnessAtomicTurnWrite } from "harness";

const completion = {
  message: { role: "assistant" as const, content: "safe" },
  usage: { inputTokens: 1, outputTokens: 1 }
};

function fakeRepository(initialMessages: readonly Record<string, unknown>[] = []) {
  const messages = new Map<string, Record<string, unknown>[]>([["restart-session", [...initialMessages]]]);
  const writes: HarnessAtomicTurnWrite[] = [];
  const runtimes = new Map<string, "harness" | "python">();
  const repository: GatewaySessionRepository = {
    async listMessages(sessionId) {
      return messages.get(sessionId) ?? [];
    },
    async commitTurn(write) {
      const current = messages.get(write.sessionId) ?? [];
      assert.equal(write.expectedNextSequence, current.length);
      writes.push(write);
      messages.set(write.sessionId, [...current, ...write.messages]);
    }
  };
  return { repository, messages, writes, runtimes };
}

function explicitTestPythonAdapter(): GatewayRuntimeAdapter {
  return {
    runtime: "python",
    supports: () => true,
    async execute(request, provider) {
      return provider.complete({
        model: request.model,
        messages: request.messages,
        tools: [],
        requestId: request.requestId
      });
    }
  };
}

test("gateway preserves legacy ChatMessage and policy snapshot inputs", async () => {
  const result = await createGateway({
    runtimeAdapters: { python: explicitTestPythonAdapter() }
  }).executeRequest({
    model: "fake",
    runtime: "python",
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
  }), /must be a string or content parts/);
  assert.throws(() => normalizeGatewayRequest({
    model: "fake",
    messages: [{ role: "user", content: "hello" }],
    toolPolicies: [{ toolName: "x", policy: "invalid" } as never]
  }), /toolPolicies\[0\] is invalid/);
  assert.equal(normalizeGatewayRequest({
    model: "fake",
    cwd: " /workspace ",
    messages: [],
    toolPolicies: []
  }).cwd, "/workspace");
  for (const cwd of ["workspace", "/workspace\u0000unsafe", "/workspace/../unsafe", "C:\\workspace\\..\\unsafe"]) {
    assert.throws(() => normalizeGatewayRequest({
      model: "fake",
      cwd,
      messages: [],
      toolPolicies: []
    }), /cwd/);
  }
});

test("session cwd set and clear is isolated through the injected store", async () => {
  const values = new Map<string, string>();
  const seen = new Map<string, string | undefined>();
  const gateway = createGateway({
    sessionCwdStore: {
      load: sessionId => values.get(sessionId),
      save: (sessionId, cwd) => { values.set(sessionId, cwd); },
      clear: sessionId => {
        if (sessionId === undefined) values.clear();
        else values.delete(sessionId);
      }
    },
    runtimeAdapters: {
      python: {
        runtime: "python",
        supports: () => true,
        async execute(request) {
          seen.set(request.sessionId, request.cwd);
          return completion;
        }
      }
    }
  });

  await gateway.setSessionCwd("session-a", "/workspace/a");
  await gateway.setSessionCwd("session-b", "/workspace/b");
  const request = (sessionId: string) => ({
    model: "fake",
    sessionId,
    runtime: "python" as const,
    messages: [{ role: "user" as const, content: "hello" }],
    toolPolicies: []
  });
  await gateway.executeRequest(request("session-a"), { async complete() { return completion; } });
  await gateway.executeRequest(request("session-b"), { async complete() { return completion; } });
  assert.deepEqual([...seen.entries()], [["session-a", "/workspace/a"], ["session-b", "/workspace/b"]]);

  await gateway.clearSessionCwd("session-a");
  await gateway.executeRequest(request("session-a"), { async complete() { return completion; } });
  assert.equal(seen.get("session-a"), undefined);
});

test("descriptor path preserves schema and metadata through harness adapter", async () => {
  clearPinnedRuntime("descriptor-session");
  const schema = { type: "object", properties: { query: { type: "string" } } } as const;
  const bridge = new PythonToolBridge({ send: async request => ({
    protocolVersion: PYTHON_TOOL_BRIDGE_PROTOCOL_VERSION,
    type: "tool.result",
    requestId: request.requestId,
    toolCallId: request.toolCallId,
    content: "unused"
  }) });
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
    }],
    pythonToolBridge: bridge,
    pythonToolBridgeOptions: { cwd: "/workspace" }
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

test("harness automatically executes reference descriptors through the injected bridge", async () => {
  const requests: PythonToolBridgeRequest[] = [];
  const deadline = Date.now() + 5_000;
  const bridge = new PythonToolBridge({
    async send(request) {
      requests.push(request);
      return {
        protocolVersion: PYTHON_TOOL_BRIDGE_PROTOCOL_VERSION,
        type: "tool.result",
        requestId: request.requestId,
        toolCallId: request.toolCallId,
        content: request.toolCallId === "call-a" ? "abcdef" : "second"
      };
    }
  });
  const providerMessages: ProviderRequest[] = [];
  let providerCalls = 0;
  const result = await createGateway().executeRequest({
    model: "fake",
    requestId: "request-reference",
    sessionId: "reference-session",
    runtime: "harness",
    cwd: "/session-workspace",
    deadline,
    messages: [{ role: "user", content: "lookup" }],
    toolPolicies: [
      {
        name: "first",
        description: "first",
        inputSchema: { type: "object", required: ["query"], properties: { query: { type: "string" } } },
        source: "python",
        executable: { reference: "python:first" },
        policy: "allow"
      },
      {
        name: "second",
        description: "second",
        inputSchema: { type: "object", properties: {} },
        source: "python",
        executable: { reference: "python:second" },
        policy: "allow"
      }
    ],
    pythonToolBridge: bridge,
    pythonToolBridgeOptions: {
      cwd: "/workspace",
      environment: { PATH: "/bin", SECRET: "hidden" },
      environmentAllowlist: ["PATH"]
    },
    toolOutputLimits: { maxBytes: 4 }
  }, {
    async complete(request) {
      providerCalls += 1;
      providerMessages.push(request);
      if (providerCalls === 1) {
        return {
          message: {
            role: "assistant",
            content: "",
            toolCalls: [
              { id: "call-a", name: "first", arguments: JSON.stringify({ query: "one" }) },
              { id: "call-b", name: "second", arguments: "{}" }
            ]
          },
          usage: { inputTokens: 1, outputTokens: 1 }
        };
      }
      return completion;
    }
  });

  assert.equal(result.message.content, "safe");
  assert.equal(providerCalls, 2);
  assert.deepEqual(requests.map(request => ({
    requestId: request.requestId,
    toolCallId: request.toolCallId,
    cwd: request.cwd,
    env: request.env,
    deadline: request.deadline
  })), [
    { requestId: "request-reference", toolCallId: "call-a", cwd: "/session-workspace", env: { PATH: "/bin" }, deadline },
    { requestId: "request-reference", toolCallId: "call-b", cwd: "/session-workspace", env: { PATH: "/bin" }, deadline }
  ]);
  assert.deepEqual(providerMessages[1]?.messages.slice(-2).map(message => ({
    role: message.role,
    toolCallId: message.toolCallId,
    content: message.content
  })), [
    { role: "tool", toolCallId: "call-a", content: "abcd" },
    { role: "tool", toolCallId: "call-b", content: "seco" }
  ]);
});

test("reference execution fails closed before provider effects when bridge or schema is unsafe", async () => {
  let providerCalls = 0;
  const base = {
    model: "fake",
    runtime: "harness" as const,
    messages: [{ role: "user" as const, content: "lookup" }],
    toolPolicies: [{
      name: "lookup",
      description: "lookup",
      inputSchema: { type: "object" },
      source: "python",
      executable: { reference: "python:lookup" },
      policy: "allow" as const
    }]
  };
  const provider = {
    async complete() {
      providerCalls += 1;
      return completion;
    }
  };

  await assert.rejects(() => createGateway().executeRequest(base, provider), /No Python tool bridge/);
  assert.equal(providerCalls, 0);

  let bridgeCalls = 0;
  const bridge = new PythonToolBridge({
    async send() {
      bridgeCalls += 1;
      throw new Error("bridge must not be reached");
    }
  });
  await assert.rejects(() => createGateway().executeRequest({
    ...base,
    pythonToolBridge: bridge,
    pythonToolBridgeOptions: {}
  }, provider), /cwd is not configured/);
  assert.equal(providerCalls, 0);
  assert.equal(bridgeCalls, 0);

  await assert.rejects(() => createGateway().executeRequest({
    ...base,
    toolPolicies: [{ ...base.toolPolicies[0], executable: { reference: "python:lookup\nunsafe" } }]
  }, provider), /Unsafe Python tool bridge reference/);
  assert.equal(providerCalls, 0);

  const invalidArgumentsBridge = new PythonToolBridge({ send: async () => {
    throw new Error("bridge must not be reached for invalid arguments");
  } });
  await assert.rejects(() => createGateway().executeRequest({
    ...base,
    pythonToolBridge: invalidArgumentsBridge,
    pythonToolBridgeOptions: { cwd: "/workspace" }
  }, {
    async complete() {
      providerCalls += 1;
      return {
        message: {
          role: "assistant",
          content: "",
          toolCalls: [{ id: "invalid", name: "lookup", arguments: JSON.stringify({ value: 1 }) }]
        },
        usage: { inputTokens: 1, outputTokens: 1 }
      };
    }
  }), /Harness execution failed/);
  assert.equal(providerCalls, 1);
});

test("configured Python runtime owns the whole turn and never calls the injected provider", async () => {
  let providerCalls = 0;
  let seenRequest: Record<string, unknown> | undefined;
  const runtimeBridge = new PythonRuntimeBridge({
    async send(request, options) {
      seenRequest = request as unknown as Record<string, unknown>;
      await options.onEvent?.({
        protocolVersion: PYTHON_RUNTIME_BRIDGE_PROTOCOL_VERSION,
        type: "runtime.event",
        requestId: request.requestId,
        sessionId: request.sessionId,
        event: { type: "started" }
      });
      return {
        protocolVersion: PYTHON_RUNTIME_BRIDGE_PROTOCOL_VERSION,
        type: "runtime.result",
        requestId: request.requestId,
        sessionId: request.sessionId,
        result: completion
      };
    }
  });
  const result = await createGateway({
    pythonRuntimeBridge: runtimeBridge,
    pythonRuntimeBridgeOptions: {
      cwd: "/workspace",
      environment: { PATH: "/bin", SECRET: "not forwarded" },
      environmentAllowlist: ["PATH"],
      credentialHandles: ["credential:one"]
    }
  }).executeRequest({
    model: "python-model",
    sessionId: "python-session",
    runtime: "python",
    messages: [{ role: "user", content: "hello" }],
    toolPolicies: [{ toolName: "search", policy: "allow" }]
  }, {
    async complete() {
      providerCalls += 1;
      return completion;
    }
  });

  assert.deepEqual(result, completion);
  assert.equal(providerCalls, 0);
  assert.equal(seenRequest?.model, "python-model");
  assert.deepEqual(seenRequest?.environment, { PATH: "/bin" });
  assert.deepEqual(seenRequest?.credentialHandles, ["credential:one"]);
  assert.equal(seenRequest?.type, "runtime.turn");
});

test("Python runtime fails closed before provider effects when no bridge is configured", async () => {
  let providerCalls = 0;
  await assert.rejects(() => createGateway().executeRequest({
    model: "python-model",
    sessionId: "unconfigured-python-session",
    runtime: "python",
    messages: [{ role: "user", content: "hello" }],
    toolPolicies: []
  }, {
    async complete() {
      providerCalls += 1;
      return completion;
    }
  }), error => {
    assert(error instanceof GatewayPythonRuntimeBridgeNotConfiguredError);
    return true;
  });
  assert.equal(providerCalls, 0);
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
    }],
    runtimeFallback: {
      runtime: "python",
      supports: () => true,
      async execute(request, provider) {
        const result = await provider.complete({
          model: request.model,
          messages: request.messages,
          tools: request.tools as unknown as ProviderRequest["tools"],
          requestId: request.requestId
        });
        return result;
      }
    }
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

test("gateway instances reload runtime selection from a shared store", async () => {
  const selections = new Map<string, "harness" | "python">();
  const store = {
    load: (sessionId: string) => selections.get(sessionId),
    save: (sessionId: string, runtime: "harness" | "python") => selections.set(sessionId, runtime)
  };
  const firstGateway = createGateway({ runtimeSelectionStore: store });
  const reloadedGateway = createGateway({ runtimeSelectionStore: store });
  const requestShapes: boolean[] = [];
  const provider = {
    async complete(request: ProviderRequest) {
      requestShapes.push(request.signal !== undefined);
      return completion;
    }
  };

  await firstGateway.executeRequest({
    model: "fake",
    sessionId: "shared-session",
    runtime: "harness",
    messages: [{ role: "user", content: "one" }],
    toolPolicies: []
  }, provider);
  await reloadedGateway.executeRequest({
    model: "fake",
    sessionId: "shared-session",
    runtime: "python",
    messages: [{ role: "user", content: "two" }],
    toolPolicies: []
  }, provider);

  assert.equal(selections.get("shared-session"), "harness");
  assert.deepEqual(requestShapes, [true, true]);
});

test("runtime selection is immutable while a turn is executing", async () => {
  const selections = new Map<string, "harness" | "python">();
  const store = {
    load: (sessionId: string) => selections.get(sessionId),
    save: (sessionId: string, runtime: "harness" | "python") => selections.set(sessionId, runtime)
  };
  const gateway = createGateway({ runtimeSelectionStore: store });
  let releaseProvider: (() => void) | undefined;
  const provider = {
    async complete(request: ProviderRequest) {
      assert.equal(request.signal !== undefined, true);
      await new Promise<void>(resolve => { releaseProvider = resolve; });
      return completion;
    }
  };

  const turn = gateway.executeRequest({
    model: "fake",
    sessionId: "immutable-session",
    runtime: "harness",
    messages: [{ role: "user", content: "one" }],
    toolPolicies: []
  }, provider);
  await new Promise(resolve => setTimeout(resolve, 0));
  await store.save("immutable-session", "python");
  releaseProvider?.();
  await turn;

  assert.equal(selections.get("immutable-session"), "python");
});

test("injected gateway uses explicit fallback once when selected runtime is unsupported", async () => {
  const selections = new Map<string, "harness" | "python">();
  const store = {
    load: (sessionId: string) => selections.get(sessionId),
    save: (sessionId: string, runtime: "harness" | "python") => selections.set(sessionId, runtime)
  };
  const gateway = createGateway({ runtimeSelectionStore: store });
  let calls = 0;
  await gateway.executeRequest({
    model: "fake",
    sessionId: "injected-fallback-session",
    runtime: "harness",
    runtimeFallback: {
      runtime: "python",
      supports: () => true,
      async execute(request, provider) {
        calls += 1;
        return await provider.complete({
          model: request.model,
          messages: request.messages.map(message => ({ role: message.role, content: message.content as string })),
          tools: []
        });
      }
    },
    messages: [{ role: "user", content: "hello" }],
    toolPolicies: [{
      name: "boolean-schema",
      description: "legacy",
      inputSchema: true,
      source: "python",
      executable: { reference: "python:boolean-schema" },
      policy: "allow"
    }]
  }, { async complete() { return completion; } });

  assert.equal(calls, 1);
  assert.equal(selections.get("injected-fallback-session"), "python");
});

test("injected session repository resumes persisted history after gateway restart", async () => {
  const fake = fakeRepository([{ role: "user", content: "start" }]);
  const runtimeSelectionStore = {
    load: (sessionId: string) => fake.runtimes.get(sessionId),
    save: (sessionId: string, runtime: "harness" | "python") => fake.runtimes.set(sessionId, runtime)
  };
  let providerCalls = 0;
  let toolEffects = 0;
  const provider = {
    async complete(request: ProviderRequest) {
      providerCalls += 1;
      if (request.messages.some(message => message.role === "tool")) return completion;
      return {
        message: {
          role: "assistant" as const,
          content: "",
          toolCalls: [{ id: "once", name: "once", arguments: "{}" }]
        },
        usage: { inputTokens: 1, outputTokens: 1 }
      };
    }
  };
  const request = {
    model: "fake",
    sessionId: "restart-session",
    runtime: "harness" as const,
    messages: [{ role: "user" as const, content: "start" }],
    toolPolicies: [{ toolName: "once", policy: "allow" as const }],
    toolExecutor: async () => {
      toolEffects += 1;
      return { content: "done" };
    },
    sessionRepository: fake.repository
  };

  await createGateway({ runtimeSelectionStore }).executeRequest(request, provider);
  await createGateway({ runtimeSelectionStore }).executeRequest({
    ...request,
    runtime: "python",
    messages: [{ role: "user", content: "resume" }]
  }, provider);

  assert.equal(fake.runtimes.get("restart-session"), "harness");
  assert.equal(toolEffects, 1);
  assert.equal(providerCalls, 3);
  assert.equal(fake.writes.length, 3);
  assert.deepEqual(fake.writes[0]?.messages.map(message => message.role), ["assistant", "tool"]);
  assert.equal(fake.messages.get("restart-session")?.some(message => message.role === "tool"), true);
});

test("normalized requests retain the injected session repository for harness execution", () => {
  const fake = fakeRepository();
  const normalized = normalizeGatewayRequest({
    model: "fake",
    messages: [{ role: "user", content: "hello" }],
    toolPolicies: [],
    sessionRepository: fake.repository
  });

  assert.equal(normalized.sessionRepository, fake.repository);
});

test("harness runtime passes provider request and result fidelity through the gateway", async () => {
  clearPinnedRuntime("fidelity-session");
  const controller = new AbortController();
  const options = {
    temperature: 0.25,
    maxOutputTokens: 128,
    reasoningEffort: "high" as const,
    responseFormat: "json" as const
  };
  const cacheHints = { key: "prompt-v1", read: true, write: true, ttlMs: 60_000 };
  const metadata = { traceId: "trace-request", labels: ["gateway"] };
  const requestIdentity = { requestId: "fidelity-request", attempt: 4, parentRequestId: "parent-1" };
  const deadline = Date.now() + 4_000;
  const providerResult: ProviderResult = {
    message: {
      role: "assistant",
      content: [
        { type: "text", text: "answer" },
        { type: "reasoning", text: "because" }
      ],
      reasoning: "because",
      metadata: { messageTrace: "trace-message" }
    },
    usage: {
      inputTokens: 11,
      outputTokens: 7,
      totalTokens: 18,
      reasoningTokens: 3,
      cachedInputTokens: 5,
      cacheCreationInputTokens: 2,
      cacheReadInputTokens: 3
    },
    finishReason: "stop",
    reasoning: "because",
    toolResults: [{
      toolCallId: "call-1",
      content: [{ type: "text", text: "tool output" }],
      isError: false
    }],
    requestId: "provider-request",
    identity: { requestId: "provider-request", attempt: 4, parentRequestId: "parent-1" },
    metadata: { traceId: "trace-provider" }
  };
  let seen: ProviderRequest | undefined;
  const result = await createGateway().executeRequest({
    model: "fidelity-model",
    sessionId: "fidelity-session",
    runtime: "harness",
    requestId: "fidelity-request",
    identity: requestIdentity,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: "hello" },
        { type: "reasoning", text: "context" }
      ],
      metadata: { source: "client" }
    }],
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
  assert.deepEqual(seen.messages, [{
    role: "user",
    content: [
      { type: "text", text: "hello" },
      { type: "reasoning", text: "context" }
    ],
    metadata: { source: "client" }
  }]);
  assert.deepEqual(seen.options, options);
  assert.deepEqual(seen.cacheHints, cacheHints);
  assert.deepEqual(seen.metadata, metadata);
  assert.equal(seen.requestId, "fidelity-request");
  assert.deepEqual(seen.identity, requestIdentity);
  assert.equal(seen.signal, seen.cancellation);
  assert.equal(seen.timeoutMs, 5_000);
  assert.equal(seen.deadline, deadline);
  assert.deepEqual(result, providerResult);
});

test("gateway forwards supported multimodal content without flattening it", async () => {
  let calls = 0;
  let seen: ProviderRequest | undefined;
  await executeRequest({
    model: "fake",
    runtime: "harness",
    messages: [{
      role: "user",
      content: [{ type: "image", url: "https://example.test/image.png" }]
    } as never],
    toolPolicies: []
  }, {
    async complete(request) {
      calls += 1;
      seen = request;
      return completion;
    }
  });
  assert.equal(calls, 1);
  assert.deepEqual(seen?.messages[0]?.content, [{ type: "image", url: "https://example.test/image.png" }]);
});

test("gateway increments provider identity attempts across harness retries", async () => {
  clearPinnedRuntime("attempt-session");
  const requests: ProviderRequest[] = [];
  let calls = 0;
  await executeRequest({
    model: "retry-model",
    sessionId: "attempt-session",
    runtime: "harness",
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

test("gateway forwards provider streams and restores stream fidelity omitted by harness collection", async () => {
  clearPinnedRuntime("stream-fidelity-session");
  const options = { maxTokens: 64, reasoningEffort: "medium" as const };
  const cacheHints = { key: "stream-prompt", read: true };
  const metadata = { traceId: "stream-request" };
  const requestIdentity = { requestId: "stream-request", attempt: 9, parentRequestId: "parent-stream" };
  let completeCalled = false;
  let seen: ProviderRequest | undefined;
  const result = await executeRequest({
    model: "stream-model",
    sessionId: "stream-fidelity-session",
    runtime: "harness",
    requestId: "stream-request",
    identity: requestIdentity,
    messages: [{ role: "user", content: "hello" }],
    toolPolicies: [],
    options,
    cacheHints,
    metadata
  }, {
    async complete() {
      completeCalled = true;
      throw new Error("complete should not be called when stream is available");
    },
    async *stream(request) {
      seen = request;
      yield { type: "start", requestId: "stream-request", identity: requestIdentity, metadata: { startPhase: true } };
      yield { type: "text-delta", text: "hello" };
      yield { type: "reasoning-delta", text: "why" };
      yield {
        type: "tool-result",
        toolCallId: "call-1",
        content: [{ type: "text", text: "found" }],
        isError: false
      };
      yield { type: "usage", usage: {
        inputTokens: 6,
        outputTokens: 5,
        totalTokens: 11,
        reasoningTokens: 2,
        cachedInputTokens: 1,
        cacheCreationInputTokens: 2,
        cacheReadInputTokens: 1
      }, metadata: { usagePhase: true } };
      yield {
        type: "finish",
        finishReason: "tool_call",
        usage: { inputTokens: 6, outputTokens: 5, totalTokens: 11, reasoningTokens: 2 },
        metadata: { finishPhase: true },
        requestId: "stream-request",
        identity: requestIdentity
      };
    }
  });

  assert.equal(completeCalled, false);
  assert.ok(seen);
  assert.deepEqual(seen.options, options);
  assert.deepEqual(seen.cacheHints, cacheHints);
  assert.deepEqual(seen.metadata, metadata);
  assert.deepEqual(seen.identity, { ...requestIdentity, attempt: 9 });
  assert.deepEqual(result.message.content, [
    { type: "text", text: "hello" },
    { type: "tool-result", toolCallId: "call-1", content: [{ type: "text", text: "found" }], isError: false }
  ]);
  assert.equal(result.message.reasoning, "why");
  assert.equal(result.message.toolCalls, undefined);
  assert.deepEqual(result.toolResults, [{
    toolCallId: "call-1",
    content: [{ type: "text", text: "found" }],
    isError: false
  }]);
  assert.deepEqual(result.usage, {
    inputTokens: 6,
    outputTokens: 5,
    totalTokens: 11,
    reasoningTokens: 2,
    cachedInputTokens: 1,
    cacheCreationInputTokens: 2,
    cacheReadInputTokens: 1
  });
  assert.equal(result.finishReason, "tool_call");
  assert.deepEqual(result.identity, requestIdentity);
  assert.deepEqual(result.metadata, {
    startPhase: true,
    usagePhase: true,
    finishPhase: true
  });
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
    runtime: "harness" as const,
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

test("gateway allows independent sessions to execute concurrently", async () => {
  const gateway = createGateway({ turnLease: { defaultWaitTimeoutMs: 1_000 } });
  let active = 0;
  let maximumActive = 0;
  let release!: () => void;
  const bothStarted = new Promise<void>(resolve => { release = resolve; });
  const provider = {
    async complete() {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      if (maximumActive === 2) release();
      await bothStarted;
      active -= 1;
      return completion;
    }
  };
  const request = (sessionId: string) => ({
    model: "fake",
    sessionId,
    runtime: "harness" as const,
    messages: [{ role: "user" as const, content: sessionId }],
    toolPolicies: []
  });

  await Promise.all([
    gateway.executeRequest(request("independent-a"), provider),
    gateway.executeRequest(request("independent-b"), provider)
  ]);
  assert.equal(maximumActive, 2);
});

test("gateway reports bounded lease timeout and cancellation diagnostics", async () => {
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
    runtime: "harness" as const,
    messages: [{ role: "user" as const, content: "hello" }],
    toolPolicies: [],
    ...overrides
  });

  const first = gateway.executeRequest(request(), provider);
  await firstStarted;
  await assert.rejects(gateway.executeRequest(request({ turnLeaseTimeoutMs: 5 }), provider), error => {
    assert(error instanceof GatewayTurnLeaseError);
    assert.equal(error.code, "wait_timeout");
    assert.equal(error.diagnostics.sessionId, "lease-diagnostics-session");
    assert.equal(error.diagnostics.queueDepth, 1);
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

test("provider deltas project in order and terminal output is deduplicated", async () => {
  const gatewayEvents: GatewayProtocolEvent[] = [];
  const transportEvents: unknown[] = [];
  await createGateway().executeRequest({
    model: "stream-model",
    requestId: "projection-request",
    sessionId: "projection-session",
    runtime: "harness",
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
      yield { type: "finish" as const, finishReason: "stop" as const };
    },
    async complete() {
      throw new Error("stream should be selected");
    }
  });

  assert.deepEqual(gatewayEvents.map(event => event.type), [
    "message.start",
    "status.update",
    "status.update",
    "message.delta",
    "reasoning.delta",
    "status.update",
    "status.update",
    "status.update",
    "message.complete"
  ]);
  assert.deepEqual((transportEvents as Array<{ type: string }>).map(event => event.type), [
    "session.started",
    "message.delta",
    "usage.updated",
    "usage.updated"
  ]);

  const projectedTerminalEvents: GatewayProtocolEvent[] = [];
  const map = createGatewayEventMapper(event => projectedTerminalEvents.push(event));
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
  assert.equal(projectedTerminalEvents.length, 1);

  const transportMap = createTransportEventMapper(event => transportEvents.push(event));
  await transportMap({ ...terminal, outcome: "provider_failure" });
  await transportMap({ ...terminal, id: "terminal-three", outcome: "provider_failure" });
  assert.equal((transportEvents as Array<{ type: string }>).filter(event => event.type === "error").length, 1);
});
