# Monorepo Architecture and Python-to-TypeScript Migration

## Goal

Reduce Hermes Subpolar to six runtime TypeScript packages in one Bun
workspace. Keep browser UI, API transport, model execution, tool policy, and
persistence behind explicit boundaries. Replace Python incrementally; do not
attempt a big-bang rewrite.

The final product direction and implementation tracker are defined by
`.plans/02-python-ts-migration.md`. Docker Compose remains the only supported
production deployment.

## Target Package Graph

These are the only six runtime packages. Use these names consistently in
documentation, manifests, imports, and architecture references.

```text
web ui
  -> api gateway
  -> data layer (browser-safe contracts only)

api gateway
  -> harness
  -> tool resolver
  -> chat provider interface
  -> data layer
 harness
  -> tool resolver
  -> chat provider interface

tool resolver
  -> data layer (read-only policy/config snapshot types)

chat provider interface
  -> no application package

data layer
  -> no application package
```

### `web ui` - browser UI

- Canonical Subpolar browser surface.
- Uses authenticated HTTP and WebSocket APIs only.
- Owns presentation, routing, optimistic UI state, and reconnect behavior.
- Must not import database drivers, filesystem code, provider SDKs, or tool
  implementations.
- Existing `web/` is the starting point. Port browser-safe renderer behavior
  from `apps/desktop/src` selectively; do not move Electron assumptions into
  the browser.

### `api gateway` - API and realtime boundary

- Owns HTTP routes, WebSocket upgrades, authentication, CSRF/origin checks,
  request validation, rate limits, and event fan-out.
- Translates transport DTOs into domain requests and calls application
  services.
- Does not contain provider-specific model calls, tool authorization rules, or
  SQL queries.
- Preserves existing `api gateway`/session API behavior during migration where it is
  an external or persisted contract.
- Every endpoint change updates `openapi.json` and generated/shared contracts.

### `chat provider interface` - provider interface

- Defines normalized request, response, streaming delta, tool-call, usage,
  cancellation, and error contracts.
- Adapts model providers behind one interface; provider details do not leak
  into the  harness` or `api gateway`.
- Supports fallback identity and failure-scope semantics already centralized
  in `agent/backend_identity.py`.
- Provider credentials are resolved by configuration/credential services, never
  accepted from browser payloads.

###  harness` - agent execution

- Executes one request from explicit input: messages, system prompt, model,
  resolved tools, permissions, and execution context.
- Owns prompt assembly, model/tool-call loop, streaming events, cancellation,
  usage, and final result reconciliation.
- Holds no session, user, workspace, credential, or durable memory state.
- Receives state through arguments and returns events/results to the `api gateway`.
- Preserves prompt caching, message-role alternation, stable system prompts,
  tool-call ordering, and existing context-compression invariants.

### `tool resolver` - policy and tool resolution

- Pure, deterministic resolver for effective tools, aliases, credentials,
  schemas, and permissions for user, agent, project role, workspace, and
  request mode.
- Enforces `allow`, `ask`, `auto`, and `deny`; scheduled execution cannot wait
  for interactive approval.
- Does not execute tools, access the network, or mutate persistence.
- Tool identity remains provider-qualified (`provider.tool_name`).
- MCP, OpenAPI, shell, and other integrations remain provider-driven; do not
  hard-code concrete self-hosted applications into core.

### `data layer` - persistence and contracts

- Owns repositories, schema migrations, transactions, ownership checks, and
  durable metadata for users, workspaces, agents, sessions, tasks, activity,
  terminals, integrations, and audit history.
- Starts with the existing WAL SQLite Subpolar store and `HERMES_HOME` path
  rules. Do not introduce a database replacement during this migration.
- Exposes browser-safe DTOs and validation schemas through an explicit
  subpath. Server-only repositories and credentials must not enter browser
  bundles.
- Uses canonical paths and workspace-root authorization for filesystem data.
- Keeps secrets out of project data, browser storage, `.env` behavioral config,
  and serialized API responses.

## Transitional Layout

Use current directories until each package cutover is complete:

```text
web/                         -> web ui
gateway/ + hermes_cli/       -> api gateway
providers/ + agent/provider* -> chat provider interface
run_agent.py + agent/        -> harness
hermes_state*.py + store     -> data layer
apps/shared/                 -> temporary contracts, then data layer/contracts
```

