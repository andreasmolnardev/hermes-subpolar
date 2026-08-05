# Subpolar Desktop Revamp TODO

Source of truth: [`DESKTOP_REVAMP.md`](./DESKTOP_REVAMP.md). Reuse the existing
`apps/desktop` React renderer and `tui_gateway`; replace Electron-owned
capabilities with authenticated server APIs instead of rebuilding chat or agent
execution.

No data migrations are required. Remove obsolete state and schemas directly.

Docker and Docker Compose are the only supported production deployment methods.
Do not retain native desktop installers, Nix packages, bare-host production
instructions, or a separate cloud deployment mode.

Do not add concrete self-hosted application integrations unless they are already
part of the approved product plan. Integrations must remain provider-driven.
Git providers are configured centrally in **Settings → Integrations** and are
only selected or referenced from project workflows.

## 0. Resolve specification decisions

- [x] Define the Docker deployment topology: one self-hosted Subpolar container
  stack serving the UI and gateway; document reverse-proxy/TLS requirements,
  container networking, persistent volumes, and upgrade/rollback behavior.
- [x] Decide authentication model, first-user bootstrap, session lifetime,
  password reset, and whether multiple human users need isolated `HERMES_HOME`,
  workspaces, credentials, sessions, and terminals.
- [x] Separate human users from agent profiles in naming and data models. Rename
  existing Profiles to Agents; do not use profiles as authentication identities.
- [x] Resolve project-group conflict: workspace selector includes groups in
  `DESKTOP_REVAMP.md:22`, but groups are declared non-selectable at line 363.
- [x] Define project/workspace model: local folder, cloned repository, ephemeral
  workspace, multiple roots, worktrees, and project groups.
- [x] Define permission semantics for `allow`, `ask`, `auto`, and `deny`, including
  scheduled-task restrictions and what internal model performs risk assessment.
  Prefer structured MCP/OpenAPI tools over shell execution; expose shell as a
  separately gated tool with command policies and approval requirements.
- [x] Define tool identity/config schema (`provider.tool_name`) and ownership of
  MCP, OpenAPI, credential, and integration configuration.
- [x] Mark MVP versus later scope. Suggested MVP excludes prompt suggestions,
  project groups, generated commit messages, split diff, browser automation,
  webhook/git-hook triggers, and advanced integration creation.

## 1. Establish web architecture

- [ ] Record architecture decision: promote `apps/desktop/src` into browser-safe
  Subpolar UI (or rename package), retire the existing unrelated `web` dashboard,
  and keep `apps/shared` as transport contract.
- [ ] Inventory every `window.hermesDesktop` preload capability and classify it
  as gateway API, browser API, server-only operation, or removed desktop feature.
- [ ] Add authenticated HTTP and WebSocket entry points to `tui_gateway`; use
  same-origin cookies or short-lived tickets and require CSRF/origin checks on
  mutations and socket upgrades.
- [ ] Move filesystem, repository scanning, git operations, persistent PTYs,
  attachment storage, workspace creation/cloning, and credential access behind
  service-gated backend methods with workspace-root authorization.
- [ ] Replace native OAuth, token store, updater, window controls, deep links,
  installation/bootstrap, power management, and Electron lifecycle assumptions
  with web equivalents or remove them.
- [ ] Serve production frontend assets and SPA fallback from the Subpolar web
  server inside the Docker deployment; add configurable bind host, public URL,
  trusted proxy, and secure-cookie settings to `config.yaml`.
- [ ] Update `openapi.json` for HTTP changes and shared TypeScript contracts for
  gateway methods/events.
- [ ] Add the sole supported production deployment path using Docker and Docker
  Compose, including health checks, persistent volumes, environment/config
  handling, restart policies, and documented reverse-proxy WebSocket setup.
- [ ] Add temporary-`HERMES_HOME` E2E coverage for bootstrap auth, reconnect,
  authorization boundaries, local/remote browser access, and restart persistence.
- [ ] Remove `apps/desktop/electron`, preload types, Electron build scripts,
  installer/release config, native dependencies, desktop Nix packaging, native
  installers, and all non-Docker deployment/release paths only after browser
  parity passes.

## 2. Build domain APIs before screen rewrites

- [ ] Projects/workspaces: CRUD, validated roots, clone progress, no-persistence
  lifecycle, repository metadata, stable worktree IDs, multiple worktrees,
  worktree lifecycle/selection, groups, named project roles, and per-project
  environment.
- [ ] Conversations: list/filter by workspace, status/unread metadata, rename,
  search/filter, archive, restore, permanent deletion policy, stable session
  identity, temporary sessions, streaming responses, and realtime updates.
