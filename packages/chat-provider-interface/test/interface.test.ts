import { strict as assert } from "node:assert";
import { test } from "bun:test";

import {
  assertProviderJsonValue,
  classifyProviderError,
  createRecordedResponseProvider,
  normalizeProviderFinishReason,
  normalizeProviderUsage,
  reconcileProviderStream,
  isRetryableProviderError,
  isProviderFiniteNumber,
  isProviderJsonValue,
  ProviderError,
  validateProviderRequest,
  validateProviderResult,
  validateProviderStreamEvent,
  type ChatProvider,
  type ProviderMessage,
  type ProviderRequest,
  type ProviderResult,
  type ProviderStreamEvent
} from "../src/index.ts";

test("provider interface supports text and typed content parts", async () => {
  const messages: readonly ProviderMessage[] = [
    { role: "user", content: "hello" },
    {
      role: "assistant",
      content: [{ type: "text", text: "I will use a tool" }],
      toolCalls: [{ id: "call-1", name: "weather", arguments: '{"city":"NYC"}' }]
    },
    {
      role: "tool",
      toolCallId: "call-1",
      content: [{ type: "tool-result", toolCallId: "call-1", content: "72F" }]
    }
  ];
  const provider: ChatProvider = {
    async complete(request) {
      assert.deepEqual(request.messages, messages);
      return {
        message: { role: "assistant", content: "ok" },
        usage: { inputTokens: 1, outputTokens: 1 },
        finishReason: "stop"
      };
    }
  };

  const result = await provider.complete({ model: "fake", messages, tools: [] });
  assert.equal(result.message.content, "ok");
  assert.equal(result.finishReason, "stop");
});

test("recorded responses preserve multimodal content, roles, and part order", async () => {
  const messages: readonly ProviderMessage[] = [
    {
      role: "user",
      content: [
        { type: "text", text: "before" },
        { type: "image", url: "https://cdn.example/image.png" },
        { type: "audio", url: "data:audio/wav;base64,QUJD" },
        { type: "file", url: "data:application/pdf;base64,REVG", name: "note.pdf" },
        { type: "text", text: "after" }
      ]
    }
  ];
  const provider = createRecordedResponseProvider({
    events: [{ type: "finish", finishReason: "stop" }]
  });

  await provider.complete({ model: "recorded", messages, tools: [] });
  assert.deepEqual(provider.requests[0]?.messages, messages);
});

test("provider validation rejects malformed and unsafe content", () => {
  assert.throws(() => validateProviderRequest({
    model: "fake",
    messages: [{
      role: "user",
      content: [{ type: "image", url: "javascript:alert(1)" }]
    }],
    tools: []
  } as ProviderRequest), /http\(s\) or data URL/);
  assert.throws(() => validateProviderRequest({
    model: "fake",
    messages: [{
      role: "user",
      content: [{ type: "video", url: "https://cdn.example/video.mp4" }]
    } as never],
    tools: []
  }), /type is unsupported/);
});

test("complete preserves tool-call IDs, reasoning, metadata, and detailed usage", async () => {
  const provider: ChatProvider = {
    async complete(request) {
      assert.equal(request.requestId, "request-1");
      assert.equal(request.options?.reasoningEffort, "high");
      assert.equal(request.cacheHints?.read, true);
      assert.equal(request.signal?.aborted, false);
      return {
        message: {
          role: "assistant",
          content: [],
          reasoning: "checked available tools",
          toolCalls: [{ id: "call-2", name: "lookup", arguments: "{}" }]
        },
        reasoning: "checked available tools",
        usage: {
          inputTokens: 10,
          outputTokens: 4,
          totalTokens: 14,
          reasoningTokens: 2,
          cachedInputTokens: 6
        },
        metadata: { provider: "fake", attempt: 1 },
        finishReason: "tool_call"
      };
    }
  };
  const signal = new AbortController().signal;

  const result = await provider.complete({
    model: "fake",
    messages: [],
    tools: [],
    signal,
    requestId: "request-1",
    options: { reasoningEffort: "high" },
    cacheHints: { read: true, write: false }
  });

  assert.equal(result.message.toolCalls?.[0]?.id, "call-2");
  assert.equal(result.usage.totalTokens, 14);
  assert.equal(result.reasoning, "checked available tools");
  assert.deepEqual(result.metadata, { provider: "fake", attempt: 1 });
});

