import { assert } from "./assert.ts";

import {
  HarnessProviderError,
  HarnessUnsupportedContextSourceError,
  classifyHarnessProviderError,
  boundedBackoff,
  boundedMaxAttempts,
  executeHarness,
  type HarnessAtomicTurnWrite,
  type HarnessEvent,
  type HarnessMessage,
  type HarnessProvider,
  type HarnessProviderRequest,
  type HarnessProviderResult,
  type HarnessRequest,
  type HarnessToolCheckpoint,
  boundToolResult,
  enforceToolTurnBudget,
  generatePreview,
  truncateTerminalOutput,
  truncateUtf8,
  utf8Bytes,
  type ToolOutputResult,
  estimateRequestTokensRough
} from "../src/index.ts";

function response(message: HarnessMessage, inputTokens = 1, outputTokens = 1) {
  return { message, usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens } };
}

function request(provider: HarnessProvider, overrides: Partial<HarnessRequest> = {}): HarnessRequest {
  let nextId = 0;
  return {
    requestId: "request-1",
    sessionId: "session-1",
    model: "fake",
    messages: [{ role: "user", content: "hello" }],
    tools: [],
    provider,
    clock: { now: () => 1_000 },
    sleeper: { sleep: async () => undefined },
    idGenerator: kind => `${kind}-${++nextId}`,
    ...overrides
  };
}

test("text-only loop emits one terminal event in order", async () => {
  const events: HarnessEvent[] = [];
  const result = await executeHarness(request({
    async complete(providerRequest) {
      assert.equal(providerRequest.signal.aborted, false);
      return response({ role: "assistant", content: "world" });
    }
  }, { eventSink: event => events.push(event) }));

  assert.equal(result.outcome, "completed");
  assert.deepEqual(events.map(event => event.type), ["request.started", "provider.requested", "provider.completed", "terminal"]);
  assert.equal(events.filter(event => event.type === "terminal").length, 1);
});

test("context source routes unsupported context before persistence, provider, or tool effects", async () => {
  const events: HarnessEvent[] = [];
  const effects: string[] = [];
  const result = await executeHarness(request({
    async complete() {
      effects.push("provider");
      return response({ role: "assistant", content: "must not run" });
    }
  }, {
    eventSink: event => events.push(event),
    contextSource: async context => {
      effects.push("context");
      assert.equal(context.messages[0]?.content, "hello");
      throw new HarnessUnsupportedContextSourceError("memory");
    },
    persistence: {
      async ensureSession() {
        effects.push("session");
      }
    },
    tools: [{ name: "write", policy: "allow" }],
    toolExecutor: async () => {
      effects.push("tool");
      return { content: "must not run" };
    }
  }));

  assert.equal(result.outcome, "unsupported");
  assert.equal(result.error.category, "unsupported");
  assert.equal(result.error.reason, "unsupported-context-source");
  assert.deepEqual(effects, ["context"]);
  assert.deepEqual(events.map(event => event.type), ["request.started", "terminal"]);
  assert.equal(events[1]?.outcome, "unsupported");
});

test("unsupported model and token shapes terminate before provider or session effects", async () => {
  let providerCalls = 0;
  let sessionEffects = 0;
  const modelResult = await executeHarness(request({
    async complete() {
      providerCalls += 1;
      return response({ role: "assistant", content: "must not run" });
    }
  }, {
    model: " " as never,
    persistence: { async ensureSession() { sessionEffects += 1; } }
  }));
  assert.equal(modelResult.outcome, "unsupported");
  assert.equal(modelResult.error.reason, "unsupported-model");

  const tokenResult = await executeHarness(request({
    async complete() {
      providerCalls += 1;
      return response({ role: "assistant", content: "must not run" });
    }
  }, {
    messages: [{
      role: "user",
      content: [{ type: "file", url: "file://unsupported" }]
    }] as never,
    persistence: { async ensureSession() { sessionEffects += 1; } }
  }));
  assert.equal(tokenResult.outcome, "unsupported");
  assert.equal(tokenResult.error.reason, "unsupported-token-shape");
  assert.equal(providerCalls, 0);
  assert.equal(sessionEffects, 0);
});

test("one tool call executes with parsed arguments, then completes", async () => {
  const calls: string[] = [];
  let providerCalls = 0;
  const result = await executeHarness(request({
    async complete(providerRequest) {
      providerCalls += 1;
      if (providerCalls === 1) {
        return response({
          role: "assistant",
          content: "",
          toolCalls: [{ id: "call-1", name: "weather", arguments: '{"city":"Paris"}' }]
        });
      }
      const toolMessage = providerRequest.messages.at(-1);
      assert.equal(toolMessage?.role, "tool");
      assert.equal(toolMessage?.content, "sunny");
      return response({ role: "assistant", content: "Paris is sunny" });
    }
  }, {
    tools: [{ name: "weather", policy: "allow" }],
    toolExecutor: async execution => {
      calls.push(`${execution.call.name}:${execution.arguments.city}`);
      return { content: "sunny" };
    }
  }));

  assert.equal(result.outcome, "completed");
  assert.deepEqual(calls, ["weather:Paris"]);
  assert.equal(providerCalls, 2);
});

test("tool checkpoints are durable before and after the tool side effect", async () => {
  const order: string[] = [];
  const checkpoints: HarnessToolCheckpoint[] = [];
  let providerCalls = 0;
  const result = await executeHarness(request({
    async complete() {
      providerCalls += 1;
      return providerCalls === 1
        ? response({
          role: "assistant",
          content: "",
          toolCalls: [{ id: "checkpointed", name: "write", arguments: "{}" }]
        })
        : response({ role: "assistant", content: "done" });
    }
  }, {
    tools: [{ name: "write", policy: "allow" }],
    toolExecutor: async () => {
      order.push("execute");
      return { content: "written" };
    },
    persistence: {
      async checkpoint(checkpoint) {
        order.push(`checkpoint:${checkpoint.phase}`);
        checkpoints.push(checkpoint);
      }
    }
  }));

  assert.equal(result.outcome, "completed");
  assert.deepEqual(order, ["checkpoint:before-tool", "execute", "checkpoint:tool-completed"]);
  assert.deepEqual(checkpoints[0]?.pendingToolCallIds, ["checkpointed"]);
  assert.equal(checkpoints[1]?.result?.content, "written");
});

test("checkpoint failure aborts before the tool side effect", async () => {
  let executed = false;
  let checkpoints = 0;
  const result = await executeHarness(request({
    async complete() {
      return response({
        role: "assistant",
        content: "",
        toolCalls: [{ id: "blocked", name: "write", arguments: "{}" }]
      });
    }
  }, {
    tools: [{ name: "write", policy: "allow" }],
    toolExecutor: async () => {
      executed = true;
      return { content: "must not run" };
    },
    persistence: {
      async checkpoint(checkpoint) {
        checkpoints += 1;
        if (checkpoint.phase === "before-tool") throw new Error("checkpoint unavailable");
      }
    }
  }));

  assert.equal(result.outcome, "provider_failure");
  assert.equal(result.error.category, "persistence");
  assert.equal(checkpoints, 1);
  assert.equal(executed, false);
});