- [ ] Agents: global/project scope, inheritance/fork-on-edit, named project roles,
  `AGENTS.md` composition, full/minimal stable system prompt choice, tools,
  skills, model defaults, integration overrides, and permission policies.
  Rename the default Hermes agent to `master`.
- [ ] Tool catalog: searchable provider-qualified tools, aliases/normalized
  exposed names, discovery and schema-change handling, provider availability and
  configuration health, per-agent and per-project-role permissions, agent-scoped
  configuration overrides, and creation flows for MCP, OpenAPI, and other planned
  integration types without hard-coding unrelated self-hosted applications.
- [ ] Scheduled tasks: CRUD, manual and cron triggers first, project/agent/model/
  permission context, execution history, enable/disable, and save/discard drafts.
- [ ] Activity: normalized turn timeline events for thinking, planning, tool calls,
  searches, browser actions, subagents, git actions, file changes, approval
  requests, errors, duration, completion, and artifact references. Tool entries
  must expose arguments, results, status, and errors where policy permits.
- [ ] Changes: capture task-scoped file baselines and emit file/diff metadata so
  reviews remain stable after later edits.
- [ ] Source control: repository/branch status, changed and staged files, stage,
  unstage, discard with approval, commit, branch creation, push, and pull-request
  preparation/publishing with granular agent permissions and approval gates.
  Keep commit-message generation optional.
- [ ] Terminals: server-owned persistent PTYs keyed by workspace and human user;
  create, reconnect, resize, rename, reorder, close, and bounded scrollback.
- [ ] Settings: typed read/write APIs split by authority; secrets use credential
  storage and never `.env` behavioral settings or browser-local persistence.
- [ ] Authentication and external access: first-user bootstrap, login/logout,
  password reset, session management, per-agent or external-client tokens, and
  scoped access for supported external harnesses.
- [ ] Authorization and isolation: define effective permission resolution across
  human user, agent, project role, workspace, tool, and per-request permission
  mode; enforce filesystem, terminal, browser-session, credential, and realtime
  event isolation.
- [ ] Tool resolver: implement a stateless authorization resolver that exposes
  only the tools, aliases, credentials, and configuration allowed for the active
  user, agent, project role, workspace, and request.
- [ ] Audit history: persist security-relevant tool calls, approvals, workspace,
  agent, user, result status, and timestamps separately from the transient
  Activity panel where required.

## 3. Implement shared application shell

- [ ] Replace current overlay/page navigation with responsive three-column shell:
  persistent left sidebar, center route outlet, optional right activity panel.
- [ ] Add top navigation in order: New Chat, Agents, Scheduled, Apps.
- [ ] Add workspace selector and project-creation action; scope active and archived
  conversation lists to selected workspace.
- [ ] Add conversation rows with status, title, agent/unread metadata; archived
  rows show title plus workspace badge.
- [ ] Put Settings at sidebar bottom and remove Artifacts, Kanban, Pets, Billing,
  Starmap, Command Center, and other unspecified primary navigation.
- [ ] Preserve route/session identity and realtime state while changing workspace;
  background events must not steal focus or navigation.
- [ ] Support desktop widths plus mobile drawers/sheets for both sidebars; keep
  chat composer reachable with safe viewport/keyboard handling.
- [ ] Add accessible focus order, labels, keyboard navigation, loading/empty/error/
  reconnect states, and localized strings.

## 4. Rebuild New Chat and Conversation screens

- [ ] Create one reusable Prompt Bar for new and existing chats with auto-growing
  multiline input, send/cancel, keyboard shortcuts, drag/drop, and attachments.
- [ ] Add context selectors for workspace (new chat only), agent, model, and
  permissions; changing agent/model must not mutate existing conversation data.
- [ ] Add overflow options for temporary conversation and later advanced flags.
- [ ] Render large pasted text as a removable preview card and full Monaco dialog;
  enforce server-side size/type limits for pastes and attachments.
- [ ] Add New Chat empty state, workspace popover, folder-plus action, and empty
  placeholder for future suggested prompts.
- [ ] Preserve streaming transcript invariants: role alternation, stable system
  prompts/prompt caching, `working...` reasoning placeholder, interruption,
  reconnect, and final response reconciliation.
- [ ] Build inline change-review blocks grouped by task: filename, summary,
  syntax-highlighted unified diff, additions/removals, collapsed context, full
  file expansion, and Explain Changes action.
- [ ] Add optional split diff only after unified diff works responsively.
- [ ] Build Activity panel tabs: Activity, Source Control, Terminal.
- [ ] Link activity file-edit entries to corresponding inline review without
  changing current conversation or stealing focus.
- [ ] Keep terminal sessions mounted/persistent when panel is hidden; support
  multiple renameable, reorderable tabs.

## 5. Rebuild Agents screen

