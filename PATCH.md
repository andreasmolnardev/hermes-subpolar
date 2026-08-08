# Subpolar Migration Record

## Current State

- Reworked Subpolar navigation around persistent project/thread sidebar,
  agent and automation galleries, and collapsed contextual detail rails; agent
  creation now requires a persisted icon selection.
- Added provider-backed model discovery and model, effort, agent, and permission
  controls to the expanded thread composer.
- Added a declarative Hermes-style provider registry with API mode, auth,
  capabilities, fallback models, request behavior, and endpoint metadata. The
  runtime now resolves provider profiles separately from encrypted connection
  credentials and selects shared Chat Completions, Anthropic Messages,
  Responses, or Bedrock Converse transports.
- Added authenticated `/v1/providers` and `/v1/providers/:providerId/models`
  endpoints. First-run setup and model settings consume provider IDs and the
  same registry, while model discovery falls back to profile catalogs.
- First-run authentication now routes incomplete accounts through `/setup` and
  `/setup/agents` inside one theme-aware card. The existing ThemeProvider is
  mounted for the web UI, with Tokyo Night remaining the default theme.

- Subpolar is a Bun-only monorepo. Active packages are `api-gateway`, `data-layer`,
  `harness`, `chat-provider-interface`, `tool-resolver`, `tool-runtime`,
  `web-ui`, and `@hermes/shared`.
- `api-gateway` is the single composition root. It assembles authentication,
  HTTP/WebSocket transport, `harness`, provider adapters, tool resolution and
  execution, SQLite persistence, static assets, and event projection.
- `data-layer` owns a fresh TypeScript SQLite store. It starts without imported
  records and provides idempotency claims, checkpoint/recovery state, durable
  approvals, and retention pruning.
- Provider credentials are encrypted at rest and exposed to runtime code only
  through opaque credential handles. The browser and provider-neutral contracts
  never receive raw credentials.
- `tool-runtime` provides native MCP, fixed-origin OpenAPI, and verified
  argv-only shell handles; `tool-resolver` applies deterministic schemas and
  execution policy.
- `web-ui` is the active browser product: authenticated projects, agents,
  sessions, streamed conversations, settings, approval UX, responsive layout,
  and WebSocket event rendering.
- Unsupported trees and entrypoints were removed, including skills/plugins,
  research and datagen, media/computer-use, TUI/ACP, desktop, platform,
  billing, and obsolete bootstrap assets.
- Remaining stale Python caches, launcher/install-test artifacts, provider/MCP
  catalogs, desktop specification, and empty runtime log were removed.
- Historical Python sources were removed under the retirement ledger.
- Provider credentials remain encrypted at rest; AWS credentials for Bedrock
  are accepted as a server-side credential object and signed with SigV4.

## Verification

- `bun run check:monorepo` passed.
- `bun run typecheck:runtime` passed.
- `bun run test` passed.
- `bun run build:web` passed.
- `git diff --check` passed.
- Browser Playwright E2E was not run per user request.
