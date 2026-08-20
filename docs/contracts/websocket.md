# WebSocket Event Contract

The authenticated browser stream is `GET /v1/ws`. It accepts only a same-origin
WebSocket upgrade with the session cookie and exact `Origin` validation. The
server and client exchange UTF-8 JSON text frames. Binary frames, unknown
commands, and unknown fields are rejected.

## Envelope

Every server event uses this closed envelope:

```json
{
  "protocol": "subpolar.v1",
  "sequence": 7,
  "requestId": "018f2b9d-5d6f-4c34-a8f7-0f61f3df0a9c",
  "sessionId": "018f2b9d-5d6f-4c34-a8f7-0f61f3df0a9d",
  "type": "message.delta",
  "payload": { "text": "Hello" }
}
```

`sequence` is a non-negative integer strictly increasing by one for every
server event on a connection, including events for concurrent requests. The
first event is `connected` with `requestId: null`, `sessionId: null`, and
`payload: { "version": "subpolar.v1" }`; subsequent request events use UUIDs.
`requestId` and `sessionId` are nullable only for `connected` and connection
errors. `payload` is a closed object specific to `type`.

## Client Commands

```text
chat.start = {
  protocol: "subpolar.v1",
  type: "chat.start",
  requestId: UUID,
  csrfToken: string,
  model: string,
  messages: RequestMessage[],
  sessionId?: UUID,
  projectId?: UUID,
  agentId?: UUID
}

chat.cancel = {
  protocol: "subpolar.v1",
  type: "chat.cancel",
  requestId: UUID
}
```

`chat.start` is state changing and must include the CSRF token issued for the
session. A command is validated in full before it claims a session or starts a
provider/tool effect. A duplicate `requestId` is handled by the idempotency
rules in [persistence](persistence.md), never dispatched twice.

## Server Event Union

The `type` and payload pairs are:

| Type | Payload |
| --- | --- |
| `connected` | `{ version: "subpolar.v1" }` |
| `message.start` | `{ requestId: UUID }` |
| `status.update` | `{ phase: StatusPhase, usage?: Usage, finishReason?: FinishReason, providerRequestId?: string }` |
| `message.delta` | `{ text: string }` |
| `reasoning.delta` | `{ text: string }` |
| `approval.request` | `{ callId: string, name: string }` |
| `tool.start` | `{ callId: string, name: string }` |
| `tool.generating` | `{ callId: string, name: string, arguments?: string }` |
| `tool.complete` | `{ callId: string, isError: boolean }` |
| `message.complete` | `{ outcome: "completed" }` |
| `error` | `{ code: ErrorCode, message: "Request failed" }` |

`StatusPhase` is the closed set `provider.requested`, `provider.started`,
`provider.completed`, `provider.failed`, `provider.usage`,
`provider.finished`, `approval.approved`, `approval.denied`,
`retry.scheduled`, and `fallback.disabled`. `FinishReason` is `stop`,
`length`, `tool_calls`, `content_filter`, or `error`. `Usage` contains finite
non-negative integer counters: `inputTokens`, `outputTokens`, optional
`totalTokens`, `cachedInputTokens`, `reasoningTokens`,
`cacheCreationInputTokens`, and `cacheReadInputTokens`.

## Ordering And Termination

- The first request event is `message.start`.
- Provider deltas, status events, approval events, and tool events may occur between start and terminal event, but per-request order is preserved even when requests interleave globally.
- A tool call MUST be preceded by `approval.request` when its effective policy is `ask`; denied approval produces no tool side effect and eventually terminates the turn.
- Each request has exactly one terminal event: `message.complete` or `error`. No event for that request may follow it.
- Cancellation is cooperative. The server emits one terminal `error` with `code: "turn_cancelled"` after active provider/tool work is stopped or reaches its bounded cancellation point.
- Connection close cancels all active requests. Reconnect does not replay an unacknowledged stream; the client reads the durable session transcript and may issue a new idempotent request.
- A malformed command yields a typed error tied to its request ID when available and does not execute a provider or tool.
