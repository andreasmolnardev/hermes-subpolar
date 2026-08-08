# Product Requirements

Hermes Subpolar is a Bun-only web API and browser application. The runtime is
one Bun process, the model boundary is OpenAI-compatible, tools cross explicit
native TypeScript boundaries, and local state starts in a fresh SQLite database.

## Runtime

- `bun run serve` builds the web UI and starts `api-gateway`.
- The server exposes authenticated `/v1` HTTP and WebSocket routes plus
  `/api/health`.
- The browser is a client only; it does not hold provider credentials or execute
  tools.
- Unsupported routes fail before provider or tool side effects.

## Provider

- Setup stores exactly one configured OpenAI-compatible connection.
- A connection contains a base URL, API key, and model.
- Provider adapters own wire encoding, authentication, request identity, usage,
  cancellation, and error classification.
- Requests preserve stable system-prompt sections, message-role alternation,
  prompt-cache boundaries, and typed tool-call/result ordering.
- No provider fallback or catalog-specific behavior is implied by the public API.

## Tools

- Tool resolution and execution are separate boundaries.
- Tools are deny-by-default and require an explicitly constructed native
  TypeScript executor.
- Schemas, arguments, policy, approval, cancellation, timeouts, concurrency,
  and output limits are validated on the server.
- Unknown descriptors, collisions, invalid schemas, missing executors, and
  policy conflicts fail closed.

## Persistence

- SQLite stores identity, ownership, provider setup, projects, agents, sessions,
  ordered messages, tool records, usage, and recovery metadata.
- The canonical path is `<SUBPOLAR_DATA_DIR>/state.db`.
- Writes use schema validation, WAL mode, serialized transactions, and atomic
  commit behavior.
- Sessions and messages are owner-scoped, contiguous, and ordered.
- Unsupported schema versions are rejected rather than guessed.

## Verification

```bash
bun run check:monorepo
bun run typecheck:runtime
bun test
bun run test:e2e:browser
```

Tests must verify behavior and invariants. API, persistence, security, and
configuration tests use isolated temporary data directories.
