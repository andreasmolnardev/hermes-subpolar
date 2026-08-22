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

function testDataDir(): string {
  return mkdtempSync(join(tmpdir(), "subpolar-gateway-test-"));
}

test("server authenticates users before dispatching owned chat turns", async () => {
  const dataDir = testDataDir();
  const server = startApiGatewayServer({
    port: 0,
    dataDir,
    provider: {
      async complete() {
        return { message: { role: "assistant", content: "hello" }, finishReason: "stop", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } };
      }
    }
  });
  try {
    const health = await fetch(`${server.url}api/health`);
    assert.deepEqual(await health.json(), { status: "ok" });
    const bootstrap = await fetch(`${server.url}v1/auth/bootstrap`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: new URL(server.url).origin },
      body: JSON.stringify({ username: "operator", password: "correct horse" }),
    });
    assert.equal(bootstrap.status, 201);
    const cookies = sessionCookies(bootstrap);
    const noAuth = await fetch(`${server.url}v1/projects`);
    assert.equal(noAuth.status, 401);
    const noCsrf = await fetch(`${server.url}v1/projects`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookies, origin: new URL(server.url).origin },
      body: JSON.stringify({ name: "blocked" }),
    });
    assert.equal(noCsrf.status, 403);
    const project = await fetch(`${server.url}v1/projects`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookies, "x-csrf-token": csrf(cookies), origin: new URL(server.url).origin },
      body: JSON.stringify({ name: "Private project" }),
    });
    assert.equal(project.status, 201);
    const initialDefaults = await fetch(`${server.url}v1/settings/models`, { headers: { cookie: cookies } });
    assert.deepEqual(await initialDefaults.json(), { conversation: "default", internal: "default", voice: "default", image: "default" });
    const updatedDefaults = await fetch(`${server.url}v1/settings/models`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: cookies, "x-csrf-token": csrf(cookies), origin: new URL(server.url).origin },
      body: JSON.stringify({ conversation: "chat", internal: "tasks", voice: "voice", image: "image" }),
    });
    assert.equal(updatedDefaults.status, 200);
    assert.deepEqual(await updatedDefaults.json(), { conversation: "chat", internal: "tasks", voice: "voice", image: "image" });
    const voiceUpdate = await fetch(`${server.url}v1/settings/voice`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: cookies, "x-csrf-token": csrf(cookies), origin: new URL(server.url).origin },
      body: JSON.stringify({
        stt: { provider: "http", model: "listen-v1", language: "auto", endpoint: "https://voice.example.test/transcribe", apiKey: "stt-secret" },
        tts: { provider: "http", model: "speak-v1", voice: "alloy", speed: 1, endpoint: "https://voice.example.test/speech", autoPlay: false, apiKey: "tts-secret" },
      }),
    });
    assert.equal(voiceUpdate.status, 200);
    const voicePayload = await voiceUpdate.json();
    assert.deepEqual(voicePayload, {
      stt: { provider: "http", model: "listen-v1", language: "auto", endpoint: "https://voice.example.test/transcribe", configured: true },
      tts: { provider: "http", model: "speak-v1", voice: "alloy", speed: 1, endpoint: "https://voice.example.test/speech", autoPlay: false, configured: true },
    });
    const voiceReload = await fetch(`${server.url}v1/settings/voice`, { headers: { cookie: cookies } });
    assert.deepEqual(await voiceReload.json(), voicePayload);
    const completion = await fetch(`${server.url}v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookies, "x-csrf-token": csrf(cookies), origin: new URL(server.url).origin },
      body: JSON.stringify({ model: "test", sessionId: "owned-session", messages: [{ role: "user", content: "hi" }] }),
    });
    const result = await completion.json() as { message: { content: string } };
    assert.equal(completion.status, 200);
    assert.equal(result.message.content, "hello");
    const transcript = await fetch(`${server.url}v1/sessions/owned-session`, { headers: { cookie: cookies } });
    assert.equal(transcript.status, 200);
    const password = await fetch(`${server.url}v1/auth/password`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookies, "x-csrf-token": csrf(cookies), origin: new URL(server.url).origin },
      body: JSON.stringify({ currentPassword: "correct horse", newPassword: "new correct horse" }),
    });
    assert.equal(password.status, 200);
    const rotatedCookies = sessionCookies(password);
    assert.equal((await fetch(`${server.url}v1/me`, { headers: { cookie: cookies } })).status, 401);
    assert.equal((await fetch(`${server.url}v1/me`, { headers: { cookie: rotatedCookies } })).status, 200);
    const logout = await fetch(`${server.url}v1/auth/logout`, { method: "POST", headers: { cookie: rotatedCookies, "x-csrf-token": csrf(rotatedCookies), origin: new URL(server.url).origin } });
    assert.equal(logout.status, 200);
    assert.equal((await fetch(`${server.url}v1/me`, { headers: { cookie: rotatedCookies } })).status, 401);
  } finally {
    await server.shutdown();
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("server completes first-run provider and agent setup before dispatch", async () => {
  const dataDir = testDataDir();
  const upstream = Bun.serve({
    port: 0,
    fetch(request) {
      assert.equal(new URL(request.url).pathname, "/v1/models");
      assert.equal(request.headers.get("authorization"), "Bearer local-key");
      return Response.json({ data: [{ id: "zeta" }, { id: "alpha" }, { id: "alpha" }] });
    },
  });
  const server = startApiGatewayServer({ port: 0, dataDir });
  try {
    const origin = new URL(server.url).origin;
    const bootstrap = await fetch(`${server.url}v1/auth/bootstrap`, { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify({ username: "operator", password: "correct horse" }) });
    const cookies = sessionCookies(bootstrap);
    const headers = { "content-type": "application/json", cookie: cookies, "x-csrf-token": csrf(cookies), origin };
    assert.deepEqual(await (await fetch(`${server.url}v1/setup`, { headers: { cookie: cookies } })).json(), { complete: false, providerConfigured: false });
    const providerCatalog = await fetch(`${server.url}v1/setup/providers`, { headers: { cookie: cookies } });
    assert.equal(providerCatalog.status, 200);
    const catalog = await providerCatalog.json() as { providers: readonly { id: string }[] };
    assert.ok(catalog.providers.some(provider => provider.id === "openai-api"));
    assert.ok(catalog.providers.length >= 40);
    const publicCatalog = await fetch(`${server.url}v1/providers`, { headers: { cookie: cookies } });
    assert.equal(publicCatalog.status, 200);
    const invalidProvider = await fetch(`${server.url}v1/setup/provider`, { method: "POST", headers, body: JSON.stringify({ provider: "not-a-hermes-provider", baseUrl: "https://example.test/v1", apiKey: "key", model: "model" }) });
    assert.equal(invalidProvider.status, 400);
    const provider = await fetch(`${server.url}v1/setup/provider`, { method: "POST", headers, body: JSON.stringify({ providerId: "openai-api", baseUrl: `${upstream.url}v1`, apiKey: "local-key", model: "local-model" }) });
    assert.equal(provider.status, 200);
    const models = await fetch(`${server.url}v1/models`, { headers: { cookie: cookies } });
    assert.equal(models.status, 200);
    assert.deepEqual(await models.json(), { providers: [{ id: "openai-api", models: [{ id: "alpha", label: "alpha" }, { id: "zeta", label: "zeta" }] }] });
    const providerModels = await fetch(`${server.url}v1/providers/openai-api/models`, { headers: { cookie: cookies } });
    assert.deepEqual(await providerModels.json(), { providerId: "openai-api", models: [{ id: "alpha", label: "alpha" }, { id: "zeta", label: "zeta" }] });
    const agents = await fetch(`${server.url}v1/setup/agents`, { method: "POST", headers, body: JSON.stringify({ templates: ["research"] }) });
    assert.equal(agents.status, 201);
    const created = await agents.json() as { agents: readonly { name: string }[] };
    assert.deepEqual(created.agents.map(agent => agent.name), ["master", "research"]);
    assert.deepEqual(await (await fetch(`${server.url}v1/setup`, { headers: { cookie: cookies } })).json(), { complete: true, providerConfigured: true });
  } finally {
    await server.shutdown();
    upstream.stop();
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("server exposes provider deltas as an authenticated SSE stream", async () => {
  const dataDir = testDataDir();
  const server = startApiGatewayServer({
    port: 0,
    dataDir,
    provider: {
      async complete() {
        return { message: { role: "assistant", content: "unused" }, finishReason: "stop", usage: { inputTokens: 1, outputTokens: 1 } };
      },
      async *stream() {
        yield { type: "start" };
        yield { type: "text-delta", text: "hello" };
        yield { type: "finish", finishReason: "stop" };
      },
    },
  });
  try {
    const bootstrap = await fetch(`${server.url}v1/auth/bootstrap`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: new URL(server.url).origin },
      body: JSON.stringify({ username: "streamer", password: "correct horse" }),
    });
    const cookies = sessionCookies(bootstrap);
    const response = await fetch(`${server.url}v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookies, "x-csrf-token": csrf(cookies), origin: new URL(server.url).origin },
      body: JSON.stringify({ stream: true, model: "test", messages: [{ role: "user", content: "hi" }] }),
    });
    const text = await response.text();
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /text\/event-stream/);
    assert.match(text, /message\.delta/);
    assert.match(text, /hello/);
    assert.match(text, /data: \[DONE\]/);
  } finally {
    await server.shutdown();
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("server begins an authenticated provider OAuth flow without exposing credentials", async () => {
  const dataDir = testDataDir();
  const previous = process.env.SUBPOLAR_OPENAI_CODEX_CLIENT_ID;
  process.env.SUBPOLAR_OPENAI_CODEX_CLIENT_ID = "test-client";
  const server = startApiGatewayServer({ port: 0, dataDir });
  try {
    const origin = new URL(server.url).origin;
    const bootstrap = await fetch(`${server.url}v1/auth/bootstrap`, { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify({ username: "oauth-user", password: "correct horse" }) });
    const cookies = sessionCookies(bootstrap);
    const response = await fetch(`${server.url}v1/providers/openai-codex/auth/start?model=gpt-test`, { headers: { cookie: cookies } });
    assert.equal(response.status, 200);
    const payload = await response.json() as { authorizationUrl: string; state: string };
    assert.match(payload.authorizationUrl, /client_id=test-client/);
    assert.match(payload.authorizationUrl, /code_challenge=/);
    assert.equal(payload.authorizationUrl.includes("secret"), false);
  } finally {
    await server.shutdown();
    rmSync(dataDir, { recursive: true, force: true });
    if (previous === undefined) delete process.env.SUBPOLAR_OPENAI_CODEX_CLIENT_ID;
    else process.env.SUBPOLAR_OPENAI_CODEX_CLIENT_ID = previous;
  }
});

test("server enforces non-stream idempotency before provider effects", async () => {
  let providerCalls = 0;
  const dataDir = testDataDir();
  const server = startApiGatewayServer({
    port: 0,
    dataDir,
    provider: {
      async complete() {
        providerCalls += 1;
        return { message: { role: "assistant", content: "idempotent" }, finishReason: "stop", usage: { inputTokens: 1, outputTokens: 1 } };
      },
    },
  });
  try {
    const origin = new URL(server.url).origin;
    const bootstrap = await fetch(`${server.url}v1/auth/bootstrap`, {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({ username: "idempotent-user", password: "correct horse" }),
    });
    const cookies = sessionCookies(bootstrap);
    const headers = {
      "content-type": "application/json",
      cookie: cookies,
      "x-csrf-token": csrf(cookies),
      origin,
      "idempotency-key": "request-key",
    };
    const request = { model: "test", messages: [{ role: "user", content: "same" }] };
    const first = await fetch(`${server.url}v1/chat/completions`, { method: "POST", headers, body: JSON.stringify(request) });
    const firstPayload = await first.json();
    const replay = await fetch(`${server.url}v1/chat/completions`, { method: "POST", headers, body: JSON.stringify(request) });
    assert.equal(replay.status, 200);
    assert.deepEqual(await replay.json(), firstPayload);
    assert.equal(providerCalls, 1);

    const mismatch = await fetch(`${server.url}v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ ...request, messages: [{ role: "user", content: "different" }] }),
    });
    assert.equal(mismatch.status, 409);
    assert.deepEqual(await mismatch.json(), { error: "idempotency_conflict" });

    const streaming = await fetch(`${server.url}v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ ...request, stream: true }),
    });
    assert.equal(streaming.status, 400);
    assert.deepEqual(await streaming.json(), { error: "idempotency_streaming_unsupported" });
    assert.equal(providerCalls, 1);
  } finally {
    await server.shutdown();
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("server upgrades authenticated WebSockets and projects ordered chat events", async () => {
  const dataDir = testDataDir();
  const server = startApiGatewayServer({
    port: 0,
    dataDir,
    provider: {
      async complete() {
        return { message: { role: "assistant", content: "socket hello" }, finishReason: "stop", usage: { inputTokens: 1, outputTokens: 1 } };
      },
    },
  });
  try {
    const bootstrap = await fetch(`${server.url}v1/auth/bootstrap`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: new URL(server.url).origin },
      body: JSON.stringify({ username: "socket-user", password: "correct horse" }),
    });
    const cookies = sessionCookies(bootstrap);
    const events: string[] = [];
    const socket = new WebSocket(String(server.url).replace(/^http/, "ws") + "v1/ws", { headers: { cookie: cookies, origin: new URL(server.url).origin } } as unknown as string);
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => socket.send(JSON.stringify({ type: "chat.start", requestId: "socket-request", csrfToken: csrf(cookies), model: "test", messages: [{ role: "user", content: "hi" }] })));
      socket.addEventListener("message", event => {
        const text = String(event.data);
        events.push(text);
        if (text.includes('"type":"message.complete"')) resolve();
      });
      socket.addEventListener("error", () => reject(new Error("WebSocket failed")));
    });
    socket.close();
    assert.ok(events.some(event => event.includes('"type":"connected"')));
    assert.ok(events.some(event => event.includes('"type":"message.start"')));
    assert.ok(events.some(event => event.includes('"type":"message.complete"')));
  } finally {
    await server.shutdown();
    rmSync(dataDir, { recursive: true, force: true });
  }
});
