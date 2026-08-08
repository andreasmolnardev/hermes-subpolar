# Contributing

Hermes Subpolar is a Bun-only TypeScript web application. Contributions should
preserve the product boundary: one Bun API process, one OpenAI-compatible
provider connection, native server-side tool boundaries, and SQLite state.

## Development Setup

Install Bun 1.3.x, then run:

```bash
bun install
bun run serve
```

Use `bun run dev` for watch mode. The web UI is in `packages/web-ui`; the API
server and composition root are in `packages/api-gateway`. Shared contracts
belong in the package that owns the boundary rather than in browser code.

## Checks

Run the smallest relevant check while developing and the full set before review:

```bash
bun run check:monorepo
bun run typecheck:runtime
bun test
bun run build:web
bun run test:e2e:browser
```

API, persistence, configuration, and security changes need behavior-focused
tests. Use an isolated temporary data directory for tests that exercise
SQLite-backed state. Do not assert source text, snapshots, counts, or volatile
provider catalogs.

## Runtime Boundaries

- `api-gateway` owns HTTP, WebSocket, authentication, static assets, and public
  API composition.
- `harness` owns turn lifecycle, cancellation, budgets, retries, and terminal
  outcomes.
- `chat-provider-interface` owns the provider-neutral OpenAI-compatible request
  and result boundary.
- `tool-resolver` validates descriptors and applies deny-by-default policy; it
  never executes a tool.
- `tool-runtime` owns explicitly constructed native TypeScript executors.
- `data-layer` owns schema-versioned SQLite repositories and atomic writes.

Keep provider credentials, tool execution, approvals, and persistence on the
server. The browser may request supported operations through the API but must
not become an execution or credential boundary.

## Pull Requests

Describe the behavior change, affected package boundary, and commands run. For
API changes, update the API contract in the same change. For new tools, include
schema, policy, cancellation, timeout, output-limit, and failure tests. Keep
commits focused and do not edit generated or unrelated files.