test("fresh-session setup fails before the provider is called", async () => {
  let providerCalls = 0;
  const result = await executeHarness(request({
    async complete() {
      providerCalls += 1;
      return response({ role: "assistant", content: "must not run" });
    }
  }, {
    persistence: {
      async ensureSession() {
        throw new Error("storage is read-only");
      }
    }
  }));

  assert.equal(result.outcome, "provider_failure");
  assert.equal(result.error.category, "persistence");
  assert.equal(providerCalls, 0);
});

test("inbound user persistence is ordered and not duplicated on resume", async () => {
  const firstWrites: HarnessAtomicTurnWrite[] = [];
  const first = await executeHarness(request({
    async complete() {
      return response({ role: "assistant", content: "answer" });
    }
  }, {
    persistence: {
      async commitTurn(write) {
        firstWrites.push(write);
      }
    }
  }));

  assert.equal(first.outcome, "completed");
  assert.deepEqual(firstWrites[0]?.messages.map(message => message.role), ["user", "assistant"]);

  const secondWrites: HarnessAtomicTurnWrite[] = [];
  const resumed = firstWrites[0]?.messages as unknown as readonly HarnessMessage[];
  const second = await executeHarness(request({
    async complete() {
      return response({ role: "assistant", content: "answer again" });
    }
  }, {
    messages: [{ role: "user", content: "hello" }],
    loadMessages: async () => resumed,
    persistence: {
      async commitTurn(write) {
        secondWrites.push(write);
      }
    }
  }));

  assert.equal(second.outcome, "completed");
  assert.deepEqual(secondWrites[0]?.messages.map(message => message.role), ["assistant"]);
});

test("atomic writes preserve structured assistant and tool sidecars", async () => {
  const writes: HarnessAtomicTurnWrite[] = [];
  let providerCalls = 0;
  const result = await executeHarness(request({
    async complete() {
      providerCalls += 1;
      if (providerCalls === 1) {
        return {
          message: {
            role: "assistant",
            content: [
              { type: "text", text: "lookup" },
              { type: "reasoning", text: "because" },
              { type: "tool-call", id: "sidecar-call", name: "lookup", arguments: "{}" }
            ],
            reasoning: "because",
            toolCalls: [{ id: "sidecar-call", name: "lookup", arguments: "{}" }],
            apiContent: [{ type: "text", text: "provider lookup" }],
            displayKind: "assistant-card",
            displayMetadata: { source: "provider" },
            synthetic: false,
            context: { trace: "assistant" }
          } as unknown as HarnessMessage,
          usage: {
            inputTokens: 11,
            outputTokens: 7,
            totalTokens: 18,
            reasoningTokens: 3,
            cachedInputTokens: 5,
            cacheCreationInputTokens: 2,
            cacheReadInputTokens: 3
          }
        };
      }
      return response({ role: "assistant", content: "done" });
    }
  }, {
    tools: [{ name: "lookup", policy: "allow" }],
    toolExecutor: async () => ({
      content: [
        { type: "text", text: "value" },
        { type: "reasoning", text: "tool reasoning" }
      ],
      apiContent: [{ type: "text", text: "raw value" }],
      displayKind: "tool-card",
      displayMetadata: { source: "tool" },
      synthetic: true,
      context: { trace: "tool" }
    }),
    persistence: {
      async commitTurn(write) {
        writes.push(write);
      }
    }
  }));

  assert.equal(result.outcome, "completed");
  assert.equal(writes.length, 2);
  const assistant = writes[0]?.messages[1];
  const tool = writes[0]?.messages[2];
  assert.deepEqual(assistant?.content, [
    { type: "text", text: "lookup" },
    { type: "reasoning", text: "because" },
    { type: "tool-call", id: "sidecar-call", name: "lookup", arguments: "{}" }
  ]);
  assert.equal(assistant?.reasoning, "because");
  assert.deepEqual(assistant?.apiContent, [{ type: "text", text: "provider lookup" }]);
  assert.deepEqual(assistant?.displayMetadata, { source: "provider" });
  assert.deepEqual(assistant?.context, { trace: "assistant" });
  assert.deepEqual(tool?.content, [
    { type: "text", text: "value" },
    { type: "reasoning", text: "tool reasoning" }
  ]);
  assert.deepEqual(tool?.toolResult?.content, tool?.content);
  assert.deepEqual(tool?.apiContent, [{ type: "text", text: "raw value" }]);
  assert.deepEqual(tool?.displayMetadata, { source: "tool" });
  assert.deepEqual(tool?.context, { trace: "tool" });
  assert.equal(writes[0]?.messages[1]?.usage?.reasoningTokens, 3);
  const usage = writes[0]?.usage;
  assert.equal((Array.isArray(usage) ? usage[0] : usage)?.usage.cacheReadInputTokens, 3);
});

test("api content replaces display content only in provider tool-loop requests", async () => {
  const writes: HarnessAtomicTurnWrite[] = [];
  let providerCalls = 0;
  const result = await executeHarness(request({
    async complete(providerRequest) {
      providerCalls += 1;
      assert.equal("apiContent" in providerRequest.messages[0]!, false);
      assert.equal(providerRequest.messages[0]?.content, "api request");
      if (providerCalls === 1) {
        return response({
          role: "assistant",
          content: "display tool request",
          apiContent: "api tool request",
          toolCalls: [{ id: "api-call", name: "lookup", arguments: "{}" }]
        } as HarnessMessage);
      }
      assert.equal(providerRequest.messages[1]?.content, "api tool request");
      assert.equal(providerRequest.messages[2]?.content, "api result");
      return response({ role: "assistant", content: "done" });
    }
  }, {
    messages: [{ role: "user", content: "display request", apiContent: "api request" }],
    tools: [{ name: "lookup", policy: "allow" }],
    toolExecutor: async () => ({ content: "display result", apiContent: "api result" }),
    persistence: { async commitTurn(write) { writes.push(write); } }
  }));

  assert.equal(result.outcome, "completed");
  assert.equal(providerCalls, 2);
  assert.equal(writes[0]?.messages[0]?.content, "display request");
  assert.equal(writes[0]?.messages[0]?.apiContent, "api request");
  assert.equal(writes[0]?.messages[1]?.content, "display tool request");
  assert.equal(writes[0]?.messages[1]?.apiContent, "api tool request");
  assert.equal(writes[0]?.messages[2]?.content, "display result");
  assert.equal(writes[0]?.messages[2]?.apiContent, "api result");
});

