# Subpolar

Subpolar is a self-hosted web application for authenticated, persistent AI
sessions. It is one Bun server with a browser UI, SQLite-backed identity and
session state, an OpenAI-compatible model provider, and explicit native tool
boundaries.

The supported product is the browser server, its authenticated API, and its
native tool runtime.

## Start Locally

Requirements: Bun 1.3.14 or a compatible Bun 1.x release.

```sh
bun install --frozen-lockfile
bun run serve
```

Open `http://127.0.0.1:8080`. The first browser visit creates the administrator,
configures an OpenAI-compatible provider, and selects the initial agent
templates. Data is stored in the directory passed through `SUBPOLAR_DATA_DIR`;
the default server process uses a temporary directory.

## Product Surface

The server exposes a small authenticated HTTP and WebSocket surface:

- `GET /api/health` and `GET /api/ready` for process probes.
- `GET/POST /v1/auth/bootstrap`, `POST /v1/auth/login`, `POST /v1/auth/logout`,
  and `POST /v1/auth/password` for session authentication.
- `GET /v1/me` and `GET /v1/setup*` for identity and first-run setup.
- `GET/POST /v1/projects`, `GET/POST /v1/agents`, and `GET /v1/sessions` for
  user-owned application state.
- `GET /v1/sessions/:id` for a user-owned session and its messages.
- `POST /v1/chat/completions` for OpenAI-shaped requests. Set `stream: true`
  for protocol events over server-sent events.
- `GET /v1/ws` for authenticated bidirectional session events. WebSocket
  messages use the `subpolar.v1` protocol and require the session CSRF token.

Authentication uses an HttpOnly session cookie plus a CSRF cookie and
`X-CSRF-Token` on state-changing requests. Requests are same-origin by default;
reverse proxies must preserve the origin and WebSocket upgrade.

## Providers

The server calls one configured OpenAI-compatible provider. Configure it during
first-run setup or through the setup API with its base URL, model, and secret.
Provider credentials stay server-side and are never returned to browser clients.

## Native Tool Boundaries

Tools are registered as typed definitions and executed by the Bun runtime. The
supported native boundaries are:

- `shell`: an executable and working-directory allowlist with timeout and
  output limits; commands are spawned without a shell.
- `mcp`: bounded JSON-RPC initialization and tool calls with policy, timeout,
  message, argument, and result limits.
- `openapi`: an allowlisted OpenAPI 3.1 operation set with HTTPS, address,
  header, request, response, and timeout checks.

Tool policies default to asking for authorization. A boundary is an execution
contract, not a promise that an untrusted tool is safe; deploy the server with
the filesystem and network access it is intended to have.

## Development Checks

```sh
bun run check:monorepo
bun run typecheck:runtime
bun run test
bun run build:web
```

Browser coverage is documented in [`tests/browser/README.md`](tests/browser/README.md).
Production deployment is documented in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Container

```sh
docker compose up -d --build
```

The Compose service listens on port 8080 and persists application state in the
`subpolar_data` volume. Put TLS and any public-network access policy in a
reverse proxy. Do not expose the Bun server directly to an untrusted network.

## License

Subpolar is distributed under the license in [`LICENSE`](LICENSE).
