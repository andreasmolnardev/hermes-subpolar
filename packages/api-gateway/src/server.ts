import { createHash, randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { createGateway, createGatewayPersistenceAdapter, type GatewayProtocolEvent } from "./index";
import { type ChatProvider, type ProviderMessage } from "chat-provider-interface";
import {
  AuthenticationError,
  IdempotencyConflictError,
  OwnershipError,
  SQLiteIdentityRepository,
  SQLiteSessionRepository,
  type JsonValue,
  type AuthenticatedPrincipal,
  type AuthSession,
  type SessionRecord,
  type AgentConfigurationInput,
} from "data-layer";
import type { HarnessApprovalPolicy } from "harness";
import { resolveAgentToolDescriptors, type PermissionMode, type ToolDefinition, type ToolPolicyInput } from "tool-resolver";
import { serveStatic } from "./static";
import { modelProvider } from "@hermes/shared/model-providers";
import { createProvider, listProviderModels, listProviderProfiles, resolveProvider } from "./provider-runtime";
import {
  beginDeviceOAuth,
  beginProviderOAuth,
  completeDeviceOAuth,
  completeProviderOAuth,
  refreshProviderCredential,
  resolveAwsCredential,
  resolveGcpCredential
} from "./provider-auth";

export type ApiGatewayServerOptions = {
  readonly provider?: ChatProvider;
  readonly hostname?: string;
  readonly port?: number;
  readonly staticRoot?: string;
  readonly maxRequestBytes?: number;
  readonly dataDir?: string;
  readonly shutdownTimeoutMs?: number;
  readonly toolDefinitions?: readonly ToolDefinition[];
  readonly toolPolicyOverrides?: readonly ToolPolicyInput[];
  readonly approvalPolicy?: HarnessApprovalPolicy;
};

export type ApiGatewayServer = ReturnType<typeof Bun.serve> & {
  shutdown(): Promise<void>;
};

type WebSocketData = { readonly principal: AuthenticatedPrincipal; readonly token: string };
type TurnInput = { readonly model: string; readonly messages: readonly ProviderMessage[]; readonly sessionId?: string; readonly projectId?: string; readonly agentId?: string; readonly requestId?: string; readonly permissionMode?: PermissionMode; readonly reasoningEffort?: "low" | "medium" | "high" };

const SESSION_COOKIE = "subpolar_session";
const CSRF_COOKIE = "subpolar_csrf";
const CHAT_REQUEST_FIELDS = new Set(["model", "messages", "sessionId", "projectId", "agentId", "requestId", "permissionMode", "reasoningEffort", "stream"]);

function json(value: unknown, status = 200, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("content-type", "application/json; charset=utf-8");
  responseHeaders.set("cache-control", "no-store");
  return new Response(JSON.stringify(value), {
    status,
    headers: responseHeaders,
  });
}

function parseCookies(request: Request): Map<string, string> {
  const result = new Map<string, string>();
  for (const item of request.headers.get("cookie")?.split(";") ?? []) {
    const separator = item.indexOf("=");
    if (separator <= 0) continue;
    try {
      result.set(item.slice(0, separator).trim(), decodeURIComponent(item.slice(separator + 1).trim()));
    } catch {
      // Ignore malformed cookies and let authentication fail closed.
    }
  }
  return result;
}

function cookie(name: string, value: string, request: Request, maxAge = 604800, httpOnly = true): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${httpOnly ? "; HttpOnly" : ""}${secure}`;
}

function authHeaders(request: Request, session: AuthSession): Headers {
  const headers = new Headers();
  headers.append("set-cookie", cookie(SESSION_COOKIE, session.token, request));
  headers.append("set-cookie", cookie(CSRF_COOKIE, session.csrfToken, request, 604800, false));
  return headers;
}

function clearAuthHeaders(request: Request): Headers {
  const headers = new Headers();
  headers.append("set-cookie", cookie(SESSION_COOKIE, "", request, 0));
  headers.append("set-cookie", cookie(CSRF_COOKIE, "", request, 0, false));
  return headers;
}

function originAllowed(request: Request): boolean {
  const origin = request.headers.get("origin");
  return origin !== null && origin === new URL(request.url).origin;
}

function parseMessages(value: unknown): readonly ProviderMessage[] {
  if (!Array.isArray(value) || value.length === 0) throw new TypeError("messages must be a non-empty array");
  return value.map(message => {
    if (typeof message !== "object" || message === null || Array.isArray(message)) throw new TypeError("message must be an object");
    const record = message as Record<string, unknown>;
    if ((record.role !== "system" && record.role !== "user" && record.role !== "assistant") || typeof record.content !== "string") {
      throw new TypeError("message role and content are invalid");
    }
    return { role: record.role, content: record.content };
  });
}

function turnInput(value: unknown): TurnInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("request body must be an object");
  const body = value as Record<string, unknown>;
  const unsupported = Object.keys(body).find(field => !CHAT_REQUEST_FIELDS.has(field));
  if (unsupported !== undefined) throw new TypeError(`Gateway field is unsupported: ${unsupported}`);
  if (typeof body.model !== "string" || !body.model.trim()) throw new TypeError("model must be a non-empty string");
  const stringField = (key: string): string | undefined => body[key] === undefined ? undefined : typeof body[key] === "string" && body[key] ? body[key] : (() => { throw new TypeError(`${key} is invalid`); })();
  const sessionId = stringField("sessionId");
  const projectId = stringField("projectId");
  const agentId = stringField("agentId");
  const requestId = stringField("requestId");
  const permissionMode = body.permissionMode === undefined ? undefined : ["full", "ask", "read-only"].includes(String(body.permissionMode)) ? body.permissionMode as PermissionMode : (() => { throw new TypeError("permissionMode is invalid"); })();
  const reasoningEffort = body.reasoningEffort === undefined ? undefined : ["low", "medium", "high"].includes(String(body.reasoningEffort)) ? body.reasoningEffort as "low" | "medium" | "high" : (() => { throw new TypeError("reasoningEffort is invalid"); })();
  return {
    model: body.model,
    messages: parseMessages(body.messages),
    ...(sessionId === undefined ? {} : { sessionId }),
    ...(projectId === undefined ? {} : { projectId }),
    ...(agentId === undefined ? {} : { agentId }),
    ...(requestId === undefined ? {} : { requestId }),
    ...(permissionMode === undefined ? {} : { permissionMode }),
    ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
  };
}

function parseAgentUpdate(value: unknown): AgentConfigurationInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("agent update must be an object");
  const record = value as Record<string, unknown>;
  const allowed = new Set(["name", "description", "icon", "instructions", "model", "reasoningEffort", "capabilities", "permissions", "skillIds"]);
  const unsupported = Object.keys(record).find(key => !allowed.has(key));
  if (unsupported !== undefined) throw new TypeError("agent field is unsupported");
  const optionalString = (key: string, max: number): string | undefined => {
    if (record[key] === undefined) return undefined;
    if (typeof record[key] !== "string" || record[key].length > max) throw new TypeError("agent string field is invalid");
    return record[key];
  };
  const capabilities = record.capabilities === undefined ? undefined : (() => {
    if (!Array.isArray(record.capabilities)) throw new TypeError("capabilities are invalid");
    return record.capabilities.map(item => {
      if (typeof item !== "object" || item === null || Array.isArray(item) || typeof (item as Record<string, unknown>).capabilityId !== "string" || typeof (item as Record<string, unknown>).enabled !== "boolean") throw new TypeError("capability assignment is invalid");
      return { capabilityId: (item as Record<string, unknown>).capabilityId as string, enabled: (item as Record<string, unknown>).enabled as boolean };
    });
  })();
  const permissions = record.permissions === undefined ? undefined : (() => {
    if (!Array.isArray(record.permissions)) throw new TypeError("permissions are invalid");
    return record.permissions.map(item => {
      if (typeof item !== "object" || item === null || Array.isArray(item)) throw new TypeError("permission is invalid");
      const entry = item as Record<string, unknown>;
      if (typeof entry.capabilityId !== "string" || !["allow", "ask", "deny"].includes(String(entry.policy))) throw new TypeError("permission is invalid");
      return { capabilityId: entry.capabilityId, policy: entry.policy as "allow" | "ask" | "deny" };
    });
  })();
  const skillIds = record.skillIds === undefined ? undefined : (() => {
    if (!Array.isArray(record.skillIds) || record.skillIds.some(item => typeof item !== "string")) throw new TypeError("skills are invalid");
    return record.skillIds as string[];
  })();
  return {
    ...(optionalString("name", 128) === undefined ? {} : { name: optionalString("name", 128) }),
    ...(optionalString("description", 10_000) === undefined ? {} : { description: optionalString("description", 10_000) }),
    ...(optionalString("icon", 64) === undefined ? {} : { icon: optionalString("icon", 64) }),
    ...(optionalString("instructions", 100_000) === undefined ? {} : { instructions: optionalString("instructions", 100_000) }),
    ...(optionalString("model", 256) === undefined ? {} : { model: optionalString("model", 256) }),
    ...(optionalString("reasoningEffort", 32) === undefined ? {} : { reasoningEffort: optionalString("reasoningEffort", 32) }),
    ...(capabilities === undefined ? {} : { capabilities }),
    ...(permissions === undefined ? {} : { permissions }),
    ...(skillIds === undefined ? {} : { skillIds }),
  };
}

async function body(request: Request, maxBytes: number): Promise<Record<string, unknown>> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null && Number(contentLength) > maxBytes) throw new TypeError("request body is too large");
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new TypeError("request body is too large");
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new TypeError("request body must be an object");
  return parsed as Record<string, unknown>;
}

function authenticated(
  request: Request,
  identity: SQLiteIdentityRepository,
  stateChanging = false,
): { principal: AuthenticatedPrincipal; token: string } | Response {
  const token = parseCookies(request).get(SESSION_COOKIE);
  const principal = identity.authenticate(token);
  if (principal === null || token === undefined) return json({ error: "unauthorized" }, 401);
  if (stateChanging) {
    if (!originAllowed(request)) return json({ error: "origin_rejected" }, 403);
    const csrf = request.headers.get("x-csrf-token");
    if (csrf === null || csrf !== identity.csrfToken(token) || csrf !== parseCookies(request).get(CSRF_COOKIE)) return json({ error: "csrf_rejected" }, 403);
  }
  return { principal, token };
}

function sessionRecord(sessionId: string, projectId: string | undefined, model: string): SessionRecord {
  const timestamp = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: sessionId,
    workspaceId: projectId ?? "default",
    status: "active",
    createdAt: timestamp,
    updatedAt: timestamp,
    runtime: { runtimeVersion: "api-gateway", schemaVersion: 1 },
    model,
  };
}

function eventJson(requestId: string, sequence: number, event: GatewayProtocolEvent): string {
  return JSON.stringify({ protocol: "subpolar.v1", requestId, sequence, event });
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value as Record<string, unknown>).sort().map(key =>
    `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`
  ).join(",")}}`;
}

