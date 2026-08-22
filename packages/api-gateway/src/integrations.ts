import {
  AuthenticationError,
  type IntegrationCapabilityRecord,
  type IntegrationRecord,
  type IntegrationRuntimeConfig,
  type SQLiteIdentityRepository,
} from "data-layer";
import {
  createMcpHttpTransport,
  createMcpStdioTransport,
  createMcpToolDefinitions,
  createOpenApiToolDefinitions,
  discoverOpenApiOperations,
  modernMeta,
  parseMcpTools,
  requestMcp,
  MCP_MODERN_PROTOCOL_VERSION,
  type McpProtocol,
  type McpTool,
  type McpTransport,
} from "tool-runtime";
import type { ToolDefinition } from "tool-resolver";
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

type IntegrationKey = `${string}:${string}`;
function record(value: unknown): Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function stringValue(value: unknown): string | undefined { return typeof value === "string" && value.length > 0 ? value : undefined; }

function integrationHeaders(runtime: IntegrationRuntimeConfig): Record<string, string> {
  const config = record(runtime.integration.config); const auth = record(config.auth); const secrets = runtime.secrets; const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(record(secrets.headers))) if (typeof value === "string") headers[name] = value;
  const authType = stringValue(auth.type);
  if (authType === "bearer") { const token = stringValue(secrets.token) ?? stringValue(secrets.accessToken); if (token !== undefined) headers.authorization = `Bearer ${token}`; }
  else if (authType === "api_key") { const value = stringValue(secrets.apiKey); if (value !== undefined) headers[stringValue(auth.headerName) ?? "x-api-key"] = value; }
  else if (authType === "oauth") { const token = stringValue(secrets.accessToken); if (token !== undefined) headers.authorization = `${stringValue(secrets.tokenType) ?? "Bearer"} ${token}`; }
  return headers;
}

function classifyError(error: unknown): "authentication_required" | "configuration_error" | "disconnected" {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("401") || message.includes("403") || message.includes("authentication") || message.includes("unauthorized") || message.includes("oauth")) return "authentication_required";
  if (error instanceof TypeError || message.includes("configuration") || message.includes("endpoint") || message.includes("document") || message.includes("specification")) return "configuration_error";
  return "disconnected";
}
function safeError(error: unknown): string { const kind = classifyError(error); return kind === "authentication_required" ? "Authentication required" : kind === "configuration_error" ? "Configuration error" : "Connection failed"; }

function safeUrl(value: string, label: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname))) throw new TypeError(`${label} must use HTTPS`);
  if (url.username || url.password || url.search || url.hash) throw new TypeError(`${label} must not contain credentials or query state`);
  return url;
}

