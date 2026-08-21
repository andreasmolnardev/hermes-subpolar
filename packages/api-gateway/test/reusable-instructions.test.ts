import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "bun:test";
import type { ProviderRequest } from "chat-provider-interface";
import { startApiGatewayServer } from "../src/server.ts";

function cookies(response: Response): string {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  return (headers.getSetCookie?.() ?? [response.headers.get("set-cookie") ?? ""]).flatMap(value => value.split(/,\s*(?=[^;]+=)/)).map(value => value.split(";", 1)[0]).join("; ");
}

function csrf(value: string): string {
  const match = /(?:^|;\s*)subpolar_csrf=([^;]+)/.exec(value);
  if (match === null) throw new Error("CSRF cookie missing");
  return decodeURIComponent(match[1] as string);
}

test("Skills and Prompt Commands work through authenticated CRUD and runtime resolution", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "subpolar-reusable-api-"));
  let seen: ProviderRequest | undefined;
  const server = startApiGatewayServer({
    port: 0,
    dataDir,
    provider: {
      async complete(request) {
        seen = request;
        return { message: { role: "assistant", content: "ok" }, finishReason: "stop", usage: { inputTokens: 1, outputTokens: 1 } };
      },
    },
  });
  try {
    const origin = new URL(server.url).origin;
    const bootstrap = await fetch(`${server.url}v1/auth/bootstrap`, { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify({ username: "operator", password: "correct horse" }) });
    const cookie = cookies(bootstrap);
    const headers = { "content-type": "application/json", cookie, "x-csrf-token": csrf(cookie), origin };
    const project = await (await fetch(`${server.url}v1/projects`, { method: "POST", headers, body: JSON.stringify({ name: "private" }) })).json() as { project: { id: string } };
    const agent = await (await fetch(`${server.url}v1/agents`, { method: "POST", headers, body: JSON.stringify({ projectId: project.project.id, name: "reviewer", instructions: "Be precise.", icon: "code" }) })).json() as { agent: { id: string } };
    const skillResponse = await fetch(`${server.url}v1/skills`, { method: "POST", headers, body: JSON.stringify({ name: "Review", description: "Review guidance", instructions: "Inspect every changed line.", enabled: true }) });
    assert.equal(skillResponse.status, 201);
    const skill = (await skillResponse.json() as { skill: { id: string } }).skill;
    const commandResponse = await fetch(`${server.url}v1/prompt-commands`, { method: "POST", headers, body: JSON.stringify({ name: "review", description: "Review changes", prompt: "Review the current changes.", enabled: true }) });
    assert.equal(commandResponse.status, 201);
    assert.equal((await fetch(`${server.url}v1/prompt-commands`, { headers: { cookie } })).status, 200);
    const assigned = await fetch(`${server.url}v1/agents/${agent.agent.id}`, { method: "PATCH", headers, body: JSON.stringify({ skillIds: [skill.id] }) });
    assert.equal(assigned.status, 200);
    const effective = await (await fetch(`${server.url}v1/agents/${agent.agent.id}/effective`, { headers: { cookie } })).json() as { skills: readonly { id: string; name: string }[] };
    assert.deepEqual(effective.skills.map(item => item.id), [skill.id]);
    const completion = await fetch(`${server.url}v1/chat/completions`, { method: "POST", headers, body: JSON.stringify({ model: "test", agentId: agent.agent.id, messages: [{ role: "system", content: "Request-specific context." }, { role: "user", content: "review" }] }) });
    assert.equal(completion.status, 200);
    const systemPrompt = String(seen?.messages.find(message => message.role === "system")?.content ?? "");
    assert.match(systemPrompt, /harness-section name="instructions"/);
    assert.match(systemPrompt, /Be precise\./);
    assert.match(systemPrompt, /Inspect every changed line/);
    assert.match(systemPrompt, /Request-specific context\./);
    assert.deepEqual(seen?.messages.map(message => message.role), ["system", "user"]);
    const invalid = await fetch(`${server.url}v1/skills`, { method: "POST", headers, body: JSON.stringify({ name: "bad", instructions: "x", unknown: true }) });
    assert.equal(invalid.status, 400);
    const foreign = await fetch(`${server.url}v1/skills/not-owned`, { headers: { cookie } });
    assert.equal(foreign.status, 404);
  } finally {
    await server.shutdown();
    rmSync(dataDir, { recursive: true, force: true });
  }
});
