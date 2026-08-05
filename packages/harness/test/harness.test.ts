import { strict as assert } from "node:assert";
import { test } from "bun:test";

import {
  HarnessProviderError,
  execute,
  executeHarness,
  type HarnessAtomicTurnWrite,
  type HarnessEvent,
  type HarnessMessage,
  type HarnessProvider,
  type HarnessProviderRequest,
  type HarnessProviderResult,
  type HarnessRequest
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

test("legacy execute remains a direct provider adapter", async () => {
  const result = await execute({
    model: "fake",
    messages: [{ role: "user", content: "hello" }],
    tools: []
  }, {
    async complete(providerRequest) {
      assert.equal(providerRequest.model, "fake");
      assert.deepEqual(providerRequest.messages, [{ role: "user", content: "hello" }]);
      assert.deepEqual(providerRequest.tools, []);
      return response({ role: "assistant", content: "world" });
    }
  });

  assert.equal(result.message.content, "world");
});

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
      messages: [loadedMessage],
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
      messages: [loadedMessage],
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
      messages: [loadedMessage],
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
  }, { loadMessages: async () => resumed }));

  assert.equal(result.outcome, "completed");
  assert.deepEqual(seen[0]?.map(message => message.role), ["user", "assistant", "tool"]);
  assert.equal(seen[0]?.[2]?.toolCallId, "resume-call");
  assert.equal("toolResult" in (seen[0]?.[2] ?? {}), false);
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

test("approval denial has no tool effect and one approval terminal", async () => {
  let executed = false;
  const events: HarnessEvent[] = [];
  const result = await executeHarness(request({
    async complete() {
      return response({ role: "assistant", content: "", toolCalls: [{ id: "danger", name: "delete", arguments: "{}" }] });
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

  assert.equal(result.outcome, "approval_rejected");
  assert.equal(executed, false);
  assert.deepEqual(events.map(event => event.type), [
    "request.started", "provider.requested", "provider.completed", "approval.requested", "approval.resolved", "terminal"
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
  assert.equal(toolCalls, 0);
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
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0]?.messages.map(message => message.role), ["assistant", "tool"]);
  assert.equal(writes[0]?.messages[1]?.toolResult?.toolCallId, "atomic-call");
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
