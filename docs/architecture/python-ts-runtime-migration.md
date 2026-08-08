# Bun Runtime Boundary

The active product runtime is the Bun TypeScript gateway. This page records the
target boundary for the web application; the migration plan and retirement
ledger remain separate historical project records.

## Composition

`api-gateway` is the one-process composition root. It serves static assets,
authenticated HTTP, WebSocket events, and OpenAI-compatible chat completions.
The runtime is composed from:

- `harness` for turn lifecycle, cancellation, budgets, retries, and terminal
  outcomes;
- `chat-provider-interface` for typed provider requests, results, usage, and
  errors;
- `tool-resolver` for deterministic descriptor validation and restrictive
  policy; and
- `data-layer` for schema-versioned SQLite repositories.

## Boundaries

- Provider adapters own credentials, wire encoding, request identity, usage,
  cancellation, and error classification.
- Tool descriptors are validated before an explicitly constructed native
  executor can run. The resolver never executes tools.
- The browser is not a credential, tool, or persistence authority.
- Unsupported providers, tools, transports, schemas, and database versions
  fail closed before side effects.

## Invariants

- System-prompt sections, message roles, prompt-cache boundaries, and
  tool-call/result ordering remain stable.
- Each turn has one terminal outcome.
- Sessions and messages are owner-scoped, contiguous, and ordered.
- SQLite transactions commit all related mutations or none.
- Cancellation and deadlines reach provider and tool boundaries.
- API keys remain server-side and are never returned by setup or chat routes.

## Verification

```bash
bun run check:monorepo
bun run typecheck:runtime
bun test
bun run test:e2e:browser
```
