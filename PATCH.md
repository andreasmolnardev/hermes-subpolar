# Subpolar Migration Record

## Persisted Automations

- Replaced the placeholder Scheduled gallery with owner-scoped global and
  project automations, an editor, explicit cron/timezone normalization, model
  and permission policy selection, enable/disable controls, and durable run
  history with session links.
- Added SQLite automation/run state, atomic scheduled-occurrence claims,
  restart recovery, immediate triggers, and execution through the existing
  Agent, Project, Tool Resolver, and Harness path. Interactive approval is
  captured as `needs_attention`; it is never silently allowed.
- Scheduled entries are grouped into Global and project sections. Restart
  semantics are explicit: definitions/history survive, while interrupted
  executions are marked failed because Harness runs are not resumable.
- The scheduler is single-instance today; the deployment assumption and
  predictable restart/missed-run behavior are documented in
  `docs/automations.md`.

## Current State

- Added owner-configurable MCP and OpenAPI Integrations. MCP supports HTTP /
  Streamable HTTP and stdio discovery, OpenAPI definitions can be supplied by
  URL or content, and normalized capabilities flow through the existing Agent
  capability-ID resolver. Integration secrets are encrypted server-side and
  omitted from responses. Added connection health, reconnect/test, deletion,
  OAuth state/token/revoke flow, API contracts, settings UI, and persistence
  behavior coverage.

- Split settings into User and Agent scopes. User settings now own account and
  interface preferences; Agent settings expose models, tools, skills, plugins,
  and memory without
  duplicating first-class agent profiles. Provider setup now lives under Models.
- Reworked Subpolar navigation around persistent project/thread sidebar,
  agent and automation galleries, and collapsed contextual detail rails; agent
  creation now requires a persisted icon selection.
- New chats now present a vertically centered composer without a title bar;
  sending the first message restores the thread header. Removed sparkle icons
  from the web UI.
- New chat composer now asks what to work on and provides project context
  selection from the prompt itself.
- Settings navigation now shows icons for every scope and section tab.
- Added first-class owner-scoped Skills with ordered Agent assignments, enabled
  runtime resolution through the harness prompt assembler, legacy assignment
  migration, CRUD APIs, effective-configuration visibility, and Skills settings
  and Agent-picker UI. Added separate owner-scoped Prompt Commands with CRUD
  APIs, management UI, and editable beginning-of-input slash expansion in chat.
- Added DOM-backed frontend interaction tests for slash-command filtering,
  disabled-command hiding, editable expansion without submission, Skills
  settings CRUD affordances, and Agent Skill assignment behavior. Existing
  request-specific system messages are now preserved inside the server-owned
  harness instruction section instead of bypassing Agent instructions and
  enabled Skills. Prompt variables and Project Skill defaults remain deferred.
- Route-level React pages now live in dedicated `web-ui/src/pages` files, leaving
  `SubpolarApp` responsible for authentication and route orchestration.
- Settings layout now uses responsive split navigation with compact mobile tab
  expansion, scrollable section lists, and a bottom-aligned conversation link.
- Appearance settings now support named color themes, system/light/dark and
  high-contrast variants, color swatches, and locally persisted custom themes.
- Models settings now persist default conversation, internal task, voice, and
  image-generation models; Models also has a Providers tab with configured and
  available provider lists.
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
- Expanded the catalog with Hermes API-key families, distinct Kimi coding
  endpoints, xAI Responses routing, Codex/Anthropic/Nous/Qwen/MiniMax/xAI
  OAuth profiles, Copilot device auth, Vertex service-account auth, and safe
  external-process profiles. Added provider parity manifest coverage.
- Added server-only provider behavior hooks for reasoning and prompt caching,
  encrypted PKCE OAuth state, refresh-token rotation, GitHub Copilot token
  exchange, GCP service-account JWT exchange, provider settings UI, and
  explicit executable allowlisting for process-backed providers.
- First-run authentication now routes incomplete accounts through `/setup` and
  `/setup/agents` inside one theme-aware card. The existing ThemeProvider is
  mounted for the web UI, with Tokyo Night remaining the default theme. Setup
  initialization now runs once, so navigation to agent selection is not reset
  back to provider defaults.
- Added client-side routing for authentication, setup, chat threads, projects,
  agents, automations, apps, settings, resource creation, and themed 404s.
  Sidebar, thread, resource, setup-step, and settings navigation now uses
  shareable router links.

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

- Agents now persist descriptions, instructions, model/reasoning defaults,
  normalized capability assignments, permission policies, and skill IDs.
- Agent sessions resolve canonical capability IDs through the server-side Tool
  Resolver, including native, MCP, and OpenAPI identities, session permission
  overlays, and a legacy compatibility marker for pre-capability agents.
- WebSocket turns now support scoped interactive permission approval and the
  agent editor exposes general, instruction, model, tool, skill, and permission
  settings. Non-interactive turns return a model-visible approval-unavailable
  tool result instead of auto-allowing.
- The Agent editor now consumes the server capability inventory, groups tools by
  integration and initializes explicit permission policies from capability defaults.
  Agent model and reasoning PATCH fields support `null` to clear an override.
- Integration management now persists encrypted server-side credentials, stable
  Integration-ID capability identities, normalized discovery metadata, health,
  cache timestamps, and owner-bound single-use OAuth/PKCE state. MCP uses one
  caller-owned JSON-RPC correlation ID through HTTP and stdio, probes modern
  `2026-07-28` stateless discovery first, and falls back to an explicit legacy
  initialize/initialized lifecycle only when needed. Modern HTTP execution gets
  a fresh transport with current credentials; legacy transports retain only the
  session state their negotiated protocol requires. OAuth revoke now replaces
  the encrypted secret set so access and refresh tokens are actually removed.
  OpenAPI operations use the same stable identity model and static headers are
  configurable from the OpenAPI form without returning saved values to the
  browser.

## Verification

- `bun run check:monorepo` passed.
- `bun run typecheck:runtime` passed.
- `bun run test` passed.
- `bun run build:web` passed.
- `git diff --check` passed.
- Browser Playwright E2E covers bootstrap, provider setup, agent setup, and
  workspace transition using built web UI. Current environment lacks Playwright
  Chromium, so this coverage could not execute locally.
- Integration follow-up verification passed package typechecks, OpenAPI JSON
  parsing, the web production build, and diff checks. The focused MCP,
  IntegrationManager, OAuth, and migration tests are included but could not be
  executed here because the environment has no Bun runtime; the collaborative
  preview host is also unavailable.
## Projects, workspaces, and Git

- Projects now persist descriptions, server-controlled workspaces, project instructions, repository metadata, default Agents, and settings.
- Project creation supports generated workspaces, validated existing workspaces, and server-side Git clones. Workspace paths are canonicalized under `SUBPOLAR_WORKSPACE_ROOT` (default: `$SUBPOLAR_DATA_DIR/workspaces`).
- Git credentials are named, encrypted identity records. Project repository configuration stores only the credential ID; secrets are never returned to the browser or model.
- Added typed `git.status`, `git.diff`, `git.log`, `git.branch.list`, `git.branch.create`, `git.commit`, `git.push`, and `git.pull` capabilities. Read operations allow by default; mutating operations ask by default.
- The project overview includes source-control status and selectable diffs, and Agent Settings → Integrations → Git includes named HTTPS and SSH credential setup, including optional key passphrases.
- Project creation exposes repository remote name and typed push/pull use that configured remote by default. Persisted workspaces are canonicalized again before Harness and native Git execution so later symlink replacement cannot escape the configured workspace root.
