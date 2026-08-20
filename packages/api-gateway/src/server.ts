import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createGateway, type GatewayProtocolEvent } from "./index";
import { createOpenAICompatibleProvider, type ChatProvider, type ProviderMessage } from "chat-provider-interface";
import {
  AuthenticationError,
  OwnershipError,
  SQLiteIdentityRepository,
  SQLiteSessionRepository,
  type AuthenticatedPrincipal,
  type AuthSession,
  type JsonValue,
  type SessionRecord,
} from "data-layer";
import { serveStatic } from "./static";
import { MODEL_PROVIDER_CATALOG, modelProvider } from "@hermes/shared/model-providers";
import { resolveAgentToolDescriptors, type PermissionMode, type ToolDefinition } from "tool-resolver";
import type { HarnessApprovalPolicy } from "harness";

export type ApiGatewayServerOptions = {
  readonly provider?: ChatProvider;
  readonly hostname?: string;
  readonly port?: number;
  readonly staticRoot?: string;
  readonly maxRequestBytes?: number;
  readonly dataDir?: string;
  readonly drainTimeoutMs?: number;
  /** Server-owned runtime tools. Agent records only reference these by ID. */
  readonly toolDefinitions?: readonly ToolDefinition[];
};

export type ApiGatewayServer = ReturnType<typeof Bun.serve> & {
  shutdown(): Promise<void>;
};

type WebSocketData = { readonly principal: AuthenticatedPrincipal; readonly token: string };
type TurnInput = { readonly model: string; readonly messages: readonly ProviderMessage[]; readonly sessionId?: string; readonly projectId?: string; readonly agentId?: string; readonly requestId?: string; readonly permissionMode?: PermissionMode };

