import { strict as assert } from "node:assert";
import { test } from "bun:test";

import {
  createOpenAICompatibleProvider,
  ProviderError,
  type OpenAICompatibleFetch,
  type ProviderRequest,
  type ProviderStreamEvent
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
      model: "fixture-model",
      system_fingerprint: "fingerprint-1",
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
        prompt_tokens_details: { cached_tokens: 3, cache_creation_input_tokens: 4, cache_read_input_tokens: 5 },
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
    cacheCreationInputTokens: 4,
    cacheReadInputTokens: 5,
    reasoningTokens: 2
  });
  assert.equal(result.finishReason, "tool_call");
  assert.equal(result.requestId, "request-1");
  assert.deepEqual(result.identity, { requestId: "request-1", attempt: 2, parentRequestId: "parent-1" });
  assert.deepEqual(result.metadata, {
    id: "completion-1",
    model: "fixture-model",
    system_fingerprint: "fingerprint-1"
  });
});

test("OpenAI-compatible adapter exposes ordered streaming deltas", async () => {
  const { provider, recorded } = providerWith({
    rawBody: [
      'data: {"id":"stream-1","choices":[{"delta":{"role":"assistant","content":"hel"}}]}',
      'data: {"choices":[{"delta":{"content":"lo","reasoning_content":"brief"}}]}',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":2,"completion_tokens":3}}',
      "data: [DONE]",
      "",
    ].join("\n\n"),
  });
  const events: ProviderStreamEvent[] = [];
  for await (const event of provider.stream!(request())) events.push(event);
  assert.equal(JSON.parse(String(recorded.calls[0]?.init?.body)).stream, true);
  assert.deepEqual(events.map(event => event.type), ["start", "text-delta", "text-delta", "reasoning-delta", "usage", "finish"]);
  assert.equal(events[1]?.text, "hel");
  assert.equal(events[2]?.text, "lo");
  assert.equal(events[5]?.finishReason, "stop");
});

test("OpenAI-compatible adapter serializes injected multimodal data without fetching it", async () => {
  const { provider, recorded } = providerWith({
    body: {
      choices: [{ finish_reason: "stop", message: { role: "assistant", content: "ok" } }]
    }
  });
  const requestWithMedia: ProviderRequest = {
    model: "fixture-model",
    requestId: "media-request",
    cacheHints: { key: "stable", read: true, write: true },
    messages: [{
      role: "user",
      content: [
        { type: "text", text: "Describe these in order." },
        { type: "image", url: "https://cdn.example/image.png", mimeType: "image/png" },
        { type: "audio", url: "data:audio/wav;base64,QUJD", mimeType: "audio/wav" },
        { type: "file", url: "data:application/pdf;base64,REVG", name: "notes.pdf" }
      ]
    }],
    tools: []
  };

  await provider.complete(requestWithMedia);
  await provider.complete(requestWithMedia);

  assert.equal(recorded.calls.length, 2);
  const firstBody = String(recorded.calls[0]?.init?.body);
  const secondBody = String(recorded.calls[1]?.init?.body);
  assert.equal(firstBody, secondBody);
  assert.deepEqual(JSON.parse(firstBody).messages, [{
    role: "user",
    content: [
      { type: "text", text: "Describe these in order." },
      { type: "image_url", image_url: { url: "https://cdn.example/image.png" } },
      { type: "input_audio", input_audio: { data: "QUJD", format: "wav" } },
      { type: "file", file: { file_data: "data:application/pdf;base64,REVG", filename: "notes.pdf" } }
    ]
  }]);
  assert.deepEqual(JSON.parse(firstBody).metadata, {
    hermes_cache: { key: "stable", read: true, write: true }
  });
});