test("context assembly runs once for retries and once for each tool-loop turn", async () => {
  let providerCalls = 0;
  let assemblies = 0;
  const seenPrompts: string[] = [];
  const result = await executeHarness(request({
    async complete(providerRequest) {
      providerCalls += 1;
      seenPrompts.push(String(providerRequest.messages[0]?.content));
      if (providerCalls === 1) {
        throw new HarnessProviderError("busy", { category: "overloaded" });
      }
      if (providerCalls === 2) {
        return response({
          role: "assistant",
          content: "",
          toolCalls: [{ id: "assemble-call", name: "lookup", arguments: "{}" }]
        });
      }
      return response({ role: "assistant", content: "done" });
    }
  }, {
    retryPolicy: { maxAttempts: 2 },
    tools: [{ name: "lookup", policy: "allow" }],
    toolExecutor: async () => ({ content: "result" }),
    contextAssembler: async context => {
      assemblies += 1;
      return [{ role: "system", content: `injected-${assemblies}` }, ...context.messages];
    }
  }));

  assert.equal(result.outcome, "completed");
  assert.equal(providerCalls, 3);
  assert.equal(assemblies, 2);
  assert.deepEqual(seenPrompts, ["injected-1", "injected-1", "injected-2"]);
});

test("final atomic write carries runtime, checkpoint, and recovery metadata", async () => {
  const writes: HarnessAtomicTurnWrite[] = [];
  const runtime = {
    runtimeVersion: "harness-test",
    schemaVersion: 1 as const,
    migratedFromSchemaVersion: 0,
    migrationId: "migration-1",
    migratedAt: "2026-08-05T00:00:00.000Z"
  };
  const result = await executeHarness(request({
    async complete() {
      return response({ role: "assistant", content: "done" });
    }
  }, {
    runtime,
    persistence: {
      async commitTurn(write) {
        writes.push(write);
      }
    }
  }));

  assert.equal(result.outcome, "completed");
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0]?.checkpoint?.runtime, runtime);
  assert.deepEqual(writes[0]?.migrationState?.runtime, runtime);
  assert.equal(writes[0]?.checkpoint?.messageSequence, 2);
  assert.equal(writes[0]?.migrationState?.recovery?.status, "recoverable");
  assert.equal(writes[0]?.migrationState?.recovery?.turnId, "request-1");
  assert.equal(writes[0]?.migrationState?.recovery?.checkpointId, "request-1:checkpoint");
});

test("recovery metadata supplies completed tool results without replaying the call", async () => {
  const completedCall = { id: "recovered", name: "write", arguments: "{}" };
  let executed = false;
  const result = await executeHarness(request({
    async complete(providerRequest) {
      const toolMessage = providerRequest.messages.at(-1);
      assert.equal(toolMessage?.role, "tool");
      assert.equal(toolMessage?.content, "already written");
      return response({ role: "assistant", content: "continued" });
    }
  }, {
    persistence: {
      async recover() {
        return {
          turnId: "request-1",
          status: "recoverable" as const,
          pendingToolCallIds: [],
          completedToolCallIds: ["recovered"],
          completedToolCalls: [{ call: completedCall, result: { content: "already written" } }]
        };
      }
    },
    tools: [{ name: "write", policy: "allow" }],
    toolExecutor: async () => {
      executed = true;
      return { content: "replayed" };
    }
  }));

  assert.equal(result.outcome, "completed");
  assert.equal(executed, false);
});

test("provider fields and detailed result survive retries and fallback", async () => {
  const options = { temperature: 0.2, reasoningEffort: "high" as const, responseFormat: "text" as const };
  const cacheHints = { key: "stable-prompt", read: true, write: true, ttlMs: 60_000 };
  const metadata = { traceId: "trace-1", labels: ["harness"] };
  const loadedMessage: HarnessMessage = {
    role: "system",
    content: [{ type: "text", text: "loaded context" }],
    metadata: { source: "session" }
  };
  const seen: HarnessProviderRequest[] = [];
  const detailedResult: HarnessProviderResult = {
    message: {
      role: "assistant",
      content: [
        { type: "text", text: "answer" },
        { type: "reasoning", text: "because" }
      ],
      reasoning: "because",
      metadata: { messageTrace: "trace-2" }
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
    metadata: { provider: "fake", traceId: "trace-2" }
  };
  let primaryCalls = 0;

  const result = await executeHarness(request({
    async complete(providerRequest) {
      seen.push(providerRequest);
      primaryCalls += 1;
      throw new HarnessProviderError("busy", { category: "overloaded" });
    }
  }, {
    options,
    cacheHints,
    metadata,
    loadMessages: async sessionId => {
      assert.equal(sessionId, "session-1");
      return [loadedMessage];
    },
    retryPolicy: { maxAttempts: 2 },
    fallbackProviders: [{
      async complete(providerRequest) {
        seen.push(providerRequest);
        return detailedResult;
      }
    }]
  }));

  assert.equal(result.outcome, "completed");
  assert.equal(primaryCalls, 2);
  assert.deepEqual(seen.map(providerRequest => ({
    model: providerRequest.model,
    messages: providerRequest.messages,
    tools: providerRequest.tools,
    options: providerRequest.options,
    cacheHints: providerRequest.cacheHints,
    metadata: providerRequest.metadata,
    requestId: providerRequest.requestId,
    timeoutMs: providerRequest.timeoutMs,
    deadline: providerRequest.deadline,
    signal: providerRequest.signal === providerRequest.cancellation
  })), [
    {
      model: "fake",
      messages: [loadedMessage, { role: "user", content: "hello" }],
      tools: [],
      options,
      cacheHints,
      metadata,
      requestId: "request-1",
      timeoutMs: undefined,
      deadline: undefined,
      signal: true
    },
    {
      model: "fake",
      messages: [loadedMessage, { role: "user", content: "hello" }],
      tools: [],
      options,
      cacheHints,
      metadata,
      requestId: "request-1",
      timeoutMs: undefined,
      deadline: undefined,
      signal: true
    },
    {
      model: "fake",
      messages: [loadedMessage, { role: "user", content: "hello" }],
      tools: [],
      options,
      cacheHints,
      metadata,
      requestId: "request-1",
      timeoutMs: undefined,
      deadline: undefined,
      signal: true
    }
  ]);
  if (result.outcome !== "completed") throw new Error("Expected completed result");
  assert.deepEqual(result.result, detailedResult);
});

test("tool results accept provider content parts", async () => {
  let providerCalls = 0;
  const content = [
    { type: "text" as const, text: "sunny" },
    { type: "reasoning" as const, text: "from forecast" }
  ];
  const result = await executeHarness(request({
    async complete(providerRequest) {
      providerCalls += 1;
      if (providerCalls === 1) {
        return response({
          role: "assistant",
          content: "",
          toolCalls: [{ id: "call-1", name: "weather", arguments: "{}" }]
        });
      }
      assert.deepEqual(providerRequest.messages.at(-1)?.content, content);
      return response({ role: "assistant", content: "done" });
    }
  }, {
    tools: [{ name: "weather", policy: "allow" }],
    toolExecutor: async () => ({ content })
  }));

  assert.equal(result.outcome, "completed");
});

test("orphan tool results are rejected before the provider is called", async () => {
  let providerCalls = 0;
  const result = await executeHarness(request({
    async complete() {
      providerCalls += 1;
      return response({ role: "assistant", content: "must not run" });
    }
  }, {
    messages: [
      { role: "user", content: "hello" },
      { role: "tool", toolCallId: "missing", content: "orphaned" }
    ]
  }));

  assert.equal(result.outcome, "provider_failure");
  assert.equal(result.error.category, "history");
  assert.equal(providerCalls, 0);
});

test("tool results cannot cross unrelated messages", async () => {
  let providerCalls = 0;
  const result = await executeHarness(request({
    async complete() {
      providerCalls += 1;
      return response({ role: "assistant", content: "must not run" });
    }
  }, {
    messages: [
      { role: "user", content: "find it" },
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "call-1", name: "find", arguments: "{}" }]
      },
      { role: "user", content: "actually, never mind" },
      { role: "tool", toolCallId: "call-1", content: "found" }
    ]
  }));

  assert.equal(result.outcome, "provider_failure");
  assert.equal(result.error.category, "history");
  assert.equal(providerCalls, 0);
});

