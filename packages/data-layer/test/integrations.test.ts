import { strict as assert } from "node:assert";
import { test } from "bun:test";
import { SQLiteIdentityRepository } from "../src/auth.ts";

test("integrations persist public configuration separately from encrypted secrets", async () => {
  const identity = new SQLiteIdentityRepository(":memory:");
  const session = await identity.bootstrap("integration-owner", "password-123");
  const created = identity.createIntegration(session.principal.id, {
    name: "Docs MCP",
    type: "mcp",
    config: { transport: "http", endpoint: "https://mcp.example.test", auth: { type: "bearer" } },
    secrets: { token: "never-return-this", headers: { "x-client": "secret" } },
  });
  assert.equal(JSON.stringify(created).includes("never-return-this"), false);
  assert.equal(JSON.stringify(created).includes("x-client"), true);
  assert.deepEqual(identity.getIntegrationRuntimeConfig(session.principal.id, created.id)?.secrets, { token: "never-return-this", headers: { "x-client": "secret" } });
  const discovered = identity.setIntegrationDiscovery(session.principal.id, created.id, "connected", [{ capabilityId: `integration:${created.id}:mcp:search`, name: "mcp__Docs_MCP__search", description: "Search", source: "tool-runtime:mcp:Docs MCP", capabilities: { mcp: true }, nativeName: "search", displayName: "Search", inputSchema: { type: "object" } }]);
  assert.equal(discovered.status, "connected");
  assert.equal(discovered.capabilities[0]?.capabilityId, `integration:${created.id}:mcp:search`);
  assert.equal(discovered.capabilities[0]?.nativeName, "search");
  identity.close();
});

test("integration OAuth state is single-use and owner-bound", async () => {
  const identity = new SQLiteIdentityRepository(":memory:");
  const owner = await identity.bootstrap("oauth-owner", "password-123");
  const integration = identity.createIntegration(owner.principal.id, {
    name: "OAuth MCP", type: "mcp", config: { transport: "http", endpoint: "https://mcp.example.test", auth: { type: "oauth", authorizationUrl: "https://auth.example.test/authorize", clientId: "client", tokenUrl: "https://auth.example.test/token" } },
  });
  const started = identity.beginIntegrationOAuth(owner.principal.id, integration.id, "https://app.example.test/callback");
  assert.match(started.authorizationUrl, /state=/);
  assert.throws(() => identity.consumeIntegrationOAuthState("another-owner", started.state), /OAuth state is invalid/);
  const consumed = identity.consumeIntegrationOAuthState(owner.principal.id, started.state);
  assert.equal(consumed.integrationId, integration.id);
  assert.throws(() => identity.consumeIntegrationOAuthState(owner.principal.id, started.state), /OAuth state is invalid/);
  identity.close();
});

test("revoking OAuth replaces stored credentials instead of merging them back", async () => {
  const identity = new SQLiteIdentityRepository(":memory:");
  const owner = await identity.bootstrap("oauth-revoke-owner", "password-123");
  const integration = identity.createIntegration(owner.principal.id, {
    name: "OAuth MCP", type: "mcp", config: { transport: "http", endpoint: "https://mcp.example.test" },
    secrets: { accessToken: "access", refreshToken: "refresh", tokenType: "Bearer", expiresAt: Date.now() + 60_000, headers: { "x-client": "retain" } },
  });

  identity.revokeIntegrationOAuth(owner.principal.id, integration.id);
  const secrets = identity.getIntegrationRuntimeConfig(owner.principal.id, integration.id)?.secrets;
  assert.equal(secrets?.accessToken, undefined);
  assert.equal(secrets?.refreshToken, undefined);
  assert.equal(secrets?.tokenType, undefined);
  assert.equal(secrets?.expiresAt, undefined);
  assert.deepEqual(secrets?.headers, { "x-client": "retain" });
  identity.close();
});

test("renaming migrates legacy name-based capability assignments to persistent IDs", async () => {
  const identity = new SQLiteIdentityRepository(":memory:");
  const owner = await identity.bootstrap("legacy-id-owner", "password-123");
  const integration = identity.createIntegration(owner.principal.id, { name: "Home Assistant", type: "mcp", config: { transport: "http", endpoint: "https://mcp.example.test" } });
  identity.setIntegrationDiscovery(owner.principal.id, integration.id, "connected", [{ capabilityId: "mcp:Home Assistant:get_state", name: "get_state", description: "State", source: "mcp", capabilities: { mcp: true } }]);
  const project = identity.createProject(owner.principal.id, "legacy-project");
  const agent = identity.createAgent(owner.principal.id, project.id, "Legacy agent", "instructions");
  identity.updateAgent(owner.principal.id, agent.id, { capabilities: [{ capabilityId: "mcp:Home Assistant:get_state", enabled: true }], permissions: [{ capabilityId: "mcp:Home Assistant:get_state", policy: "allow" }] });
  identity.updateIntegration(owner.principal.id, integration.id, { name: "Home Assistant Local" });
  const migrated = identity.getAgent(owner.principal.id, agent.id);
  assert.equal(migrated?.capabilities[0]?.capabilityId, `integration:${integration.id}:mcp:get_state`);
  assert.equal(migrated?.permissions[0]?.capabilityId, `integration:${integration.id}:mcp:get_state`);
  identity.close();
});
