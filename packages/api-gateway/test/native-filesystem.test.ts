import { strict as assert } from "node:assert";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "bun:test";

import { startApiGatewayServer } from "../src/server.ts";

function cookies(response: Response): string {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const values = headers.getSetCookie?.() ?? [response.headers.get("set-cookie") ?? ""];
  return values.flatMap(value => value.split(/,\s*(?=[^;]+=)/)).map(value => value.split(";", 1)[0]).join("; ");
}

function csrf(value: string): string {
  const match = /(?:^|;\s*)subpolar_csrf=([^;]+)/.exec(value);
  if (match === null) throw new Error("CSRF cookie missing");
  return decodeURIComponent(match[1]);
}

function textSse(content: string): Response {
  const event = { id: "native-filesystem", object: "chat.completion.chunk", choices: [{ index: 0, delta: { role: "assistant", content }, finish_reason: null }] };
  const done = { id: "native-filesystem", object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] };
  return new Response(`data: ${JSON.stringify(event)}\n\ndata: ${JSON.stringify(done)}\n\ndata: [DONE]\n\n`, { headers: { "content-type": "text/event-stream" } });
}

function toolSse(id: string, name: string, argumentsValue: Record<string, string>): Response {
  const event = {
    id: "native-filesystem-tool",
    object: "chat.completion.chunk",
    choices: [{ index: 0, delta: { role: "assistant", tool_calls: [{ index: 0, id, type: "function", function: { name, arguments: JSON.stringify(argumentsValue) } }] }, finish_reason: null }],
  };
  const done = { id: "native-filesystem-tool", object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] };
  return new Response(`data: ${JSON.stringify(event)}\n\ndata: ${JSON.stringify(done)}\n\ndata: [DONE]\n\n`, { headers: { "content-type": "text/event-stream" } });
}

test("native project resolution exposes only assigned filesystem capabilities in an arbitrary workspace", async () => {
  const directory = await mkdtemp(join(tmpdir(), "subpolar-native-filesystem-"));
  const workspaceRoot = join(directory, "workspaces");
  const workspace = join(workspaceRoot, "arbitrary-project");
  await mkdir(join(workspace, "notes"), { recursive: true });
  await writeFile(join(workspace, "notes", "readme.txt"), "hello\n", "utf8");
  const originalFetch = globalThis.fetch;
  const server = startApiGatewayServer({ port: 0, dataDir: join(directory, "data"), workspaceRoot });
  try {
    const origin = new URL(server.url).origin;
    const bootstrap = await originalFetch(`${server.url}v1/auth/bootstrap`, { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify({ username: "filesystem-owner", password: "correct horse" }) });
    const cookie = cookies(bootstrap);
    const headers = { "content-type": "application/json", cookie, "x-csrf-token": csrf(cookie), origin };
    const project = await originalFetch(`${server.url}v1/projects`, { method: "POST", headers, body: JSON.stringify({ name: "Arbitrary workspace", workspaceMode: "existing", workspacePath: workspace }) });
    const projectId = (await project.json() as { readonly project: { readonly id: string } }).project.id;
    const agent = await originalFetch(`${server.url}v1/agents`, { method: "POST", headers, body: JSON.stringify({ projectId, name: "filesystem-agent", instructions: "Read the assigned file.", icon: "bot" }) });
    const agentId = (await agent.json() as { readonly agent: { readonly id: string } }).agent.id;
    const updated = await originalFetch(`${server.url}v1/agents/${agentId}`, { method: "PATCH", headers, body: JSON.stringify({ capabilities: [{ capabilityId: "filesystem.read", enabled: true }], permissions: [{ capabilityId: "filesystem.read", policy: "allow" }] }) });
    assert.equal(updated.status, 200);
    await originalFetch(`${server.url}v1/setup/provider`, { method: "POST", headers, body: JSON.stringify({ providerId: "openai-api", baseUrl: "https://native-filesystem.invalid/v1", apiKey: "filesystem-key", model: "filesystem-model" }) });
    let seenTools: readonly string[] = [];
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url === "https://native-filesystem.invalid/v1/chat/completions") {
        const body = JSON.parse(String(init?.body ?? "{}")) as { readonly tools?: readonly { readonly function?: { readonly name?: string } }[] };
        seenTools = (body.tools ?? []).map(tool => tool.function?.name ?? "");
        return textSse("read complete");
      }
      return originalFetch(input, init);
    };
    const completion = await fetch(`${server.url}v1/chat/completions`, { method: "POST", headers, body: JSON.stringify({ model: "filesystem-model", projectId, agentId, messages: [{ role: "user", content: "Read notes/readme.txt" }] }) });
    assert.equal(completion.status, 200);
    assert.ok(seenTools.includes("filesystem.read"));
    assert.equal(seenTools.includes("filesystem.write"), false);
    assert.equal(seenTools.includes("filesystem.edit"), false);
  } finally {
    globalThis.fetch = originalFetch;
    await server.shutdown();
    await rm(directory, { recursive: true, force: true });
  }
});