test("provider stream exposes typed async events", async () => {
  const events: ProviderStreamEvent[] = [
    { type: "start", requestId: "request-2" },
    { type: "text-delta", text: "hello" },
    { type: "reasoning-delta", text: "thinking" },
    { type: "tool-call", id: "call-3", name: "search", arguments: "{}" },
    { type: "usage", usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 } },
    { type: "finish", finishReason: "stop" }
  ];
  const provider: ChatProvider = {
    async complete() {
      return { message: { role: "assistant", content: "done" }, usage: { inputTokens: 0, outputTokens: 0 } };
    },
    async *stream() {
      yield* events;
    }
  };

  assert.deepEqual(await Array.fromAsync(provider.stream?.({ model: "fake", messages: [], tools: [] }) ?? []), events);
});

test("provider receives AbortSignal and can stop streaming", async () => {
  const controller = new AbortController();
  let observedAbort = false;
  const provider: ChatProvider = {
    async complete(request) {
      request.signal?.addEventListener("abort", () => {
        observedAbort = true;
      }, { once: true });
      await new Promise<void>((resolve) => request.signal?.addEventListener("abort", () => resolve(), { once: true }));
      throw new ProviderError("request cancelled", { category: "cancelled" });
    }
  };

  const pending = provider.complete({
    model: "fake",
    messages: [],
    tools: [],
    signal: controller.signal,
    timeoutMs: 100,
    deadline: Date.now() + 100
  });
  controller.abort();

  await assert.rejects(pending, (error: Error) => error instanceof ProviderError && error.category === "cancelled");
  assert.equal(observedAbort, true);
});

test("provider errors classify retryable categories", () => {
  const limited = new ProviderError("slow down", { category: "rate_limit", statusCode: 429, requestId: "request-3" });
  assert.deepEqual(classifyProviderError(limited), {
    category: "rate_limit",
    retryable: true,
    message: "slow down",
    statusCode: 429,
    requestId: "request-3"
  });
  assert.equal(isRetryableProviderError(limited), true);
  assert.equal(classifyProviderError(new Error("bad input")).category, "unknown");
  assert.equal(classifyProviderError(new DOMException("aborted", "AbortError")).category, "cancelled");
});

test("provider JSON helper rejects non-finite and non-JSON values", () => {
  assert.equal(isProviderFiniteNumber(1), true);
  assert.equal(isProviderFiniteNumber(Number.NaN), false);
  assert.equal(isProviderFiniteNumber(Number.POSITIVE_INFINITY), false);
  assert.equal(isProviderJsonValue({ nested: ["ok", 2] }), true);
  assert.equal(isProviderJsonValue({ nested: Number.NaN }), false);
  assert.equal(isProviderJsonValue(undefined), false);
  assert.equal(isProviderJsonValue(new Date()), false);
  const cyclic: { self?: object } = {};
  cyclic.self = cyclic;
  assert.equal(isProviderJsonValue(cyclic), false);

  assert.throws(() => assertProviderJsonValue({ value: Number.NEGATIVE_INFINITY }, "metadata"), {
    name: "TypeError"
  });
});

test("provider validators enforce finite numbers on complete and stream contracts", () => {
  const request = {
    model: "fake",
    messages: [],
    tools: [],
    options: { temperature: Number.NaN },
    metadata: { attempt: 1 }
  } as ProviderRequest;
  assert.throws(() => validateProviderRequest(request), /request\.options\.temperature must be finite/);

  const result = {
    message: { role: "assistant", content: "done" },
    usage: { inputTokens: 1, outputTokens: Number.POSITIVE_INFINITY }
  } as ProviderResult;
  assert.throws(() => validateProviderResult(result), /result\.usage\.outputTokens must be finite/);

  const event = {
    type: "finish",
    finishReason: "stop",
    usage: { inputTokens: Number.NaN, outputTokens: 1 }
  } as ProviderStreamEvent;
  assert.throws(() => validateProviderStreamEvent(event), /stream\.finish\.usage\.inputTokens must be finite/);
});

