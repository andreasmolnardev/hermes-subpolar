# Provider Contract

The gateway depends on a provider-neutral `ChatProvider` boundary. A provider
must implement `complete(request)` and may implement typed `stream(request)`.
Provider adapters own authentication, wire encoding, provider request IDs,
usage normalization, and provider error classification.

## Request Boundary

The gateway supplies:

```ts
type ProviderRequest = {
  model: string;
  messages: ProviderMessage[];
  tools: ProviderTool[];
  requestId?: string;
  identity?: { requestId: string; attempt?: number; parentRequestId?: string };
  signal?: AbortSignal;
  timeoutMs?: number;
  deadline?: number;
  cacheHints?: { key?: string; ttlMs?: number; read?: boolean; write?: boolean };
  options?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};
```

Messages preserve the roles `system`, `user`, `assistant`, and `tool`; content
may be text or typed content parts. Metadata and JSON schema values must be
finite JSON values. Cancellation and deadline signals must reach the provider
without being replaced by an adapter.

The gateway keeps stable system-prompt sections, role alternation, and prompt
cache boundaries when assembling a provider request. An adapter must not
silently rewrite those invariants.

## Result Boundary

```ts
type ProviderResult = {
  message: ProviderMessage;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens?: number;
    cachedInputTokens?: number;
    reasoningTokens?: number;
    cacheCreationInputTokens?: number;
    cacheReadInputTokens?: number;
  };
  finishReason?: "stop" | "length" | "tool_call" | "content_filter" |
    "cancelled" | "error" | "unknown";
  reasoning?: string;
  toolResults?: ProviderToolResult[];
  requestId?: string;
  identity?: { requestId: string; attempt?: number; parentRequestId?: string };
  metadata?: Record<string, unknown>;
};
```

Streaming uses typed `start`, text/reasoning deltas, tool-call events, usage,
finish, and error events. The gateway projects these into the public protocol
without exposing raw provider credentials or unclassified provider errors.

## Catalog And Setup

`GET /v1/setup/providers` returns the static catalog. Catalog entries describe
metadata only:

```ts
  id: string;
  aliases?: readonly string[];
  label: string;
  description: string;
  apiMode: "chat_completions" | "anthropic_messages" | "codex_responses" | "bedrock_converse";
  authType: "api_key" | "oauth" | "copilot" | "aws_sdk" | "external_process";
  baseUrl?: string;
  modelsUrl?: string;
  fallbackModels?: readonly string[];
  capabilities?: { vision?: boolean; toolCalling?: boolean; reasoning?: boolean };
  request?: Record<string, unknown>;
};
```

The runtime resolves a `ProviderConnection` (`providerId`, model, endpoint, and
opaque credential handle) to a profile and selects the shared transport for its
`apiMode`. Chat Completions providers share the existing OpenAI-compatible
adapter; Anthropic Messages, Responses, and Bedrock Converse have native
adapters. The configured endpoint and credentials are never returned by setup,
`/v1/me`, or chat responses.

`GET /v1/providers` is an alias intended for settings clients. Model discovery
is available through `GET /v1/models` and
`GET /v1/providers/:providerId/models`; live catalogs fall back to the model
profile and the configured model.

## Failure Boundary

Internally, provider failures are classified as authentication,
authorization, invalid request, model not found, context length, content
filter, rate limit, overloaded, timeout, cancelled, network, server, or
unknown, with retryability. The current HTTP gateway intentionally maps
provider and harness failures to `400 {error:"request_failed"}` and does not
leak the classification to the browser.

No provider fallback is implied by the public `/v1` contract. A turn has one
configured provider connection unless an embedding supplies a different
provider object before the server starts.