test("native filesystem write and edit tools remain project-confined and return diffs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "subpolar-native-filesystem-"));
  const workspaceRoot = join(directory, "workspaces");
  const workspace = join(workspaceRoot, "arbitrary-project");
  await mkdir(join(workspace, "notes"), { recursive: true });
  const originalFetch = globalThis.fetch;
  const server = startApiGatewayServer({ port: 0, dataDir: join(directory, "data"), workspaceRoot });
  try {
    const origin = new URL(server.url).origin;
    const bootstrap = await originalFetch(`${server.url}v1/auth/bootstrap`, { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify({ username: "filesystem-owner", password: "correct horse" }) });
    const cookie = cookies(bootstrap);
    const headers = { "content-type": "application/json", cookie, "x-csrf-token": csrf(cookie), origin };
    const projectResponse = await originalFetch(`${server.url}v1/projects`, { method: "POST", headers, body: JSON.stringify({ name: "Arbitrary workspace", workspaceMode: "existing", workspacePath: workspace }) });
    const projectId = (await projectResponse.json() as { readonly project: { readonly id: string } }).project.id;
    const agentResponse = await originalFetch(`${server.url}v1/agents`, { method: "POST", headers, body: JSON.stringify({ projectId, name: "filesystem-agent", instructions: "Use filesystem tools.", icon: "bot" }) });
    const agentId = (await agentResponse.json() as { readonly agent: { readonly id: string } }).agent.id;
    const assignments = ["filesystem.read", "filesystem.write", "filesystem.edit"].map(capabilityId => ({ capabilityId, enabled: true }));
    const permissions = assignments.map(({ capabilityId }) => ({ capabilityId, policy: "allow" }));
    const updated = await originalFetch(`${server.url}v1/agents/${agentId}`, { method: "PATCH", headers, body: JSON.stringify({ capabilities: assignments, permissions }) });
    assert.equal(updated.status, 200);
    await originalFetch(`${server.url}v1/setup/provider`, { method: "POST", headers, body: JSON.stringify({ providerId: "openai-api", baseUrl: "https://native-filesystem.invalid/v1", apiKey: "filesystem-key", model: "filesystem-model" }) });
    let calls = 0;
    const modelToolResults: string[] = [];
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url === "https://native-filesystem.invalid/v1/chat/completions") {
        calls += 1;
        const body = JSON.parse(String(init?.body ?? "{}")) as { readonly messages?: readonly { readonly role?: string; readonly content?: unknown }[] };
        modelToolResults.push(...(body.messages ?? []).filter(message => message.role === "tool").map(message => JSON.stringify(message.content)));
        return calls === 1
          ? toolSse("write-call", "filesystem.write", { path: "notes/change.txt", content: "before\n" })
          : calls === 2
            ? toolSse("edit-call", "filesystem.edit", { path: "notes/change.txt", oldText: "before", newText: "after" })
            : calls === 3
              ? toolSse("escape-call", "filesystem.write", { path: "../escape.txt", content: "must not write" })
              : textSse("filesystem work complete");
      }
      return originalFetch(input, init);
    };
    const completion = await fetch(`${server.url}v1/chat/completions`, { method: "POST", headers, body: JSON.stringify({ model: "filesystem-model", projectId, agentId, sessionId: "filesystem-session", messages: [{ role: "user", content: "Create and edit notes/change.txt" }] }) });
    assert.equal(completion.status, 200);
    assert.equal(await readFile(join(workspace, "notes", "change.txt"), "utf8"), "after\n");
    assert.equal(await readFile(join(workspaceRoot, "escape.txt")).catch(() => undefined), undefined);
    assert.match(modelToolResults.join("\n"), /diff --git a\/notes\/change\.txt b\/notes\/change\.txt/);
    assert.match(modelToolResults.join("\n"), /\+after/);
    const transcript = await originalFetch(`${server.url}v1/sessions/filesystem-session`, { headers: { cookie } });
    assert.equal(transcript.status, 200);
    assert.equal(calls, 4);
  } finally {
    globalThis.fetch = originalFetch;
    await server.shutdown();
    await rm(directory, { recursive: true, force: true });
  }
});
