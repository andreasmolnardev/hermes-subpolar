---
sidebar_position: 7
title: "Subpolar Docker Deployment"
description: "Run self-hosted Subpolar with Docker Compose"
---

# Subpolar Docker Deployment

Docker and Docker Compose are the only supported production deployment
methods. The canonical stack runs one supervised container that serves the
Subpolar browser UI and Hermes gateway together.

## First Start

Generate a password hash with the built image or a local Hermes checkout, then
set Compose variables for explicit credentials:

```sh
export HERMES_DASHBOARD_BASIC_AUTH_USERNAME=admin
export HERMES_DASHBOARD_BASIC_AUTH_PASSWORD_HASH='scrypt$...'
export HERMES_DASHBOARD_BASIC_AUTH_SECRET="$(openssl rand -hex 32)"
docker compose up -d --build
```

Compose also supports first-user bootstrap. Leave the three
`HERMES_DASHBOARD_BASIC_AUTH_*` variables unset, expose Subpolar only through a
TLS reverse proxy, and open `/`. `HERMES_SUBPOLAR_ONLY=1` registers persistent
self-hosted auth; the first bootstrap request creates user and signs in. The
SQLite auth state is stored in `HERMES_HOME/dashboard_auth.db`. Registration
remains disabled after first user unless
`HERMES_DASHBOARD_BASIC_AUTH_ALLOW_REGISTRATION=1` is supplied.

Set `HERMES_DASHBOARD_BASIC_AUTH_RESET_TOKEN` as a Docker secret when operator
password recovery is required. Password changes revoke other active sessions;
the reset endpoint accepts this token and never stores it.

Open `http://127.0.0.1:9119`. Compose creates persistent volume
`subpolar_data`; it contains configuration, credentials, workspaces,
conversations, scheduled tasks, terminals, and audit history.

Do not use `--insecure`, separate gateway/dashboard containers, host networking,
or a second container against the same volume.

## Reverse Proxy

Terminate TLS at the reverse proxy and forward `Host`, `X-Forwarded-Host`,
`X-Forwarded-Proto`, and `X-Forwarded-Prefix`. Forward WebSocket upgrades for
`/api/ws`, `/api/pty`, `/api/events`, `/api/pub`, and
`/api/subpolar/terminals/ws`. Set `HERMES_DASHBOARD_PUBLIC_URL` when forwarded
headers are not trustworthy. Keep port `9119` private to the proxy.

## Health, Upgrade, Rollback

The Compose healthcheck uses `/api/health`. Validate deployment with:

```sh
docker compose config
docker compose build
docker compose up -d
docker compose ps
curl -fsS http://127.0.0.1:9119/api/health
```

Pin image tags or digests in deployment overrides. Back up `subpolar_data`
before upgrades. Roll back by restoring the previous image and running
`docker compose up -d`; preserve the volume.

## Configuration

Behavioral settings belong in `config.yaml`. Credentials use Docker secrets or
environment injection and are never stored in project metadata or browser
local storage. `SUBPOLAR_ALLOWED_ROOTS` controls roots available to workspace
creation; keep it limited to the intended persistent workspace directory.
