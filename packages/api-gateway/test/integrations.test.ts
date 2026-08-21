import { strict as assert } from "node:assert";
import { test } from "bun:test";
import { SQLiteIdentityRepository } from "data-layer";
import { resolveAgentToolDescriptors } from "tool-resolver";
import { IntegrationManager } from "../src/integrations.ts";

test("modern MCP integration discovery, stable identity, resolver enforcement, and execution", async () => {
  const originalFetch = globalThis.fetch;
  const methods: string[] = [];
  globalThis.fetch = (async input => {
    const request = input instanceof Request ? input : new Request(input);
    const body = await request.json() as Record<string, unknown>;
    methods.push(String(body.method));
    const result = body.method === "server/discover" ? { supportedVersions: ["2026-07-28"] } : body.method === "tools/list" ? { tools: [{ name: "search", description: "Search", inputSchema: { type: "object" } }, { name: "delete", inputSchema: { type: "object" } }] } : { content: [{ type: "text", text: "executed" }] };
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }), { headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  const identity = new SQLiteIdentityRepository(":memory:");
  try {
    const owner = await identity.bootstrap("integration-test-owner", "password-123");
    const manager = new IntegrationManager(identity);
    const created = identity.createIntegration(owner.principal.id, { name: "Home Assistant", type: "mcp", config: { transport: "http", endpoint: "https://mcp-one.example.test/mcp" } });
    const discovered = await manager.discover(owner.principal.id, created.id);
    const searchId = discovered.capabilities.find(capability => capability.nativeName === "search")?.capabilityId;
    assert.equal(searchId, `integration:${created.id}:mcp:search`);
    assert.equal(methods.includes("initialize"), false);
    const project = identity.createProject(owner.principal.id, "integration-project");
    const agent = identity.createAgent(owner.principal.id, project.id, "Agent", "Use selected tools only.");
    identity.updateAgent(owner.principal.id, agent.id, { capabilities: [{ capabilityId: searchId!, enabled: true }], permissions: [{ capabilityId: searchId!, policy: "allow" }] });
    const definitions = await manager.toolsFor(owner.principal.id);
    const resolved = resolveAgentToolDescriptors(definitions, { userId: owner.principal.id, sessionId: "integration-session", agentId: agent.id, enabledCapabilityIds: [searchId!], agentPolicies: [{ capabilityId: searchId!, policy: "allow" }] });
    assert.deepEqual(resolved.map(tool => tool.capabilityId), [searchId]);
    const executable = resolved[0]?.executable;
    assert.ok(executable && "handle" in executable);
    if (!(executable && "handle" in executable)) throw new Error("resolved integration tool is not executable");
    await executable.handle.execute({ query: "hello" });
    const renamed = identity.updateIntegration(owner.principal.id, created.id, { name: "Home Assistant Local" });
    const rediscovered = await manager.discover(owner.principal.id, renamed.id);
    assert.equal(rediscovered.capabilities.find(capability => capability.nativeName === "search")?.capabilityId, searchId);
    assert.equal((await manager.toolsFor(owner.principal.id)).some(tool => tool.capabilityId === searchId), true);
    identity.updateIntegration(owner.principal.id, created.id, { enabled: false });
    assert.deepEqual(await manager.toolsFor(owner.principal.id), []);
  } finally { globalThis.fetch = originalFetch; identity.close(); }
});

test("MCP integrations with the same native tool remain independently addressable", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async input => {
    const request = input instanceof Request ? input : new Request(input);
    const body = await request.json() as Record<string, unknown>;
    const result = body.method === "server/discover" ? { supportedVersions: ["2026-07-28"] } : { tools: [{ name: "search", inputSchema: { type: "object" } }] };
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }), { headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  const identity = new SQLiteIdentityRepository(":memory:");
  try {
    const owner = await identity.bootstrap("collision-owner", "password-123");
    const manager = new IntegrationManager(identity);
    const first = identity.createIntegration(owner.principal.id, { name: "First", type: "mcp", config: { transport: "http", endpoint: "https://first.example.test/mcp" } });
    const second = identity.createIntegration(owner.principal.id, { name: "Second", type: "mcp", config: { transport: "http", endpoint: "https://second.example.test/mcp" } });
    const firstDiscovery = await manager.discover(owner.principal.id, first.id);
    const secondDiscovery = await manager.discover(owner.principal.id, second.id);
    const firstId = firstDiscovery.capabilities[0]?.capabilityId;
    const secondId = secondDiscovery.capabilities[0]?.capabilityId;
    assert.notEqual(firstId, secondId);
    assert.deepEqual((await manager.toolsFor(owner.principal.id)).map(tool => tool.capabilityId).sort(), [firstId, secondId].sort());
  } finally { globalThis.fetch = originalFetch; identity.close(); }
});