test("OpenAI-compatible adapter rejects malformed media before fetch", async () => {
  const { provider, recorded } = providerWith({
    body: { choices: [{ finish_reason: "stop", message: { role: "assistant", content: "unused" } }] }
  });

  await assert.rejects(
    provider.complete({
      model: "fixture-model",
      messages: [{ role: "user", content: [{ type: "audio", url: "https://cdn.example/speech.wav" }] }],
      tools: []
    } as ProviderRequest),
    (error: Error) => error instanceof ProviderError && error.category === "invalid_request"
  );
  assert.equal(recorded.calls.length, 0);

  await assert.rejects(
    provider.complete({
      model: "fixture-model",
      messages: [{ role: "user", content: [{ type: "image", url: "file:///etc/passwd" }] }],
      tools: []
    } as ProviderRequest),
    (error: Error) => error instanceof TypeError && error.message.includes("http(s) or data URL")
  );
  assert.equal(recorded.calls.length, 0);
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

test("OpenAI-compatible adapter classifies safe body signals and preserves response request IDs", async () => {
  const policy = providerWith({
    status: 400,
    headers: { "x-request-id": "server-request-4" },
    body: { error: { message: "violates our usage policies: secret prompt payload" } }
  });

  await assert.rejects(
    policy.provider.complete({ model: "fixture-model", messages: [], tools: [] }),
    (error: Error) => error instanceof ProviderError &&
      error.category === "content_filter" &&
      error.retryable === false &&
      error.statusCode === 400 &&
      error.requestId === "server-request-4" &&
      !error.message.includes("secret prompt payload")
  );

  const gateway = providerWith({ status: 502, body: { error: { message: "bad gateway" } } });
  await assert.rejects(
    gateway.provider.complete({ model: "fixture-model", messages: [], tools: [] }),
    (error: Error) => error instanceof ProviderError && error.category === "server" && error.retryable
  );
});

test("OpenAI-compatible adapter protects authorization and rejects redirects", async () => {
  assert.throws(() => createOpenAICompatibleProvider({
    baseUrl: "https://recorded.example/v1",
    credentials: { apiKey: "fixture-secret" },
    headers: { Authorization: "Bearer caller-secret" },
    fetch: async () => new Response()
  }), /credential headers are managed/);

  const recorded = createRecordedFetch({ body: { choices: [{ finish_reason: "stop", message: { role: "assistant", content: "ok" } }] } });
  const provider = createOpenAICompatibleProvider({
    baseUrl: "https://recorded.example/v1",
    credentials: { apiKey: "fixture-secret" },
    fetch: recorded.fetch
  });
  await provider.complete({ model: "fixture-model", messages: [], tools: [] });
  assert.equal(recorded.calls[0]?.init?.redirect, "error");

  const redirected = createOpenAICompatibleProvider({
    baseUrl: "https://recorded.example/v1",
    credentials: { apiKey: "fixture-secret" },
    fetch: async () => Response.redirect("https://evil.example/chat/completions", 302)
  });
  await assert.rejects(
    redirected.complete({ model: "fixture-model", messages: [], tools: [], requestId: "redirect-1" }),
    (error: Error) => error instanceof ProviderError && error.category === "invalid_request" && !error.message.includes("evil.example")
  );
});

test("OpenAI-compatible adapter resolves opaque credential handles without exposing them", async () => {
  const recorded = createRecordedFetch({ body: { choices: [{ finish_reason: "stop", message: { role: "assistant", content: "ok" } }] } });
  const provider = createOpenAICompatibleProvider({
    baseUrl: "https://recorded.example/v1",
    credentialHandle: "credential:fixture",
    resolveCredentialHandle: async (handle) => {
      assert.equal(handle, "credential:fixture");
      return { apiKey: "handle-secret" };
    },
    fetch: recorded.fetch
  });
  await provider.complete({ model: "fixture-model", messages: [], tools: [], requestId: "handle-1" });
  assert.equal(new Headers(recorded.calls[0]?.init?.headers).get("authorization"), "Bearer handle-secret");

  const failed = createOpenAICompatibleProvider({
    baseUrl: "https://recorded.example/v1",
    credentialHandle: "credential:fixture",
    resolveCredentialHandle: () => { throw new Error("handle-secret must not escape"); },
    fetch: recorded.fetch
  });
  await assert.rejects(
    failed.complete({ model: "fixture-model", messages: [], tools: [], requestId: "handle-2" }),
    (error: Error) => error instanceof ProviderError && error.category === "authentication" && !error.message.includes("handle-secret")
  );
});

test("OpenAI-compatible adapter consumes an unterminated final SSE event", async () => {
  const { provider } = providerWith({
    rawBody: 'data: {"choices":[{"delta":{"content":"final"},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":2,"total_tokens":3}}'
  });
  const events: ProviderStreamEvent[] = [];
  for await (const event of provider.stream!({ model: "fixture-model", messages: [], tools: [] })) events.push(event);
  assert.deepEqual(events.map(event => event.type), ["start", "text-delta", "usage", "finish"]);
  assert.equal(events[1]?.text, "final");
});

test("OpenAI-compatible adapter enforces response and SSE bounds", async () => {
  const oversized = providerWith({ body: { choices: [{ finish_reason: "stop", message: { role: "assistant", content: "a large response" } }] } });
  const bounded = createOpenAICompatibleProvider({
    baseUrl: "https://recorded.example/v1",
    credentials: { apiKey: "fixture-secret" },
    maxResponseBytes: 8,
    fetch: oversized.recorded.fetch
  });
  await assert.rejects(
    bounded.complete({ model: "fixture-model", messages: [], tools: [], requestId: "bounds-1" }),
    (error: Error) => error instanceof ProviderError && error.category === "invalid_request" && error.message.includes("size limit")
  );

  const streamed = createOpenAICompatibleProvider({
    baseUrl: "https://recorded.example/v1",
    credentials: { apiKey: "fixture-secret" },
    maxSseEventBytes: 16,
    fetch: createRecordedFetch({ rawBody: 'data: {"choices":[]}' }).fetch
  });
  await assert.rejects(
    (async () => { for await (const _event of streamed.stream!({ model: "fixture-model", messages: [], tools: [] })) {} })(),
    (error: Error) => error instanceof ProviderError && error.category === "invalid_request"
  );
});

test("OpenAI-compatible adapter rejects malformed usage, finish, and tool codecs", async () => {
  const malformedUsage = providerWith({ body: {
    choices: [{ finish_reason: "stop", message: { role: "assistant", content: "bad" } }],
    usage: { prompt_tokens: 1 }
  } });
  await assert.rejects(
    malformedUsage.provider.complete({ model: "fixture-model", messages: [], tools: [] }),
    (error: Error) => error instanceof ProviderError && error.category === "invalid_request"
  );

  const unknownFinish = providerWith({ body: {
    choices: [{ finish_reason: "vendor-finished", message: { role: "assistant", content: "bad" } }]
  } });
  await assert.rejects(
    unknownFinish.provider.complete({ model: "fixture-model", messages: [], tools: [] }),
    (error: Error) => error instanceof ProviderError && error.category === "invalid_request"
  );

  const malformedTool = providerWith({ body: {
    choices: [{ finish_reason: "tool_calls", message: {
      role: "assistant", content: null, tool_calls: [{ id: "call-1", type: "custom", function: { name: "tool", arguments: "{}" } }]
    } }]
  } });
  await assert.rejects(
    malformedTool.provider.complete({ model: "fixture-model", messages: [], tools: [] }),
    (error: Error) => error instanceof ProviderError && error.category === "invalid_request"
  );
});
