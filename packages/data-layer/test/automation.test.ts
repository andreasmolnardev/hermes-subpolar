import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "bun:test";
import { SQLiteIdentityRepository, type AutomationInput } from "../src/index.ts";

test("automation occurrences are claimed atomically and survive repository reopen", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "subpolar-automation-data-"));
  const database = join(dataDir, "state.db");
  const scheduledFor = new Date(Date.now() + 60_000).toISOString();
  const input: AutomationInput = {
    name: "Daily report",
    schedule: { kind: "once", at: scheduledFor, timezone: "UTC" },
    prompt: "Prepare the report",
    agentId: "agent-placeholder",
    permissionMode: "fail",
    nextRunAt: scheduledFor,
  };
  let userId = "";
  let automationId = "";
  const identity = new SQLiteIdentityRepository(database);
  try {
    const session = await identity.bootstrap("operator", "correct horse");
    userId = session.principal.id;
    const project = identity.createProject(session.principal.id, { name: "Workspace" });
    const agent = identity.createAgent(session.principal.id, project.id, "runner", "Run scheduled work.");
    const automation = identity.createAutomation(session.principal.id, { ...input, agentId: agent.id });
    automationId = automation.id;
    const first = identity.claimDueAutomationRun(automation.id, scheduledFor, null, { source: "test" });
    const duplicate = identity.claimDueAutomationRun(automation.id, scheduledFor, null, { source: "test" });
    assert.ok(first);
    assert.equal(duplicate, null);
    assert.equal(identity.listAutomationRuns(session.principal.id, automation.id).length, 1);
    identity.updateAutomationRun(first!.id, "running");
    identity.recoverAutomationRuns();
    const recovered = identity.getAutomationRun(session.principal.id, automation.id, first!.id);
    assert.equal(recovered?.status, "failed");
    assert.match(recovered?.error ?? "", /Server restarted/);
  } finally {
    identity.close();
  }
  const reopened = new SQLiteIdentityRepository(database);
  try {
    assert.equal(reopened.getUser(userId)?.username, "operator");
    assert.equal(reopened.getAutomation(userId, automationId)?.name, "Daily report");
    assert.equal(reopened.listAutomationRuns(userId, automationId).length, 1);
  } finally {
    reopened.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
});