async function openApiDocument(runtime: IntegrationRuntimeConfig): Promise<unknown> {
  const config = record(runtime.integration.config); const content = stringValue(config.specificationContent);
  if (content !== undefined) { try { return JSON.parse(content) as unknown; } catch { throw new TypeError("OpenAPI specification content is invalid"); } }
  const specificationUrl = stringValue(config.specificationUrl); if (specificationUrl === undefined) throw new TypeError("OpenAPI specification is missing");
  const url = safeUrl(specificationUrl, "OpenAPI specification URL");
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const privateAddress = (address: string): boolean => {
    const normalized = address.replace(/^::ffff:/i, "");
    if (isIP(normalized) === 4) { const parts = normalized.split(".").map(Number); const [first, second] = parts; return first === 10 || first === 127 || first === 169 && second === 254 || first === 172 && second !== undefined && second >= 16 && second <= 31 || first === 192 && second === 168; }
    return isIP(normalized) === 6 && (normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb"));
  };
  if (!["localhost", "127.0.0.1", "::1"].includes(hostname)) {
    const addresses = isIP(hostname) !== 0 ? [hostname] : (await dnsLookup(hostname, { all: true, verbatim: true })).map(item => item.address);
    if (addresses.some(privateAddress)) throw new TypeError("OpenAPI specification URL resolves to a private network");
  }
  const response = await fetch(url, { redirect: "error" });
  if (!response.ok) throw new Error(`OpenAPI specification request failed (${response.status})`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > 1_048_576) throw new TypeError("OpenAPI specification is too large");
  try { return JSON.parse(new TextDecoder().decode(bytes)) as unknown; } catch { throw new TypeError("OpenAPI specification is invalid"); }
}

function modernDiscoveryResult(value: unknown): boolean {
  const result = record(value); return Array.isArray(result.supportedVersions) && result.supportedVersions.includes(MCP_MODERN_PROTOCOL_VERSION);
}

export class IntegrationManager {
  private readonly definitions = new Map<IntegrationKey, readonly ToolDefinition[]>();
  private readonly transports = new Map<IntegrationKey, McpTransport>();
  private readonly cacheExpiry = new Map<IntegrationKey, string>();
  private readonly protocols = new Map<IntegrationKey, McpProtocol>();
  private readonly fetch: typeof fetch;
  constructor(private readonly identity: SQLiteIdentityRepository, fetcher: typeof fetch = globalThis.fetch) { this.fetch = fetcher; }
  private key(ownerId: string, integrationId: string): IntegrationKey { return `${ownerId}:${integrationId}`; }

  /** Resolves IDs written by the pre-integration-ID implementation without rewriting agent data blindly. */
  canonicalCapabilityId(ownerId: string, capabilityId: string): string {
    const match = /^(mcp|openapi):([^:]+):(.+)$/.exec(capabilityId);
    if (match === null) return capabilityId;
    const integration = this.identity.listIntegrations(ownerId).find(item => item.type === match[1] && item.name === match[2]);
    return integration === undefined ? capabilityId : `integration:${integration.id}:${match[1]}:${match[3]}`;
  }

  invalidate(ownerId: string, integrationId: string): void { const key = this.key(ownerId, integrationId); this.definitions.delete(key); this.cacheExpiry.delete(key); void this.closeTransport(key); }

  private async runtimeFor(ownerId: string, integrationId: string): Promise<IntegrationRuntimeConfig> {
    let runtime = this.identity.getIntegrationRuntimeConfig(ownerId, integrationId);
    if (runtime === null) throw new AuthenticationError("Integration is not owned by the authenticated user");
    const auth = record(runtime.integration.config.auth);
    if (stringValue(auth.type) !== "oauth") return runtime;
    const expiresAt = typeof runtime.secrets.expiresAt === "number" ? runtime.secrets.expiresAt : undefined;
    if (expiresAt === undefined || expiresAt > Date.now() + 30_000) return runtime;
    const refreshToken = stringValue(runtime.secrets.refreshToken); const tokenUrl = stringValue(auth.tokenUrl); const clientId = stringValue(auth.clientId);
    if (refreshToken === undefined || tokenUrl === undefined || clientId === undefined) { this.identity.updateIntegrationStatus(ownerId, integrationId, "authentication_required", "Authentication required"); throw new AuthenticationError("OAuth authentication is required"); }
    const params = new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId });
    const clientSecret = stringValue(runtime.secrets.clientSecret); if (clientSecret !== undefined) params.set("client_secret", clientSecret);
    let response: Response;
    try { response = await this.fetch(safeUrl(tokenUrl, "OAuth token URL"), { method: "POST", headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" }, body: params, redirect: "error" }); }
    catch { this.identity.updateIntegrationStatus(ownerId, integrationId, "authentication_required", "Authentication required"); throw new AuthenticationError("OAuth refresh failed"); }
    if (!response.ok) { this.identity.updateIntegrationStatus(ownerId, integrationId, "authentication_required", "Authentication required"); throw new AuthenticationError("OAuth refresh failed"); }
    const payload = record(await response.json()); const accessToken = stringValue(payload.access_token); if (accessToken === undefined) { this.identity.updateIntegrationStatus(ownerId, integrationId, "authentication_required", "Authentication required"); throw new AuthenticationError("OAuth refresh failed"); }
    this.identity.saveIntegrationOAuthCredentials(ownerId, integrationId, { accessToken, ...(stringValue(payload.refresh_token) === undefined ? {} : { refreshToken: payload.refresh_token }), ...(stringValue(payload.token_type) === undefined ? {} : { tokenType: payload.token_type }), ...(typeof payload.expires_in === "number" ? { expiresAt: Date.now() + payload.expires_in * 1000 } : {}) });
    runtime = this.identity.getIntegrationRuntimeConfig(ownerId, integrationId);
    if (runtime === null) throw new AuthenticationError("Integration is not owned by the authenticated user");
    return runtime;
  }

  async discover(ownerId: string, integrationId: string): Promise<IntegrationRecord> {
    let runtime: IntegrationRuntimeConfig;
    try { runtime = await this.runtimeFor(ownerId, integrationId); } catch (error) { return this.identity.updateIntegrationStatus(ownerId, integrationId, classifyError(error), safeError(error)); }
    const key = this.key(ownerId, integrationId);
    try {
      const definitions = runtime.integration.type === "mcp" ? await this.discoverMcp(ownerId, integrationId, runtime, key) : runtime.integration.type === "openapi" ? await this.discoverOpenApi(ownerId, integrationId, runtime) : (() => { throw new TypeError("Integration type is not supported"); })();
      this.definitions.set(key, definitions);
      const at = new Date().toISOString();
      const expiry = this.cacheExpiry.get(key);
      const capabilities: readonly Omit<IntegrationCapabilityRecord, "integrationId">[] = definitions.map(definition => ({
        capabilityId: definition.capabilityId ?? definition.name, name: definition.name, description: definition.description, source: definition.source, capabilities: definition.capabilities ?? [],
        ...(definition.nativeName === undefined ? {} : { nativeName: definition.nativeName }), ...(definition.displayName === undefined ? {} : { displayName: definition.displayName }), inputSchema: definition.inputSchema, discoveredAt: at, ...(expiry === undefined ? {} : { expiresAt: expiry }),
      }));
      return this.identity.setIntegrationDiscovery(ownerId, integrationId, "connected", capabilities, undefined, this.protocols.get(key));
    } catch (error) {
      this.definitions.delete(key); if (runtime.integration.type === "mcp") await this.closeTransport(key);
      return this.identity.setIntegrationDiscovery(ownerId, integrationId, classifyError(error), [], safeError(error));
    }
  }

  private async discoverMcp(ownerId: string, integrationId: string, runtime: IntegrationRuntimeConfig, key: IntegrationKey): Promise<readonly ToolDefinition[]> {
    const config = record(runtime.integration.config); const transportName = stringValue(config.transport);
    const makeTransport = async (): Promise<McpTransport> => {
      const current = await this.runtimeFor(ownerId, integrationId); const currentConfig = record(current.integration.config);
      return currentConfig.transport === "stdio" ? createMcpStdioTransport({ command: stringValue(currentConfig.command) ?? "", args: Array.isArray(currentConfig.arguments) ? currentConfig.arguments.filter((item): item is string => typeof item === "string") : [], env: record(current.secrets.environment ?? current.secrets.env) as Record<string, string> }) : createMcpHttpTransport({ endpoint: stringValue(currentConfig.endpoint) ?? "", headers: integrationHeaders(current), fetch: this.fetch });
    };
    const transport = await makeTransport(); let protocol: McpProtocol = "modern"; let discovery: unknown;
    try {
      discovery = await requestMcp(transport, { id: "discover-1", method: "server/discover", protocol: "modern", params: { _meta: modernMeta() } });
      if (!modernDiscoveryResult(discovery)) throw new Error("modern MCP protocol is unavailable");
    } catch {
      protocol = "legacy";
      discovery = await requestMcp(transport, { id: "initialize-1", method: "initialize", protocol, params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "hermes-subpolar", version: "1.0" } } });
      if (!record(discovery).protocolVersion) throw new Error("MCP legacy initialization failed");
      await transport.notify?.({ method: "notifications/initialized", protocol, params: {} });
    }
    const listResponse = await requestMcp(transport, { id: protocol === "modern" ? "tools-list-1" : "tools-list-2", method: "tools/list", protocol, params: protocol === "modern" ? { _meta: modernMeta() } : {} });
    const listMetadata = record(listResponse); const ttlMs = typeof listMetadata.ttlMs === "number" && Number.isFinite(listMetadata.ttlMs) && listMetadata.ttlMs > 0 ? listMetadata.ttlMs : undefined;
    if (ttlMs !== undefined) this.cacheExpiry.set(key, new Date(Date.now() + ttlMs).toISOString()); else this.cacheExpiry.delete(key);
    const listed = parseMcpTools(listResponse);
    if (protocol === "legacy" || transportName === "stdio") { await this.closeTransport(key); this.transports.set(key, transport); }
    else await transport.close?.();
    this.protocols.set(key, protocol);
    return createMcpToolDefinitions({
      serverName: runtime.integration.name, transport, protocol, discoveredTools: listed, capabilityPrefix: `integration:${integrationId}:mcp:`, integrationId, integrationName: runtime.integration.name, integrationType: runtime.integration.type, policy: "ask",
      ...(protocol === "modern" && transportName !== "stdio" ? { transportFactory: makeTransport } : {}),
    });
  }

  private async discoverOpenApi(_ownerId: string, integrationId: string, runtime: IntegrationRuntimeConfig): Promise<readonly ToolDefinition[]> {
    const document = await openApiDocument(runtime); const config = record(runtime.integration.config); const baseUrl = stringValue(config.baseUrl); if (baseUrl === undefined) throw new TypeError("OpenAPI base URL is missing");
    const operations = discoverOpenApiOperations(document);
    return createOpenApiToolDefinitions({ serviceName: runtime.integration.name, document, baseUrl, allowedOperationIds: operations.map(operation => operation.operationId), capabilityPrefix: `integration:${integrationId}:openapi:`, integrationId, integrationName: runtime.integration.name, integrationType: runtime.integration.type, headersFactory: async () => integrationHeaders(await this.runtimeFor(_ownerId, integrationId)), policy: "ask" });
  }

  private async cachedMcp(ownerId: string, integration: IntegrationRecord): Promise<readonly ToolDefinition[]> {
    const key = this.key(ownerId, integration.id); const runtime = this.identity.getIntegrationRuntimeConfig(ownerId, integration.id); if (runtime === null) return Promise.resolve([]);
    const transport = this.transports.get(key) ?? createMcpHttpTransport({ endpoint: stringValue(record(runtime.integration.config).endpoint) ?? "", headers: integrationHeaders(runtime), fetch: this.fetch });
    const tools: McpTool[] = integration.capabilities.map(capability => ({ name: capability.nativeName ?? capability.name, description: capability.description, inputSchema: capability.inputSchema as never }));
    const protocol: McpProtocol = record(runtime.integration.config).transport === "stdio" ? "legacy" : "modern";
    try {
      return await createMcpToolDefinitions({ serverName: integration.name, transport, protocol, discoveredTools: tools, capabilityPrefix: `integration:${integration.id}:mcp:`, integrationId: integration.id, integrationName: integration.name, integrationType: integration.type, policy: "ask", ...(this.transports.has(key) ? {} : { transportFactory: async () => { const current = await this.runtimeFor(ownerId, integration.id); const config = record(current.integration.config); return createMcpHttpTransport({ endpoint: stringValue(config.endpoint) ?? "", headers: integrationHeaders(current), fetch: this.fetch }); } }) });
    } finally { if (!this.transports.has(key)) await transport.close?.(); }
  }

  async toolsFor(ownerId: string): Promise<readonly ToolDefinition[]> {
    const all: ToolDefinition[] = [];
    for (const integration of this.identity.listIntegrations(ownerId)) {
      if (!integration.enabled || integration.status === "authentication_required" || integration.status === "configuration_error" || integration.status === "disconnected") continue;
      const key = this.key(ownerId, integration.id); let definitions = this.definitions.get(key);
      const persistedExpiry = integration.capabilities.map(capability => capability.expiresAt).find(value => value !== undefined);
      const expiry = this.cacheExpiry.get(key) ?? persistedExpiry;
      if (expiry !== undefined && Date.parse(expiry) <= Date.now()) { definitions = undefined; this.definitions.delete(key); }
      if (definitions === undefined && integration.capabilities.length > 0 && integration.type === "mcp" && integration.protocol === "modern" && record(this.identity.getIntegrationRuntimeConfig(ownerId, integration.id)?.integration.config).transport !== "stdio") { try { definitions = await this.cachedMcp(ownerId, integration); this.definitions.set(key, definitions); } catch { definitions = undefined; } }
      if (definitions === undefined && (integration.status === "unknown" || integration.status === "connected")) { await this.discover(ownerId, integration.id); definitions = this.definitions.get(key); }
      if (definitions !== undefined) all.push(...definitions);
    }
    return all;
  }

  async test(ownerId: string, integrationId: string): Promise<IntegrationRecord> { return this.discover(ownerId, integrationId); }
  async closeTransport(key: IntegrationKey): Promise<void> { const transport = this.transports.get(key); this.transports.delete(key); if (transport !== undefined) await transport.close?.(); }
  async closeAll(): Promise<void> { for (const key of [...this.transports.keys()]) await this.closeTransport(key); }

  async revokeOAuth(ownerId: string, integrationId: string): Promise<IntegrationRecord> {
    const runtime = this.identity.getIntegrationRuntimeConfig(ownerId, integrationId); if (runtime === null) throw new AuthenticationError("Integration is not owned by the authenticated user");
    const auth = record(runtime.integration.config.auth); const token = stringValue(runtime.secrets.accessToken); const revocationUrl = stringValue(auth.revocationUrl);
    if (token !== undefined && revocationUrl !== undefined) { try { await this.fetch(safeUrl(revocationUrl, "OAuth revocation URL"), { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }), redirect: "error" }); } catch { /* local revoke is authoritative */ } }
    this.invalidate(ownerId, integrationId); this.identity.revokeIntegrationOAuth(ownerId, integrationId); return this.identity.updateIntegrationStatus(ownerId, integrationId, "authentication_required", "Authentication required");
  }

  async completeOAuth(ownerId: string, integrationId: string, code: string, state: string, redirectUri: string): Promise<IntegrationRecord> {
    const oauthState = this.identity.consumeIntegrationOAuthState(ownerId, state); if (oauthState.integrationId !== integrationId || oauthState.redirectUri !== redirectUri) throw new AuthenticationError("OAuth state is invalid");
    const runtime = this.identity.getIntegrationRuntimeConfig(ownerId, integrationId); if (runtime === null) throw new AuthenticationError("Integration is not owned by the authenticated user"); const auth = record(runtime.integration.config.auth);
    const tokenUrl = stringValue(auth.tokenUrl); const clientId = stringValue(auth.clientId); if (tokenUrl === undefined || clientId === undefined) throw new TypeError("OAuth configuration is invalid");
    const params = new URLSearchParams({ grant_type: "authorization_code", code, client_id: clientId, redirect_uri: redirectUri, code_verifier: oauthState.codeVerifier }); const clientSecret = stringValue(runtime.secrets.clientSecret); if (clientSecret !== undefined) params.set("client_secret", clientSecret);
    const response = await this.fetch(safeUrl(tokenUrl, "OAuth token URL"), { method: "POST", headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" }, body: params, redirect: "error" }); if (!response.ok) throw new Error("OAuth token exchange failed");
    const payload = record(await response.json()); const accessToken = stringValue(payload.access_token); if (accessToken === undefined) throw new Error("OAuth token exchange failed");
    this.identity.saveIntegrationOAuthCredentials(ownerId, integrationId, { accessToken, ...(stringValue(payload.refresh_token) === undefined ? {} : { refreshToken: payload.refresh_token }), ...(stringValue(payload.token_type) === undefined ? {} : { tokenType: payload.token_type }), ...(typeof payload.expires_in === "number" ? { expiresAt: Date.now() + payload.expires_in * 1000 } : {}) });
    return this.discover(ownerId, integrationId);
  }
}