- [ ] Remove duplicate Profiles route/UI and rename all user-facing profile terms
  to Agent without changing gateway connection-profile terminology prematurely.
- [ ] Show agents grouped by global/project scope: grid with no selection, compact
  list with selected editor, and responsive back/collapse control.
- [ ] Build instruction editor for `AGENTS.md` plus additional prompt and full/
  minimal Hermes system-prompt switch.
- [ ] Build searchable creatable Tools and Skills multiselects; open New Tool or
  Add Skill dialogs for unknown entries.
- [ ] Add per-tool `allow`/`ask`/`auto`/`deny` controls and clearly display inherited
  versus project-forked values.
- [ ] Test global inheritance, fork-on-edit, project `AGENTS.md` inclusion,
  permission evaluation, and agent switching during existing conversations.

## 6. Rebuild Scheduled and Apps screens

- [ ] Build Scheduled grid grouped by project, list/editor mode on selection,
  floating add action, trigger editor, shared Prompt Bar, and save/discard state.
- [ ] Add run-now, enable/disable, next-run/last-run status, execution errors, and
  schedule timezone handling.
- [ ] Ensure scheduled tasks cannot wait indefinitely for interactive approvals;
  enforce scheduled permission policy before execution.
- [ ] Build Apps route as stable empty/grid landing page for first-party apps; do
  not restore Pets, Artifacts, or Kanban yet.

## 7. Project and group creation

- [ ] Build combined folder-plus workflow choosing Project or Project Group.
- [ ] Project form: name, files/roots, repository URL, local path, configured Git
  provider selection, and Clone/Local/No Persistence mode with validation and
  clone progress/cancellation. The form may select an existing Git provider but
  must not configure provider credentials.
- [ ] Add worktree creation/selection inspired by T3 Code; show repository and
  branch context before chat submission.
- [ ] Project Group form: name and projects; treat groups as organization only
  unless decision in section 0 changes this.
- [ ] Test path traversal/symlink boundaries, clone failure cleanup, duplicate
  roots, ephemeral cleanup, and concurrent project creation.

## 8. Restructure Settings

- [ ] Models: pill tabs for Providers and Defaults; context length and fallbacks.
- [ ] Chat: personality, timezone, reasoning visibility, and image-input behavior.
- [ ] Appearance, Voice, Advanced, Notifications, Gateway, Keybinds, Plugins,
  Skills, Integrations, Chat Providers, Archived Chats, and About.
- [ ] Memory & Context: configure providers as tools; expose memory tools by
  default only to `master`.
- [ ] Integrations: list provider-qualified tools and configure MCP servers,
  OpenAPI servers, planned integration types, credentials, and Git providers.
  Git provider accounts and login configuration must live here rather than in
  project creation or a standalone API Keys section.
- [ ] Move workspace/safety behavior into Agent configuration where specified;
  remove Billing and standalone API Keys sections.
- [ ] Remove Hermes Cloud mode and messaging-sidebar duplication; keep one
  self-hosted instance model and move messaging configuration to Chat Providers.
- [ ] Move archived chats into main sidebar while retaining management actions.

## 9. Verification and release

- [ ] Add component tests for shell, workspace scoping, Prompt Bar, inline diffs,
  activity links, agent inheritance, scheduled drafts, and responsive drawers.
- [ ] Add browser E2E journeys for first-user auth, project creation, new chat,
  streaming/tool approval, attachment, archive/restore, git commit, terminal
  reconnect, agent edit/switch, scheduled run, settings persistence, and logout.
- [ ] Test two human users and two workspaces for session, filesystem, terminal,
  credential, and realtime-event isolation if multi-user mode is retained.
- [ ] Run Python tests through `scripts/run_tests.sh`; run frontend typecheck,
  lint, unit tests, production build, and Playwright against temporary
  `HERMES_HOME`.
- [ ] Verify long transcript/diff performance, terminal persistence, mobile
  keyboard behavior, reconnect after server restart, reduced motion, and WCAG
  keyboard/contrast basics.
- [ ] Update `README.md`, Docker deployment docs, screenshots, `PATCH.md`, image
  and Compose metadata, and remove remaining Desktop/Cloud/Billing terminology,
  Nix packaging, native installers, and other unsupported deployment guidance.
- [ ] Commit completed phases independently; remove the Electron release path
  once Docker-based web deployment and E2E parity are green.

## Deferred

- [ ] Suggested prompt catalog.
- [ ] Split-diff and richer full-file review editor.
- [ ] Internal-model generated commit messages.
- [ ] Browser automation activity artifacts.
- [ ] Webhook and git-hook scheduled triggers.
- [ ] Agent templates roadmap.
- [ ] Pets, Artifacts, and Kanban reintroduction.
