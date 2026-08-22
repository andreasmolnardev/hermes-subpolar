import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "bun:test";
import { startApiGatewayServer } from "../src/server.ts";
import { AutomationRunError, AutomationScheduler, nextAutomationRun, normalizeAutomationSchedule } from "../src/automation.ts";
import { SQLiteIdentityRepository } from "data-layer";
import { createToolHandle } from "tool-resolver";

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

test("scheduler catches up recurring work and isolates needs-attention and failed runs", async () => {
  const identity = new SQLiteIdentityRepository(":memory:");
  try {
    const owner = await identity.bootstrap("scheduler-owner", "correct horse");
    const project = identity.createProject(owner.principal.id, { name: "Scheduler project" });
    const agent = identity.createAgent(owner.principal.id, project.id, "runner", "Run scheduled work.");
    const overdue = new Date(Date.now() - 120_000).toISOString();
    const recurring = identity.createAutomation(owner.principal.id, { name: "Recurring", schedule: { kind: "cron", expression: "* * * * *", timezone: "UTC" }, prompt: "catch up", agentId: agent.id, projectId: project.id, permissionMode: "pre-approved", nextRunAt: overdue });
    const attention = identity.createAutomation(owner.principal.id, { name: "Needs approval", schedule: { kind: "once", at: overdue, timezone: "UTC" }, prompt: "ask", agentId: agent.id, projectId: project.id, permissionMode: "fail", nextRunAt: overdue });
    const failed = identity.createAutomation(owner.principal.id, { name: "Provider failure", schedule: { kind: "once", at: overdue, timezone: "UTC" }, prompt: "fail", agentId: agent.id, projectId: project.id, permissionMode: "pre-approved", nextRunAt: overdue });
    const scheduler = new AutomationScheduler(identity, async automation => {
      if (automation.id === attention.id) throw new AutomationRunError("needs_attention", "Permission required");
      if (automation.id === failed.id) throw new Error("Provider unavailable");
    }, 100);
    scheduler.start();
    try {
      await eventually(async () => {
        const runs = [
          ...identity.listAutomationRuns(owner.principal.id, attention.id),
          ...identity.listAutomationRuns(owner.principal.id, failed.id),
          ...identity.listAutomationRuns(owner.principal.id, recurring.id)
        ];
        return runs.length === 3 && runs.every(run => run.status !== "queued" && run.status !== "running") ? runs : undefined;
      });
      assert.equal(identity.listAutomationRuns(owner.principal.id, attention.id)[0]?.status, "needs_attention");
      assert.equal(identity.listAutomationRuns(owner.principal.id, failed.id)[0]?.status, "failed");
      const updatedRecurring = identity.getAutomation(owner.principal.id, recurring.id);
      assert.equal(updatedRecurring?.enabled, true);
      assert.notEqual(updatedRecurring?.nextRunAt, overdue);
    } finally {
      await scheduler.stop();
    }
  } finally {
    identity.close();
  }
});

test("cron schedules normalize explicit timezones and find the next occurrence", () => {
  const schedule = normalizeAutomationSchedule({ kind: "cron", expression: "0 8 * * 1", timezone: "UTC" });
  assert.deepEqual(schedule, { kind: "cron", expression: "0 8 * * 1", timezone: "UTC" });
  assert.equal(nextAutomationRun(schedule, new Date("2026-08-21T08:01:00.000Z")), "2026-08-24T08:00:00.000Z");
});

