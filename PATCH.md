# Subpolar Patch Notes

## Current Revamp

- Added Bun migration foundation with six explicitly named runtime packages,
  strict shared TypeScript settings, browser-safe data contracts, dependency
  direction/import-boundary checks, focused behavior tests, and isolated Bun CI.
- Migrated canonical Vite/Vitest browser app from `web/` to `packages/web-ui/`,
  preserving its API entrypoint and tests, and moved `@hermes/shared` contracts
  from `apps/shared/` to `packages/shared/`.
- Updated workspace manifests, browser aliases, npm and Bun lockfiles, and
  Docker frontend build paths.
- Removed obsolete website, Electron desktop, and TUI workspaces. Retained
  Python compatibility paths, root tests, and plugin-owned sidecars only where
  runtime parity still requires them.
- Updated CLI, update, doctor, dashboard, and installer paths to use
  `packages/web-ui/`; removed obsolete TUI and desktop installer stages.

- Added browser-first Subpolar shell with workspace, Agent, Scheduled, Apps,
  Settings, conversation, Activity, Source Control, and Terminal surfaces.
- Added owner-scoped workspace, Agent, scheduled-task, integration, activity,
  audit, source-control, baseline, session, and terminal APIs.
- Bound authenticated WebSocket principals to gateway transports and filtered
  browser session operations by owner.
- Added production-only legacy surface gating, endpoint-scoped WebSocket
  tickets, workspace-root/worktree containment checks, and owned Git provider
  validation.
- Wired browser Source Control changes, unified diffs, stage/unstage/discard,
  and commit actions to workspace-authorized APIs.
- Made Docker Compose the canonical one-service deployment with persistent
  volume, password authentication, healthcheck, and WebSocket proxy
  guidance.
- Added persistent self-hosted auth bootstrap under `HERMES_HOME`, login/logout
  lifecycle state, password change/reset, active-session revocation, and scoped
  client-token management without changing OAuth or WebSocket ticket contracts.
- Replaced self-hosted JSON auth state with SQLite multi-user tables and added
  policy-gated server-rendered signup/register pages.
- Added production-like Playwright browser E2E coverage using temporary
  `HERMES_HOME` for auth lifecycle, owner/workspace scoping, project creation,
  scheduled policy/run-now, source control, terminal fallback, and restart
  persistence without provider calls.
- Added immutable Subpolar metadata to cron jobs and runtime policy revalidation
  immediately before execution; legacy cron jobs retain existing behavior.
- Removed Electron/Tauri installers, native release scripts, Nix deployment
  paths, and desktop-only lifecycle surfaces while retaining browser-safe
  renderer components and server capabilities.
- Documented implemented Python/TypeScript runtime boundary, explicit harness
  lifecycle, neutral contracts, deterministic resolver, in-memory persistence
  adapter, and retained Python fallback; no default cutover claimed.

Deferred product items remain listed in `TODO.md` and are not reintroduced by
this patch.
