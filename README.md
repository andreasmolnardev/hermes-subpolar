# Hermes Subpolar

Hermes Subpolar is a self-hosted web application for workspace-scoped AI
development. It is a Bun and TypeScript service with a React web UI, one HTTP
process, one OpenAI-compatible model connection, native tool boundaries, and a
fresh SQLite database for local state.

## Start Locally

Requirements: Bun 1.3.x and a supported browser.

```bash
bun install
bun run serve
```

Open `http://127.0.0.1:8080`. The command builds `packages/web-ui` and starts
`packages/api-gateway` in the same Bun process. First-run setup creates the
administrator, stores one OpenAI-compatible connection, and creates the
initial agent templates.

## What It Provides

- Browser-based workspace and agent management.
- Authenticated `/v1` HTTP and WebSocket APIs.
- OpenAI-compatible chat completions with typed streaming events.
- Owner-scoped projects, agents, sessions, and ordered transcripts.
- Native tool boundaries with deny-by-default resolution and bounded results.
- SQLite persistence at `<SUBPOLAR_DATA_DIR>/state.db`.
- Static web assets served by the same Bun process as the API.

The public API does not expose provider credentials or allow a browser client to
register arbitrary executors. Unsupported provider, tool, transport, and data
shapes fail before side effects.

## Configuration

The server accepts these process variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `SUBPOLAR_HOST` | `127.0.0.1` | Bun listen hostname |
| `SUBPOLAR_PORT` | `8080` | HTTP port |
| `SUBPOLAR_DATA_DIR` | `.subpolar` | Directory containing `state.db` |
| `SUBPOLAR_STATIC_ROOT` | `packages/web-ui/dist` | Built web assets |

Provider setup is completed through the authenticated browser flow. The
configured connection uses an OpenAI-compatible base URL, API key, and model;
credentials remain server-side in SQLite.

## Development Commands

```bash
bun run check:monorepo
bun run typecheck:runtime
bun test
bun run build:web
bun run test:e2e:browser
```

Run `bun run dev` for the workspace development processes. Package-level
commands are documented in `packages/*/package.json` and use Bun throughout.

## Architecture

```text
Browser
  |
  | HTTP / WebSocket
  v
Bun api-gateway
  |-- authentication and owner checks
  |-- harness turn lifecycle
  |-- OpenAI-compatible provider adapter
  |-- native tool resolver and tool runtime
  `-- SQLite repositories: identity, setup, sessions, transcripts
```

The browser is a client of the API, not an execution host. Tool descriptors,
approval, cancellation, output limits, provider calls, and persistence stay on
the server-side TypeScript boundaries. Stable system-prompt sections, message
roles, prompt-cache boundaries, and tool-call/result ordering are preserved.

## Deployment

For a durable self-hosted deployment, set `SUBPOLAR_DATA_DIR` to a private
persistent directory and place TLS and public authentication at a trusted
reverse proxy. The process listens on one port and must not share its SQLite
database with another instance. See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Documentation

- [Deployment](docs/DEPLOYMENT.md)
- [Session lifecycle](docs/session-lifecycle.md)
- [Provider contract](docs/contracts/providers.md)
- [Tool contract](docs/contracts/tools.md)
- [Persistence contract](docs/contracts/persistence.md)
- [Configuration contract](docs/contracts/configuration.md)
- [Security policy](SECURITY.md)

## Contributing

Use the Bun commands above, keep changes inside the package boundary that owns
them, and include behavior-focused tests for API, persistence, security, and
tool changes. See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## License

Hermes Subpolar is released under the MIT license. See [`LICENSE`](LICENSE).
