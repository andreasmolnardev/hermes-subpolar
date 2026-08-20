import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "bun:test";

import { OwnershipError, SQLiteIdentityRepository } from "../src/auth.js";

test("identity repository scopes projects, agents, and sessions to their owner", async () => {
  const directory = mkdtempSync(join(tmpdir(), "subpolar-auth-"));
  const repository = new SQLiteIdentityRepository(join(directory, "state.db"));
  try {
    const session = await repository.bootstrap("operator", "correct horse");
    const project = repository.createProject(session.principal.id, "private");
    const agent = repository.createAgent(session.principal.id, project.id, "default", "private instructions");
    repository.claimSession(session.principal.id, "session-1", project.id, agent.id);
    assert.equal(repository.listProjects("other-user").length, 0);
    assert.equal(repository.listAgents("other-user").length, 0);
    assert.equal(repository.listSessions("other-user").length, 0);
    assert.throws(() => repository.assertSessionOwner("other-user", "session-1"), OwnershipError);
    assert.equal(repository.listSessions(session.principal.id)[0]?.sessionId, "session-1");
  } finally {
    repository.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("agent configuration persists normalized capabilities, permissions, skills, and model settings", async () => {
  const directory = mkdtempSync(join(tmpdir(), "subpolar-agent-config-"));
  const path = join(directory, "state.db");
  let repository = new SQLiteIdentityRepository(path);
  try {
    const session = await repository.bootstrap("operator", "correct horse");
    const project = repository.createProject(session.principal.id, "private");
    const agent = repository.createAgent(session.principal.id, project.id, "reviewer", "review carefully");
    const updated = repository.updateAgent(session.principal.id, agent.id, {
      description: "Reviews changes", icon: "shield", model: "test-model", reasoningEffort: "high",
      capabilities: [{ capabilityId: "filesystem.read", enabled: true }, { capabilityId: "shell.execute", enabled: false }],
      permissions: [{ capabilityId: "filesystem.read", policy: "allow" }, { capabilityId: "shell.execute", policy: "ask" }],
      skillIds: ["code-review"]
    });
    assert.equal(updated.model, "test-model");
    assert.deepEqual(updated.permissions, [{ capabilityId: "filesystem.read", policy: "allow" }, { capabilityId: "shell.execute", policy: "ask" }]);
    repository.close();
    repository = new SQLiteIdentityRepository(path);
    assert.deepEqual(repository.getAgent(session.principal.id, agent.id), updated);
  } finally {
    repository.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