function requestFingerprint(principalId: string, input: TurnInput): string {
  return createHash("sha256")
    .update(canonicalJson({ endpoint: "subpolar.v1/chat/completions", principalId, input }))
    .digest("hex");
}

export function startApiGatewayServer(options: ApiGatewayServerOptions): ApiGatewayServer {
  const maxRequestBytes = options.maxRequestBytes ?? 1_048_576;
  if (!Number.isInteger(maxRequestBytes) || maxRequestBytes < 1) throw new TypeError("maxRequestBytes must be positive");
  const shutdownTimeoutMs = options.shutdownTimeoutMs ?? 5_000;
  if (!Number.isFinite(shutdownTimeoutMs) || shutdownTimeoutMs <= 0) throw new TypeError("shutdownTimeoutMs must be positive");
   const dataDir = options.dataDir ?? process.env.SUBPOLAR_DATA_DIR ?? resolve(process.cwd(), ".subpolar");
  const databasePath = join(dataDir, "state.db");
  const sessions = new SQLiteSessionRepository(databasePath);
  const identity = new SQLiteIdentityRepository(databasePath);
  const persistence = createGatewayPersistenceAdapter(sessions);
  const gateway = createGateway({ sessionRepository: persistence, persistence });
  const activeTurns = new Set<AbortController>();
  const socketTurns = new Map<object, Map<string, AbortController>>();
  const pendingApprovals = new WeakMap<object, Map<string, { readonly resolve: (decision: "allow" | "deny") => void }>>();
  let shutdownPromise: Promise<void> | undefined;

  const configuredCredential = async (connection: NonNullable<ReturnType<SQLiteIdentityRepository["providerConnection"]>>) => {
    const profile = modelProvider(connection.providerId);
    if (profile === undefined) throw new Error("provider_not_configured");
    let credentials = identity.resolveCredentialHandle(connection.credentialHandle);
    const envMarker = credentials.apiKey === "env";
    if (profile.authType === "aws_sdk" && envMarker) credentials = resolveAwsCredential(credentials);
    if (profile.authType === "gcp" && envMarker && process.env.GOOGLE_OAUTH_ACCESS_TOKEN !== undefined) {
      credentials = { accessToken: process.env.GOOGLE_OAUTH_ACCESS_TOKEN };
    }
    if (profile.authType === "external_process" && credentials.executable === undefined) {
      const executable = process.env[`SUBPOLAR_${profile.id.toUpperCase().replace(/-/g, "_")}_EXECUTABLE`];
      if (executable !== undefined) credentials = { executable, arguments: [] };
    }
    if (profile.authType === "gcp") return resolveGcpCredential(credentials);
    return profile.authType === "oauth" ? refreshProviderCredential(identity, profile.id, connection.credentialHandle, credentials) : credentials;
  };

  const trackTurn = (controller: AbortController): (() => void) => {
    activeTurns.add(controller);
    return () => activeTurns.delete(controller);
  };

  const prepareTurn = async (principal: AuthenticatedPrincipal, input: TurnInput): Promise<{ input: TurnInput; sessionId: string; tools: readonly ToolDefinition[]; reasoningEffort?: "low" | "medium" | "high" }> => {
    const sessionId = input.sessionId ?? randomUUID();
    const agent = input.agentId === undefined ? null : identity.getAgent(principal.id, input.agentId);
    if (input.agentId !== undefined && agent === null) throw new OwnershipError("Agent is not owned by the authenticated user");
    const projectOverride = agent !== null && input.projectId !== undefined ? identity.getAgentProjectOverride(principal.id, input.projectId, agent.id) : null;
    const selectedModel = input.model !== "default" ? input.model : projectOverride?.model ?? agent?.model;
    const effectiveModel = selectedModel ?? (options.provider === undefined ? identity.providerConnection()?.model ?? input.model : input.model);
    const explicitReasoning = input.reasoningEffort;
    const existing = await sessions.getSession(sessionId);
    if (existing !== null) {
      identity.assertSessionOwner(principal.id, sessionId);
    } else {
      identity.claimSession(principal.id, sessionId, input.projectId, input.agentId);
      await sessions.createSession(sessionRecord(sessionId, input.projectId, effectiveModel));
    }
    if (agent !== null) {
      const hasSystem = input.messages.some(message => message.role === "system");
      const effectiveCapabilities = projectOverride?.capabilities ?? agent.capabilities;
      const effectivePermissions = projectOverride?.permissions ?? agent.permissions;
      const enabledCapabilityIds = agent.capabilityMode === "legacy" && projectOverride?.capabilities === undefined
        ? (options.toolDefinitions ?? []).map(definition => definition.capabilityId ?? definition.name)
        : effectiveCapabilities.filter(item => item.enabled).map(item => item.capabilityId);
      const tools = resolveAgentToolDescriptors(options.toolDefinitions ?? [], {
        userId: principal.id,
        sessionId,
        ...(input.projectId === undefined ? {} : { projectId: input.projectId }),
        agentId: agent.id,
        enabledCapabilityIds,
        agentPolicies: effectivePermissions,
        ...(input.permissionMode === undefined ? {} : { sessionMode: input.permissionMode }),
      });
      const configuredEffort = input.reasoningEffort ?? projectOverride?.reasoningEffort ?? agent.reasoningEffort;
      const reasoningEffort = configuredEffort === "low" || configuredEffort === "medium" || configuredEffort === "high" ? configuredEffort : undefined;
      if (!hasSystem && agent.instructions.trim()) {
        return { input: { ...input, model: effectiveModel, messages: [{ role: "system", content: agent.instructions }, ...input.messages] }, sessionId, tools, ...(reasoningEffort === undefined ? {} : { reasoningEffort }) };
      }
      return { input: { ...input, model: effectiveModel }, sessionId, tools, ...(reasoningEffort === undefined ? {} : { reasoningEffort }) };
    }
    return { input: { ...input, model: effectiveModel }, sessionId, tools: options.toolDefinitions ?? [], ...(explicitReasoning === undefined ? {} : { reasoningEffort: explicitReasoning }) };
  };

  const executeTurn = async (
    principal: AuthenticatedPrincipal,
    input: TurnInput,
    signal: AbortSignal,
    emit: (event: GatewayProtocolEvent) => void | Promise<void>,
    turnApprovalPolicy?: HarnessApprovalPolicy,
  ): Promise<unknown> => {
    const prepared = await prepareTurn(principal, input);
    const connection = options.provider === undefined ? identity.providerConnection() : null;
    if (options.provider === undefined && connection === null) throw new Error("provider_not_configured");
    const runtime = connection === null ? null : await resolveProvider(connection, () => configuredCredential(connection));
    const approvalPolicy = turnApprovalPolicy ?? options.approvalPolicy;
    return gateway.executeRequest({
      model: prepared.input.model === "default" && runtime !== null ? runtime.model : prepared.input.model,
      messages: prepared.input.messages,
      toolPolicies: [],
      toolDefinitions: prepared.tools,
      toolPolicyOverrides: prepared.tools.length === 0 ? options.toolPolicyOverrides ?? [] : [],
      sessionId: prepared.sessionId,
      requestId: prepared.input.requestId ?? randomUUID(),
      ...(prepared.reasoningEffort === undefined ? {} : { options: { reasoningEffort: prepared.reasoningEffort } }),
      signal,
      eventSink: emit,
      ...(approvalPolicy === undefined ? {} : { approvalPolicy: async approval => {
        const approvalRequestId = `${approval.requestId}:${approval.call.id}`;
        const at = new Date().toISOString();
        await sessions.savePendingApproval({
          requestId: approvalRequestId,
          sessionId: approval.sessionId,
          callId: approval.call.id,
          toolName: approval.call.name,
          arguments: approval.arguments,
          status: "pending",
          createdAt: at,
          updatedAt: at,
        });
        const decision = await approvalPolicy(approval);
        if (decision !== "allow" && decision !== "deny") {
          throw new Error("Explicit tool approval decision required");
        }
        await sessions.resolvePendingApproval(approvalRequestId, decision, new Date().toISOString());
        return decision;
      } }),
    }, options.provider ?? createProvider(runtime as NonNullable<typeof runtime>, { resolveCredential: handle => identity.resolveCredentialHandle(handle) }));
  };

  const server = Bun.serve<WebSocketData>({
    hostname: options.hostname ?? "127.0.0.1",
    port: options.port ?? 8080,
    async fetch(request, serverInstance) {
      const url = new URL(request.url);
      if (request.method === "GET" && url.pathname === "/api/health") return json({ status: "ok" });
      if (request.method === "GET" && url.pathname === "/api/ready") return json({ status: "ready" });

      if (url.pathname === "/v1/ws") {
        if (request.method !== "GET" || !originAllowed(request)) return json({ error: "origin_rejected" }, 403);
        const token = parseCookies(request).get(SESSION_COOKIE);
        const principal = identity.authenticate(token);
        if (principal === null || token === undefined) return json({ error: "unauthorized" }, 401);
        if (serverInstance.upgrade(request, { data: { principal, token } })) return undefined;
        return json({ error: "upgrade_failed" }, 400);
      }

      if (url.pathname === "/v1/auth/bootstrap") {
        if (request.method === "GET") return json({ required: identity.bootstrapRequired() });
        if (request.method !== "POST" || !originAllowed(request)) return json({ error: "origin_rejected" }, 403);
        try {
          const value = await body(request, maxRequestBytes);
          const session = await identity.bootstrap(String(value.username ?? ""), String(value.password ?? ""));
          return json({ user: session.principal, expiresAt: session.expiresAt }, 201, authHeaders(request, session));
        } catch { return json({ error: "bootstrap_failed" }, 400); }
      }

      if (url.pathname === "/v1/auth/login" && request.method === "POST") {
        if (!originAllowed(request)) return json({ error: "origin_rejected" }, 403);
        try {
          const value = await body(request, maxRequestBytes);
          const session = await identity.login(String(value.username ?? ""), String(value.password ?? ""));
          return json({ user: session.principal, expiresAt: session.expiresAt }, 200, authHeaders(request, session));
        } catch { return json({ error: "invalid_credentials" }, 401); }
      }

      if (url.pathname === "/v1/auth/logout" && request.method === "POST") {
        const auth = authenticated(request, identity, true);
        if (auth instanceof Response) return auth;
        identity.revoke(auth.token);
        return json({ ok: true }, 200, clearAuthHeaders(request));
      }

      if (url.pathname === "/v1/auth/password" && request.method === "POST") {
        const auth = authenticated(request, identity, true);
        if (auth instanceof Response) return auth;
        try {
          const value = await body(request, maxRequestBytes);
          const session = await identity.changePassword(auth.principal.id, String(value.currentPassword ?? ""), String(value.newPassword ?? ""));
          return json({ user: session.principal, expiresAt: session.expiresAt }, 200, authHeaders(request, session));
        } catch (error) {
          return json({ error: error instanceof AuthenticationError ? "invalid_credentials" : "invalid_password" }, error instanceof AuthenticationError ? 401 : 400);
        }
      }

      if (url.pathname === "/v1/me" && request.method === "GET") {
        const auth = authenticated(request, identity);
        return auth instanceof Response ? auth : json({ user: auth.principal });
      }

      if (url.pathname === "/v1/setup" && request.method === "GET") {
        const auth = authenticated(request, identity);
        return auth instanceof Response ? auth : json(identity.setupStatus(auth.principal.id));
      }

      if (url.pathname === "/v1/settings/models" && request.method === "GET") {
        const auth = authenticated(request, identity);
        return auth instanceof Response ? auth : json(identity.modelDefaults(auth.principal.id));
      }

      if (url.pathname === "/v1/settings/models" && request.method === "PUT") {
        const auth = authenticated(request, identity, true);
        if (auth instanceof Response) return auth;
        try {
          const value = await body(request, maxRequestBytes);
          return json(identity.setModelDefaults(auth.principal.id, {
            conversation: value.conversation,
            internal: value.internal,
            voice: value.voice,
            image: value.image,
          }));
        } catch { return json({ error: "invalid_model_defaults" }, 400); }
      }

      if ((url.pathname === "/v1/setup/providers" || url.pathname === "/v1/providers") && request.method === "GET") {
        const auth = authenticated(request, identity);
        return auth instanceof Response ? auth : json({ providers: listProviderProfiles() });
      }

      if (url.pathname === "/v1/setup/provider" && request.method === "POST") {
        const auth = authenticated(request, identity, true);
        if (auth instanceof Response) return auth;
        try {
          const value = await body(request, maxRequestBytes);
          const provider = String(value.providerId ?? value.provider ?? "openai-api");
          const profile = modelProvider(provider);
          if (profile === undefined) throw new Error("provider is invalid");
          identity.configureProvider(profile.id, String(value.baseUrl ?? profile.baseUrl ?? ""), String(value.apiKey ?? ""), String(value.model ?? ""));
          return json({ configured: true });
        } catch { return json({ error: "invalid_provider" }, 400); }
      }

      const providerAuthPath = /^\/v1\/providers\/([^/]+)\/auth\/(start|callback|device\/start|device\/complete)$/.exec(url.pathname);
      if (providerAuthPath !== null) {
        const provider = modelProvider(decodeURIComponent(providerAuthPath[1] as string));
        if (provider === undefined) return json({ error: "provider_not_found" }, 404);
        if (providerAuthPath[2] === "start" && request.method === "GET") {
          const auth = authenticated(request, identity);
          if (auth instanceof Response) return auth;
          try {
            const model = url.searchParams.get("model") ?? provider.fallbackModels?.[0] ?? "default";
            const baseUrl = url.searchParams.get("baseUrl") ?? provider.baseUrl ?? "";
            return json(beginProviderOAuth(identity, provider.id, baseUrl, model, url.origin, auth.principal.id));
          } catch (error) {
            return json({ error: error instanceof Error ? error.message : "provider_oauth_failed" }, 400);
          }
        }
        if (providerAuthPath[2] === "callback" && request.method === "GET") {
          const auth = authenticated(request, identity);
          if (auth instanceof Response) return auth;
          const state = url.searchParams.get("state");
          const code = url.searchParams.get("code");
          if (state === null || code === null) return json({ error: "provider_oauth_callback_invalid" }, 400);
          try {
            await completeProviderOAuth(identity, provider.id, state, code, auth.principal.id);
            return Response.redirect(`${url.origin}/setup?provider=${encodeURIComponent(provider.id)}&connected=1`, 303);
          } catch { return json({ error: "provider_oauth_exchange_failed" }, 400); }
        }
        if (providerAuthPath[2] === "device/start" && request.method === "POST") {
          const auth = authenticated(request, identity, true);
          if (auth instanceof Response) return auth;
          try { return json(await beginDeviceOAuth(provider.id)); } catch { return json({ error: "provider_device_flow_failed" }, 400); }
        }
        if (providerAuthPath[2] === "device/complete" && request.method === "POST") {
          const auth = authenticated(request, identity, true);
          if (auth instanceof Response) return auth;
          try {
            const value = await body(request, maxRequestBytes);
            if (typeof value.deviceCode !== "string" || value.deviceCode.trim().length === 0) throw new Error("device code is invalid");
            const credentials = await completeDeviceOAuth(provider.id, value.deviceCode);
            identity.configureProviderCredentials(provider.id, provider.baseUrl ?? "", credentials, provider.fallbackModels?.[0] ?? "default");
            return json({ configured: true });
          } catch { return json({ error: "provider_device_flow_failed" }, 400); }
        }
        return json({ error: "method_not_allowed" }, 405);
      }

      if (url.pathname === "/v1/models" && request.method === "GET") {
        const auth = authenticated(request, identity);
        if (auth instanceof Response) return auth;
        const connection = identity.providerConnection();
        if (connection === null) return json({ providers: [] });
        const runtime = await resolveProvider(connection, () => configuredCredential(connection));
        const models = await listProviderModels(runtime);
        return json({ providers: [{ id: connection.providerId, models }] });
      }

      if (url.pathname === "/v1/capabilities" && request.method === "GET") {
        const auth = authenticated(request, identity);
        if (auth instanceof Response) return auth;
        return json({ capabilities: (options.toolDefinitions ?? []).map(definition => ({ capabilityId: definition.capabilityId ?? definition.name, name: definition.name, description: definition.description, source: definition.source, capabilities: definition.capabilities ?? [] })) });
      }

      const providerModelsPath = /^\/v1\/providers\/([^/]+)\/models$/.exec(url.pathname);
      if (providerModelsPath !== null && request.method === "GET") {
        const auth = authenticated(request, identity);
        if (auth instanceof Response) return auth;
        const connection = identity.providerConnection();
        const profile = modelProvider(decodeURIComponent(providerModelsPath[1] as string));
        if (profile === undefined) return json({ error: "provider_not_found" }, 404);
        if (connection === null || connection.providerId !== profile.id) return json({ providerId: profile.id, models: (profile.fallbackModels ?? []).map(id => ({ id, label: id })) });
        const runtime = await resolveProvider(connection, () => configuredCredential(connection));
        return json({ providerId: profile.id, models: await listProviderModels(runtime) });
      }

      if (url.pathname === "/v1/setup/agents" && request.method === "POST") {
        const auth = authenticated(request, identity, true);
        if (auth instanceof Response) return auth;
        try {
          const value = await body(request, maxRequestBytes);
          if (!Array.isArray(value.templates) || value.templates.some(template => typeof template !== "string")) throw new Error("templates are invalid");
          return json(identity.createInitialAgents(auth.principal.id, value.templates), 201);
        } catch { return json({ error: "invalid_templates" }, 400); }
      }

      if (url.pathname === "/v1/projects") {
        const auth = authenticated(request, identity, request.method !== "GET");
        if (auth instanceof Response) return auth;
        if (request.method === "GET") return json({ projects: identity.listProjects(auth.principal.id) });
        if (request.method === "POST") {
          try { const value = await body(request, maxRequestBytes); return json({ project: identity.createProject(auth.principal.id, String(value.name ?? "")) }, 201); } catch { return json({ error: "invalid_project" }, 400); }
        }
        return json({ error: "method_not_allowed" }, 405);
      }

      if (url.pathname === "/v1/agents") {
        const auth = authenticated(request, identity, request.method !== "GET");
        if (auth instanceof Response) return auth;
        if (request.method === "GET") return json({ agents: identity.listAgents(auth.principal.id, url.searchParams.get("projectId") ?? undefined) });
        if (request.method === "POST") {
          try { const value = await body(request, maxRequestBytes); return json({ agent: identity.createAgent(auth.principal.id, String(value.projectId ?? ""), String(value.name ?? ""), String(value.instructions ?? ""), String(value.icon ?? "")) }, 201); } catch (error) { return json({ error: error instanceof OwnershipError ? "forbidden" : "invalid_agent" }, error instanceof OwnershipError ? 403 : 400); }
        }
        return json({ error: "method_not_allowed" }, 405);
      }

      const agentPath = /^\/v1\/agents\/([^/]+)$/.exec(url.pathname);
      if (agentPath !== null) {
        const auth = authenticated(request, identity, request.method !== "GET");
        if (auth instanceof Response) return auth;
        const agentId = decodeURIComponent(agentPath[1] as string);
        if (request.method === "GET") {
          const agent = identity.getAgent(auth.principal.id, agentId);
          return agent === null ? json({ error: "not_found" }, 404) : json({ agent });
        }
        if (request.method === "DELETE") {
          try { identity.deleteAgent(auth.principal.id, agentId); return json({ deleted: true }); }
          catch (error) { return json({ error: error instanceof OwnershipError ? "forbidden" : "not_found" }, error instanceof OwnershipError ? 403 : 404); }
        }
        if (request.method !== "PATCH") return json({ error: "method_not_allowed" }, 405, { allow: "GET, PATCH, DELETE" });
        try {
          const value = await body(request, maxRequestBytes);
          return json({ agent: identity.updateAgent(auth.principal.id, agentId, parseAgentUpdate(value)) });
        } catch (error) {
          return json({ error: error instanceof OwnershipError ? "forbidden" : "invalid_agent" }, error instanceof OwnershipError ? 403 : 400);
        }
      }

      const effectiveAgentPath = /^\/v1\/agents\/([^/]+)\/effective$/.exec(url.pathname);
      if (effectiveAgentPath !== null && request.method === "GET") {
        const auth = authenticated(request, identity);
        if (auth instanceof Response) return auth;
        const agent = identity.getAgent(auth.principal.id, decodeURIComponent(effectiveAgentPath[1] as string));
        if (agent === null) return json({ error: "not_found" }, 404);
        const sessionId = url.searchParams.get("sessionId") ?? randomUUID();
        const projectId = url.searchParams.get("projectId") ?? agent.projectId;
        if (projectId !== agent.projectId) return json({ error: "forbidden" }, 403);
        const projectOverride = identity.getAgentProjectOverride(auth.principal.id, projectId, agent.id);
        const effectiveCapabilities = projectOverride?.capabilities ?? agent.capabilities;
        const enabledCapabilityIds = agent.capabilityMode === "legacy" && projectOverride?.capabilities === undefined
          ? (options.toolDefinitions ?? []).map(definition => definition.capabilityId ?? definition.name)
          : effectiveCapabilities.filter(item => item.enabled).map(item => item.capabilityId);
        const resolved = resolveAgentToolDescriptors(options.toolDefinitions ?? [], { userId: auth.principal.id, sessionId, projectId, agentId: agent.id, enabledCapabilityIds, agentPolicies: projectOverride?.permissions ?? agent.permissions });
        return json({ agent, model: projectOverride?.model ?? agent.model ?? (identity.providerConnection()?.model ?? "default"), reasoningEffort: projectOverride?.reasoningEffort ?? agent.reasoningEffort, capabilities: resolved.map(tool => ({ capabilityId: tool.capabilityId, name: tool.name, source: tool.source, policy: tool.policy })) });
      }

      if (url.pathname === "/v1/sessions" && request.method === "GET") {
        const auth = authenticated(request, identity);
        return auth instanceof Response ? auth : json({ sessions: identity.listSessions(auth.principal.id) });
      }

      const sessionPath = /^\/v1\/sessions\/([^/]+)$/.exec(url.pathname);
      if (sessionPath !== null && request.method === "GET") {
        const auth = authenticated(request, identity);
        if (auth instanceof Response) return auth;
        try {
          const sessionId = decodeURIComponent(sessionPath[1] as string);
          identity.assertSessionOwner(auth.principal.id, sessionId);
          const session = await sessions.getSession(sessionId);
          if (session === null) return json({ error: "not_found" }, 404);
          return json({ session, messages: await sessions.listMessages(sessionId) });
        } catch (error) {
          return json({ error: error instanceof OwnershipError ? "forbidden" : "not_found" }, error instanceof OwnershipError ? 403 : 404);
        }
      }

      if (url.pathname === "/v1/chat/completions") {
        if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, { allow: "POST" });
        const auth = authenticated(request, identity, true);
        if (auth instanceof Response) return auth;
        try {
           const value = await body(request, maxRequestBytes);
           const input = turnInput(value);
           const requestId = input.requestId ?? randomUUID();
           const idempotencyKey = request.headers.get("idempotency-key");
           if (idempotencyKey !== null && idempotencyKey.length === 0) {
             return json({ error: "idempotency_key_invalid" }, 400);
           }
           if (value.stream === true) {
             if (idempotencyKey !== null) {
               return json({ error: "idempotency_streaming_unsupported" }, 400);
             }
             const encoder = new TextEncoder();
            const turnController = new AbortController();
            const untrackTurn = trackTurn(turnController);
            let sequence = 0;
            let closed = false;
            const stream = new ReadableStream<Uint8Array>({
              start(controller) {
                void executeTurn(auth.principal, { ...input, requestId }, turnController.signal, event => {
                  if (!closed) controller.enqueue(encoder.encode(`data: ${eventJson(requestId, sequence++, event)}\n\n`));
                }).then(() => {
                  if (!closed) { closed = true; controller.enqueue(encoder.encode("data: [DONE]\n\n")); controller.close(); }
                }).catch(() => {
                  if (!closed) { closed = true; controller.enqueue(encoder.encode(`data: ${JSON.stringify({ protocol: "subpolar.v1", requestId, sequence: sequence++, type: "error", code: "request_failed" })}\n\n`)); controller.close(); }
                }).finally(untrackTurn);
              },
              cancel() { turnController.abort(); },
            });
            return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache", connection: "keep-alive" } });
           }
           const fingerprint = idempotencyKey === null
             ? undefined
             : requestFingerprint(auth.principal.id, input);
           if (idempotencyKey !== null && fingerprint !== undefined) {
             const claim = await sessions.claimIdempotency(idempotencyKey, fingerprint);
             if (claim.status === "replay") return json(claim.terminalPayload);
             if (claim.status === "pending") return json({ error: "idempotency_pending" }, 409);
           }
           const turnController = new AbortController();
          const untrackTurn = trackTurn(turnController);
           try {
             const result = await executeTurn(auth.principal, { ...input, requestId }, turnController.signal, () => undefined);
             if (idempotencyKey !== null && fingerprint !== undefined) {
               await sessions.completeIdempotency(idempotencyKey, fingerprint, result as JsonValue);
             }
             return json(result);
          } finally {
            untrackTurn();
          }
         } catch (error) {
           if (error instanceof IdempotencyConflictError) return json({ error: "idempotency_conflict" }, 409);
           return json({ error: error instanceof OwnershipError ? "forbidden" : "request_failed" }, error instanceof OwnershipError ? 403 : 400);
         }
      }

      if (options.staticRoot !== undefined) return serveStatic(request, { root: options.staticRoot });
      return json({ error: "not_found" }, 404);
    },
    websocket: {
      open(socket) {
        socketTurns.set(socket, new Map());
        socket.send(JSON.stringify({ protocol: "subpolar.v1", type: "connected" }));
      },
      message(socket, message) {
        const turns = socketTurns.get(socket) ?? new Map<string, AbortController>();
        socketTurns.set(socket, turns);
        void (async () => {
          try {
            const value: unknown = JSON.parse(typeof message === "string" ? message : new TextDecoder().decode(message));
            if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("message is invalid");
            const record = value as Record<string, unknown>;
            if (record.type === "permission_response") {
              if (typeof record.requestId !== "string" || typeof record.callId !== "string" || (record.decision !== "allow" && record.decision !== "deny")) throw new TypeError("permission response is invalid");
              const approvals = pendingApprovals.get(socket);
              const pending = approvals?.get(`${record.requestId}:${record.callId}`);
              if (pending === undefined) throw new TypeError("permission response is not pending");
              approvals?.delete(`${record.requestId}:${record.callId}`);
              pending.resolve(record.decision);
              return;
            }
            if (record.type === "chat.cancel" && typeof record.requestId === "string") { turns.get(record.requestId)?.abort(); return; }
            if (record.type !== "chat.start" || typeof record.requestId !== "string" || typeof record.csrfToken !== "string") throw new TypeError("message type is invalid");
             if (record.csrfToken !== identity.csrfToken(socket.data.token)) throw new AuthenticationError("CSRF validation failed");
             const requestId = record.requestId;
             const { type: _type, csrfToken: _csrfToken, ...chatRecord } = record;
             const input = turnInput(chatRecord);
            const controller = new AbortController();
            const untrackTurn = trackTurn(controller);
            turns.set(requestId, controller);
            try {
              let sequence = 0;
              const approvalPolicy: HarnessApprovalPolicy = approval => new Promise<"allow" | "deny">(resolveDecision => {
                const approvals = pendingApprovals.get(socket) ?? new Map();
                pendingApprovals.set(socket, approvals);
                const key = `${approval.requestId}:${approval.call.id}`;
                const finish = (decision: "allow" | "deny") => {
                  approvals.delete(key);
                  controller.signal.removeEventListener("abort", onAbort);
                  resolveDecision(decision);
                };
                const onAbort = () => finish("deny");
                approvals.set(key, { resolve: finish });
                controller.signal.addEventListener("abort", onAbort, { once: true });
                if (controller.signal.aborted) finish("deny");
              });
              await executeTurn(socket.data.principal, { ...input, requestId }, controller.signal, event => { socket.send(eventJson(requestId, sequence++, event)); }, approvalPolicy);
            } finally {
              const approvals = pendingApprovals.get(socket);
              for (const approval of approvals?.keys() ?? []) {
                if (approval.startsWith(`${requestId}:`)) approvals.get(approval)?.resolve("deny");
              }
              turns.delete(requestId);
              untrackTurn();
            }
          } catch (error) {
            socket.send(JSON.stringify({ protocol: "subpolar.v1", type: "error", code: error instanceof AuthenticationError ? "unauthorized" : "request_failed", message: "Request failed" }));
          }
        })();
      },
      close(socket) {
        for (const controller of socketTurns.get(socket)?.values() ?? []) controller.abort();
        for (const approval of pendingApprovals.get(socket)?.values() ?? []) approval.resolve("deny");
        pendingApprovals.delete(socket);
        socketTurns.delete(socket);
      },
    },
  });

  const waitForDrain = (): Promise<void> => new Promise(resolve => {
    const deadline = Date.now() + shutdownTimeoutMs;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      if (activeTurns.size === 0 || Date.now() >= deadline) {
        if (timer !== undefined) clearTimeout(timer);
        resolve();
      } else {
        timer = setTimeout(check, 10);
      }
    };
    check();
  });
  const shutdown = (): Promise<void> => {
    if (shutdownPromise !== undefined) return shutdownPromise;
    shutdownPromise = (async () => {
      void Promise.resolve(server.stop(false)).catch(() => undefined);
      for (const controller of activeTurns) controller.abort();
      await waitForDrain();
      try {
        await server.stop(true);
      } finally {
        sessions.close();
        identity.close();
      }
    })();
    return shutdownPromise;
  };
  return Object.assign(server, { shutdown });
}

if (import.meta.main) {
  const port = Number(process.env.SUBPOLAR_PORT ?? "8080");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("SUBPOLAR_PORT must be a valid TCP port");
  }
  const server = startApiGatewayServer({
    hostname: process.env.SUBPOLAR_HOST ?? "127.0.0.1",
    port,
    staticRoot: process.env.SUBPOLAR_STATIC_ROOT ?? resolve(process.cwd(), "packages/web-ui/dist"),
    ...(process.env.SUBPOLAR_DATA_DIR === undefined ? {} : { dataDir: process.env.SUBPOLAR_DATA_DIR }),
  });
  const shutdown = () => { void server.shutdown().then(() => process.exit(0)); };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}
