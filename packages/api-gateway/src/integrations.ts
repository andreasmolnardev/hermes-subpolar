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
  type McpTransport,
  type ToolDefinition,
} from "tool-runtime";

type IntegrationKey = `${string}:${string}`;

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | undefined { return typeof value === "string" && value.length > 0 ? value : undefined; }

function integrationHeaders(runtime: IntegrationRuntimeConfig): Record<string, string> {
  const config = record(runtime.integration.config);
  const auth = record(config.auth);
  const secrets = runtime.secrets;
  const headers: Record<string, string> = {};
  const fixed = record(secrets.headers);
  for (const [name, value] of Object.entries(fixed)) if (typeof value === "string") headers[name] = value;
  const authType = stringValue(auth.type);
  if (authType === "bearer") {
    const token = stringValue(secrets.token) ?? stringValue(secrets.accessToken);
    if (token !== undefined) headers.authorization = `Bearer ${token}`;
  } else if (authType === "api_key") {
    const name = stringValue(auth.headerName) ?? "x-api-key";
    const value = stringValue(secrets.apiKey);
    if (value !== undefined) headers[name] = value;
  } else if (authType === "oauth") {
    const token = stringValue(secrets.accessToken);
    if (token !== undefined) headers.authorization = `${stringValue(secrets.tokenType) ?? "Bearer"} ${token}`;
  }
  return headers;
}

function classifyError(error: unknown): "authentication_required" | "configuration_error" | "disconnected" {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("401") || message.includes("403") || message.includes("authentication") || message.includes("unauthorized")) return "authentication_required";
  if (error instanceof TypeError || message.includes("configuration") || message.includes("endpoint") || message.includes("document")) return "configuration_error";
  return "disconnected";
}

function safeError(error: unknown): string {
  const kind = classifyError(error);
  return kind === "authentication_required" ? "Authentication required" : kind === "configuration_error" ? "Configuration error" : "Connection failed";
}

function openApiDocument(runtime: IntegrationRuntimeConfig): Promise<unknown> {
  const config = record(runtime.integration.config);
  const content = stringValue(config.specificationContent);
  if (content !== undefined) {
    try { return Promise.resolve(JSON.parse(content) as unknown); } catch { throw new TypeError("OpenAPI specification content is invalid"); }
  }
  const specificationUrl = stringValue(config.specificationUrl);
  if (specificationUrl === undefined) throw new TypeError("OpenAPI specification is missing");
  const parsedUrl = new URL(specificationUrl);
  if (parsedUrl.protocol !== "https:" && !(parsedUrl.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(parsedUrl.hostname))) throw new TypeError("OpenAPI specification URL must use HTTPS");
  if (parsedUrl.username || parsedUrl.password) throw new TypeError("OpenAPI specification URL must not contain credentials");
  return fetch(specificationUrl, { redirect: "error" }).then(async response => {
    if (!response.ok) throw new Error(`OpenAPI specification request failed (${response.status})`);
    try { return await response.json() as unknown; } catch { throw new TypeError("OpenAPI specification is invalid"); }
  });
}

export class IntegrationManager {
  private readonly definitions = new Map<IntegrationKey, readonly ToolDefinition[]>();
  private readonly transports = new Map<IntegrationKey, McpTransport>();

  constructor(private readonly identity: SQLiteIdentityRepository) {}

  private key(ownerId: string, integrationId: string): IntegrationKey { return `${ownerId}:${integrationId}`; }

  invalidate(ownerId: string, integrationId: string): void {
    const key = this.key(ownerId, integrationId);
    this.definitions.delete(key);
    void this.closeTransport(key);
  }

  async discover(ownerId: string, integrationId: string): Promise<IntegrationRecord> {
    let runtime: IntegrationRuntimeConfig | null;
    try { runtime = this.identity.getIntegrationRuntimeConfig(ownerId, integrationId); } catch {
      return this.identity.updateIntegrationStatus(ownerId, integrationId, "configuration_error", "Configuration error");
    }
    if (runtime === null) throw new AuthenticationError("Integration is not owned by the authenticated user");
    const key = this.key(ownerId, integrationId);
    try {
      let definitions: readonly ToolDefinition[];
      if (runtime.integration.type === "mcp") definitions = await this.discoverMcp(runtime, key);
      else if (runtime.integration.type === "openapi") definitions = await this.discoverOpenApi(runtime);
      else throw new TypeError("Integration type is not supported");
      this.definitions.set(key, definitions);
      const capabilities: readonly Omit<IntegrationCapabilityRecord, "integrationId">[] = definitions.map(definition => ({
        capabilityId: definition.capabilityId ?? definition.name,
        name: definition.name,
        description: definition.description,
        source: definition.source,
        capabilities: definition.capabilities ?? [],
      }));
      return this.identity.setIntegrationDiscovery(ownerId, integrationId, "connected", capabilities);
    } catch (error) {
      this.definitions.delete(key);
      if (runtime.integration.type === "mcp") await this.closeTransport(key);
      return this.identity.setIntegrationDiscovery(ownerId, integrationId, classifyError(error), [], safeError(error));
    }
  }

