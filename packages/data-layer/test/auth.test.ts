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

test("agent capability assignments and policies persist through updates", async () => {
  const repository = new SQLiteIdentityRepository(":memory:");
  try {
    const session = await repository.bootstrap("operator", "correct horse");
    const project = repository.createProject(session.principal.id, "private");
    const agent = repository.createAgent(session.principal.id, project.id, "default", "instructions", "code");
    const updated = repository.updateAgent(session.principal.id, agent.id, {
      description: "restricted agent",
      capabilities: [{ capabilityId: "shell.execute", enabled: true }],
      permissions: [{ capabilityId: "shell.execute", policy: "ask" }],
      skillIds: ["code-review"],
      model: "model-a",
      reasoningEffort: "medium",
    });
    assert.equal(updated.description, "restricted agent");
    assert.deepEqual(updated.capabilities, [{ capabilityId: "shell.execute", enabled: true }]);
    assert.deepEqual(updated.permissions, [{ capabilityId: "shell.execute", policy: "ask" }]);
    assert.deepEqual(updated.skillIds, ["code-review"]);
    assert.equal(updated.model, "model-a");
    assert.equal(updated.reasoningEffort, "medium");
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
