# Subpolar Docker Deployment

Docker Compose is Subpolar's only supported production deployment.

## First Start

Generate a password hash and stable session-signing secret:

```sh
docker run --rm hermes-subpolar:local \
  python -c "from plugins.dashboard_auth.basic import hash_password; print(hash_password('change-me'))"
export HERMES_DASHBOARD_BASIC_AUTH_USERNAME=admin
export HERMES_DASHBOARD_BASIC_AUTH_PASSWORD_HASH='scrypt$...'
export HERMES_DASHBOARD_BASIC_AUTH_SECRET="$(openssl rand -hex 32)"
docker compose up -d --build
```

Open `http://127.0.0.1:9119`. The named `subpolar_data` volume stores config,
credentials, workspaces, conversations, scheduled metadata, terminals, and
audit history. Back it up before upgrades.

## Reverse Proxy

Terminate TLS at a reverse proxy and forward `Host`, `X-Forwarded-Host`,
`X-Forwarded-Proto`, and `X-Forwarded-Prefix`. Forward WebSocket upgrades for
`/api/ws`, `/api/pty`, `/api/events`, `/api/pub`, and
`/api/subpolar/terminals/ws`. Set `HERMES_DASHBOARD_PUBLIC_URL` when forwarded
headers cannot be trusted. Keep the container port private to the proxy.

## Upgrade and Rollback

```sh
docker compose pull
docker compose up -d
docker compose ps
curl -fsS http://127.0.0.1:9119/api/health
```

Pin image tags or digests in an environment-specific Compose override. To
rollback, restore the previous image tag and run `docker compose up -d`; do not
run two Subpolar containers against one data volume.

## Security

Non-loopback binding requires password or OAuth authentication. Do not use
`--insecure`. Behavioral settings belong in `config.yaml`; secrets belong in
Docker secrets or environment injection, not browser storage or project data.
