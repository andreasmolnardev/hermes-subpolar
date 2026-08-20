# HTTP REST Contract

The public browser API is same-origin JSON under `/v1`. There are no supported
legacy `/api` routes and no unversioned resource routes. A missing `/v1` route
returns the typed `not_found` error; it MUST NOT fall through to the SPA.

## Common HTTP Rules

- The server MUST set `Content-Type: application/json; charset=utf-8` for JSON and `Cache-Control: no-store` for authenticated responses.
- JSON request bodies MUST be UTF-8 objects with a configured byte limit. Unknown object keys are rejected.
- State-changing requests MUST use `Origin`, `X-CSRF-Token`, and `Idempotency-Key` as required by [authentication](authentication.md) and [persistence](persistence.md).
- `X-Request-Id` is an optional client UUIDv4. The server generates one when absent and returns it in the error envelope and `X-Request-Id` response header.
- `Content-Length` and the actual decoded body size are checked before JSON parsing.
- `GET` list endpoints use `limit` (integer, 1 through 100) and opaque `cursor`. A list response is `{ "items": [...], "nextCursor": string | null }`.

## Resources

| Method | Path | Authentication | Result |
| --- | --- | --- | --- |
| `GET` | `/v1/health` | none | `{ "status": "ok" }` |
| `GET` | `/v1/ready` | none | `{ "status": "ready" }` or typed unavailable error |
| `GET` | `/v1/auth/bootstrap` | none | `{ "required": boolean }` |
| `POST` | `/v1/auth/bootstrap` | exact origin | Creates first administrator and session; `201` |
| `POST` | `/v1/auth/login` | exact origin | Creates session; `200` |
| `POST` | `/v1/auth/logout` | session, CSRF | Revokes session; `{ "ok": true }` |
| `POST` | `/v1/auth/password` | session, CSRF | Rotates password and session |
| `GET` | `/v1/me` | session | `{ "user": User }` |
| `GET` | `/v1/setup` | session | Setup status without secrets |
| `GET` | `/v1/setup/providers` | session | Supported provider metadata only |
| `POST` | `/v1/setup/provider` | session, CSRF | Stores a validated provider connection; secret is write-only |
| `POST` | `/v1/setup/agents` | session, CSRF | Creates initial agents; `201` |
| `GET` | `/v1/projects` | session | Owned project list |
| `POST` | `/v1/projects` | session, CSRF | Creates owned project; `201` |
| `GET` | `/v1/agents` | session | Owned agent list; optional `projectId` filter |
| `POST` | `/v1/agents` | session, CSRF | Creates owned agent; `201` |
| `GET` | `/v1/sessions` | session | Owned session list |
| `GET` | `/v1/sessions/{sessionId}` | session | Owned session and typed messages |
| `POST` | `/v1/chat/completions` | session, CSRF | One normalized turn, JSON or SSE |
| `GET` | `/v1/ws` | session, exact origin | WebSocket upgrade; see [WebSocket](websocket.md) |

`User`, `Project`, `Agent`, `Session`, and `Message` are closed objects with
server-generated IDs and timestamps. Their domain records are:

```text
Project = { id: UUID, name: string, createdAt: Timestamp }
Agent = { id: UUID, projectId: UUID, name: string, instructions: string, createdAt: Timestamp }
Session = { id: UUID, projectId: UUID, status: active | completed | failed | cancelled, createdAt: Timestamp, updatedAt: Timestamp }
Message = { id: UUID, sessionId: UUID, sequence: positive integer, role: system | user | assistant | tool, content: JsonValue, createdAt: Timestamp }
```

Responses MUST omit fields not applicable to the record rather than invent an
untyped value. Ownership fields such as `ownerId` are not public response
fields.

## Chat

The request is a closed object:

```json
{
  "model": "model-id",
  "messages": [
    { "role": "user", "content": "Hello" }
  ],
  "sessionId": "018f2b9d-5d6f-4c34-a8f7-0f61f3df0a9c",
  "projectId": "018f2b9d-5d6f-4c34-a8f7-0f61f3df0a9d",
  "agentId": "018f2b9d-5d6f-4c34-a8f7-0f61f3df0a9e",
  "stream": false
}
```

`model` and `messages` are required. Message roles are `system`, `user`, or
`assistant`; content is a string in the initial REST surface. The server may
prepend the owned agent's system instructions, but never accepts a client
instruction as a server policy override.

For `stream: false`, the response is a typed completion containing `requestId`,
`sessionId`, `message`, `finishReason`, and optional finite usage counters. For
`stream: true`, the response is `text/event-stream`; each `data:` record is the
WebSocket event envelope from [WebSocket](websocket.md), in the same order,
followed by exactly one `data: [DONE]` record after a terminal event.

## Change Log

- Wave 0: froze the clean `/v1` surface, typed errors, request IDs, cursors,
  idempotency requirements, and SSE projection.
- The root `openapi.json` remains intentionally unchanged because it does not
  describe this surface without retaining legacy routes.
