import { strict as assert } from "node:assert";
import { test } from "bun:test";

import {
  assertProviderJsonValue,
  classifyProviderError,
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