test("fail-mode automation marks interactive approval as needs_attention", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "subpolar-automation-permission-"));
  let executed = false;
  const server = startApiGatewayServer({
    port: 0,
    dataDir,
    automationPollMs: 100,
    toolDefinitions: [{ name: "write", capabilityId: "test.write", description: "Write data", inputSchema: { type: "object" }, source: "test", capabilities: { mutating: true }, executable: { handle: createToolHandle(async () => { executed = true; return "written"; }) } }],
    provider: {
      async complete(request) {
        if (request.messages.some(message => message.role === "tool")) return { message: { role: "assistant", content: "tool finished" }, finishReason: "stop" };
        const prompt = request.messages.find(message => message.role === "user")?.content;
        return prompt === "Write now" || prompt === "Write pre-approved"
          ? { message: { role: "assistant", content: "", toolCalls: [{ id: "write-call", name: "write", arguments: "{}" }] }, finishReason: "tool_calls" }
          : { message: { role: "assistant", content: "read-only finished" }, finishReason: "stop" };
      }
    }
  });
  try {
    const origin = new URL(server.url).origin;
    const bootstrap = await fetch(`${server.url}v1/auth/bootstrap`, { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify({ username: "permission-owner", password: "correct horse" }) });
    const cookie = cookies(bootstrap);
    const headers = { "content-type": "application/json", cookie, "x-csrf-token": csrf(cookie), origin };
    const project = await fetch(`${server.url}v1/projects`, { method: "POST", headers, body: JSON.stringify({ name: "Permission project" }) });
    const projectId = (await project.json() as { project: { id: string } }).project.id;
    const agent = await fetch(`${server.url}v1/agents`, { method: "POST", headers, body: JSON.stringify({ projectId, name: "writer", instructions: "Write data.", icon: "bot" }) });
    const agentId = (await agent.json() as { agent: { id: string } }).agent.id;
    await fetch(`${server.url}v1/agents/${agentId}`, { method: "PATCH", headers, body: JSON.stringify({ capabilities: [{ capabilityId: "test.write", enabled: true }], permissions: [{ capabilityId: "test.write", policy: "allow" }] }) });
    const create = await fetch(`${server.url}v1/automations`, { method: "POST", headers, body: JSON.stringify({ name: "Safe writer", schedule: { kind: "once", at: new Date(Date.now() + 60_000).toISOString(), timezone: "UTC" }, prompt: "Write now", agentId, projectId, permissionMode: "fail" }) });
    const automation = (await create.json() as { automation: { id: string } }).automation;
    await fetch(`${server.url}v1/automations/${automation.id}/run`, { method: "POST", headers });
    const run = await eventually(async () => {
      const response = await fetch(`${server.url}v1/automations/${automation.id}/runs`, { headers: { cookie } });
      const runs = (await response.json() as { runs: readonly { status: string; error?: string }[] }).runs;
      return runs[0]?.status === "needs_attention" ? runs[0] : undefined;
    });
    assert.match(run.error ?? "", /Permission required/);
    assert.equal(executed, false);
    const approved = await fetch(`${server.url}v1/automations`, { method: "POST", headers, body: JSON.stringify({ name: "Configured writer", schedule: { kind: "once", at: new Date(Date.now() + 60_000).toISOString(), timezone: "UTC" }, prompt: "Write pre-approved", agentId, projectId, permissionMode: "pre-approved" }) });
    const approvedAutomation = (await approved.json() as { automation: { id: string } }).automation;
    await fetch(`${server.url}v1/automations/${approvedAutomation.id}/run`, { method: "POST", headers });
    await eventually(async () => {
      const response = await fetch(`${server.url}v1/automations/${approvedAutomation.id}/runs`, { headers: { cookie } });
      const runs = (await response.json() as { runs: readonly { status: string }[] }).runs;
      return runs[0]?.status === "completed" ? runs[0] : undefined;
    });
    assert.equal(executed, true);
    const readOnly = await fetch(`${server.url}v1/automations`, { method: "POST", headers, body: JSON.stringify({ name: "Read-only writer", schedule: { kind: "once", at: new Date(Date.now() + 60_000).toISOString(), timezone: "UTC" }, prompt: "Write read-only", agentId, projectId, permissionMode: "read-only" }) });
    const readOnlyAutomation = (await readOnly.json() as { automation: { id: string } }).automation;
    await fetch(`${server.url}v1/automations/${readOnlyAutomation.id}/run`, { method: "POST", headers });
    await eventually(async () => {
      const response = await fetch(`${server.url}v1/automations/${readOnlyAutomation.id}/runs`, { headers: { cookie } });
      const runs = (await response.json() as { runs: readonly { status: string }[] }).runs;
      return runs[0]?.status === "completed" ? runs[0] : undefined;
    });
    assert.equal(executed, true);
  } finally {
    await server.shutdown();
    rmSync(dataDir, { recursive: true, force: true });
  }
});
