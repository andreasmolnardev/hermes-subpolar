# WebSocket Contract

The Bun gateway exposes one browser WebSocket at `/v1/ws`. It is an
authenticated, owner-scoped transport for chat turns. The URL is normally the
same origin as the browser application, with `http` changed to `ws` or `https`
changed to `wss`.

## Upgrade

The upgrade must be a `GET` with:

- a valid `subpolar_session` cookie;
- an `Origin` header exactly equal to the origin parsed from the request URL.

The server rejects a missing or mismatched origin with `403
origin_rejected`, and an invalid session with `401 unauthorized`. The browser
session cookie is `HttpOnly`; the separate `subpolar_csrf` cookie is readable by
the browser and is used in the first message.

## Message Types

Start a turn with:

```ts
type ChatStart = {
  type: "chat.start";
  csrfToken: string;
  requestId: string;
  model: string;
  messages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }>;
  sessionId?: string;
  projectId?: string;
  agentId?: string;
};
```

`csrfToken` must equal the CSRF token bound to the authenticated session.
`requestId` identifies the turn and is required for correlation. The remaining
validation is the same as the HTTP chat request.

Cancel a turn with:

```ts
type ChatCancel = { type: "chat.cancel"; requestId: string };
```

Cancellation has no acknowledgement message. It aborts work if that request
is active. Closing the socket aborts all active turns on that socket.

## Envelope

After opening, the server sends:

```ts
type Connected = { protocol: "subpolar.v1"; type: "connected" };
```

Turn events use this envelope:

```ts
type EventEnvelope = {
  protocol: "subpolar.v1";
  requestId: string;
  sequence: number;
  event: GatewayEvent;
};
```

`sequence` starts at zero for each request and increases by one. Multiple turns
may share a socket, so consumers must correlate by `requestId`, not by socket
arrival order alone.

The current `GatewayEvent` union is:

```ts
type GatewayEvent =
  | { type: "message.start"; session_id: string; payload: { request_id: string } }
  | { type: "message.delta"; session_id: string; payload: { text: string } }
  | { type: "message.complete"; session_id: string; payload: { outcome: "completed" } }
  | { type: "reasoning.delta"; session_id: string; payload: { text: string } }
  | { type: "status.update"; session_id: string; payload: {
      phase: string; usage?: Usage; finish_reason?: string;
      reasoning?: string; provider_request_id?: string;
      metadata?: Record<string, unknown>;
    } }
  | { type: "approval.request"; session_id: string;
      payload: { call_id: string; name: string } }
  | { type: "tool.start"; session_id: string;
      payload: { call_id: string; name: string } }
  | { type: "tool.generating"; session_id: string;
      payload: { call_id: string; name: string; arguments?: string } }
  | { type: "tool.complete"; session_id: string;
      payload: { call_id: string; is_error: boolean } }
  | { type: "error"; session_id: string;
      payload: { code: string; message: "Request failed" } };
```

`Usage` has the token fields defined by the HTTP contract. The public gateway
currently starts turns with no tools, so tool and approval events are reserved
for a future explicitly enabled tool set.

Protocol errors that occur outside a turn use a compact envelope rather than
an event envelope:

```ts
type SocketError = {
  protocol: "subpolar.v1";
  type: "error";
  code: "unauthorized" | "request_failed";
  message?: "Request failed";
};
```

Malformed messages, failed CSRF validation, and execution failures do not
return provider details. The server fails closed and keeps the message
`Request failed` where a message is present.

## SSE Equivalence

`POST /v1/chat/completions` with `stream:true` emits
`data: {protocol,requestId,sequence,event}` records with the same event union,
then `data: [DONE]`. A failed SSE execution emits a protocol error record with
`code: "request_failed"` before closing.
