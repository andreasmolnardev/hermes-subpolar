import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "bun:test";
import { startApiGatewayServer } from "../src/server.ts";

function cookies(response: Response): string {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  return (headers.getSetCookie?.() ?? [response.headers.get("set-cookie") ?? ""]).flatMap(value => value.split(/,\s*(?=[^;]+=)/)).map(value => value.split(";", 1)[0]).join("; ");
}

function csrf(value: string): string {
  const match = /(?:^|;\s*)subpolar_csrf=([^;]+)/.exec(value);
  if (match === null) throw new Error("CSRF cookie missing");
  return decodeURIComponent(match[1]!);
}

async function eventually<T>(read: () => Promise<T | undefined>, timeoutMs = 6_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await read();
    if (value !== undefined) return value;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for automation run");
}

test("automations are CRUD-managed, run through the normal gateway, and persist history", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "subpolar-automation-server-"));
  let providerCalls = 0;
  const server = startApiGatewayServer({
    port: 0,
    dataDir,
    automationPollMs: 100,
    provider: {
      async complete(request) {
        providerCalls += 1;
        assert.equal(request.messages.at(-1)?.content, "Run this automation");
        return { message: { role: "assistant", content: "automation complete" }, finishReason: "stop", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } };
      },
    },
  });
  try {
    const origin = new URL(server.url).origin;
    const bootstrap = await fetch(`${server.url}v1/auth/bootstrap`, { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify({ username: "operator", password: "correct horse" }) });
    const cookie = cookies(bootstrap);
    const headers = { "content-type": "application/json", cookie, "x-csrf-token": csrf(cookie), origin };
    const project = await fetch(`${server.url}v1/projects`, { method: "POST", headers, body: JSON.stringify({ name: "Automation project" }) });
    const projectId = (await project.json() as { project: { id: string } }).project.id;
    const agent = await fetch(`${server.url}v1/agents`, { method: "POST", headers, body: JSON.stringify({ projectId, name: "runner", instructions: "Run scheduled work.", icon: "bot" }) });
    const agentId = (await agent.json() as { agent: { id: string } }).agent.id;
    const create = await fetch(`${server.url}v1/automations`, { method: "POST", headers, body: JSON.stringify({ name: "Global report", schedule: { kind: "once", at: new Date(Date.now() + 60_000).toISOString(), timezone: "UTC" }, prompt: "Run this automation", agentId, projectId: null, permissionMode: "fail" }) });
    assert.equal(create.status, 201);
    const automation = (await create.json() as { automation: { id: string; projectId?: string; schedule: { kind: string }; nextRunAt?: string } }).automation;
    assert.equal(automation.projectId, undefined);
    assert.equal(automation.schedule.kind, "once");
    assert.ok(automation.nextRunAt);
    const update = await fetch(`${server.url}v1/automations/${automation.id}`, { method: "PATCH", headers, body: JSON.stringify({ enabled: false }) });
    assert.equal((await update.json() as { automation: { enabled: boolean; nextRunAt?: string } }).automation.enabled, false);
    const reenable = await fetch(`${server.url}v1/automations/${automation.id}`, { method: "PATCH", headers, body: JSON.stringify({ enabled: true, projectId }) });
    assert.equal((await reenable.json() as { automation: { enabled: boolean; projectId?: string } }).automation.projectId, projectId);
    const queued = await fetch(`${server.url}v1/automations/${automation.id}/run`, { method: "POST", headers });
    assert.equal(queued.status, 202);
    const run = await eventually(async () => {
      const response = await fetch(`${server.url}v1/automations/${automation.id}/runs`, { headers: { cookie } });
      const runs = (await response.json() as { runs: readonly { status: string; sessionId: string; error?: string }[] }).runs;
      const item = runs[0];
      return item?.status === "completed" ? item : undefined;
    });
    assert.equal(run.error, undefined);
    assert.equal(providerCalls, 1);
    const scheduled = await fetch(`${server.url}v1/automations`, { method: "POST", headers, body: JSON.stringify({ name: "Scheduled report", schedule: { kind: "once", at: new Date(Date.now() + 250).toISOString(), timezone: "UTC" }, prompt: "Run this automation", agentId, projectId, permissionMode: "fail" }) });
    const scheduledAutomation = (await scheduled.json() as { automation: { id: string } }).automation;
    const scheduledRun = await eventually(async () => {
      const response = await fetch(`${server.url}v1/automations/${scheduledAutomation.id}/runs`, { headers: { cookie } });
      const runs = (await response.json() as { runs: readonly { status: string; sessionId: string }[] }).runs;
      return runs[0]?.status === "completed" ? runs[0] : undefined;
    });
    assert.ok(scheduledRun.sessionId);
    assert.equal(providerCalls, 2);
    const transcript = await fetch(`${server.url}v1/sessions/${encodeURIComponent(run.sessionId)}`, { headers: { cookie } });
    assert.equal(transcript.status, 200);
    const deleted = await fetch(`${server.url}v1/automations/${automation.id}`, { method: "DELETE", headers });
    assert.deepEqual(await deleted.json(), { deleted: true });
  } finally {
    await server.shutdown();
    rmSync(dataDir, { recursive: true, force: true });
  }
});