test("mixed content parts retain order and tool correlation", async () => {
  const messages: HarnessMessage[] = [
    { role: "user", content: "weather" },
    {
      role: "assistant",
      content: [
        { type: "text", text: "Checking" },
        { type: "reasoning", text: " the forecast" },
        { type: "tool-call", id: "call-1", name: "weather", arguments: "{}" }
      ],
      toolCalls: [{ id: "call-1", name: "weather", arguments: "{}" }]
    },
    {
      role: "tool",
      toolCallId: "call-1",
      content: [
        { type: "text", text: "sunny" },
        { type: "tool-result", toolCallId: "call-1", content: "sunny" }
      ]
    }
  ];
  const result = await executeHarness(request({
    async complete(providerRequest) {
      assert.deepEqual(providerRequest.messages, messages);
      return response({ role: "assistant", content: "done" });
    }
  }, { messages }));

  assert.equal(result.outcome, "completed");
});

test("valid resumed histories preserve order and strip persistence-only result data", async () => {
  const resumed: readonly HarnessMessage[] = [
    { role: "user", content: "resume" },
    {
      role: "assistant",
      content: "",
      toolCalls: [{ id: "resume-call", name: "lookup", arguments: "{\"key\":\"value\"}" }]
    },
    {
      role: "tool",
      toolCallId: "resume-call",
      content: "stored result",
      toolResult: {
        toolCallId: "resume-call",
        content: "stored result",
        isError: false,
        toolName: "lookup"
      }
    } as HarnessMessage
  ];
  const seen: HarnessMessage[][] = [];
  const result = await executeHarness(request({
    async complete(providerRequest) {
      seen.push([...providerRequest.messages]);
      return response({ role: "assistant", content: "continued" });
    }
  }, { loadMessages: async () => resumed, messages: [{ role: "user", content: "resume" }] }));

  assert.equal(result.outcome, "completed");
  assert.deepEqual(seen[0]?.map(message => message.role), ["user", "assistant", "tool"]);
  assert.equal(seen[0]?.[2]?.toolCallId, "resume-call");
  assert.equal("toolResult" in (seen[0]?.[2] ?? {}), false);
});

test("normalization replaces lone surrogates without damaging Unicode pairs", async () => {
  let observed: HarnessMessage[] | undefined;
  const result = await executeHarness(request({
    async complete(providerRequest) {
      observed = [...providerRequest.messages];
      return response({ role: "assistant", content: "ok" });
    }
  }, {
    messages: [{
      role: "user",
      content: "bad\ud800 and good 😀",
      metadata: { nested: ["also\udfff"] }
    }]
  }));

  assert.equal(result.outcome, "completed");
  assert.equal(observed?.[0]?.content, "bad� and good 😀");
  assert.deepEqual(observed?.[0]?.metadata, { nested: ["also�"] });
});

test("missing tool-call IDs use stable content-derived IDs", async () => {
  const ids: string[] = [];
  let providerCalls = 0;
  const result = await executeHarness(request({
    async complete(providerRequest) {
      providerCalls += 1;
      if (providerCalls === 1) {
        return response({
          role: "assistant",
          content: "",
          toolCalls: [{ id: "", name: "weather", arguments: '{"city":"Paris"}' }]
        });
      }
      assert.equal(providerRequest.messages.at(-1)?.role, "tool");
      return response({ role: "assistant", content: "done" });
    }
  }, {
    tools: [{ name: "weather", policy: "allow" }],
    toolExecutor: async execution => {
      ids.push(execution.call.id);
      return { content: "sunny" };
    }
  }));

  assert.equal(result.outcome, "completed");
  assert.deepEqual(ids, ["call_0dd162a7f3ce"]);
});

test("duplicate call IDs are renamed and results follow their adjacent calls", async () => {
  const messages: readonly HarnessMessage[] = [
    { role: "user", content: "resume" },
    {
      role: "assistant",
      content: "",
      toolCalls: [
        { id: "same", name: "first", arguments: "{}" },
        { id: "same", name: "second", arguments: "{}" }
      ]
    },
    { role: "tool", toolCallId: "same", content: "one" },
    { role: "tool", toolCallId: "same", content: "two" }
  ];
  let observed: readonly HarnessMessage[] | undefined;
  const result = await executeHarness(request({
    async complete(providerRequest) {
      observed = providerRequest.messages;
      return response({ role: "assistant", content: "continued" });
    }
  }, { messages }));

  assert.equal(result.outcome, "completed");
  const assistant = observed?.find(message => message.role === "assistant");
  assert.deepEqual(assistant?.toolCalls?.map(call => call.id), ["same", "same_d2"]);
  assert.deepEqual(observed?.filter(message => message.role === "tool").map(message => message.toolCallId), ["same", "same_d2"]);
  assert.deepEqual(messages[1]?.toolCalls?.map(call => call.id), ["same", "same"]);
});

test("tool results correlate against either provider call ID field", async () => {
  let observed: readonly HarnessMessage[] | undefined;
  const messages = [
    { role: "user" as const, content: "resume" },
    {
      role: "assistant" as const,
      content: "",
      toolCalls: [{ id: "fc_1", call_id: "call_1", name: "lookup", arguments: "{}" }]
    },
    { role: "tool" as const, toolCallId: "fc_1", content: "found" }
  ] as unknown as readonly HarnessMessage[];
  const result = await executeHarness(request({
    async complete(providerRequest) {
      observed = providerRequest.messages;
      return response({ role: "assistant", content: "continued" });
    }
  }, { messages }));

  assert.equal(result.outcome, "completed");
  assert.equal(observed?.[1]?.toolCalls?.[0]?.id, "call_1");
  assert.equal(observed?.[2]?.toolCallId, "call_1");
});