const SESSION_COOKIE = "subpolar_session";
const CSRF_COOKIE = "subpolar_csrf";

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
  if (typeof body.model !== "string" || !body.model.trim()) throw new TypeError("model must be a non-empty string");
  const stringField = (key: string): string | undefined => body[key] === undefined ? undefined : typeof body[key] === "string" && body[key] ? body[key] : (() => { throw new TypeError(`${key} is invalid`); })();
  const sessionId = stringField("sessionId");
  const projectId = stringField("projectId");
  const agentId = stringField("agentId");
  const requestId = stringField("requestId");
  const permissionMode = body.permissionMode;
  if (permissionMode !== undefined && permissionMode !== "full" && permissionMode !== "ask" && permissionMode !== "read-only") throw new TypeError("permissionMode is invalid");
  return {
    model: body.model,
    messages: parseMessages(body.messages),
    ...(sessionId === undefined ? {} : { sessionId }),
    ...(projectId === undefined ? {} : { projectId }),
    ...(agentId === undefined ? {} : { agentId }),
    ...(requestId === undefined ? {} : { requestId }),
    ...(permissionMode === undefined ? {} : { permissionMode }),
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
  if (value === null || typeof value !== "object") {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) throw new TypeError("value is not JSON serializable");
    return serialized;
  }
  if (Array.isArray(value)) return `[${value.map(item => canonicalJson(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

function requestFingerprint(ownerId: string, input: TurnInput, stream: boolean): string {
  const normalized = {
    ownerId,
    request: {
      model: input.model.trim(),
      messages: input.messages,
      ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
      ...(input.projectId === undefined ? {} : { projectId: input.projectId }),
      ...(input.agentId === undefined ? {} : { agentId: input.agentId }),
      ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
      stream,
    },
  };
  return createHash("sha256").update(canonicalJson(normalized), "utf8").digest("hex");
}

function jsonValue(value: unknown): JsonValue {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new TypeError("response is not JSON serializable");
  return JSON.parse(serialized) as JsonValue;
}

export function startApiGatewayServer(options: ApiGatewayServerOptions): ApiGatewayServer {
  const maxRequestBytes = options.maxRequestBytes ?? 1_048_576;
  if (!Number.isInteger(maxRequestBytes) || maxRequestBytes < 1) throw new TypeError("maxRequestBytes must be positive");
  const drainTimeoutMs = options.drainTimeoutMs ?? 10_000;
  if (!Number.isInteger(drainTimeoutMs) || drainTimeoutMs < 0) throw new TypeError("drainTimeoutMs must be a non-negative integer");
  const dataDir = options.dataDir ?? mkdtempSync(join(tmpdir(), "api-gateway-"));
  const databasePath = join(dataDir, "state.db");
  const sessions = new SQLiteSessionRepository(databasePath);
  const identity = new SQLiteIdentityRepository(databasePath);
  const gateway = createGateway({ sessionRepository: sessions });
  type ActiveTurn = { readonly controller: AbortController; readonly promise: Promise<unknown> };
  type ActiveSocket = { close(code?: number, reason?: string): void };
  type ActiveSseStream = { close(): void };
  const activeTurns = new Set<ActiveTurn>();
  const activeSseStreams = new Set<ActiveSseStream>();
  const activeSockets = new Set<ActiveSocket>();
  const websocketTurns = new Map<object, Map<string, AbortController>>();
  const websocketApprovals = new Map<object, Map<string, (decision: "allow" | "deny") => void>>();
  let lifecycleState: "accepting" | "draining" | "stopped" = "accepting";
  let shutdownPromise: Promise<void> | undefined;
  let server: ReturnType<typeof Bun.serve>;

  const prepareTurn = async (principal: AuthenticatedPrincipal, input: TurnInput): Promise<{ input: TurnInput; sessionId: string; tools: readonly ToolDefinition[]; agentModel?: string }> => {
    const sessionId = input.sessionId ?? randomUUID();
    const existing = await sessions.getSession(sessionId);
    if (existing !== null) {
      identity.assertSessionOwner(principal.id, sessionId);
    } else {
      identity.claimSession(principal.id, sessionId, input.projectId, input.agentId);
      await sessions.createSession(sessionRecord(sessionId, input.projectId, input.model));
    }
    if (input.agentId !== undefined) {
      const agent = identity.getAgent(principal.id, input.agentId);
      if (agent === null) throw new OwnershipError("Agent is not owned by the authenticated user");
      const hasSystem = input.messages.some(message => message.role === "system");
      if (!hasSystem && agent.instructions.trim()) {
        const tools = resolveAgentToolDescriptors(options.toolDefinitions ?? [], { userId: principal.id, sessionId, projectId: input.projectId, agentId: agent.id, enabledCapabilityIds: agent.capabilities.filter(item => item.enabled).map(item => item.capabilityId), agentPolicies: agent.permissions, sessionMode: input.permissionMode });
        return { input: { ...input, messages: [{ role: "system", content: agent.instructions }, ...input.messages] }, sessionId, tools, ...(agent.model === undefined ? {} : { agentModel: agent.model }) };
      }
      const tools = resolveAgentToolDescriptors(options.toolDefinitions ?? [], { userId: principal.id, sessionId, projectId: input.projectId, agentId: agent.id, enabledCapabilityIds: agent.capabilities.filter(item => item.enabled).map(item => item.capabilityId), agentPolicies: agent.permissions, sessionMode: input.permissionMode });
      return { input, sessionId, tools, ...(agent.model === undefined ? {} : { agentModel: agent.model }) };
    }
    return { input, sessionId, tools: [] };
  };

  const executeTurn = async (
    principal: AuthenticatedPrincipal,
    input: TurnInput,
    signal: AbortSignal,
    emit: (event: GatewayProtocolEvent) => void | Promise<void>,
    approvalPolicy?: HarnessApprovalPolicy,
  ): Promise<unknown> => {
    const prepared = await prepareTurn(principal, input);
    const connection = options.provider === undefined ? identity.providerConnection() : null;
    if (options.provider === undefined && connection === null) throw new Error("provider_not_configured");
    return gateway.executeRequest({
      model: prepared.input.model === "default" ? prepared.agentModel ?? connection?.model ?? "default" : prepared.input.model,
      messages: prepared.input.messages,
      toolPolicies: prepared.tools,
      sessionId: prepared.sessionId,
      requestId: prepared.input.requestId ?? randomUUID(),
      signal,
      eventSink: emit,
      ...(approvalPolicy === undefined ? {} : { approvalPolicy }),
    }, options.provider ?? (() => {
      // The connection has been validated above and is never returned to clients.
      const configured = connection as NonNullable<typeof connection>;
      return createOpenAICompatibleProvider({ baseUrl: configured.baseUrl, credentials: { apiKey: configured.apiKey }, fetch });
    })());
  };

  const runTurn = (
    principal: AuthenticatedPrincipal,
    input: TurnInput,
    controller: AbortController,
    emit: (event: GatewayProtocolEvent) => void | Promise<void>,
    approvalPolicy?: HarnessApprovalPolicy,
  ): Promise<unknown> => {
    const promise = executeTurn(principal, input, controller.signal, emit, approvalPolicy);
    const active: ActiveTurn = { controller, promise };
    activeTurns.add(active);
    void promise.then(
      () => activeTurns.delete(active),
      () => activeTurns.delete(active),
    );
    return promise;
  };

  const shutdown = (): Promise<void> => {
    if (shutdownPromise !== undefined) return shutdownPromise;
    shutdownPromise = (async () => {
      lifecycleState = "draining";
      try {
        for (const active of activeTurns) active.controller.abort();
        for (const stream of activeSseStreams) stream.close();
        for (const socket of activeSockets) {
          try { socket.close(1001, "server shutting down"); } catch { /* The socket may already be closed. */ }
        }

        const active = [...activeTurns];
        if (active.length > 0) {
          const drained = Promise.all(active.map(turn => turn.promise.then(() => undefined, () => undefined)));
          await new Promise<void>(resolve => {
            const timeout = setTimeout(resolve, drainTimeoutMs);
            void drained.then(() => {
              clearTimeout(timeout);
              resolve();
            });
          });
        }
        server.stop(false);
      } finally {
        try {
          sessions.close();
        } finally {
          identity.close();
          lifecycleState = "stopped";
        }
      }
    })();
    return shutdownPromise;
  };

  server = Bun.serve<WebSocketData>({
    hostname: options.hostname ?? "127.0.0.1",
    port: options.port ?? 8080,
    async fetch(request, serverInstance) {
      const url = new URL(request.url);
      if (request.method === "GET" && url.pathname === "/api/health") return json({ status: "ok" });
      if (request.method === "GET" && url.pathname === "/api/ready") {
        return lifecycleState === "accepting" ? json({ status: "ready" }) : json({ status: "not_ready" }, 503);
      }
      if (lifecycleState !== "accepting") return json({ error: "server_draining" }, 503);

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

      if (url.pathname === "/v1/setup/providers" && request.method === "GET") {
        const auth = authenticated(request, identity);
        return auth instanceof Response ? auth : json({ providers: MODEL_PROVIDER_CATALOG });
      }

      if (url.pathname === "/v1/setup/provider" && request.method === "POST") {
        const auth = authenticated(request, identity, true);
        if (auth instanceof Response) return auth;
        try {
          const value = await body(request, maxRequestBytes);
          const provider = String(value.provider ?? "openai-api");
          if (modelProvider(provider) === undefined) throw new Error("provider is invalid");
          identity.configureProvider(provider, String(value.baseUrl ?? ""), String(value.apiKey ?? ""), String(value.model ?? ""));
          return json({ configured: true });
        } catch { return json({ error: "invalid_provider" }, 400); }
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
          try { const value = await body(request, maxRequestBytes); return json({ agent: identity.createAgent(auth.principal.id, String(value.projectId ?? ""), String(value.name ?? ""), String(value.instructions ?? "")) }, 201); } catch (error) { return json({ error: error instanceof OwnershipError ? "forbidden" : "invalid_agent" }, error instanceof OwnershipError ? 403 : 400); }
        }
        return json({ error: "method_not_allowed" }, 405);
      }

      if (url.pathname === "/v1/capabilities" && request.method === "GET") {
        const auth = authenticated(request, identity);
        if (auth instanceof Response) return auth;
        // Definitions are server-owned; never disclose executable handles.
        return json({ capabilities: (options.toolDefinitions ?? []).map(tool => ({ id: tool.name, source: tool.source, description: tool.description, capabilities: tool.capabilities ?? {} })) });
      }

      const effectiveAgentPath = /^\/v1\/agents\/([^/]+)\/effective$/.exec(url.pathname);
      if (effectiveAgentPath !== null && request.method === "GET") {
        const auth = authenticated(request, identity);
        if (auth instanceof Response) return auth;
        const agent = identity.getAgent(auth.principal.id, decodeURIComponent(effectiveAgentPath[1] as string));
        if (agent === null) return json({ error: "not_found" }, 404);
        const mode = url.searchParams.get("permissionMode");
        if (mode !== null && mode !== "full" && mode !== "ask" && mode !== "read-only") return json({ error: "invalid_permission_mode" }, 400);
        const tools = resolveAgentToolDescriptors(options.toolDefinitions ?? [], { userId: auth.principal.id, projectId: agent.projectId, agentId: agent.id, enabledCapabilityIds: agent.capabilities.filter(item => item.enabled).map(item => item.capabilityId), agentPolicies: agent.permissions, ...(mode === null ? {} : { sessionMode: mode }) });
        return json({ agentId: agent.id, model: agent.model, reasoningEffort: agent.reasoningEffort, skillIds: agent.skillIds, tools: tools.map(tool => ({ id: tool.name, source: tool.source, policy: tool.policy })) });
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
        if (request.method === "PATCH") {
          try {
            const value = await body(request, maxRequestBytes);
            const string = (key: string): string | undefined => value[key] === undefined ? undefined : typeof value[key] === "string" ? value[key] : (() => { throw new Error("invalid agent"); })();
            const capabilities = value.capabilities === undefined ? undefined : Array.isArray(value.capabilities) ? value.capabilities.map(item => {
              if (typeof item !== "object" || item === null || typeof (item as Record<string, unknown>).capabilityId !== "string" || typeof (item as Record<string, unknown>).enabled !== "boolean") throw new Error("invalid agent");
              return { capabilityId: (item as Record<string, unknown>).capabilityId as string, enabled: (item as Record<string, unknown>).enabled as boolean };
            }) : (() => { throw new Error("invalid agent"); })();
            const permissions = value.permissions === undefined ? undefined : Array.isArray(value.permissions) ? value.permissions.map(item => {
              if (typeof item !== "object" || item === null || typeof (item as Record<string, unknown>).capabilityId !== "string" || !["allow", "ask", "deny"].includes(String((item as Record<string, unknown>).policy))) throw new Error("invalid agent");
              return { capabilityId: (item as Record<string, unknown>).capabilityId as string, policy: (item as Record<string, unknown>).policy as "allow" | "ask" | "deny" };
            }) : (() => { throw new Error("invalid agent"); })();
            const skillIds = value.skillIds === undefined ? undefined : Array.isArray(value.skillIds) && value.skillIds.every(item => typeof item === "string") ? value.skillIds as string[] : (() => { throw new Error("invalid agent"); })();
            return json({ agent: identity.updateAgent(auth.principal.id, agentId, { name: string("name"), description: string("description"), icon: string("icon"), instructions: string("instructions"), model: string("model"), reasoningEffort: string("reasoningEffort"), capabilities, permissions, skillIds }) });
          } catch (error) { return json({ error: error instanceof OwnershipError ? "forbidden" : "invalid_agent" }, error instanceof OwnershipError ? 403 : 400); }
        }
        if (request.method === "DELETE") { try { identity.deleteAgent(auth.principal.id, agentId); return json({ deleted: true }); } catch { return json({ error: "not_found" }, 404); } }
        return json({ error: "method_not_allowed" }, 405);
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
          if (lifecycleState !== "accepting") return json({ error: "server_draining" }, 503);
          const input = turnInput(value);
          const requestId = input.requestId ?? randomUUID();
          const idempotencyKey = request.headers.get("Idempotency-Key");
          if (value.stream === true) {
            if (idempotencyKey !== null) return json({ error: "idempotency_not_supported_for_streaming" }, 400);
            const encoder = new TextEncoder();
            const turnController = new AbortController();
            let sequence = 0;
            let closed = false;
            let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
            let activeStream: ActiveSseStream | undefined;
            const closeStream = () => {
              if (closed) return;
              closed = true;
              turnController.abort();
              try { streamController?.close(); } catch { /* The client may have cancelled the stream. */ }
              if (activeStream !== undefined) activeSseStreams.delete(activeStream);
            };
            const stream = new ReadableStream<Uint8Array>({
              start(controller) {
                streamController = controller;
                activeStream = { close: closeStream };
                activeSseStreams.add(activeStream);
                void runTurn(auth.principal, { ...input, requestId }, turnController, event => {
                  if (!closed) controller.enqueue(encoder.encode(`data: ${eventJson(requestId, sequence++, event)}\n\n`));
                }).then(() => {
                  if (!closed) { closed = true; controller.enqueue(encoder.encode("data: [DONE]\n\n")); controller.close(); }
                }, () => {
                  if (!closed) { closed = true; controller.enqueue(encoder.encode(`data: ${JSON.stringify({ protocol: "subpolar.v1", requestId, sequence: sequence++, type: "error", code: "request_failed" })}\n\n`)); controller.close(); }
                }).then(() => {
                  if (activeStream !== undefined) activeSseStreams.delete(activeStream);
                }, () => {
                  if (activeStream !== undefined) activeSseStreams.delete(activeStream);
                });
              },
              cancel: closeStream,
            });
            return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache", connection: "keep-alive" } });
          }
          const idempotency = idempotencyKey === null ? undefined : {
            scope: `${auth.principal.id}:POST:/v1/chat/completions`,
            key: idempotencyKey,
            requestHash: requestFingerprint(auth.principal.id, input, false),
          };
          let claimedIdempotency: typeof idempotency = undefined;
          if (idempotency !== undefined) {
            const claim = await sessions.claimIdempotency({
              ...idempotency,
              createdAt: new Date().toISOString(),
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            });
            if (claim.status === "mismatch") return json({ error: "idempotency_conflict" }, 409);
            if (claim.status === "in_progress") return json({ error: "idempotency_in_progress" }, 409);
            if (claim.status === "replay") return json(claim.response, claim.record.statusCode);
            claimedIdempotency = idempotency;
          }
          let result: unknown;
          try {
            result = await runTurn(auth.principal, { ...input, requestId }, new AbortController(), () => undefined);
          } catch (error) {
            const status = error instanceof OwnershipError ? 403 : 400;
            const response = { error: error instanceof OwnershipError ? "forbidden" : "request_failed" } as const;
            if (claimedIdempotency !== undefined) {
              await sessions.completeIdempotency({ ...claimedIdempotency, state: "failed", statusCode: status, response });
            }
            return json(response, status);
          }
          if (claimedIdempotency === undefined) return json(result);
          const response = jsonValue(result);
          await sessions.completeIdempotency({ ...claimedIdempotency, state: "completed", statusCode: 200, response });
          return json(response);
        } catch (error) {
          return json({ error: error instanceof OwnershipError ? "forbidden" : "request_failed" }, error instanceof OwnershipError ? 403 : 400);
        }
      }

      if (options.staticRoot !== undefined) return serveStatic(request, { root: options.staticRoot });
      return json({ error: "not_found" }, 404);
    },
    websocket: {
      open(socket) {
        activeSockets.add(socket);
        websocketTurns.set(socket, new Map());
        websocketApprovals.set(socket, new Map());
        socket.send(JSON.stringify({ protocol: "subpolar.v1", type: "connected" }));
      },
      message(socket, message) {
        if (lifecycleState !== "accepting") return;
        const turns = websocketTurns.get(socket) ?? new Map<string, AbortController>();
        websocketTurns.set(socket, turns);
        const approvals = websocketApprovals.get(socket) ?? new Map<string, (decision: "allow" | "deny") => void>();
        websocketApprovals.set(socket, approvals);
        void (async () => {
          try {
            const value: unknown = JSON.parse(typeof message === "string" ? message : new TextDecoder().decode(message));
            if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("message is invalid");
            const record = value as Record<string, unknown>;
            if (record.type === "chat.cancel" && typeof record.requestId === "string") { turns.get(record.requestId)?.abort(); return; }
            if (record.type === "approval.respond" && typeof record.callId === "string" && (record.decision === "allow" || record.decision === "deny")) { approvals.get(record.callId)?.(record.decision); return; }
            if (record.type !== "chat.start" || typeof record.requestId !== "string" || typeof record.csrfToken !== "string") throw new TypeError("message type is invalid");
            if (record.csrfToken !== identity.csrfToken(socket.data.token)) throw new AuthenticationError("CSRF validation failed");
            const requestId = record.requestId;
            const input = turnInput(record);
            const controller = new AbortController();
            turns.set(requestId, controller);
            let sequence = 0;
            try {
              const approvalPolicy: HarnessApprovalPolicy = request => new Promise(resolveApproval => {
                approvals.set(request.call.id, decision => { approvals.delete(request.call.id); resolveApproval(decision); });
                request.signal.addEventListener("abort", () => { approvals.delete(request.call.id); resolveApproval("deny"); }, { once: true });
              });
              await runTurn(socket.data.principal, { ...input, requestId }, controller, event => { socket.send(eventJson(requestId, sequence++, event)); }, approvalPolicy);
            } finally {
              turns.delete(requestId);
              for (const resolveApproval of approvals.values()) resolveApproval("deny");
            }
          } catch (error) {
            try { socket.send(JSON.stringify({ protocol: "subpolar.v1", type: "error", code: error instanceof AuthenticationError ? "unauthorized" : "request_failed", message: "Request failed" })); } catch { /* The socket may be closing during shutdown. */ }
          }
        })();
      },
      close(socket) {
        for (const controller of websocketTurns.get(socket)?.values() ?? []) controller.abort();
        websocketTurns.delete(socket);
        const approvals = websocketApprovals.get(socket);
        for (const resolveApproval of approvals?.values() ?? []) resolveApproval("deny");
        websocketApprovals.delete(socket);
        activeSockets.delete(socket);
      },
    },
  });
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
  const shutdown = () => { void server.shutdown().then(() => process.exit(0), () => process.exit(1)); };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
