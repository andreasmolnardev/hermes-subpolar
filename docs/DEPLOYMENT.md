# Deployment

Hermes Subpolar runs as one Bun process. The process serves the built web UI,
the authenticated `/v1` web API, WebSocket events, and `/api/health`.

## Local Deployment

```bash
bun install
SUBPOLAR_DATA_DIR=/var/lib/hermes-subpolar bun run serve
```

Open `http://127.0.0.1:8080` and complete first-run setup. The administrator
stores one OpenAI-compatible provider connection through the browser.

`SUBPOLAR_DATA_DIR/state.db` is the durable SQLite database. It contains
identity, ownership, provider setup, sessions, transcripts, and recovery state.
Use a private directory with restrictive permissions and back it up before
upgrades.

## Reverse Proxy

Keep the Bun listener on loopback when possible. A public reverse proxy must:

- terminate TLS;
- preserve the public origin and `Host` headers;
- forward WebSocket upgrades for `/v1/ws`;
- forward `/v1/*` and `/api/health` without rewriting their paths; and
- enforce the deployment's public authentication policy.

The data directory must not be served as static content. Do not expose the
SQLite file or provider credentials to the browser.

## Container Verification

After starting the Compose deployment, verify that the service reports the
expected health payload and accepts a graceful shutdown:

```bash
bash scripts/verify-container.sh --container hermes-subpolar
```

The check waits for `{"status":"ok"}`, confirms the container is still
running, sends Docker's normal stop signal, and requires a clean exit. It is
also used by the repository's Docker CI jobs. Run it before replacing a
container that uses a persistent `SUBPOLAR_DATA_DIR` volume.

## Upgrade

```bash
bun install
bun run build:web
bun run check:monorepo
bun run serve
```

Stop the old process before starting the new one against the same database.
Do not run two instances against one SQLite file. Restore the previous build
and database backup together if rollback is required.
