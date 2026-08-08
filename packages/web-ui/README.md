# Web UI

The web UI is the browser client for the Bun `api-gateway`. It does not execute
tools or store provider credentials.

## Development

From the repository root:

```bash
bun install
bun run dev
```

For the production-shaped local server:

```bash
bun run serve
```

`bun run serve` builds this package and serves `dist/` from the same Bun process
that exposes the `/v1` API. Open `http://127.0.0.1:8080`.

## Build And Checks

```bash
bun run --filter web-ui build
bun run --filter web-ui typecheck
bun run --filter web-ui test
bun run --filter web-ui lint
```

The UI consumes typed HTTP and WebSocket contracts. Keep authentication,
provider setup, tool policy, execution, and persistence on the API side.

## Structure

```text
src/
  components/   shared UI primitives
  lib/          API client and browser utilities
  pages/        workspace, agent, setup, and session views
  App.tsx       application shell
  main.tsx      browser entry point
```

Use the existing design tokens and component patterns. Add behavior tests for
API event handling, ownership-sensitive states, and error recovery.