`apps/desktop`, `ui-tui`, `website`, `tests-js`, plugins, skills, and legacy
platform adapters are not target runtime packages. Keep them only while they
still provide required parity, documentation, or test coverage. Plugins and
new third-party integrations remain outside core package migration.

## Decisions

- Bun is the JavaScript package manager and workspace runner. Pin Bun and Node
  versions in repository metadata and CI.
- One lockfile is authoritative. Remove `package-lock.json` only after Bun
  install and CI are green; do not maintain npm and Bun lockfiles in parallel.
- TypeScript strict mode is required for all target packages. No new `any`
  across package boundaries.
- Runtime package dependencies use exact versions or repository-approved
  controlled update policy. Dependency changes update the lockfile and supply
  chain checks.
- `data layer` owns shared transport schemas through a browser-safe export; do not
  add a seventh contracts package unless two real consumers require an
  independent lifecycle.
- SQLite remains the first deployment database. Repository interfaces may
  leave room for another backend later, but no speculative adapter is built
  now.
- `api gateway` and  harness` remain separate. `api gateway` handles
  transport and identity;  harness` handles one agent execution.
- No compatibility layer is added without a concrete external API, persisted
  record, or older runtime that needs it.
- Python and TypeScript run side by side during migration. Delete Python only
  after replacement behavior, tests, packaging, and deployment are verified.

## Migration Phases

Each phase must land independently and leave the repository buildable.

### 0. Freeze boundaries and inventory

- Confirm package names, ownership, public APIs, and dependency direction.
- Inventory Python imports, CLI entry points, gateway routes, WebSocket
  messages, provider adapters, tool registries, persistence tables, and
  Electron preload capabilities.
- Mark each item `port`, `wrap`, `keep external`, or `remove`.
- Record API and persisted-data compatibility requirements before deleting
  code.

Exit criteria: inventory reviewed; no target module has an undefined owner;
architecture checks can reject forbidden imports.

### 1. Bootstrap Bun workspace

- Add target workspace directories and minimal package manifests.
- Pin Bun/Node versions, migrate root scripts, and generate one Bun lockfile.
- Add shared TypeScript compiler, lint, format, test, and build configuration.
- Keep Python test commands unchanged through `scripts/run_tests.sh` while
  Python remains in use.
- Add CI jobs for clean Bun install, package checks, Python regression tests,
  and Docker build/health checks.

Exit criteria: clean clone installs; all six packages typecheck; existing
Python and JavaScript checks still run; no production code depends on an
untracked local package.

### 2. Port contracts and data layer

- Move `apps/shared/src/subpolar*.ts` contracts into `data layer/contracts`.
- Port `hermes_cli/subpolar_store.py` behavior, including owner scoping,
  workspace-root validation, WAL behavior, migrations, and transaction
  boundaries.
- Define repository interfaces before moving callers.
- Add behavior tests for isolation, path traversal/symlink rejection,
  restart persistence, concurrent access, and temporary `HERMES_HOME`.
- Keep old Python store available behind the transition boundary until the new
  store passes dual-read or migration verification.

Exit criteria: `api gateway` can use TypeScript data repositories for foundation
flows; no browser bundle contains server-only data code; `openapi.json` and
DTO validation agree.

### 3. Port chat provider interface and adapters

- Implement the normalized provider interface first, including streaming,
  tool calls, usage, cancellation, timeout, retry, and typed errors.
- Port one provider end to end before adding more adapters.
- Port backend identity and failure-scope behavior without reimplementing
  comparisons at call sites.
- Add provider contract tests with deterministic fakes and live-provider tests
  only where explicitly configured.

Exit criteria:  harness` can call a fake provider and one real
provider through the `chat provider interface`; fallback and cancellation
tests pass.

### 4. Port tool resolver

- Build immutable resolver inputs from authenticated request context and data
  snapshots.
- Port tool discovery, aliases, normalized names, schemas, credential refs,
  and permission evaluation.
- Ensure scheduled mode fails closed instead of waiting for approval.
- Test that unauthorized tools and credentials never reach  harness`/
  `chat provider interface` calls.

Exit criteria: `tool resolver` is deterministic for identical inputs, has no
network or persistence side effects, and produces auditable decisions.

### 5. Port harness

important: harness itself is stateless, only gets data provided by data layer.

- Port prompt construction, tool-call loop, streaming, interruption,
  compression, fallback, and final response handling.
