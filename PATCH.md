# Subpolar Migration Record

## Embedded Pi Runtime

- Added bounded `spawn_agent` as a Subpolar-owned Pi custom-tool primitive:
  child Agent resolution, authorization, deadline clamping, cancellation,
  recursive privilege stripping, and parent/child event correlation are
  covered by the harness suite.
- Added opt-in Pi session-file hydration for process restart tests without
  making Pi JSONL authoritative, plus model-change/session-state persistence
  coverage.
- Added a server-scoped native Pi `ModelRuntime` pool keyed by provider so
  catalog initialization is reused while the credential backend remains
  Subpolar-owned and provider-scoped.
- Added traversal, symlink, sibling-project, stale-resolution, hidden-tool,
  shell-interpreter, approval, and child-privilege security regressions.
- Included all vendored Pi package manifests in the Docker dependency layer;
  live Docker build/health verification remains host-permission blocked when
  the invoking user cannot access `/var/run/docker.sock`.

- Added `PI-MIGRATION-PLAN.md` as the authoritative Pi-specific task tracker,
  with package ownership, completed baseline, remaining parity/security gates,
  and package-batch release criteria.
- Added `check:pi`/`test:pi` and a CI job that validate the pinned Pi commit,
  documented import closure, vendored source directories, and package names.
- Vendored the pinned Pi `0.84.2` runtime closure from commit
  `c49906ec77788625aacbdc53ebca6fbe65bd20f5` under `packages/pi-*`:
  agent core, AI, client, coding-agent, protocol, telemetry, and TUI.
- Preserved Pi's upstream package names and added workspace-local source
  exports, Pi-compatible TypeScript settings, dependency metadata, and
  entrypoint smoke tests.
- Added `scripts/pi/sync-pi.sh`, `PINNED_COMMIT`, and local-patch notes so
  future upstream refreshes replace only the vendored source surface.
- Imported the matching generated model catalog from the pinned `pi-ai`
  release artifact; Subpolar still owns provider credentials and execution
  policy, which are added in the harness adapter batches.
- Added the first Subpolar-owned Pi harness seam: an explicit per-run context,
  in-memory Pi session creation, controlled resource loading, custom-tool
  authorization, and stable Subpolar event projection. The legacy provider
  loop remains available as a gateway compatibility path.
- Added explicit provider-credential and conversation seams for Pi: a
  Subpolar-backed credential-store adapter and provider-neutral message
  hydration into Pi's transcript model. System policy remains resource-loader
  input rather than a persisted conversation message.
- Added the Tool Resolver → Pi custom-tool adapter. Resolved descriptors retain
  their capability identity and policy, while execution is delegated to an
  injected Subpolar Tool Runtime callback; `ask` is closed by default without
  an approval callback.
- Hardened descriptor narrowing in `tool-resolver` so the Pi adapter and the
  resolver agree on the executable-handle invariant under the Pi-compatible
  TypeScript settings.
- Added the harness execution entry point that hydrates approved history and
  performs exactly one Pi-backed turn, giving gateway/automation callers one
  shared migration boundary.
- Added an optional `api-gateway` Pi executor seam. It receives the normalized
  request and projected event sink; the server now supplies the embedded Pi
  executor by default.
- Kept the staged gateway/Pi source graph type-safe across Bun and DOM fetch
  declarations, including executable-handle narrowing and two documented
  upstream Pi fetch/Headers compatibility patches.
- Exposed the same optional Pi executor through the Bun API server options so
  an application-owned Pi runtime can be attached without making the legacy
  provider path implicit or global.
- Added a provider bridge that exposes an existing Subpolar `ChatProvider` as a
  Pi AI model/provider, translating messages, tools, usage, errors, and stream
  deltas. This enables Pi-loop execution before the native credential/provider
  catalog migration is switched on.
- Passed the selected `ChatProvider` into the optional gateway Pi executor so
  application-owned Pi adapters can bridge the request without process-global
  provider state.
- Added an opt-in gateway Pi executor that converts resolved descriptors into
  Subpolar-owned Pi tools, routes approvals and execution through the existing
  gateway callbacks, applies assembled system context through the controlled
  resource loader, and projects text/reasoning/tool/terminal events back to the
  gateway event contract.
- Allowed explicitly injected Pi custom tools while keeping Pi built-in tools
  disabled by default; the generic gateway still permits an explicit legacy
  path for compatibility.
- Added Pi-path persistence projection: inbound preparation, before/after tool
  checkpoints, and the final assistant result/usage are written through the
  existing gateway persistence port without making Pi's JSONL session state
  authoritative.
