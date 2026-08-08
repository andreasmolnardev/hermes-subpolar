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
    const agent = repository.createAgent(session.principal.id, project.id, "default", "private instructions", "code");
    assert.equal(agent.icon, "code");
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
