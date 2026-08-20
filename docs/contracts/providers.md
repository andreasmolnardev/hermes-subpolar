# Provider Contract

Wave 0 supports **OpenAI-compatible HTTP APIs only**. This includes OpenAI and
services that intentionally implement the same normalized Chat Completions
request/response and streaming protocol behind a configured base URL. It does
not mean that every provider catalog label is supported.

Until separately reviewed adapters exist, the supported provider kind is the
single closed value `openai-compatible`. Native Anthropic, Gemini, Vertex,
Bedrock, OAuth portals, ACP processes, provider-specific SDKs, and virtual
providers are unsupported and MUST fail as `invalid_request` or
`provider_not_configured`; they MUST NOT fall back to Python.

## Configuration

```text
OpenAICompatibleProvider = {
  kind: "openai-compatible",
  baseUrl: absolute HTTP(S) URL,
  model: non-empty string,
  credentialRef: non-empty secret reference
}
```

The base URL has no credentials, query, or fragment. The adapter appends
`/chat/completions` unless the configured URL already ends with that path. The
server resolves the URL from validated configuration; clients cannot select a
different provider origin or credential.

HTTPS is required for non-loopback origins. Plain HTTP is permitted only for
an explicitly configured loopback development endpoint. Redirects are not
followed across origins.

## Normalized Request

The provider boundary receives a typed request:

```text
ProviderRequest = {
  model: string,
  messages: ProviderMessage[],
  stream: boolean,
  tools?: ProviderTool[],
  requestId: UUID,
  signal: cancellation signal
}

ProviderMessage = {
  role: system | user | assistant | tool,
  content: string | ProviderContentPart[],
  toolCalls?: ToolCall[],
  toolCallId?: string,
  reasoning?: string
}
```

Content parts are a closed union of text, reasoning, image, image URL, file,
audio, tool call, and tool result. An adapter may reject a valid normalized
part when the compatible endpoint cannot represent it; it must do so before
network I/O with `invalid_request`.

Provider tools have a name, description, and closed JSON Schema input schema.
Tool arguments are JSON objects; executable code and shell strings are not
provider arguments.

## Response And Streaming

Non-streaming responses contain a provider request identifier when supplied,
one assistant message, a closed finish reason (`stop`, `length`, `tool_calls`,
`content_filter`, or `error`), and optional finite usage counters.

Streaming responses are parsed as provider SSE and normalized into ordered
text, reasoning, tool-call, usage, and finish events. Events after finish,
malformed JSON, invalid roles, negative counters, or a changed request identity
are provider protocol failures. The gateway projects them through the typed
REST/WebSocket events and never forwards raw provider frames.

## Credentials And Headers

The adapter creates the `Authorization: Bearer` header from the secret store.
Optional organization/project headers are operator configuration, not model or
browser input. Credentials are never included in the normalized request, event
envelope, persisted transcript, or public error.

The gateway sends the public request ID as a correlation header when the
provider supports it. A provider request ID is opaque metadata and is subject
to the redaction rules in [errors](errors.md).

## Failure Categories

Provider failures normalize to `invalid_request`, `provider_failed`,
`provider_not_configured`, or `turn_cancelled`. Retry decisions are made by
the harness from a closed category and bounded attempt policy; a provider
response body is never used as a public error message.
