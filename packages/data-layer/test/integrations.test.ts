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
  const discovered = identity.setIntegrationDiscovery(session.principal.id, created.id, "connected", [{ capabilityId: "mcp:Docs MCP:search", name: "mcp__Docs_MCP__search", description: "Search", source: "tool-runtime:mcp:Docs MCP", capabilities: { mcp: true } }]);
  assert.equal(discovered.status, "connected");
  assert.equal(discovered.capabilities[0]?.capabilityId, "mcp:Docs MCP:search");
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