- Added authenticated server coverage for the opt-in Pi path, including its
  normal HTTP chat dispatch and persisted session boundary.
- Enforced Pi-path session setup and approval routing at the executor boundary,
  with coverage proving `ask` tools cannot execute without the gateway approval
  decision.
- Added a bounded native model-resolution seam in `harness`: Hermes provider
  IDs map explicitly to Pi provider IDs, unsupported providers fail closed, and
  `ModelRuntime.getModel()` runs with a network-disabled runtime backed by
  `SubpolarPiCredentialStore`.
- Switched `startApiGatewayServer()` to the embedded Pi executor by default,
  while retaining the explicit `piExecutor` option for custom runtimes and
  tests. Fixed optional usage serialization so Pi results remain valid JSON for
  idempotency replay.
- Made the low-level `createGateway()` helper Pi-backed by default as well;
  callers that still require the old provider loop must opt into the explicit
  `legacyHarness` compatibility option.
- Ordered Pi event projection at the gateway boundary and drain projected
  events before returning or surfacing execution errors, preventing races with
  persistence and terminal delivery.
- Mapped native Pi model-resolution failures to stable API error codes and
  covered unsupported-provider behavior in the native server tests.
- Added a fail-closed native Pi model-resolution seam with explicit Hermes-to-Pi
  provider mappings and a network-disabled, Subpolar-backed `ModelRuntime`.
- Added automation coverage proving Pi-backed success persistence, approval
  failure, and provider failure behavior through the normal automation runner.
- Native server-default model resolution now honors Hermes' persisted endpoint,
  materializes configured model IDs from a controlled Pi catalog template, and
  selects Pi's Chat Completions API for the Hermes `openai-api` profile.
- Added a true default-path integration test covering Subpolar credentials,
  custom endpoint dispatch, streaming completion projection, and usage.
- Documented the exact Pi refresh sequence, closure safeguards, package checks,
  security gates, local-patch review, and one package-batched commit policy;
  vendor tests now protect the procedure as well as the source closure.
- Added explicit Pi credential conversion with provider scoping. API-key,
  OAuth, and Copilot values map deliberately; AWS, GCP, and external-process
  values fail with stable unsupported-mode errors instead of being dropped.
- Added native-default automation and WebSocket approval coverage, including
  disconnect denial and rejection of stale approval responses on a new socket.
- Added shutdown behavior coverage for active native Pi turns, provider abort
  propagation, idempotent shutdown, readiness, and prevention of post-shutdown
  effects.
- Added a restricted child-session harness primitive that reuses the Pi runner,
  propagates parent cancellation, accepts only pre-resolved child tools, and
  correlates child events to parent and child run IDs.
- Added workspace-confined native filesystem tools with bounded read/write,
  canonical traversal and symlink-escape checks, fail-closed operation
  selection, approval-gated mutations, and explicit shell-interpreter opt-in.
- Added restart/recovery and pending-approval behavior coverage for both the
  in-memory and SQLite repositories, including reconnect filtering,
  idempotent decisions, conflicting decisions, and retention pruning.
- Added configurable persistence redaction for provider payloads, credentials,
  tool arguments/output, reasoning, checkpoints, approvals, and error details;
  in-memory and SQLite tests inspect stored records and raw database rows.
- Wired confined native filesystem capabilities into project tool resolution,
  including arbitrary workspace support, capability filtering, and edit/write
  diff metadata.
- Added browser-client reconnect coverage for pending approval responses,
  cursor resume, event deduplication, and projected Pi status activity.
- Projected native Pi status phases into the WebUI activity timeline without
  importing Pi package types into the browser.

## Repository Residue Cleanup

- Rebranded active package, browser, and container metadata from the upstream
  Hermes Agent repository to Hermes Subpolar.
- Removed committed Python-era bytecode, web-build lock, and test-duration
  artifacts; test-duration output is now ignored.

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

- Added optional provider-neutral Voice settings and runtime paths. Speech-to-Text
  records only after an explicit microphone action, inserts transcription into the
  editable composer, and releases media tracks immediately. Text-to-Speech supports
  per-response playback and an opt-in auto-play setting. Voice API credentials are
  encrypted server-side, audio is forwarded temporarily, and dedicated STT/TTS
  interfaces remain separate from chat model providers. The microphone action is
  disabled until STT is configured, and the settings UI identifies the supported
  OpenAI-compatible speech wire formats.
- Stabilized injected HTTP MCP request bodies, isolated integration-test fetchers,
  and restored synthetic Git diffs for untracked files so the gateway/runtime
  regression suites remain deterministic under Bun.
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