test("safe argument repair handles trailing commas but leaves truncation fail-closed", async () => {
  let executed = false;
  let providerCalls = 0;
  const result = await executeHarness(request({
    async complete() {
      providerCalls += 1;
      return providerCalls === 1
        ? response({ role: "assistant", content: "", toolCalls: [{ id: "safe", name: "parse", arguments: '{"items":[1,2,],}' }] })
        : response({ role: "assistant", content: "done" });
    }
  }, {
    tools: [{ name: "parse", policy: "allow" }],
    toolExecutor: async execution => {
      executed = execution.arguments.items instanceof Array;
      return { content: "ok" };
    }
  }));

  assert.equal(result.outcome, "completed");
  assert.equal(executed, true);

  const unsupported = await executeHarness(request({
    async complete() {
      return response({ role: "assistant", content: "", toolCalls: [{ id: "unsafe", name: "parse", arguments: '{"items":[1,2' }] });
    }
  }, {
    tools: [{ name: "parse", policy: "allow" }],
    toolExecutor: async () => ({ content: "must not run" })
  }));
  assert.equal(unsupported.outcome, "tool_failure");
});

test("interrupted recovery closes a trailing tool result before replay", async () => {
  let observed: readonly HarnessMessage[] | undefined;
  const result = await executeHarness(request({
    async complete(providerRequest) {
      observed = providerRequest.messages;
      return response({ role: "assistant", content: "continued" });
    }
  }, {
    messages: [
      { role: "user", content: "run it" },
      { role: "assistant", content: "", toolCalls: [{ id: "interrupted", name: "run", arguments: "{}" }] },
      { role: "tool", toolCallId: "interrupted", content: "partial" }
    ],
    persistence: {
      async recover() {
        return { turnId: "request-1", status: "interrupted" as const, pendingToolCallIds: [] };
      }
    }
  }));

  assert.equal(result.outcome, "completed");
  assert.deepEqual(observed?.map(message => message.role), ["user", "assistant", "tool", "assistant"]);
  assert.equal(observed?.at(-1)?.content, "Operation interrupted.");
});

test("multiple tool calls execute sequentially in provider order", async () => {
  const calls: string[] = [];
  let providerCalls = 0;
  await executeHarness(request({
    async complete() {
      providerCalls += 1;
      return providerCalls === 1
        ? response({
          role: "assistant",
          content: "",
          toolCalls: [
            { id: "a", name: "first", arguments: "{}" },
            { id: "b", name: "second", arguments: "{}" }
          ]
        })
        : response({ role: "assistant", content: "finished" });
    }
  }, {
    tools: [{ name: "first", policy: "allow" }, { name: "second", policy: "allow" }],
    toolExecutor: async execution => {
      calls.push(execution.call.name);
      return { content: execution.call.name };
    }
  }));

  assert.deepEqual(calls, ["first", "second"]);
});

test("approval denial has no tool effect and returns a model-visible result", async () => {
  let executed = false;
  const events: HarnessEvent[] = [];
  let calls = 0;
  const result = await executeHarness(request({
    async complete() {
      calls += 1;
      return calls === 1
        ? response({ role: "assistant", content: "", toolCalls: [{ id: "danger", name: "delete", arguments: "{}" }] })
        : response({ role: "assistant", content: "The operation was denied." });
    }
  }, {
    tools: [{ name: "delete", policy: "ask" }],
    approvalPolicy: async () => "deny",
    toolExecutor: async () => {
      executed = true;
      return { content: "deleted" };
    },
    eventSink: event => events.push(event)
  }));

  assert.equal(result.outcome, "completed");
  assert.equal(executed, false);
  assert.deepEqual(events.map(event => event.type), [
    "request.started", "provider.requested", "provider.completed", "approval.requested", "approval.resolved", "tool.completed", "provider.requested", "provider.completed", "terminal"
  ]);
});

test("only classified retryable failures retry, then eligible fallback is selected", async () => {
  let primaryCalls = 0;
  let fallbackCalls = 0;
  const sleeps: number[] = [];
  const result = await executeHarness(request({
    async complete() {
      primaryCalls += 1;
      throw new HarnessProviderError("busy", { category: "overloaded" });
    }
  }, {
    retryPolicy: { maxAttempts: 2, backoffMs: 25 },
    sleeper: { sleep: async milliseconds => sleeps.push(milliseconds) },
    fallbackProviders: [{
      async complete() {
        fallbackCalls += 1;
        return response({ role: "assistant", content: "fallback" });
      }
    }]
  }));

  assert.equal(result.outcome, "completed");
  assert.equal(primaryCalls, 2);
  assert.equal(fallbackCalls, 1);
  assert.deepEqual(sleeps, [25]);
});

test("unknown provider failures do not retry or use fallback", async () => {
  let primaryCalls = 0;
  let fallbackCalls = 0;
  const result = await executeHarness(request({
    async complete() {
      primaryCalls += 1;
      throw new Error("bad request");
    }
  }, {
    retryPolicy: { maxAttempts: 3, backoffMs: 1 },
    fallbackProviders: [{
      async complete() {
        fallbackCalls += 1;
        return response({ role: "assistant", content: "must not run" });
      }
    }]
  }));

  assert.equal(result.outcome, "provider_failure");
  assert.equal(primaryCalls, 1);
  assert.equal(fallbackCalls, 0);
});

test("abort signal propagates and produces cancelled terminal", async () => {
  const abort = new AbortController();
  const resultPromise = executeHarness(request({
    async complete(providerRequest) {
      assert.equal(providerRequest.signal, providerRequest.cancellation);
      abort.abort();
      return new Promise((_resolve, reject) => {
        if (providerRequest.signal.aborted) {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
          return;
        }
        providerRequest.signal.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        }, { once: true });
      });
    }
  }, { signal: abort.signal }));

  const result = await resultPromise;
  assert.equal(result.outcome, "cancelled");
});

test("cancellation while approval is pending emits cancellation, not approval rejection", async () => {
  const abort = new AbortController();
  const events: HarnessEvent[] = [];
  let executed = false;
  const resultPromise = executeHarness(request({
    async complete() {
      return response({ role: "assistant", content: "", toolCalls: [{ id: "approval-race", name: "write", arguments: "{}" }] });
    }
  }, {
    signal: abort.signal,
    eventSink: event => events.push(event),
    tools: [{ name: "write", policy: "ask" }],
    approvalPolicy: async () => await new Promise<"allow">(resolve => {
      abort.abort();
      setTimeout(() => resolve("allow"), 1);
    }),
    toolExecutor: async () => {
      executed = true;
      return { content: "must not execute" };
    }
  }));

  const result = await resultPromise;
  assert.equal(result.outcome, "cancelled");
  assert.equal(executed, false);
  assert.equal(events.filter(event => event.type === "terminal").length, 1);
});