- Make all state inputs explicit; remove imports of `api gateway` globals, CLI state,
  filesystem paths, and direct credential stores.
- Preserve stable system prompts and role alternation to protect prompt-cache
  behavior.
- Add concurrency tests proving requests do not share mutable execution state.
- Compare Python and TypeScript outputs with behavior-oriented conformance
  vectors, not source snapshots.

Exit criteria: one request can execute entirely through `chat provider interface`
and `tool resolver`
interfaces; concurrent requests remain isolated; stream and non-stream paths
reconcile to equivalent final results.

### 6. Port API gateway and realtime transport

- Port authenticated HTTP routes, WebSocket methods/events, session routing,
  activity events, terminal transport, and scheduled dispatch in slices.
- Keep authentication actor identity separate from agent identity.
- Enforce CSRF/origin checks, workspace authorization, credential isolation,
  bounded request sizes, rate limits, and reconnect semantics.
- Update `openapi.json`, shared DTOs, deployment docs, and API tests together.
- Add E2E coverage with temporary `HERMES_HOME` for bootstrap auth, restart,
  reconnect, owner/workspace isolation, and browser-to-gateway flow.

Exit criteria: Docker Compose serves `web ui` and `api gateway`; foundation,
chat, activity, source-control, terminal, agent, integration, and schedule
flows use TypeScript services without Python calls on the request path.

### 7. Port and verify web UI

- Keep `web/` as canonical browser package, using gateway APIs rather than
  direct legacy dashboard behavior.
- Port only browser-safe UI behavior from `apps/desktop/src`; replace native
  capabilities with service-gated APIs or remove them.
- Verify streaming transcript invariants, workspace switching, reconnect,
  activity/source-control/terminal surfaces, responsive layouts, and focus
  behavior.
- Run browser E2E against Docker, including mobile viewport coverage.

Exit criteria: browser parity checklist is complete; no required feature uses
Electron preload APIs; production assets and SPA fallback work from Compose.

### 8. Remove obsolete packages and Python paths

- Remove old dashboard routes only after Subpolar routes are authoritative.
- Remove `apps/desktop/electron`, preload types, installer/release config,
  native dependencies, Nix packaging, and native installers after browser
  parity, matching the active rewrite plan.
- Remove `ui-tui` only when its supported behavior has an explicit replacement
  or is out of product scope.
- Delete Python modules one package at a time after import, test, packaging,
  and Docker scans prove they are unused.
- Remove transition flags, dual-read code, and temporary compatibility shims.

Exit criteria: target dependency graph contains only six runtime packages;
clean build and Docker image contain no obsolete Python request path; release
artifacts match Docker-only support policy.

## Verification Matrix

Run relevant checks at every phase:

- `bun install --frozen-lockfile`
- `bun run check`
- `bun test`
- `scripts/run_tests.sh <focused Python tests>` while Python remains
- `docker compose config`
- `docker compose build`
- Docker E2E with temporary `HERMES_HOME`
- API contract tests against `openapi.json`
- Dependency-direction/import-boundary check
- Browser E2E for auth, workspace isolation, streaming, reconnect, terminal,
  and mobile layout behavior

Tests must verify behavior and security invariants, not source text, snapshots,
hard-coded catalog counts, or volatile provider data.

## Non-goals

- Big-bang rewrite or simultaneous database migration.
- New model, tool, messaging, or self-hosted application integrations during
  package migration.
- Browser access to credentials, filesystem APIs, database drivers, or provider
  SDKs.
- Retaining native installers, Nix deployment, bare-host production support,
  or a separate cloud runtime.
- A generic plugin ABI. Existing plugin contracts are migrated only when a
  required supported feature depends on them.

## Completion Checklist

- [ ] Six target packages have stable names, manifests, and dependency edges.
- [ ] Bun and Node versions are pinned; one lockfile is used in CI and release.
- [ ] Data repositories and browser-safe contracts are TypeScript-owned.
- [ ] Provider, resolver, and harness boundaries have conformance tests.
- [ ] Gateway routes and WebSocket events are TypeScript-owned and documented.
- [ ] Browser UI reaches parity without Electron capabilities.
- [ ] Temporary `HERMES_HOME` E2E covers auth, isolation, persistence, and
      reconnect.
- [ ] Python request-path modules and obsolete packages are deleted only after
      import/build/test/deployment verification.
- [ ] Docker Compose is the only supported production deployment.