test("stream reconciliation preserves interleaved reasoning and tool-call order", async () => {
  const provider = createRecordedResponseProvider({
    events: [
      { type: "start", identity: { requestId: "recorded-1", attempt: 2 }, metadata: { source: "fixture" } },
      { type: "text-delta", text: "before" },
      { type: "reasoning-delta", text: "checking" },
      { type: "tool-call-delta", index: 0, id: "call-1", name: "search", arguments: '{"q"' },
      { type: "reasoning-delta", text: " tools" },
      { type: "tool-call-delta", index: 0, arguments: ':"hermes"}' },
      { type: "text-delta", text: "after" },
      { type: "tool-result", toolCallId: "call-1", content: "found" },
      { type: "usage", usage: { inputTokens: 4, outputTokens: 3 }, metadata: { phase: "stream" } },
      {
        type: "finish",
        finishReason: "tool_call",
        usage: { inputTokens: 5, outputTokens: 4, reasoningTokens: 2 },
        metadata: { phase: "finish" },
        requestId: "recorded-1"
      }
    ]
  });
  const request: ProviderRequest = {
    model: "recorded",
    messages: [],
    tools: [],
    requestId: "recorded-1"
  };

  const result = await provider.complete(request);

  assert.deepEqual(result.message.content, [
    { type: "text", text: "before" },
    { type: "reasoning", text: "checking" },
    { type: "tool-call", id: "call-1", name: "search", arguments: '{"q":"hermes"}' },
    { type: "reasoning", text: " tools" },
    { type: "text", text: "after" }
  ]);
  assert.deepEqual(result.message.toolCalls, [
    { id: "call-1", name: "search", arguments: '{"q":"hermes"}' }
  ]);
  assert.deepEqual(result.toolResults, [{ toolCallId: "call-1", content: "found" }]);
  assert.equal(result.reasoning, "checking tools");
  assert.deepEqual(result.usage, {
    inputTokens: 5,
    outputTokens: 4,
    totalTokens: 9,
    reasoningTokens: 2
  });
  assert.deepEqual(result.metadata, { source: "fixture", phase: "finish" });
  assert.deepEqual(result.identity, { requestId: "recorded-1", attempt: 2 });
  assert.equal(provider.requests.length, 1);
});

test("stream reconciliation rejects identity changes and stream errors with normalized metadata", async () => {
  const mismatch = (async function* (): AsyncIterable<ProviderStreamEvent> {
    yield { type: "start", requestId: "request-a" };
    yield { type: "finish", finishReason: "stop", requestId: "request-b" };
  })();
  await assert.rejects(
    reconcileProviderStream(mismatch, { requestId: "request-a" }),
    (error: Error) => error instanceof ProviderError && error.category === "invalid_request"
  );

  const failed = (async function* (): AsyncIterable<ProviderStreamEvent> {
    yield {
      type: "error",
      error: {
        category: "rate_limit",
        retryable: true,
        message: "slow down",
        statusCode: 429,
        metadata: { vendorCode: "busy" }
      },
      metadata: { phase: "request" },
      requestId: "request-c"
    };
  })();
  await assert.rejects(
    reconcileProviderStream(failed),
    (error: Error) => error instanceof ProviderError &&
      error.category === "rate_limit" && error.requestId === "request-c" &&
      error.metadata?.phase === "request" && error.metadata.vendorCode === "busy"
  );
});

test("request context combines cancellation and deadline without credentials", async () => {
  const controller = new AbortController();
  const pending = (async function* (): AsyncIterable<ProviderStreamEvent> {
    yield { type: "text-delta", text: "partial" };
    await new Promise<void>((resolve) => controller.signal.addEventListener("abort", () => resolve(), { once: true }));
  })();
  const running = reconcileProviderStream(pending, { requestId: "cancel-1", signal: controller.signal });
  controller.abort();
  await assert.rejects(
    running,
    (error: Error) => error instanceof ProviderError && error.category === "cancelled" && error.requestId === "cancel-1"
  );

  const expired = (async function* (): AsyncIterable<ProviderStreamEvent> {
    yield { type: "text-delta", text: "never" };
  })();
  await assert.rejects(
    reconcileProviderStream(expired, { requestId: "deadline-1", deadline: 0 }),
    (error: Error) => error instanceof ProviderError && error.category === "timeout"
  );

  const unresolvedStream = new Promise<AsyncIterable<ProviderStreamEvent>>(() => undefined);
  await assert.rejects(
    reconcileProviderStream(unresolvedStream, { requestId: "deadline-2", timeoutMs: 10 }),
    (error: Error) => error instanceof ProviderError && error.category === "timeout"
  );
});

test("usage and finish aliases normalize to provider-neutral values", () => {
  assert.deepEqual(normalizeProviderUsage({ inputTokens: 2, outputTokens: 3 }), {
    inputTokens: 2,
    outputTokens: 3,
    totalTokens: 5
  });
  assert.equal(normalizeProviderFinishReason("tool_calls"), "tool_call");
  assert.equal(normalizeProviderFinishReason("max_tokens"), "length");
  assert.equal(normalizeProviderFinishReason("unrecognized-vendor-value"), "unknown");
  assert.throws(() => normalizeProviderUsage({ inputTokens: -1 }), /must be non-negative/);
});