test("provider completion racing cancellation cannot continue to tools or emit twice", async () => {
  const abort = new AbortController();
  const events: HarnessEvent[] = [];
  let toolCalls = 0;
  const resultPromise = executeHarness(request({
    async complete() {
      return new Promise<HarnessProviderResult>(resolve => {
        setTimeout(() => {
          abort.abort();
          resolve(response({ role: "assistant", content: "late", toolCalls: [{ id: "late", name: "write", arguments: "{}" }] }));
        }, 0);
      });
    }
  }, {
    signal: abort.signal,
    eventSink: event => events.push(event),
    tools: [{ name: "write", policy: "allow" }],
    toolExecutor: async () => {
      toolCalls += 1;
      return { content: "must not execute" };
    }
  }));
  const result = await resultPromise;
  assert.equal(result.outcome, "cancelled");
  assert.equal(toolCalls, 0);
  assert.equal(events.filter(event => event.type === "terminal").length, 1);
});

test("deadline and budget stop before provider or tool effects", async () => {
  let providerCalls = 0;
  let toolCalls = 0;
  const deadlineResult = await executeHarness(request({
    async complete() {
      providerCalls += 1;
      return response({ role: "assistant", content: "no" });
    }
  }, { deadline: 1_000 }));
  const budgetResult = await executeHarness(request({
    async complete() {
      return response({ role: "assistant", content: "", toolCalls: [{ id: "x", name: "x", arguments: "{}" }] });
    }
  }, {
    tools: [{ name: "x", policy: "allow" }],
    budgets: { maxToolCalls: 0 },
    toolExecutor: async () => {
      toolCalls += 1;
      return { content: "no" };
    }
  }));

  assert.equal(deadlineResult.outcome, "budget_exhausted");
  assert.equal(providerCalls, 0);
  assert.equal(budgetResult.outcome, "budget_exhausted");
  assert.equal(budgetResult.error.reason, "max_tool_calls");
  assert.equal(toolCalls, 0);
});

test("provider budget stops before the provider side effect", async () => {
  let providerCalls = 0;
  const result = await executeHarness(request({
    async complete() {
      providerCalls += 1;
      return response({ role: "assistant", content: "must not run" });
    }
  }, { budgets: { maxProviderCalls: 0 } }));

  assert.equal(result.outcome, "budget_exhausted");
  assert.equal(result.error.reason, "max_provider_calls");
  assert.equal(providerCalls, 0);
});

test("supported request estimates enforce the existing token budget preflight", async () => {
  let providerCalls = 0;
  const requestEstimate = estimateRequestTokensRough([{ role: "user", content: "hello" }]);
  assert.equal(requestEstimate.supported, true);
  const estimate = requestEstimate.tokens;
  const allowed = await executeHarness(request({
    async complete() {
      providerCalls += 1;
      return response({ role: "assistant", content: "done" });
    }
  }, { budgets: { maxTokens: estimate } }));
  assert.equal(allowed.outcome, "completed");
  assert.equal(providerCalls, 1);

  const rejected = await executeHarness(request({
    async complete() {
      providerCalls += 1;
      return response({ role: "assistant", content: "must not run" });
    }
  }, { budgets: { maxTokens: estimate - 1 } }));
  assert.equal(rejected.outcome, "budget_exhausted");
  assert.equal(rejected.error.reason, "max_tokens");
  assert.equal(providerCalls, 1);
});

test("timeout aborts an uncooperative provider", async () => {
  const result = await executeHarness(request({
    async complete(providerRequest) {
      assert.equal(providerRequest.signal.aborted, false);
      return new Promise(() => undefined);
    }
  }, { timeoutMs: 5 }));

  assert.equal(result.outcome, "budget_exhausted");
});

test("malformed tool arguments become safe tool failure", async () => {
  let executed = false;
  const result = await executeHarness(request({
    async complete() {
      return response({ role: "assistant", content: "", toolCalls: [{ id: "bad", name: "parse", arguments: "{" }] });
    }
  }, {
    tools: [{ name: "parse", policy: "allow" }],
    toolExecutor: async () => {
      executed = true;
      return { content: "bad" };
    }
  }));

  assert.equal(result.outcome, "tool_failure");
  assert.equal(executed, false);
});

test("persistence failure is isolated and later events recover", async () => {
  let appendCalls = 0;
  const persisted: string[] = [];
  const warnings: string[] = [];
  const result = await executeHarness(request({
    async complete() {
      return response({ role: "assistant", content: "ok" });
    }
  }, {
    persistence: {
      async append(event) {
        appendCalls += 1;
        if (appendCalls === 1) throw new Error("storage unavailable");
        persisted.push(event.type);
      }
    },
    logger: { warn: message => warnings.push(message) }
  }));

  assert.equal(result.outcome, "completed");
  assert.equal(appendCalls, 4);
  assert.deepEqual(persisted, ["provider.requested", "provider.completed", "terminal"]);
  assert.equal(warnings.length, 1);
});

test("fallback recovery does not duplicate completed tool effect", async () => {
  let primaryCalls = 0;
  let fallbackCalls = 0;
  let effects = 0;
  const primary: HarnessProvider = {
    async complete() {
      primaryCalls += 1;
      if (primaryCalls === 1) {
        return response({ role: "assistant", content: "", toolCalls: [{ id: "same", name: "once", arguments: "{}" }] });
      }
      throw new HarnessProviderError("down", { category: "server" });
    }
  };
  const fallback: HarnessProvider = {
    async complete() {
      fallbackCalls += 1;
      return fallbackCalls === 1
        ? response({ role: "assistant", content: "", toolCalls: [{ id: "recovered", name: "once", arguments: "{}" }] })
        : response({ role: "assistant", content: "recovered" });
    }
  };
  const result = await executeHarness(request(primary, {
    fallbackProviders: [fallback],
    tools: [{ name: "once", policy: "allow" }],
    toolExecutor: async () => {
      effects += 1;
      return { content: "done" };
    }
  }));

  assert.equal(result.outcome, "completed");
  assert.equal(effects, 1);
  assert.equal(primaryCalls, 2);
  assert.equal(fallbackCalls, 2);
});

