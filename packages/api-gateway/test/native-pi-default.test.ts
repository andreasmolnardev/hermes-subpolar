import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "bun:test";

import { HERMES_TO_PI_PROVIDER_ID } from "harness";
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

function completionSse(content: string): Response {
  const events = [
    { id: "child-completion", object: "chat.completion.chunk", choices: [{ index: 0, delta: { role: "assistant", content }, finish_reason: null }] },
    { id: "child-completion", object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] },
  ];
  return new Response(`${events.map(event => `data: ${JSON.stringify(event)}\n\n`).join("")}data: [DONE]\n\n`, { headers: { "content-type": "text/event-stream" } });
}

function spawnAgentSse(agentId: string): Response {
  const event = {
    id: "spawn-call",
    object: "chat.completion.chunk",
    choices: [{ index: 0, delta: { role: "assistant", tool_calls: [{ index: 0, id: "spawn-call", type: "function", function: { name: "spawn_agent", arguments: JSON.stringify({ agentId, task: "Return a short answer." }) } }] }, finish_reason: null }],
  };
  const done = { id: "spawn-call", object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] };
  return new Response(`data: ${JSON.stringify(event)}\n\ndata: ${JSON.stringify(done)}\n\ndata: [DONE]\n\n`, { headers: { "content-type": "text/event-stream" } });
}

test("default server dispatch uses native Pi ModelRuntime for a configured supported provider", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "subpolar-native-pi-default-test-"));
  const server = startApiGatewayServer({ port: 0, dataDir });
  const originalFetch = globalThis.fetch;
  let nativeCompletionsCalls = 0;
  let nativeMessages: unknown;
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
        nativeMessages = JSON.parse(String(init?.body ?? "{}")).messages;
        assert.equal(new Headers(init?.headers).get("authorization"), "Bearer native-test-key");
        return chatCompletionsSse();
      }
      if (url.startsWith(server.url)) return originalFetch(input, init);
      throw new Error(`Unexpected provider request: ${url}`);
    };

    const completion = await fetch(`${server.url}v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: [
          { type: "text", text: "hello" },
          { type: "image_url", imageUrl: { url: "data:image/png;base64,AA==" } },
        ] }],
      }),
    });
    assert.equal(completion.status, 200);
    const result = await completion.json() as { message: { content: string }; usage?: { inputTokens?: number } };
    assert.equal(result.message.content, "native Pi");
    assert.equal(result.usage?.inputTokens, 3);
    assert.equal(nativeCompletionsCalls, 1);
    const userMessage = (nativeMessages as readonly { readonly role: string; readonly content: unknown }[]).find(message => message.role === "user");
    assert.deepEqual(userMessage, {
      role: "user",
      content: [
        { type: "text", text: "hello" },
        { type: "image_url", image_url: { url: "data:image/png;base64,AA==" } },
      ],
    });
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
    for (const [providerId, piProviderId] of Object.entries(HERMES_TO_PI_PROVIDER_ID)) {
      if (piProviderId === null) {
        const configured = await fetch(`${server.url}v1/setup/provider`, {
          method: "POST",
          headers,
          body: JSON.stringify({ providerId, baseUrl: `https://${providerId}.invalid/v1`, apiKey: "key", model: "model" }),
        });
        assert.equal(configured.status, 400, `unsupported provider ${providerId} should be rejected`);
        assert.deepEqual(await configured.json(), { error: "invalid_provider" });
      }
    }

    for (const [providerId, piProviderId] of Object.entries(HERMES_TO_PI_PROVIDER_ID)) {
      if (piProviderId !== null) {
        const configured = await fetch(`${server.url}v1/setup/provider`, {
          method: "POST",
          headers,
          body: JSON.stringify({ providerId, baseUrl: `https://${providerId}.invalid/v1`, apiKey: "key", model: "model" }),
        });
        assert.equal(configured.status, 200, `mapped provider ${providerId} should be accepted by setup`);
        assert.deepEqual(await configured.json(), { configured: true });
      }
    }
  } finally {
    await server.shutdown();
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("native Pi wires an explicitly authorized spawn_agent into a restricted child session", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "subpolar-native-pi-child-test-"));
  const server = startApiGatewayServer({ port: 0, dataDir });
  const originalFetch = globalThis.fetch;
  let providerCalls = 0;
  try {
    const origin = new URL(server.url).origin;
    const bootstrap = await originalFetch(`${server.url}v1/auth/bootstrap`, {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({ username: "operator", password: "correct horse" }),
    });
    const cookies = sessionCookies(bootstrap);
    const headers = { "content-type": "application/json", cookie: cookies, "x-csrf-token": csrf(cookies), origin };
    const projectResponse = await originalFetch(`${server.url}v1/projects`, { method: "POST", headers, body: JSON.stringify({ name: "Child project" }) });
    assert.equal(projectResponse.status, 201);
    const projectId = (await projectResponse.json() as { project: { id: string } }).project.id;
    const parentResponse = await originalFetch(`${server.url}v1/agents`, { method: "POST", headers, body: JSON.stringify({ projectId, name: "Parent", instructions: "Use child agents when authorized.", icon: "bot" }) });
    assert.equal(parentResponse.status, 201);
    const parentId = (await parentResponse.json() as { agent: { id: string } }).agent.id;
    const childResponse = await originalFetch(`${server.url}v1/agents`, { method: "POST", headers, body: JSON.stringify({ projectId, name: "Child", instructions: "Answer the assigned task.", icon: "bot" }) });
    assert.equal(childResponse.status, 201);
    const childId = (await childResponse.json() as { agent: { id: string } }).agent.id;
    const updated = await originalFetch(`${server.url}v1/agents/${parentId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ capabilities: [{ capabilityId: "subpolar.spawn_agent", enabled: true }], permissions: [{ capabilityId: "subpolar.spawn_agent", policy: "allow" }] }),
    });
    assert.equal(updated.status, 200);
    await originalFetch(`${server.url}v1/setup/provider`, {
      method: "POST",
      headers,
      body: JSON.stringify({ providerId: "openai-api", baseUrl: "https://native-child.invalid/v1", apiKey: "child-key", model: "child-model" }),
    });
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url === "https://native-child.invalid/v1/chat/completions") {
        providerCalls += 1;
        return providerCalls === 1 ? spawnAgentSse(childId) : providerCalls === 2 ? completionSse("child answer") : completionSse("parent answer");
      }
      return originalFetch(input, init);
    };
    const completion = await fetch(`${server.url}v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ model: "child-model", projectId, agentId: parentId, messages: [{ role: "user", content: "delegate" }] }),
    });
    assert.equal(completion.status, 200);
    assert.equal((await completion.json() as { message: { content: string } }).message.content, "parent answer");
    assert.equal(providerCalls, 3);
  } finally {
    globalThis.fetch = originalFetch;
    await server.shutdown();
    rmSync(dataDir, { recursive: true, force: true });
  }
});
