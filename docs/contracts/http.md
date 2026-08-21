# HTTP Contract

This is the public HTTP contract for the Bun Subpolar gateway. The browser API
is rooted at `/v1`. The two `/api` paths are operational probes only.

## Transport Rules

- JSON requests use `Content-Type: application/json` and JSON responses use
  `application/json; charset=utf-8`.
- JSON responses are `Cache-Control: no-store`.
- Request bodies are limited to 1 MiB by the server default. An embedding may
  choose a different positive integer limit.
- Authentication is a browser session cookie. There is no bearer-token
  contract.
- Every error body is an object with one stable public field: `{ "error":
  "code" }`. Error messages and provider diagnostics are not public fields.
- IDs are opaque non-empty strings. Timestamps are ISO 8601 strings.

## Public Paths

| Method | Path | Auth | CSRF/origin | Result |
| --- | --- | --- | --- | --- |
| GET | `/api/health` | no | none | `{status:"ok"}` |
| GET | `/api/ready` | no | none | `{status:"ready"}` |
| GET | `/v1/auth/bootstrap` | no | none | `{required:boolean}` |
| POST | `/v1/auth/bootstrap` | no | origin | Create first user and session |
| POST | `/v1/auth/login` | no | origin | Create session |
| POST | `/v1/auth/logout` | session | origin + CSRF | Revoke current session |
| POST | `/v1/auth/password` | session | origin + CSRF | Rotate password and session |
| GET | `/v1/me` | session | none | `{user}` |
| GET | `/v1/setup` | session | none | Setup status |
| GET | `/v1/setup/providers` | session | none | Provider catalog |
| POST | `/v1/setup/provider` | session | origin + CSRF | Store provider connection |
| POST | `/v1/setup/agents` | session | origin + CSRF | Create initial agents |
| GET | `/v1/projects` | session | none | `{projects}` |
| POST | `/v1/projects` | session | origin + CSRF | Create a project |
| GET | `/v1/agents` | session | none | `{agents}` |
| POST | `/v1/agents` | session | origin + CSRF | Create an agent |
| GET | `/v1/integrations` | session | none | `{integrations}` without secrets |
| POST | `/v1/integrations` | session | origin + CSRF | Create MCP/OpenAPI integration |
| GET/PATCH/DELETE | `/v1/integrations/{integrationId}` | session | read / origin + CSRF | Manage an integration |
| POST | `/v1/integrations/{integrationId}/test` | session | origin + CSRF | Rediscover capabilities |
| GET | `/v1/integrations/{integrationId}/oauth/start` | session | none | Begin MCP OAuth; server-bound state protects the flow |
| GET | `/v1/integrations/{integrationId}/oauth/callback` | session | state | Complete MCP OAuth |
| POST | `/v1/integrations/{integrationId}/oauth/revoke` | session | origin + CSRF | Revoke MCP OAuth |
| GET | `/v1/sessions` | session | none | `{sessions}` |
| GET | `/v1/sessions/{sessionId}` | session | none | `{session,messages}` |
| POST | `/v1/chat/completions` | session | origin + CSRF | One completion or SSE |
| GET | `/v1/ws` | session | origin | WebSocket upgrade |

Paths outside this table are not part of the product contract. Static assets
may be served by an embedding when a static root is configured, but they are
not API routes.

## Identity And Workspace Records

The following response shapes are stable at the HTTP boundary:

```ts
type User = { id: string; username: string };
type Project = {
  id: string; ownerId: string; name: string; createdAt: string;
};
type Agent = {
  id: string; ownerId: string; projectId: string; name: string;
  instructions: string; createdAt: string;
};
type OwnedSession = {
  sessionId: string; ownerId: string; projectId?: string;
  agentId?: string; createdAt: string;
};
```

`GET /v1/agents` accepts the optional `projectId` query parameter. All listed
projects, agents, and sessions are filtered to the authenticated user. A
cross-owner reference is forbidden rather than reinterpreted as a new object.