  private async discoverMcp(runtime: IntegrationRuntimeConfig, key: IntegrationKey): Promise<readonly ToolDefinition[]> {
    const config = record(runtime.integration.config);
    const transportName = stringValue(config.transport);
    const transport = transportName === "stdio"
      ? createMcpStdioTransport({ command: stringValue(config.command) ?? "", args: Array.isArray(config.arguments) ? config.arguments.filter((item): item is string => typeof item === "string") : [], env: record(runtime.secrets.environment ?? runtime.secrets.env) as Record<string, string> })
      : createMcpHttpTransport({ endpoint: stringValue(config.endpoint) ?? "", headers: integrationHeaders(runtime) });
    await transport.request("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "hermes-subpolar", version: "1.0" } });
    await transport.request("notifications/initialized", {});
    await this.closeTransport(key);
    this.transports.set(key, transport);
    return createMcpToolDefinitions({ serverName: runtime.integration.name, transport, policy: "ask" });
  }

  private async discoverOpenApi(runtime: IntegrationRuntimeConfig): Promise<readonly ToolDefinition[]> {
    const document = await openApiDocument(runtime);
    const config = record(runtime.integration.config);
    const baseUrl = stringValue(config.baseUrl);
    if (baseUrl === undefined) throw new TypeError("OpenAPI base URL is missing");
    const operations = discoverOpenApiOperations(document);
    return createOpenApiToolDefinitions({
      serviceName: runtime.integration.name,
      document,
      baseUrl,
      allowedOperationIds: operations.map(operation => operation.operationId),
      headers: integrationHeaders(runtime),
      policy: "ask",
    });
  }

  async toolsFor(ownerId: string): Promise<readonly ToolDefinition[]> {
    const all: ToolDefinition[] = [];
    for (const integration of this.identity.listIntegrations(ownerId)) {
      if (!integration.enabled) continue;
      const key = this.key(ownerId, integration.id);
      let definitions = this.definitions.get(key);
      if (definitions === undefined && (integration.status === "unknown" || integration.status === "connected")) {
        await this.discover(ownerId, integration.id);
        definitions = this.definitions.get(key);
      }
      if (definitions !== undefined) all.push(...definitions);
    }
    return all;
  }

  async test(ownerId: string, integrationId: string): Promise<IntegrationRecord> { return this.discover(ownerId, integrationId); }

  async closeTransport(key: IntegrationKey): Promise<void> {
    const transport = this.transports.get(key);
    this.transports.delete(key);
    if (transport !== undefined) await transport.close?.();
  }

  async closeAll(): Promise<void> {
    for (const key of [...this.transports.keys()]) await this.closeTransport(key);
  }

  async revokeOAuth(ownerId: string, integrationId: string): Promise<IntegrationRecord> {
    const runtime = this.identity.getIntegrationRuntimeConfig(ownerId, integrationId);
    if (runtime === null) throw new AuthenticationError("Integration is not owned by the authenticated user");
    const auth = record(runtime.integration.config.auth);
    const token = stringValue(runtime.secrets.accessToken);
    const revocationUrl = stringValue(auth.revocationUrl);
    if (token !== undefined && revocationUrl !== undefined) {
      try { await fetch(revocationUrl, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }) }); } catch { /* local revoke still succeeds */ }
    }
    await this.closeTransport(this.key(ownerId, integrationId));
    this.definitions.delete(this.key(ownerId, integrationId));
    return this.identity.revokeIntegrationOAuth(ownerId, integrationId);
  }

  async completeOAuth(ownerId: string, integrationId: string, code: string, state: string, redirectUri: string): Promise<IntegrationRecord> {
    const oauthState = this.identity.consumeIntegrationOAuthState(ownerId, state);
    if (oauthState.integrationId !== integrationId || oauthState.redirectUri !== redirectUri) throw new AuthenticationError("OAuth state is invalid");
    const runtime = this.identity.getIntegrationRuntimeConfig(ownerId, integrationId);
    if (runtime === null) throw new AuthenticationError("Integration is not owned by the authenticated user");
    const auth = record(runtime.integration.config.auth);
    const tokenUrl = stringValue(auth.tokenUrl);
    const clientId = stringValue(auth.clientId);
    if (tokenUrl === undefined || clientId === undefined) throw new TypeError("OAuth configuration is invalid");
    const params = new URLSearchParams({ grant_type: "authorization_code", code, client_id: clientId, redirect_uri: redirectUri, code_verifier: oauthState.codeVerifier });
    const clientSecret = stringValue(runtime.secrets.clientSecret);
    if (clientSecret !== undefined) params.set("client_secret", clientSecret);
    const response = await fetch(tokenUrl, { method: "POST", headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" }, body: params, redirect: "error" });
    if (!response.ok) throw new Error("OAuth token exchange failed");
    const payload = record(await response.json());
    const accessToken = stringValue(payload.access_token);
    if (accessToken === undefined) throw new Error("OAuth token exchange failed");
    this.identity.saveIntegrationOAuthCredentials(ownerId, integrationId, { accessToken, ...(stringValue(payload.refresh_token) === undefined ? {} : { refreshToken: payload.refresh_token }), ...(stringValue(payload.token_type) === undefined ? {} : { tokenType: payload.token_type }), ...(typeof payload.expires_in === "number" ? { expiresAt: Date.now() + payload.expires_in * 1000 } : {}) });
    return this.discover(ownerId, integrationId);
  }
}
