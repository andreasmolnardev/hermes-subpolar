import { createHash, randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { createGateway, createGatewayPersistenceAdapter, type GatewayProtocolEvent } from "./index";
import { createOpenAICompatibleProvider, type ChatProvider, type ProviderMessage } from "chat-provider-interface";
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
} from "data-layer";
import type { HarnessApprovalPolicy } from "harness";
import type { ToolDefinition, ToolPolicyInput } from "tool-resolver";
import { serveStatic } from "./static";
import { MODEL_PROVIDER_CATALOG, modelProvider } from "../../shared/src/model-providers";

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
type TurnInput = { readonly model: string; readonly messages: readonly ProviderMessage[]; readonly sessionId?: string; readonly projectId?: string; readonly agentId?: string; readonly requestId?: string };

const SESSION_COOKIE = "subpolar_session";
const CSRF_COOKIE = "subpolar_csrf";
const CHAT_REQUEST_FIELDS = new Set(["model", "messages", "sessionId", "projectId", "agentId", "requestId", "stream"]);

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
  return {
    model: body.model,
    messages: parseMessages(body.messages),
    ...(sessionId === undefined ? {} : { sessionId }),
    ...(projectId === undefined ? {} : { projectId }),
    ...(agentId === undefined ? {} : { agentId }),
    ...(requestId === undefined ? {} : { requestId }),
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
  let shutdownPromise: Promise<void> | undefined;

  const trackTurn = (controller: AbortController): (() => void) => {
    activeTurns.add(controller);
    return () => activeTurns.delete(controller);
  };

  const prepareTurn = async (principal: AuthenticatedPrincipal, input: TurnInput): Promise<{ input: TurnInput; sessionId: string }> => {
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
        return { input: { ...input, messages: [{ role: "system", content: agent.instructions }, ...input.messages] }, sessionId };
      }
    }
    return { input, sessionId };
  };

  const executeTurn = async (
    principal: AuthenticatedPrincipal,
    input: TurnInput,
    signal: AbortSignal,
    emit: (event: GatewayProtocolEvent) => void | Promise<void>,
  ): Promise<unknown> => {
    const prepared = await prepareTurn(principal, input);
    const connection = options.provider === undefined ? identity.providerConnection() : null;
    if (options.provider === undefined && connection === null) throw new Error("provider_not_configured");
    return gateway.executeRequest({
      model: prepared.input.model === "default" && connection !== null ? connection.model : prepared.input.model,
      messages: prepared.input.messages,
      toolPolicies: [],
      toolDefinitions: options.toolDefinitions ?? [],
      toolPolicyOverrides: options.toolPolicyOverrides ?? [],
      sessionId: prepared.sessionId,
      requestId: prepared.input.requestId ?? randomUUID(),
      signal,
      eventSink: emit,
      approvalPolicy: async approval => {
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
        if (options.approvalPolicy === undefined) {
          throw new Error("Explicit tool approval decision required");
        }
        const decision = await options.approvalPolicy(approval);
        if (decision !== "allow" && decision !== "deny") {
          throw new Error("Explicit tool approval decision required");
        }
        await sessions.resolvePendingApproval(approvalRequestId, decision, new Date().toISOString());
        return decision;
      },
    }, options.provider ?? (() => {
      // The connection has been validated above and is never returned to clients.
      const configured = connection as NonNullable<typeof connection>;
      return createOpenAICompatibleProvider({
        baseUrl: configured.baseUrl,
        credentialHandle: configured.credentialHandle,
        resolveCredentialHandle: handle => identity.resolveCredentialHandle(handle),
        fetch,
      });
    })());
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
              await executeTurn(socket.data.principal, { ...input, requestId }, controller.signal, event => { socket.send(eventJson(requestId, sequence++, event)); });
            } finally {
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
