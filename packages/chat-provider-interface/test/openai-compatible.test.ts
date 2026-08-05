import { strict as assert } from "node:assert";
import { test } from "bun:test";

import {
  createOpenAICompatibleProvider,
  ProviderError,
  type OpenAICompatibleFetch,
  type ProviderRequest
} from "../src/index.ts";

type RecordedFixture = {
  readonly status?: number;
  readonly body?: unknown;
  readonly rawBody?: string;
  readonly headers?: Record<string, string>;
  readonly error?: Error;
};

function createRecordedFetch(fixture: RecordedFixture): {
  readonly fetch: OpenAICompatibleFetch;
  readonly calls: readonly { input: string; init: RequestInit | undefined }[];
} {
  const calls: { input: string; init: RequestInit | undefined }[] = [];
  const fetch: OpenAICompatibleFetch = async (input, init) => {
    calls.push({ input: String(input), init });
    if (fixture.error !== undefined) throw fixture.error;
    return new Response(
      fixture.rawBody ?? JSON.stringify(fixture.body),
      {
        status: fixture.status ?? 200,
        headers: fixture.headers
      }
    );
  };
  return { fetch, calls };
}

function request(): ProviderRequest {
  return {
    model: "fixture-model",
    requestId: "request-1",
    identity: { requestId: "request-1", attempt: 2, parentRequestId: "parent-1" },
    messages: [
      { role: "system", content: "Be concise" },
      { role: "user", content: "What is the weather?" },
      {
        role: "assistant",
        content: [
          { type: "text", text: "I will check" },
          { type: "reasoning", text: "selecting weather tool" },
          { type: "tool-call", id: "call-1", name: "weather", arguments: '{"city":"NYC"}' }
        ],
        toolCalls: [{ id: "call-1", name: "weather", arguments: '{"city":"NYC"}' }]
      },
      {
        role: "tool",
        toolCallId: "call-1",
        content: [{ type: "tool-result", toolCallId: "call-1", content: "72F" }]
      }
    ],
    tools: [{
      name: "weather",
      policy: "allow",
      description: "Look up weather",
      parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] }
    }],
    options: {
      temperature: 0.2,
      topP: 0.9,
      maxTokens: 100,
      maxOutputTokens: 80,
      stop: ["END"],
      seed: 7,
      reasoningEffort: "low",
      responseFormat: "text",
      parallelToolCalls: false
    }
  };
}

function providerWith(fixture: RecordedFixture) {
  const recorded = createRecordedFetch(fixture);
  return {
    recorded,
    provider: createOpenAICompatibleProvider({
      baseUrl: "https://recorded.example/v1/",
      credentials: { apiKey: "fixture-secret", organization: "fixture-org", project: "fixture-project" },
      headers: { "X-Fixture": "yes" },
      fetch: recorded.fetch
    })
  };
}

test("OpenAI-compatible adapter serializes provider requests and normalizes tool calls", async () => {
  const { provider, recorded } = providerWith({
    headers: { "x-request-id": "server-request-id" },
    body: {
      id: "completion-1",
      choices: [{
        finish_reason: "tool_calls",
        message: {
          role: "assistant",
          content: "The weather tool can answer that.",
          reasoning_content: "The request needs weather data.",
          tool_calls: [{
            id: "call-1",
            type: "function",
            function: { name: "weather", arguments: '{"city":"NYC"}' }
          }]
        }
      }],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 6,
        total_tokens: 16,
        prompt_tokens_details: { cached_tokens: 3 },
        completion_tokens_details: { reasoning_tokens: 2 }
      }
    }
  });

  const result = await provider.complete(request());
  const call = recorded.calls[0];
  assert.equal(call?.input, "https://recorded.example/v1/chat/completions");
  assert.equal(call?.init?.method, "POST");
  assert.equal(call?.init?.signal?.aborted, false);
  assert.equal(new Headers(call?.init?.headers).get("authorization"), "Bearer fixture-secret");
  assert.equal(new Headers(call?.init?.headers).get("x-request-id"), "request-1");
  assert.equal(new Headers(call?.init?.headers).get("x-fixture"), "yes");

  const body = JSON.parse(String(call?.init?.body)) as Record<string, unknown>;
  assert.deepEqual(body.messages, [
    { role: "system", content: "Be concise" },
    { role: "user", content: "What is the weather?" },
    {
      role: "assistant",
      content: "I will check",
      reasoning_content: "selecting weather tool",
      tool_calls: [{ id: "call-1", type: "function", function: { name: "weather", arguments: '{"city":"NYC"}' } }]
    },
    { role: "tool", content: "72F", tool_call_id: "call-1" }
  ]);
  assert.deepEqual(body.tools, [{
    type: "function",
    function: {
      name: "weather",
      description: "Look up weather",
      parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] }
    }
  }]);
  assert.equal(body.stream, false);
  assert.equal(body.max_tokens, 100);
  assert.equal(body.max_completion_tokens, 80);
  assert.equal(body.reasoning_effort, "low");

  assert.equal(result.message.content, "The weather tool can answer that.");
  assert.deepEqual(result.message.toolCalls, [{ id: "call-1", name: "weather", arguments: '{"city":"NYC"}' }]);
  assert.equal(result.reasoning, "The request needs weather data.");
  assert.deepEqual(result.usage, {
    inputTokens: 10,
    outputTokens: 6,
    totalTokens: 16,
    cachedInputTokens: 3,
    reasoningTokens: 2
  });
  assert.equal(result.finishReason, "tool_call");
  assert.equal(result.requestId, "request-1");
  assert.deepEqual(result.identity, { requestId: "request-1", attempt: 2, parentRequestId: "parent-1" });
});

test("OpenAI-compatible adapter validates malformed responses without leaking payloads", async () => {
  const { provider } = providerWith({
    body: { choices: [{ message: { role: "assistant", content: "bad" } }] }
  });

  await assert.rejects(
    provider.complete({ model: "fixture-model", messages: [], tools: [], requestId: "malformed-1" }),
    (error: Error) => error instanceof ProviderError &&
      error.category === "invalid_request" &&
      error.retryable === false &&
      error.requestId === "malformed-1" &&
      !error.message.includes("bad")
  );
});

test("OpenAI-compatible adapter classifies retryable HTTP and network failures", async () => {
  const limited = providerWith({
    status: 429,
    body: { error: { message: "prompt should never appear in an adapter error" } }
  });
  await assert.rejects(
    limited.provider.complete({ model: "fixture-model", messages: [], tools: [], requestId: "limited-1" }),
    (error: Error) => error instanceof ProviderError &&
      error.category === "rate_limit" &&
      error.retryable === true &&
      error.statusCode === 429 &&
      !error.message.includes("prompt")
  );

  const network = providerWith({ error: new Error("network fixture") });
  await assert.rejects(
    network.provider.complete({ model: "fixture-model", messages: [], tools: [], requestId: "network-1" }),
    (error: Error) => error instanceof ProviderError &&
      error.category === "network" &&
      error.retryable === true &&
      error.requestId === "network-1" &&
      !error.message.includes("network fixture")
  );
});
