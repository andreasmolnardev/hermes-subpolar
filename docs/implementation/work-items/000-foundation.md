# Work Item 000: Web Foundation

## Goal

Establish one browser-safe Subpolar entry point, authenticated owner-scoped
workspace metadata, and one Docker Compose production topology.

## Source requirements

- `TODO.md` sections 0, 1, and 2: deployment, identity, workspace ownership,
  authenticated HTTP, path authorization, shared contracts.
- `DESKTOP_REVAMP.md`: shared shell, workspace selector, Agents terminology,
  organization-only project groups.

## Decisions

- `web/` is promoted to canonical Subpolar browser package. Its old dashboard
  routes remain in source temporarily but are no longer mounted by the primary
  entry point. Electron renderer code remains only as parity reference until
  browser verification completes.
- Cookie-authenticated humans use `Session.user_id` as owner. Loopback token
  mode is explicitly one trusted `local-single-user` actor; it is not a human
  multi-user identity and cannot accept a client-supplied owner.
- Projects are represented by owner-scoped workspaces. Groups are organization
  metadata only and never appear as selectable workspaces.
- Workspace roots are canonical real paths, must be inside configured allowed
  roots, and cannot contain symlink components. Repository URLs cannot contain
  embedded credentials. Git provider credentials remain outside project data.
- Compose runs one `gateway run` service with s6-supervised dashboard, bridge
  networking, persistent named volume, required password authentication, and
  `/api/health` healthcheck. Reverse proxy terminates TLS and forwards WebSocket
  upgrades.
- Existing Hermes JSON-RPC gateway and session persistence remain authoritative
  for chat execution. Subpolar APIs add ownership and UI metadata instead of
  reimplementing the agent loop.

## Implementation

- `hermes_cli/subpolar_store.py`: WAL SQLite metadata and root validation.
- `hermes_cli/web_routers/subpolar.py`: owner-scoped authenticated API.
- `packages/shared/src/subpolar.ts`: frontend transport types.
- `packages/web-ui/src/SubpolarApp.tsx`: browser shell and first conversation flow.
- `docker-compose.yml`: sole canonical production topology.

## Verification

- `scripts/run_tests.sh tests/hermes_cli/test_subpolar_store.py`
- `npm --prefix packages/shared run check` requires installed workspace
  dependencies; run in Docker/clean install before release.
- `docker compose config` requires dashboard auth variables by design.

## Status

Foundation implemented. Remaining work: actor-bound WebSocket dispatch, full
domain services, agent/integration APIs, activity/source-control/terminal
surfaces, Docker E2E, and Electron removal after parity.
