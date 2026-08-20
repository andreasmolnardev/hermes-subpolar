# Errors And Redaction

All `/v1` JSON errors and terminal WebSocket errors use the same envelope.
HTTP status and WebSocket transport status remain separate from the stable
application code.

```json
{
  "error": {
    "code": "invalid_request",
    "message": "The request is invalid.",
    "requestId": "018f2b9d-5d6f-4c34-a8f7-0f61f3df0a9c"
  }
}
```

`error` MUST contain exactly `code`, `message`, and `requestId`, with optional
`fieldErrors` or `retryAfterSeconds` only where declared below.

```text
fieldErrors = [{ field: string, issue: required | invalid | unsupported | too_long }]
```

`fieldErrors` names public request fields only. It MUST NOT contain a secret,
database column, provider path, filesystem path, stack trace, or tool output.

`ErrorCode` is the closed set of codes in the table below. A client MUST treat
an unrecognized future code as a generic failure without displaying its raw
payload.

## Codes

| Code | HTTP status | Meaning |
| --- | ---: | --- |
| `invalid_request` | 400 | JSON, field, schema, or content validation failed. |
| `method_not_allowed` | 405 | The resource does not support the HTTP method. |
| `unauthorized` | 401 | No valid authenticated session exists. |
| `origin_rejected` | 403 | The request origin is absent or not an allowed exact origin. |
| `csrf_rejected` | 403 | Cookie-authenticated state change failed CSRF validation. |
| `forbidden` | 403 | The principal is authenticated but lacks ownership or permission. |
| `not_found` | 404 | The resource does not exist or is not visible to this principal. |
| `conflict` | 409 | The requested state transition conflicts with durable state. |
| `idempotency_conflict` | 409 | A key was reused with a different operation or body. |
| `request_in_progress` | 409 | An identical non-replayable operation is still running. |
| `payload_too_large` | 413 | A byte, item, or output limit was exceeded. |
| `rate_limited` | 429 | An operator limit was exceeded. |
| `provider_not_configured` | 503 | No valid OpenAI-compatible connection is configured. |
| `provider_failed` | 502 | The configured provider failed or returned an invalid response. |
| `tool_denied` | 403 | Tool policy or approval denied execution. |
| `tool_failed` | 502 | A permitted tool failed, timed out, or was cancelled. |
| `turn_cancelled` | 409 | The turn was cancelled before terminal completion. |
| `internal_error` | 500 | An unexpected server failure occurred. |

Unknown internal failures MUST map to `internal_error` or the closest stable
code above. They MUST NOT be serialized as arbitrary exception text.

## Redaction Rules

The public response, SSE stream, WebSocket stream, audit event, and ordinary
logs MUST NOT contain:

- Passwords, API keys, bearer credentials, session tokens, CSRF tokens, cookie values, or secret-store references.
- Raw provider error bodies, authorization headers, credential-bearing URLs, SQL, stack traces, local absolute paths, or process environments.
- Unbounded provider request/response payloads or tool arguments in an error message.

Public messages are stable, short, and non-sensitive. A provider request ID
may be exposed only as an opaque identifier in a typed status field; it is not a
credential. Tool results are returned only through the typed tool-result event,
are byte bounded, and are never copied into error messages.

Private diagnostics MAY retain a correlation ID, stable category, HTTP status,
byte counts, and timing. Private diagnostics MUST apply the same secret
redaction and MUST use bounded fields. Prompt, transcript, and tool data are
content, not diagnostic context.

Authentication, ownership, and not-found failures SHOULD avoid revealing
whether another principal's resource exists. Redaction is applied before
serialization, not as a presentation-only client feature.