test("atomic repository write records a completed tool round before interruption", async () => {
  const writes: HarnessAtomicTurnWrite[] = [];
  const abort = new AbortController();
  let providerCalls = 0;
  const result = await executeHarness(request({
    async complete(providerRequest) {
      providerCalls += 1;
      if (providerCalls === 1) {
        return response({
          role: "assistant",
          content: "",
          toolCalls: [{ id: "atomic-call", name: "once", arguments: "{}" }]
        });
      }
      abort.abort();
      return new Promise((_resolve, reject) => {
        const error = new Error("interrupted");
        error.name = "AbortError";
        providerRequest.signal.addEventListener("abort", () => reject(error), { once: true });
      });
    }
  }, {
    signal: abort.signal,
    tools: [{ name: "once", policy: "allow" }],
    toolExecutor: async () => ({ content: "done" }),
    persistence: {
      async commitTurn(write) {
        writes.push(write);
      }
    }
  }));

  assert.equal(result.outcome, "cancelled");
  assert.equal(providerCalls, 2);
  assert.equal(writes.length, 2);
  assert.deepEqual(writes[0]?.messages.map(message => message.role), ["user", "assistant", "tool"]);
  assert.equal(writes[0]?.messages[2]?.toolResult?.toolCallId, "atomic-call");
  assert.deepEqual(writes[0]?.migrationState?.recovery?.completedToolCallIds, ["atomic-call"]);
  assert.equal(writes[1]?.messages.length, 0);
  assert.equal(writes[1]?.migrationState?.recovery?.status, "interrupted");
});

test("atomic persistence failure stops continuation and emits one terminal", async () => {
  const events: HarnessEvent[] = [];
  let providerCalls = 0;
  const result = await executeHarness(request({
    async complete() {
      providerCalls += 1;
      return response({
        role: "assistant",
        content: "",
        toolCalls: [{ id: "persist-call", name: "write", arguments: "{}" }]
      });
    }
  }, {
    tools: [{ name: "write", policy: "allow" }],
    toolExecutor: async () => ({ content: "result" }),
    eventSink: event => events.push(event),
    sessionRepository: {
      async commitTurn() {
        throw new Error("interrupted persistence");
      }
    }
  }));

  assert.equal(result.outcome, "provider_failure");
  assert.equal(result.error.category, "persistence");
  assert.equal(providerCalls, 1);
  assert.equal(events.filter(event => event.type === "terminal").length, 1);
});

test("oversized tool output is safely truncated before provider continuation", async () => {
  let providerCalls = 0;
  let observed: string | undefined;
  const result = await executeHarness(request({
    async complete(providerRequest) {
      providerCalls += 1;
      if (providerCalls === 1) {
        return response({
          role: "assistant",
          content: "",
          toolCalls: [{ id: "large", name: "large", arguments: "{}" }]
        });
      }
      observed = String(providerRequest.messages.at(-1)?.content);
      return response({ role: "assistant", content: "done" });
    }
  }, {
    tools: [{ name: "large", policy: "allow" }],
    toolOutputLimits: { maxBytes: 5 },
    toolExecutor: async () => ({ content: "😀😀😀" })
  }));

  assert.equal(result.outcome, "completed");
  assert.equal(observed, "😀");
});

test("tool output limits preserve small results and use newline-aware previews", () => {
  const small: ToolOutputResult = { content: "small", isError: true, truncated: false };
  assert.deepEqual(boundToolResult(small, 32), small);

  const large = boundToolResult({ content: "first line\nsecond line\nthird line", isError: true }, 16);
  assert.deepEqual(large, { content: "first line\n", isError: true, truncated: true });
  assert.equal(utf8Bytes(large.content as string) <= 16, true);
});

test("tool output truncation never splits Unicode and previews retain a complete line", () => {
  assert.deepEqual(truncateUtf8("A😀B", 2), { value: "A", truncated: true });
  assert.deepEqual(truncateUtf8("A😀B", 5), { value: "A😀", truncated: true });
  assert.deepEqual(generatePreview("😀\nsecond", 6), { value: "😀\n", truncated: true });
});

test("aggregate tool budget selects largest results first and keeps call order", () => {
  const results: readonly ToolOutputResult[] = [
    { content: "aaaa" },
    { content: "bbbbbbbb", isError: true },
    { content: "cccccc", truncated: true }
  ];

  const bounded = enforceToolTurnBudget(results, 14);
  assert.deepEqual(bounded.map(result => result.content), ["aaaa", "bbbb", "cccccc"]);
  assert.deepEqual(bounded.map(result => result.isError), [undefined, true, undefined]);
  assert.equal(bounded[2]?.truncated, true);
  assert.equal(utf8Bytes(bounded.map(result => String(result.content)).join("")), 14);
});

test("executeHarness applies the aggregate tool budget before continuation", async () => {
  let providerCalls = 0;
  let observed: readonly unknown[] = [];
  const result = await executeHarness(request({
    async complete(providerRequest) {
      providerCalls += 1;
      if (providerCalls === 1) {
        return response({
          role: "assistant",
          content: "",
          toolCalls: [
            { id: "aggregate-a", name: "first", arguments: "{}" },
            { id: "aggregate-b", name: "second", arguments: "{}" }
          ]
        });
      }
      observed = providerRequest.messages.slice(-2).map(message => message.content);
      return response({ role: "assistant", content: "done" });
    }
  }, {
    tools: [{ name: "first", policy: "allow" }, { name: "second", policy: "allow" }],
    toolOutputLimits: { maxBytes: 100, maxTurnBytes: 10 },
    toolExecutor: async execution => ({
      content: execution.call.id === "aggregate-a" ? "aaaaa" : "bbbbbbbb"
    })
  }));

  assert.equal(result.outcome, "completed");
  assert.deepEqual(observed, ["aaaaa", "bbbbb"]);
});

test("structured fallback and terminal truncation are deterministic and preserve errors", () => {
  const structured = boundToolResult({
    content: [{ type: "text", text: "alpha" }, { type: "reasoning", text: "beta" }],
    isError: true,
    truncated: true
  }, 8, 5);
  assert.deepEqual(structured, { content: "alpha", isError: true, truncated: true });

  const terminal = truncateTerminalOutput(`HEAD${"x".repeat(200)}TAIL`, 120);
  assert.equal(utf8Bytes(terminal.value) <= 120, true);
  assert.equal(terminal.value.includes("HEAD"), true);
  assert.equal(terminal.value.includes("TAIL"), true);
  assert.deepEqual(terminal, truncateTerminalOutput(`HEAD${"x".repeat(200)}TAIL`, 120));
});

test("malformed tool result fails closed without continuation", async () => {
  let providerCalls = 0;
  let executed = false;
  const result = await executeHarness(request({
    async complete() {
      providerCalls += 1;
      return response({
        role: "assistant",
        content: "",
        toolCalls: [{ id: "bad-result", name: "bad", arguments: "{}" }]
      });
    }
  }, {
    tools: [{ name: "bad", policy: "allow" }],
    toolExecutor: async () => {
      executed = true;
      return { content: { malformed: true } } as never;
    }
  }));

  assert.equal(result.outcome, "tool_failure");
  assert.equal(providerCalls, 1);
  assert.equal(executed, true);
});

