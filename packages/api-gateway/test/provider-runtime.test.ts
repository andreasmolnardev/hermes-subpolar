import { strict as assert } from "node:assert";
import { test } from "bun:test";

import { createProvider, listProviderModels, resolveProvider } from "../src/provider-runtime.ts";

const request = {
  model: "test-model",
  messages: [{ role: "user" as const, content: "hello" }],
  tools: [],
  requestId: "provider-runtime-test"
};

test("provider runtime selects the Chat Completions transport", async () => {
  let seenUrl = "";
  const runtime = await resolveProvider({ providerId: "openai-api", baseUrl: "https://provider.test/v1", credentialHandle: "openai-api:default", model: "test-model" }, () => ({ apiKey: "secret" }));
  const provider = createProvider(runtime, { fetch: async (input, init) => {
    seenUrl = String(input);
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer secret");
    return Response.json({ choices: [{ message: { role: "assistant", content: "chat" }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } });
  }, resolveCredential: () => ({ apiKey: "secret" }) });
  const result = await provider.complete(request);
  assert.equal(seenUrl, "https://provider.test/v1/chat/completions");
  assert.equal(result.message.content, "chat");
});

test("provider runtime selects native Anthropic Messages", async () => {
  let seenUrl = "";
  const runtime = await resolveProvider({ providerId: "anthropic", baseUrl: "https://provider.test", credentialHandle: "anthropic:default", model: "claude-test" }, () => ({ apiKey: "secret" }));
  const provider = createProvider(runtime, { fetch: async (input, init) => {
    seenUrl = String(input);
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("x-api-key"), "secret");
    assert.equal(headers.get("anthropic-version"), "2023-06-01");
    return Response.json({ content: [{ type: "text", text: "native" }], stop_reason: "end_turn", usage: { input_tokens: 2, output_tokens: 3 } });
  }, resolveCredential: () => ({ apiKey: "secret" }) });
  const result = await provider.complete(request);
  assert.equal(seenUrl, "https://provider.test/v1/messages");
  assert.equal(result.message.content, "native");
  assert.equal(result.usage.inputTokens, 2);
});

test("provider runtime selects the Responses transport and preserves fallback models", async () => {
  let seenUrl = "";
  const runtime = await resolveProvider({ providerId: "openai-responses", baseUrl: "https://provider.test/v1", credentialHandle: "openai-responses:default", model: "response-test" }, () => ({ apiKey: "secret" }));
  const provider = createProvider(runtime, { fetch: async (input) => {
    seenUrl = String(input);
    return Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "response" }] }], usage: { input_tokens: 4, output_tokens: 5 } });
  }, resolveCredential: () => ({ apiKey: "secret" }) });
  const result = await provider.complete(request);
  assert.equal(seenUrl, "https://provider.test/v1/responses");
  assert.equal(result.message.content, "response");
  assert.deepEqual(await listProviderModels(runtime, { fetch: async () => new Response("", { status: 503 }) }), [
    { id: "response-test", label: "response-test" },
    { id: "gpt-5", label: "gpt-5" },
    { id: "gpt-4.1", label: "gpt-4.1" }
  ]);
});

test("provider runtime selects Bedrock Converse with AWS credentials", async () => {
  let seenUrl = "";
  const runtime = await resolveProvider({ providerId: "bedrock", baseUrl: "https://bedrock-runtime.us-east-1.amazonaws.com", credentialHandle: "bedrock:default", model: "anthropic.test" }, () => ({ accessKeyId: "access", secretAccessKey: "secret", region: "us-east-1" }));
  const provider = createProvider(runtime, {
    resolveCredential: () => ({ accessKeyId: "access", secretAccessKey: "secret", region: "us-east-1" }),
    fetch: async (input) => {
      seenUrl = String(input);
      return Response.json({ output: { message: { content: [{ text: "bedrock" }] } }, stopReason: "end_turn", usage: { inputTokens: 1, outputTokens: 2 } });
    }
  });
  const result = await provider.complete({ ...request, model: "anthropic.test" });
  assert.equal(seenUrl, "https://bedrock-runtime.us-east-1.amazonaws.com/model/anthropic.test/converse");
  assert.equal(result.message.content, "bedrock");
});

test("provider behaviors materialize reasoning options and provider credential headers", async () => {
  let payload: Record<string, unknown> | undefined;
  const runtime = await resolveProvider({ providerId: "openrouter", baseUrl: "https://provider.test/v1", credentialHandle: "openrouter:default", model: "router-model" }, () => ({ apiKey: "secret" }));
  const provider = createProvider(runtime, {
    resolveCredential: () => ({ apiKey: "secret" }),
    fetch: async (_input, init) => {
      payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({ choices: [{ message: { role: "assistant", content: "ok" }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1 } });
    }
  });
  await provider.complete({ ...request, options: { reasoningEffort: "high" } });
  assert.deepEqual(payload?.reasoning, { effort: "high" });

  const gemini = await resolveProvider({ providerId: "gemini", baseUrl: "https://provider.test/v1", credentialHandle: "gemini:default", model: "gemini-test" }, () => ({ apiKey: "secret" }));
  const geminiProvider = createProvider(gemini, {
    resolveCredential: () => ({ apiKey: "secret" }),
    fetch: async (_input, init) => {
      assert.equal(new Headers(init?.headers).get("x-goog-api-key"), "secret");
      return Response.json({ choices: [{ message: { role: "assistant", content: "ok" }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1 } });
    }
  });
  await geminiProvider.complete(request);
});
