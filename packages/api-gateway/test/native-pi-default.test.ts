import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "bun:test";

import { startApiGatewayServer } from "../src/server.ts";

function sessionCookies(response: Response): string {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const values = headers.getSetCookie?.() ?? [response.headers.get("set-cookie") ?? ""];
  return values.flatMap(value => value.split(/,\s*(?=[^;]+=)/)).map(cookie => cookie.split(";", 1)[0]).join("; ");
}

function csrf(cookies: string): string {
  const match = /(?:^|;\s*)subpolar_csrf=([^;]+)/.exec(cookies);
  if (match === null) throw new Error("CSRF cookie missing");
  return decodeURIComponent(match[1] as string);
}

function chatCompletionsSse(): Response {
  const events = [
    { id: "chatcmpl-native-pi", object: "chat.completion.chunk", choices: [{ index: 0, delta: { role: "assistant", content: "native Pi" }, finish_reason: null }] },
    { id: "chatcmpl-native-pi", object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 } },
  ];
  const body = `${events.map(event => `data: ${JSON.stringify(event)}\n\n`).join("")}data: [DONE]\n\n`;
  return new Response(body, { headers: { "content-type": "text/event-stream" } });
}

test("default server dispatch uses native Pi ModelRuntime for a configured supported provider", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "subpolar-native-pi-default-test-"));
  const server = startApiGatewayServer({ port: 0, dataDir });
  const originalFetch = globalThis.fetch;
  let nativeCompletionsCalls = 0;
  try {
    const origin = new URL(server.url).origin;
    const bootstrap = await originalFetch(`${server.url}v1/auth/bootstrap`, {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({ username: "operator", password: "correct horse" }),
    });
    assert.equal(bootstrap.status, 201);
    const cookies = sessionCookies(bootstrap);
    const headers = {
      "content-type": "application/json",
      cookie: cookies,
      "x-csrf-token": csrf(cookies),
      origin,
    };
    const configured = await originalFetch(`${server.url}v1/setup/provider`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        providerId: "openai-api",
        baseUrl: "https://legacy-provider.invalid/v1",
        apiKey: "native-test-key",
        model: "gpt-4o-mini",
      }),
    });
    assert.equal(configured.status, 200);

    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url === "https://legacy-provider.invalid/v1/chat/completions") {
        nativeCompletionsCalls += 1;
        assert.equal(new Headers(init?.headers).get("authorization"), "Bearer native-test-key");
        return chatCompletionsSse();
      }
      if (url.startsWith(server.url)) return originalFetch(input, init);
      throw new Error(`Unexpected provider request: ${url}`);
    };

    const completion = await fetch(`${server.url}v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: "hello" }] }),
    });
    assert.equal(completion.status, 200);
    const result = await completion.json() as { message: { content: string }; usage?: { inputTokens?: number } };
    assert.equal(result.message.content, "native Pi");
    assert.equal(result.usage?.inputTokens, 3);
    assert.equal(nativeCompletionsCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    await server.shutdown();
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("native model resolution reports unsupported providers explicitly", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "subpolar-native-pi-error-test-"));
  const server = startApiGatewayServer({ port: 0, dataDir });
  try {
    const origin = new URL(server.url).origin;
    const bootstrap = await fetch(`${server.url}v1/auth/bootstrap`, {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({ username: "operator", password: "correct horse" }),
    });
    const cookies = sessionCookies(bootstrap);
    const headers = {
      "content-type": "application/json",
      cookie: cookies,
      "x-csrf-token": csrf(cookies),
      origin,
    };
    const configured = await fetch(`${server.url}v1/setup/provider`, {
      method: "POST",
      headers,
      body: JSON.stringify({ providerId: "custom", baseUrl: "https://unsupported.example/v1", apiKey: "key", model: "model" }),
    });
    assert.equal(configured.status, 200);
    const completion = await fetch(`${server.url}v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ model: "model", messages: [{ role: "user", content: "hello" }] }),
    });
    assert.equal(completion.status, 400);
    assert.deepEqual(await completion.json(), { error: "unsupported_provider" });
  } finally {
    await server.shutdown();
    rmSync(dataDir, { recursive: true, force: true });
  }
});
