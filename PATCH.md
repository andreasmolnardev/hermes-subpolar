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
- Added atomic repository turn writes, checkpoint-before-tool recovery,
  stream/reasoning reconciliation, strict role/tool validation, bounded tool
  execution, SQLite legacy metadata compatibility, a scoped Python tool bridge,
  a credential-injected OpenAI-compatible adapter, durable gateway runtime and
  session-repository ports, and deterministic migration fixtures. These remain
  foundation/parity evidence only; Python fallback and rollout gates remain
  authoritative.
- Continued replacement of Python-owned deterministic runtime behavior with
  transcript/schema normalization, retry/error and tool-output policies,
  prompt/token assembly, multimodal content, iteration budgets, cwd/leases,
  complete sidecar persistence, additive SQLite compatibility, and a real
  versioned whole-turn Python bridge. Unsupported integrations remain
  Python-authoritative before side effects.
- Added additive provider metadata and cache-usage propagation through harness
  lifecycle events and SQLite message/usage records, plus cache-hint forwarding
  for the OpenAI-compatible adapter.
- Added SQLite-backed per-session runtime selection and gateway runtime policy
  seams. Runtime selection remains opt-in and disabled configuration keeps the
  Python whole-turn fallback authoritative; cancellation/approval/provider race
  coverage now asserts one terminal outcome and no post-cancel tool effect.
- Default gateway runtime pins now use the shared `$HERMES_HOME/state.db`
  location instead of a process-local map, and disabled/shadow policy cannot be
  bypassed by a previously persisted TypeScript pin. Gateway completion events
  retain provider request identity through the public projection.
- Added fail-closed migration prerequisites: provider-facing API sidecars,
  stable per-turn context assembly, typed unsupported-context fallback,
  validated disabled-by-default `config.yaml` settings, deterministic JSONL
  bridge-worker conformance, and a stateless first-cut eligibility gate. These
  controls do not enable production TypeScript dispatch or relax Python
  fallback/deletion gates.
- Added `requirements.md`, a concise target-state architecture and feature
  reference for TypeScript runtime ownership, retained Python concerns, and the
  required parity, rollout, and deletion gates.
- Began the clean-break TypeScript-only rewrite with the `tool-runtime` package.
  It supplies native MCP tool handles, fixed-origin OpenAPI operation tools, and
  verified argv-based shell execution with deny-by-default allowlists. Existing
  Python compatibility, data migration, TUI, ACP, and cron behavior are not
  targets of this new runtime contract.
- Added the first Bun server delivery slice: strict `subpolar` argument parsing,
  strict YAML/JSON config validation, liveness/readiness responses, traversal-safe static
  asset serving, immutable hashed-asset caching, HTML-only SPA fallback, and
  package-local web output at `packages/web-ui/dist`. Removed the Python Vite
  dev proxy and token-injection plugin.
- Hardened native tools with byte-bounded shell output, cancellation race
  handling, fixed-origin OpenAPI 3.1 validation, local-reference and credential
  header rejection, bounded response reads, and redacted MCP call failures.
- Added authenticated TypeScript browser transport: first-user bootstrap,
  password sessions, HttpOnly/CSRF cookies, same-origin checks, user-owned
  projects, agents, and conversation sessions, provider streaming, SSE chat,
  and an ordered authenticated `/v1/ws` event stream with cancellation.
- Replaced the active `SubpolarApp` browser entry with the versioned Bun client:
  login/bootstrap, private project and agent management, owned session loading,
  live streamed chat rendering, model selection, mobile navigation, and stop
  response controls. The old TUI/admin page sources are no longer imported by
  the active browser entry.

Remaining rewrite work is tracked in `.plans/02-python-ts-migration.md`.
