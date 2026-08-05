# Subpolar Patch Notes

## Current Revamp

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

Deferred product items remain listed in `TODO.md` and are not reintroduced by
this patch.
