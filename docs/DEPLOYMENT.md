# Deploying Subpolar

Subpolar production is one Bun server. Docker Compose is the supported
self-hosted deployment; a reverse proxy is responsible for TLS and public
network policy.

## Compose

```sh
docker compose up -d --build
docker compose ps
curl -fsS http://127.0.0.1:8080/api/health
```

The service binds to `127.0.0.1:8080` by default. Override the host binding
with `SUBPOLAR_BIND` when the reverse proxy is on another interface. The
container uses `SUBPOLAR_HOST=0.0.0.0` internally and stores SQLite state in
`/opt/data`.

The named `subpolar_data` volume contains identity, provider configuration,
projects, agents, sessions, and messages. Back it up before upgrades. Never run
two Subpolar containers against the same volume.

## First Run

Open `http://127.0.0.1:8080` and complete the browser setup:

1. Create the first administrator at `GET/POST /v1/auth/bootstrap`.
2. Configure the OpenAI-compatible provider at `/v1/setup/provider`.
3. Choose the initial agent templates at `/v1/setup/agents`.

The server sets an HttpOnly `subpolar_session` cookie and a readable
`subpolar_csrf` cookie. Browser state-changing requests must send the CSRF value
as `X-CSRF-Token` and use the server origin.

## Reverse Proxy

Proxy the single HTTP origin and preserve the `Host`, `X-Forwarded-Host`, and
`X-Forwarded-Proto` headers used by your TLS termination. Forward WebSocket
upgrades for `/v1/ws`. Keep the container port private to the proxy and enforce
authentication, rate limits, and an allowlist at the proxy when the service is
reachable by more than its local operator.

## Configuration

Supported process settings are:

- `SUBPOLAR_HOST`, default `127.0.0.1`.
- `SUBPOLAR_PORT`, default `8080`.
- `SUBPOLAR_DATA_DIR`, the persistent data directory.
- `SUBPOLAR_STATIC_ROOT`, the built web directory; it defaults to
  `packages/web-ui/dist` in a source checkout.

Provider API keys are application secrets. Inject them through the setup flow
or a deployment secret mechanism; do not commit them or place them in browser
storage.

## Upgrade and Rollback

```sh
docker compose pull
docker compose up -d
docker compose ps
```

Pin image tags or digests in an environment-specific Compose override. To roll
back, restore the previous image and run `docker compose up -d` after verifying
that the application data backup is available.

## Hardening

- Run the container as a non-root process and grant it only its data volume.
- Expose the service through TLS and a trusted reverse proxy.
- Treat shell, MCP, and OpenAPI tool boundaries as explicit capabilities.
- Restrict outbound network access when OpenAPI or MCP tools are enabled.
- Review provider, agent, and tool configuration as application input.
