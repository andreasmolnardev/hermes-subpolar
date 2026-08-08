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
  slug: string;
  label: string;
  description: string;
  authType: "api_key" | "oauth" | "external_process" | "virtual";
  baseUrl?: string;
};
```

The Wave 0 server executes the stored connection through its OpenAI-compatible
provider adapter. A catalog `oauth`, `external_process`, or `virtual` label is
not by itself an implemented credential or routing flow; those entries remain
metadata until an adapter is explicitly supplied. The configured base URL and
credentials are never returned by setup, `/v1/me`, or chat responses.

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