test("tool concurrency is bounded and tool timeout cancels the timed call", async () => {
  let active = 0;
  let maximumActive = 0;
  const result = await executeHarness(request({
    async complete() {
      return response({
        role: "assistant",
        content: "",
        toolCalls: [
          { id: "slow", name: "slow", arguments: "{}" },
          { id: "fast", name: "fast", arguments: "{}" }
        ]
      });
    }
  }, {
    tools: [{ name: "slow", policy: "allow" }, { name: "fast", policy: "allow" }],
    toolConcurrency: 1,
    toolTimeoutMs: 5,
    toolExecutor: async execution => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      try {
        if (execution.call.name === "slow") {
          return await new Promise(() => undefined);
        }
        return { content: "fast" };
      } finally {
        active -= 1;
      }
    }
  }));

  assert.equal(result.outcome, "tool_failure");
  assert.equal(maximumActive, 1);
});

test("cancellation racing concurrent tools emits one terminal and no continuation", async () => {
  const abort = new AbortController();
  const events: HarnessEvent[] = [];
  let providerCalls = 0;
  const result = await executeHarness(request({
    async complete() {
      providerCalls += 1;
      return response({
        role: "assistant",
        content: "",
        toolCalls: [
          { id: "cancel-a", name: "cancel", arguments: "{}" },
          { id: "cancel-b", name: "cancel", arguments: "{}" }
        ]
      });
    }
  }, {
    signal: abort.signal,
    tools: [{ name: "cancel", policy: "allow" }],
    toolConcurrency: 2,
    eventSink: event => events.push(event),
    toolExecutor: async execution => {
      abort.abort();
      return await new Promise((_resolve, reject) => {
        if (execution.signal.aborted) {
          reject(new Error("cancelled"));
          return;
        }
        execution.signal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true });
      });
    }
  }));

  assert.equal(result.outcome, "cancelled");
  assert.equal(providerCalls, 1);
  assert.equal(events.filter(event => event.type === "terminal").length, 1);
});

test("stream deltas reconcile into the normal provider result", async () => {
  let completeCalled = false;
  const result = await executeHarness(request({
    async complete() {
      completeCalled = true;
      return response({ role: "assistant", content: "wrong" });
    },
    async *stream() {
      yield { type: "start", requestId: "stream-1" };
      yield { type: "text-delta", text: "hello" };
      yield { type: "reasoning-delta", text: "because" };
      yield { type: "text-delta", text: " world" };
      yield {
        type: "finish",
        finishReason: "stop" as const,
        usage: { inputTokens: 2, outputTokens: 2, totalTokens: 4 }
      };
    }
  }));

  assert.equal(result.outcome, "completed");
  assert.equal(completeCalled, false);
  if (result.outcome !== "completed") throw new Error("Expected completion");
  assert.equal(result.result.message.content, "hello world");
  assert.equal(result.result.message.reasoning, "because");
  assert.equal(result.result.usage.totalTokens, 4);
});

test("partial stream usage is normalized without requiring finish usage", async () => {
  const result = await executeHarness(request({
    async complete() {
      throw new Error("complete should not be called");
    },
    async *stream() {
      yield { type: "usage", usage: { outputTokens: 3 } };
      yield { type: "finish", finishReason: "stop" as const };
    }
  }));

  assert.equal(result.outcome, "completed");
  if (result.outcome !== "completed") throw new Error("Expected completion");
  assert.deepEqual(result.result.usage, {
    inputTokens: 0,
    outputTokens: 3,
    totalTokens: 3
  });
});

test("retry classification preserves precedence and never returns provider payloads", () => {
  const secret = "sensitive-provider-payload";
  const cases: readonly [string, unknown, Parameters<typeof classifyHarnessProviderError>[1] | undefined, string, boolean, boolean][] = [
    ["cancellation", Object.assign(new Error("cancelled"), { name: "AbortError", statusCode: 500 }), undefined, "cancelled", false, false],
    ["invalid request", new Error("unsupported parameter: max_tokens"), { statusCode: 400 }, "invalid_request", false, true],
    ["content policy", new Error("violates our usage policies"), { statusCode: 400 }, "content_filter", false, true],
    ["tool side effect", { category: "tool_side_effect", message: "write already committed" }, undefined, "tool_side_effect", false, false],
    ["timeout", new Error("gateway timeout"), { statusCode: 504 }, "timeout", true, true],
    ["overload", new Error("service is overloaded"), { statusCode: 429 }, "overloaded", true, true],
    ["rate limit", new Error("too many requests"), { statusCode: 429 }, "rate_limit", true, true],
    ["network", new Error("opaque transport detail"), { network: true }, "network", true, true],
    ["server", new Error("internal server error"), { statusCode: 500 }, "server", true, true]
  ];

  for (const [label, error, options, category, retryable, fallbackEligible] of cases) {
    const classified = classifyHarnessProviderError(error, options);
    assert.equal(classified.category, category, label);
    assert.equal(classified.retryable, retryable, label);
    assert.equal(classified.fallbackEligible, fallbackEligible, label);
  }

  const safe = classifyHarnessProviderError(new Error("request failed"), {
    statusCode: 400,
    body: { error: { message: `context length exceeded: ${secret}`, code: "context_length_exceeded" } }
  });
  assert.equal(safe.category, "context_length");
  assert.equal(JSON.stringify(safe).includes(secret), false);
  assert.equal(boundedMaxAttempts({ maxAttempts: 10_000 }), 8);
  assert.equal(boundedBackoff({ backoffMs: 10_000_000 }, 1), 60_000);
});

test("attempt identity is global across fallback providers while request ID stays stable", async () => {
  const seen: HarnessProviderRequest[] = [];
  let primaryCalls = 0;
  const result = await executeHarness(request({
    async complete(providerRequest) {
      seen.push(providerRequest);
      primaryCalls += 1;
      throw new HarnessProviderError("busy", { category: "overloaded" });
    }
  }, {
    identity: { requestId: "ignored-public-id", attempt: 4, parentRequestId: "parent-1" },
    retryPolicy: { maxAttempts: 2 },
    fallbackProviders: [{
      async complete(providerRequest) {
        seen.push(providerRequest);
        return response({ role: "assistant", content: "fallback" });
      }
    }]
  }));

  assert.equal(result.outcome, "completed");
  assert.equal(primaryCalls, 2);
  assert.deepEqual(seen.map(providerRequest => ({
    requestId: providerRequest.requestId,
    identity: providerRequest.identity,
    providerId: providerRequest.providerId,
    providerIndex: providerRequest.providerIndex
  })), [
    {
      requestId: "request-1",
      identity: { requestId: "request-1", attempt: 4, parentRequestId: "parent-1" },
      providerId: "primary",
      providerIndex: 0
    },
    {
      requestId: "request-1",
      identity: { requestId: "request-1", attempt: 5, parentRequestId: "parent-1" },
      providerId: "primary",
      providerIndex: 0
    },
    {
      requestId: "request-1",
      identity: { requestId: "request-1", attempt: 6, parentRequestId: "parent-1" },
      providerId: "fallback-1",
      providerIndex: 1
    }
  ]);
});
