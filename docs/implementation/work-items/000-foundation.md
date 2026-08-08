# Work Item 000: Bun Web Foundation

## Goal

Provide one authenticated browser entry point, one Bun API process, and one
owner-scoped SQLite state database.

## Decisions

- `packages/web-ui` is the browser client and is served by `api-gateway` after a
  production build.
- `packages/api-gateway` owns `/v1` HTTP, `/v1/ws`, `/api/health`, static assets,
  authentication, setup, and request dispatch.
- The first-run flow stores one OpenAI-compatible provider connection and
  creates the initial project and agents.
- `SUBPOLAR_DATA_DIR/state.db` is the fresh SQLite authority for identity,
  ownership, setup, sessions, and ordered transcripts.
- Tools remain native server-side TypeScript executors behind explicit resolver
  and policy boundaries.

## Implementation

- `packages/api-gateway/src/server.ts`: Bun server composition and routing.
- `packages/harness`: turn lifecycle and terminal outcomes.
- `packages/chat-provider-interface`: provider boundary.
- `packages/tool-resolver` and `packages/tool-runtime`: native tool boundaries.
- `packages/data-layer`: SQLite repositories.
- `packages/web-ui`: browser shell and API client.

## Verification

```bash
bun run check:monorepo
bun run typecheck:runtime
bun test
bun run test:e2e:browser
```

Foundation is implemented. Remaining work is limited to supported web product
surfaces and their contract tests; it must not add a second runtime or process.