## Authentication Requests

`POST /v1/auth/bootstrap` accepts `{username,password}` and returns `201` with
`{user,expiresAt}`. It succeeds only while no user exists. The username must
contain at least three characters after trimming and the password must contain
at least eight characters.

`POST /v1/auth/login` accepts the same shape and returns `200` with
`{user,expiresAt}`. `POST /v1/auth/password` accepts
`{currentPassword,newPassword}` and returns the same shape after rotating all
sessions and issuing a new one.

`POST /v1/auth/logout` returns `{ok:true}` and clears both auth cookies.

## Setup Requests

`POST /v1/setup/provider` accepts `{provider,baseUrl,apiKey,model}` and returns
`{configured:true}`. `POST /v1/setup/agents` accepts
`{templates:string[]}` and returns `{project,agents}`. The currently supported
initial template is `research`; the `master` agent is always created when
needed.

`POST /v1/projects` accepts `{name}`. `POST /v1/agents` accepts
`{projectId,name,instructions}`. Creation returns the wrapped record with `201`.

## Integrations

Integrations are owner-scoped global configuration. Supported initial types are
`mcp` with `http`/streamable HTTP or `stdio` transport, and `openapi`. The
configuration response contains normalized capability metadata, status, and
discovery timestamps, but never secret values. Agents store only selected
capability IDs; `/v1/capabilities` exposes the discovered definitions that the
resolver can enforce at runtime.

Create and update requests use `{name,type,enabled,config,secrets}`. `secrets`
may contain MCP environment values or headers, bearer/API-key values, and OAuth
client secrets. They are encrypted server-side and are write-only. OAuth state
is server-bound, short-lived, owner-bound, and single-use.

## Chat Requests

The request shape is:

```ts
type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};
type ChatRequest = {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  sessionId?: string;
  projectId?: string;
  agentId?: string;
  requestId?: string;
};
```

`messages` must be non-empty. `model` and every supplied ID must be a
non-empty string. A missing `sessionId` creates a new owner-scoped session.
`model: "default"` selects the configured setup model.

When `stream` is absent or not exactly `true`, the response is the provider
result envelope:

```ts
type Completion = {
  message: {
    role: "system" | "user" | "assistant" | "tool";
    content: string | unknown[];
    reasoning?: string;
    toolCalls?: unknown[];
    toolCallId?: string;
    name?: string;
    metadata?: Record<string, unknown>;
  };
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens?: number;
    cachedInputTokens?: number;
    reasoningTokens?: number;
    cacheCreationInputTokens?: number;
    cacheReadInputTokens?: number;
  };
  finishReason?: string;
  reasoning?: string;
  toolResults?: unknown[];
  requestId?: string;
  identity?: { requestId: string; attempt?: number; parentRequestId?: string };
  metadata?: Record<string, unknown>;
};
```

The gateway preserves provider-neutral message roles, usage, request identity,
metadata, and prompt-cache hints at the internal boundary. It does not expose
provider credentials.

When `stream:true`, the response is `text/event-stream; charset=utf-8`. Each
event is a `data:` record described in [websocket.md](websocket.md); the stream
ends with `data: [DONE]`. SSE is an HTTP transport for the same protocol event
payloads, not a second event schema.

## Status And Errors

| Status | Codes used by the implementation |
| --- | --- |
| 400 | `bootstrap_failed`, `invalid_provider`, `invalid_templates`, `invalid_project`, `invalid_agent`, `request_failed`, `upgrade_failed` |
| 401 | `unauthorized`, `invalid_credentials` |
| 403 | `origin_rejected`, `csrf_rejected`, `forbidden` |
| 404 | `not_found` |
| 405 | `method_not_allowed` |

Malformed JSON, oversized bodies, invalid chat input, missing provider setup,
and provider execution failures currently collapse to the route's documented
`400` error code. This intentionally keeps diagnostics out of the browser
contract; richer classification belongs behind the provider boundary.