test("OAuth credentials refresh server-side, rotate refresh tokens, and revoke locally", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async input => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push(url);
    if (url.includes("/token")) return new Response(JSON.stringify({ access_token: "fresh-access", refresh_token: "rotated-refresh", token_type: "Bearer", expires_in: 3600 }), { headers: { "content-type": "application/json" } });
    if (url.includes("/revoke")) return new Response(null, { status: 200 });
    const request = input instanceof Request ? input : new Request(input);
    const body = await request.json() as Record<string, unknown>;
    const result = body.method === "server/discover" ? { supportedVersions: ["2026-07-28"] } : { tools: [{ name: "profile", inputSchema: { type: "object" } }] };
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }), { headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  const identity = new SQLiteIdentityRepository(":memory:");
  try {
    const owner = await identity.bootstrap("oauth-refresh-owner", "password-123");
    const integration = identity.createIntegration(owner.principal.id, { name: "OAuth MCP", type: "mcp", config: { transport: "http", endpoint: "https://oauth.example.test/mcp", auth: { type: "oauth", tokenUrl: "https://oauth.example.test/token", clientId: "client", revocationUrl: "https://oauth.example.test/revoke" } }, secrets: { accessToken: "expired-access", refreshToken: "initial-refresh", tokenType: "Bearer", expiresAt: Date.now() - 1 } });
    const manager = new IntegrationManager(identity);
    await manager.discover(owner.principal.id, integration.id);
    const runtime = identity.getIntegrationRuntimeConfig(owner.principal.id, integration.id);
    assert.equal(runtime?.secrets.accessToken, "fresh-access");
    assert.equal(runtime?.secrets.refreshToken, "rotated-refresh");
    assert.equal(JSON.stringify(identity.getIntegration(owner.principal.id, integration.id)).includes("fresh-access"), false);
    await manager.revokeOAuth(owner.principal.id, integration.id);
    const revoked = identity.getIntegrationRuntimeConfig(owner.principal.id, integration.id);
    assert.equal(revoked?.secrets.accessToken, undefined);
    assert.equal(revoked?.secrets.refreshToken, undefined);
    assert.equal(calls.some(url => url.includes("/token")), true);
    assert.equal(calls.some(url => url.includes("/revoke")), true);
  } finally { globalThis.fetch = originalFetch; identity.close(); }
});

test("legacy MCP HTTP fallback keeps the negotiated session lifecycle", async () => {
  const originalFetch = globalThis.fetch;
  const methods: string[] = [];
  globalThis.fetch = (async input => {
    const request = input instanceof Request ? input : new Request(input);
    const body = request.method === "POST" ? await request.clone().json() as Record<string, unknown> : {};
    methods.push(String(body.method));
    if (body.method === "server/discover") return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, error: { code: -32601, message: "unsupported" } }), { status: 200, headers: { "content-type": "application/json" } });
    const result = body.method === "initialize" ? { protocolVersion: "2025-11-25" } : body.method === "tools/list" ? { tools: [{ name: "legacy_search", inputSchema: { type: "object" } }] } : { content: [] };
    return body.method === "notifications/initialized" ? new Response(null, { status: 204, headers: { "mcp-session-id": "legacy-session" } }) : new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }), { headers: { "content-type": "application/json", "mcp-session-id": "legacy-session" } });
  }) as typeof fetch;
  const identity = new SQLiteIdentityRepository(":memory:");
  try {
    const owner = await identity.bootstrap("legacy-mcp-owner", "password-123");
    const integration = identity.createIntegration(owner.principal.id, { name: "Legacy MCP", type: "mcp", config: { transport: "http", endpoint: "https://legacy.example.test/mcp" } });
    const manager = new IntegrationManager(identity);
    const discovered = await manager.discover(owner.principal.id, integration.id);
    assert.equal(discovered.protocol, "legacy");
    assert.deepEqual(methods.slice(0, 4), ["server/discover", "initialize", "notifications/initialized", "tools/list"]);
  } finally { globalThis.fetch = originalFetch; identity.close(); }
});
