import { strict as assert } from "node:assert";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "bun:test";
import { Database } from "bun:sqlite";

import { OwnershipError, SQLiteIdentityRepository } from "../src/auth.js";

test("identity repository scopes projects, agents, and sessions to their owner", async () => {
  const directory = mkdtempSync(join(tmpdir(), "subpolar-auth-"));
  const repository = new SQLiteIdentityRepository(join(directory, "state.db"));
  try {
    const session = await repository.bootstrap("operator", "correct horse");
    const project = repository.createProject(session.principal.id, "private");
    const agent = repository.createAgent(session.principal.id, project.id, "default", "private instructions", "code");
    assert.equal(agent.icon, "code");
    assert.equal(agent.capabilityMode, "explicit");
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

test("projects persist workspace metadata and Git credential secrets stay out of public records", async () => {
  const repository = new SQLiteIdentityRepository(":memory:");
  try {
    const session = await repository.bootstrap("operator", "correct horse");
    const credential = repository.createGitCredential(session.principal.id, { name: "GitHub", provider: "github", username: "operator", token: "server-only-token" });
    const project = repository.createProject(session.principal.id, {
      name: "repo",
      description: "A repository",
      workspace: "/data/workspaces/project-1",
      instructions: "Use the project conventions.",
      repository: { url: "https://github.com/org/repo.git", credentialId: credential.id, remoteName: "origin", defaultBranch: "main" },
      settings: { autoRefresh: true },
    });
    assert.equal(project.workspace, "/data/workspaces/project-1");
    assert.equal(project.instructions, "Use the project conventions.");
    assert.equal(project.repository?.credentialId, credential.id);
    assert.equal(JSON.stringify(project).includes("server-only-token"), false);
    assert.deepEqual(repository.getGitCredentialRuntime(session.principal.id, credential.id), { name: "GitHub", provider: "github", username: "operator", token: "server-only-token" });
    assert.deepEqual(repository.listGitCredentials(session.principal.id), [credential]);
  } finally {
    repository.close();
  }
});

test("agent capability assignments and policies persist through updates", async () => {
  const repository = new SQLiteIdentityRepository(":memory:");
  try {
    const session = await repository.bootstrap("operator", "correct horse");
    const project = repository.createProject(session.principal.id, "private");
    const agent = repository.createAgent(session.principal.id, project.id, "default", "instructions", "code");
    const skill = repository.createSkill(session.principal.id, { name: "Code review", instructions: "Review code carefully." });
    const updated = repository.updateAgent(session.principal.id, agent.id, {
      description: "restricted agent",
      capabilities: [{ capabilityId: "shell.execute", enabled: true }],
      permissions: [{ capabilityId: "shell.execute", policy: "ask" }],
      skillIds: [skill.id],
      model: "model-a",
      reasoningEffort: "medium",
    });
    assert.equal(updated.description, "restricted agent");
    assert.deepEqual(updated.capabilities, [{ capabilityId: "shell.execute", enabled: true }]);
    assert.deepEqual(updated.permissions, [{ capabilityId: "shell.execute", policy: "ask" }]);
    assert.deepEqual(updated.skillIds, [skill.id]);
    assert.equal(updated.model, "model-a");
    assert.equal(updated.reasoningEffort, "medium");
    assert.equal(updated.capabilityMode, "explicit");
    const cleared = repository.updateAgent(session.principal.id, agent.id, { model: null, reasoningEffort: null });
    assert.equal(cleared.model, undefined);
    assert.equal(cleared.reasoningEffort, undefined);
  } finally {
    repository.close();
  }
});

test("Skills and Prompt Commands persist, isolate owners, and clean Agent assignments", async () => {
  const directory = mkdtempSync(join(tmpdir(), "subpolar-reusable-instructions-"));
  const databasePath = join(directory, "state.db");
  const first = new SQLiteIdentityRepository(databasePath);
  const session = await first.bootstrap("operator", "correct horse");
  const project = first.createProject(session.principal.id, "private");
  const agent = first.createAgent(session.principal.id, project.id, "default", "instructions");
  const skill = first.createSkill(session.principal.id, { name: "React", description: "UI guidance", instructions: "Use components.", enabled: false });
  const secondSkill = first.createSkill(session.principal.id, { name: "TypeScript", instructions: "Keep types precise." });
  const command = first.createPromptCommand(session.principal.id, { name: "review", description: "Review changes", prompt: "Review this.", enabled: true });
  assert.equal(first.getSkill("other-user", skill.id), null);
  assert.equal(first.getPromptCommand("other-user", command.id), null);
  assert.throws(() => first.updateAgent(session.principal.id, agent.id, { skillIds: ["not-owned"] }), OwnershipError);
  first.updateAgent(session.principal.id, agent.id, { skillIds: [skill.id, secondSkill.id] });
  assert.deepEqual(first.getAgent(session.principal.id, agent.id)?.skillIds, [skill.id, secondSkill.id]);
  first.close();

  const second = new SQLiteIdentityRepository(databasePath);
  try {
    assert.equal(second.listSkills(session.principal.id)[0]?.name, "React");
    assert.equal(second.listPromptCommands(session.principal.id)[0]?.name, "review");
    assert.deepEqual(second.getAgent(session.principal.id, agent.id)?.skillIds, [skill.id, secondSkill.id]);
    assert.deepEqual(second.effectiveAgentSkills(session.principal.id, agent.id), [secondSkill]);
    const enabled = second.updateSkill(session.principal.id, skill.id, { enabled: true });
    assert.equal(enabled.enabled, true);
    assert.deepEqual(second.effectiveAgentSkills(session.principal.id, agent.id).map(item => item.id), [skill.id, secondSkill.id]);
    second.updateSkill(session.principal.id, secondSkill.id, { enabled: false });
    assert.deepEqual(second.effectiveAgentSkills(session.principal.id, agent.id).map(item => item.id), [skill.id]);
    second.deleteSkill(session.principal.id, skill.id);
    assert.deepEqual(second.getAgent(session.principal.id, agent.id)?.skillIds, [secondSkill.id]);
    second.deletePromptCommand(session.principal.id, command.id);
    assert.equal(second.listPromptCommands(session.principal.id).length, 0);
  } finally {
    second.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("legacy opaque Agent Skill IDs are migrated to disabled owned records safely", () => {
  const directory = mkdtempSync(join(tmpdir(), "subpolar-legacy-skills-"));
  const databasePath = join(directory, "state.db");
  const database = new Database(databasePath);
  database.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE projects (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, name TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE agents (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, project_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', icon TEXT NOT NULL DEFAULT 'bot', instructions TEXT NOT NULL, capability_mode TEXT NOT NULL DEFAULT 'legacy', created_at TEXT NOT NULL);
    CREATE TABLE agent_skills (agent_id TEXT NOT NULL, skill_id TEXT NOT NULL, PRIMARY KEY (agent_id, skill_id));
  `);
  database.run("INSERT INTO users VALUES ('user-1', 'operator', 'hash', '2026-01-01T00:00:00.000Z')");
  database.run("INSERT INTO projects VALUES ('project-1', 'user-1', 'private', '2026-01-01T00:00:00.000Z')");
  database.run("INSERT INTO agents VALUES ('agent-1', 'user-1', 'project-1', 'reviewer', '', 'bot', 'instructions', 'legacy', '2026-01-01T00:00:00.000Z')");
  database.run("INSERT INTO agent_skills VALUES ('agent-1', 'legacy-skill')");
  database.close();
  const repository = new SQLiteIdentityRepository(databasePath);
  try {
    assert.deepEqual(repository.getAgent("user-1", "agent-1")?.skillIds, ["legacy-skill"]);
    assert.deepEqual(repository.listSkills("user-1").map(skill => ({ id: skill.id, enabled: skill.enabled })), [{ id: "legacy-skill", enabled: false }]);
    const migrated = new Database(databasePath, { readonly: true });
    try { assert.equal(migrated.query<{ table: string }, []>("PRAGMA foreign_key_list(agent_skills)").all().some(row => row.table === "skills"), true); }
    finally { migrated.close(); }
  } finally {
    repository.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("project agent overrides remain owner-scoped and normalized by reference", async () => {
  const repository = new SQLiteIdentityRepository(":memory:");
  try {
    const session = await repository.bootstrap("operator", "correct horse");
    const project = repository.createProject(session.principal.id, "private");
    const agent = repository.createAgent(session.principal.id, project.id, "default", "instructions", "code");
    repository.setAgentProjectOverride(session.principal.id, { projectId: project.id, agentId: agent.id, capabilities: [{ capabilityId: "shell.execute", enabled: true }], permissions: [{ capabilityId: "shell.execute", policy: "ask" }] });
    assert.deepEqual(repository.getAgentProjectOverride(session.principal.id, project.id, agent.id)?.permissions, [{ capabilityId: "shell.execute", policy: "ask" }]);
    assert.equal(repository.getAgentProjectOverride("other-user", project.id, agent.id), null);
  } finally {
    repository.close();
  }
});

test("provider credentials are ciphertext behind an opaque handle", () => {
  const directory = mkdtempSync(join(tmpdir(), "subpolar-provider-"));
  const databasePath = join(directory, "state.db");
  const repository = new SQLiteIdentityRepository(databasePath);
  try {
    repository.configureProvider("openai-api", "https://api.example.test/v1", "secret-api-key", "model");
    assert.deepEqual(repository.providerConnection(), {
      providerId: "openai-api",
      baseUrl: "https://api.example.test/v1",
      credentialHandle: "openai-api:default",
      model: "model",
    });
    const database = new Database(databasePath, { readonly: true });
    try {
      const columns = database.query<{ name: string }, []>("PRAGMA table_info(provider_connections)").all().map(row => row.name);
      assert.equal(columns.includes("api_key"), false);
      assert.equal(columns.includes("credential_ciphertext"), true);
      const row = database.query<{ credential_ciphertext: string }, []>("SELECT credential_ciphertext FROM provider_connections WHERE id = 1").get();
      assert.ok(row !== null);
      assert.notEqual(row.credential_ciphertext, "secret-api-key");
      assert.equal(readFileSync(join(directory, "provider-credentials.key")).length, 32);
      assert.equal(statSync(join(directory, "provider-credentials.key")).mode & 0o777, 0o600);
    } finally {
      database.close();
    }
  } finally {
    repository.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("provider credentials decrypt after repository restart", () => {
  const directory = mkdtempSync(join(tmpdir(), "subpolar-provider-"));
  const databasePath = join(directory, "state.db");
  const first = new SQLiteIdentityRepository(databasePath);
  first.configureProvider("openai-api", "https://api.example.test/v1", "secret-api-key", "model");
  first.close();
  const second = new SQLiteIdentityRepository(databasePath);
  try {
    assert.deepEqual(second.resolveCredentialHandle("openai-api:default"), { apiKey: "secret-api-key" });
  } finally {
    second.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("missing or tampered provider key fails closed", () => {
  const directory = mkdtempSync(join(tmpdir(), "subpolar-provider-"));
  const databasePath = join(directory, "state.db");
  const keyPath = join(directory, "provider-credentials.key");
  const first = new SQLiteIdentityRepository(databasePath);
  first.configureProvider("openai-api", "https://api.example.test/v1", "secret-api-key", "model");
  first.close();

  unlinkSync(keyPath);
  const missingKey = new SQLiteIdentityRepository(databasePath);
  try {
    assert.throws(() => missingKey.providerConnection(), /provider credential key is unavailable/);
  } finally {
    missingKey.close();
  }

  writeFileSync(keyPath, Buffer.alloc(32, 7), { mode: 0o600 });
  const tamperedKey = new SQLiteIdentityRepository(databasePath);
  try {
    assert.throws(() => tamperedKey.resolveCredentialHandle("openai-api:default"), /provider credential is unavailable/);
  } finally {
    tamperedKey.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("invalid provider inputs reject before persistence", () => {
  const directory = mkdtempSync(join(tmpdir(), "subpolar-provider-"));
  const databasePath = join(directory, "state.db");
  const keyPath = join(directory, "provider-credentials.key");
  const repository = new SQLiteIdentityRepository(databasePath);
  try {
    for (const [provider, baseUrl, apiKey, model] of [
      ["unsupported", "https://api.example.test/v1", "key", "model"],
      ["openai-api", "https://user:pass@api.example.test/v1", "key", "model"],
      ["openai-api", "https://api.example.test/v1?token=secret", "key", "model"],
      ["openai-api", "https://api.example.test/v1#fragment", "key", "model"],
      ["openai-api", "https://api.example.test/v1", "   ", "model"],
      ["openai-api", "https://api.example.test/v1", "key", "   "],
    ] as const) {
      assert.throws(() => repository.configureProvider(provider, baseUrl, apiKey, model));
    }
    assert.equal(repository.providerConnection(), null);
    assert.equal(existsSync(keyPath), false);
    const database = new Database(databasePath, { readonly: true });
    try {
      assert.equal(database.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM provider_connections").get()?.count, 0);
    } finally {
      database.close();
    }
  } finally {
    repository.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("model defaults persist per user and use provider model on first load", async () => {
  const repository = new SQLiteIdentityRepository(":memory:");
  try {
    const session = await repository.bootstrap("operator", "correct horse");
    repository.configureProvider("openai-api", "https://api.example.test/v1", "key", "conversation-model");
    assert.deepEqual(repository.modelDefaults(session.principal.id), {
      conversation: "conversation-model",
      internal: "conversation-model",
      voice: "conversation-model",
      image: "conversation-model",
    });
    assert.deepEqual(repository.setModelDefaults(session.principal.id, {
      conversation: "chat-model",
      internal: "task-model",
      voice: "voice-model",
      image: "image-model",
    }), {
      conversation: "chat-model",
      internal: "task-model",
      voice: "voice-model",
      image: "image-model",
    });
    assert.equal(repository.modelDefaults(session.principal.id).image, "image-model");
    assert.throws(() => repository.setModelDefaults(session.principal.id, {
      conversation: "",
      internal: "task-model",
      voice: "voice-model",
      image: "image-model",
    }));
  } finally {
    repository.close();
  }
});
