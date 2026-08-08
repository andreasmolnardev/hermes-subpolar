# TypeScript-Only Subpolar Rewrite

## Status And Authority

This is the active implementation plan and task tracker for the clean-break
Subpolar rewrite. It supersedes the previous Python-to-TypeScript compatibility
migration.

- The new product has no Python runtime fallback.
- Existing Python sessions, databases, configuration, plugins, credentials,
  transport protocols, and user data are unsupported and are not migrated.
- TUI, ACP, cron, messaging platforms, voice/media, and desktop workflows are
  out of scope unless a later plan explicitly adds a TypeScript replacement.
- The shipped runtime is Bun and TypeScript only.
- Unsupported input must fail closed before a provider request, tool execution,
  filesystem operation, or network request.
- `TODO.md` does not exist. Checkboxes in this document are the task tracker.

Historical Python source may be used for product research only. It is not a
behavioral oracle and must not be bridged into the new runtime.

## Product Contract

The product is a self-hosted web agent:

1. `bun run serve` and the container entry point start one Bun process. There
   is no general-purpose end-user CLI, command registry, interactive shell, or
   compatibility command surface in the target product.
2. That process serves the compiled `web-ui`, REST API, WebSocket API, and
   runtime gateway from one origin.
3. The gateway validates a request, authenticates it, creates or resumes a
   TypeScript-owned session, invokes `harness`, and projects ordered events.
4. `harness` owns a cancellable turn state machine, provider attempts, tool
   orchestration, budgets, persistence boundaries, and one terminal outcome.
5. Providers implement `chat-provider-interface`; no provider SDK behavior is
   embedded in `harness`.
6. `tool-runtime` provides executable native handles. The initial supported
   tools are operator-configured MCP tools, fixed-origin OpenAPI operations,
   and verified argv-only shell commands.
7. SQLite is a new TypeScript-owned store. It starts empty and has no Python
   schema reader, writer, compatibility metadata, or retention requirement.

## Package Ownership

| Package | Owns | Must not own |
| --- | --- | --- |
| `packages/api-gateway` | Uniform API abstraction, Bun server entry point, HTTP/WebSocket listener, auth/session cookies, static assets, request validation, composition root, shutdown, public API command mapping, event projection, session turn lease, request/response envelopes | General-purpose CLI commands, agent-loop policy, provider codecs, tool implementations |
| `packages/harness` | Turn state machine, cancellation, retries, fallback, budgets, tool-call continuation, lifecycle events | Network, filesystem, SQLite, process globals, web types |
| `packages/chat-provider-interface` | Provider-neutral messages, streams, usage, errors, provider adapters | Harness policy, gateway transport, secret storage |
| `packages/tool-resolver` | Schema validation, deterministic descriptors, collision checks, restrictive policy calculation | Tool execution, process/network I/O |
| `packages/tool-runtime` | MCP, OpenAPI, shell execution, operator policy enforcement, output limits | Model/provider selection, browser HTTP routes |
| `packages/data-layer` | New SQLite schema, migrations within the TS schema line, transactions, sessions, messages, usage, checkpoints | Provider/tool side effects, HTTP types |
| `packages/web-ui` | Browser UI, API client, WebSocket rendering, approval UX | Runtime behavior, server imports, credentials |
| `packages/shared` | Stable browser-safe wire types only | Runtime implementation, filesystem, process, provider SDKs |

Dependency direction is fixed:

```text
api-gateway -> harness -> chat-provider-interface
       |              |
       |              -> tool-resolver
       -> tool-runtime -> tool-resolver
       -> data-layer
web-ui -> shared, api-gateway/client, data-layer/contracts
```

`tool-runtime` may be composed by `api-gateway`; it must not be imported by
`harness`. Every new edge requires an update to
`scripts/check-package-boundaries.mjs` and its test.

## Architectural Mental Model

The system is a set of inward-facing policy cores surrounded by adapters. The
browser and network are inputs, SQLite is durable state, providers and tools are
side-effecting outputs, and `api-gateway` is the only place where those pieces
are assembled. Package boundaries exist to make authority visible and to make
unsafe dependency directions impossible.

### One Request, One Direction

A supported turn follows this sequence and no other:

1. `web-ui` sends a versioned browser-safe request to `api-gateway`.
2. `api-gateway` authenticates the actor, validates origin/CSRF/input, acquires
   the session lease, and loads owner-scoped state through `data-layer`.
3. `api-gateway` resolves configured provider credentials to an opaque handle
   and asks `tool-resolver` for deterministic allowed tool descriptors.
4. `api-gateway` constructs a `harness` request from immutable messages,
   provider/tool ports, budgets, deadlines, persistence callbacks, and an
   abort signal.
5. `harness` owns the turn state machine. It may call only the supplied
   provider and tool ports; it cannot discover credentials, open SQLite, spawn
   processes, access the network, or infer browser identity.
6. A provider adapter in `chat-provider-interface` translates normalized model
   contracts to one configured provider protocol.
7. Approved tool calls are matched to handles created by `tool-runtime`.
   `tool-resolver` decides policy; `tool-runtime` performs the side effect;
   `harness` only orchestrates the supplied handle.
8. Persistence callbacks commit ordered messages, attempts, checkpoints,
   approvals, usage, and the single terminal outcome through `data-layer`.
9. `api-gateway` projects ordered domain events to HTTP/SSE/WebSocket envelopes;
   `web-ui` renders them without reproducing harness logic.

If validation or capability resolution fails at any step, processing stops at
that boundary. It must never jump sideways into a Python implementation or
partially execute the same turn in two runtimes.

### Boundary Responsibilities

- **Transport boundary:** `api-gateway` cares about authenticated actors,
  request limits, protocol versions, leases, and event delivery. It does not
  care how prompts, provider payloads, or tool implementations work.
- **Execution boundary:** `harness` cares about deterministic lifecycle,
  ordering, cancellation, budgets, and exactly one outcome. It does not care
  about HTTP, cookies, SQLite, process globals, concrete providers, or concrete
  tools.
- **Provider boundary:** `chat-provider-interface` cares about normalized
  messages, streams, errors, usage, and protocol codecs. It does not decide
  retries, fallback policy, session ownership, or where secrets are stored.
- **Policy boundary:** `tool-resolver` cares about trusted descriptors,
  schemas, collisions, and restrictive policy reduction. It does not execute,
  discover arbitrary infrastructure, read ambient configuration, or mutate
  state.
- **Effect boundary:** `tool-runtime` cares about safely executing preapproved
  shell/OpenAPI/MCP handles with limits and cancellation. It does not select
  models, authorize users, construct prompts, or expose browser routes.
- **Persistence boundary:** `data-layer` cares about schema lineage,
  transactions, ownership, ordering, idempotency, recovery, and retention. It
  does not call providers/tools or define HTTP behavior.
- **Presentation boundary:** `web-ui` cares about accessible interaction,
  optimistic state, reconnection, and rendering ordered events. It does not
  contain credentials, server policy, provider SDKs, database code, or tool
  execution.
- **Wire-contract boundary:** `shared` cares only about stable JSON-safe types
  consumed on both sides of the browser boundary. It must not become a dumping
  ground for runtime helpers or a way to bypass dependency direction.

### Abstraction Rules

- Add an abstraction only for a real boundary with at least one current
  producer and consumer, or where deterministic tests require an injected
  clock, process, transport, persistence, or credential port.
- Interfaces describe capabilities, not implementation ancestry. Prefer small
  request/result ports over service locators, registries, global containers,
  or generic plugin objects.
- Concrete adapters live at the edge and are instantiated only by the gateway
  composition root. Core packages receive already-validated values and opaque
  handles.
- Cross-package data is immutable, JSON-safe where persisted/transmitted, and
  validated once at the owning boundary. Do not pass database rows, provider
  SDK objects, `Request`/`Response`, or process handles across domain packages.
- Errors are typed at the producing boundary, mapped once by the gateway, and
  redacted before persistence or transport.
- Do not create compatibility abstractions for deleted Python behavior. A
  removed capability gets an explicit unsupported error or disappears from the
  product surface.

## Explicit Product Non-Goals

The Bun rewrite intentionally does not preserve every Hermes Python surface:

- No general-purpose CLI, subcommand framework, interactive terminal command,
  updater command, doctor command, service installer, or Python-compatible
  command syntax. Operational startup is `bun run serve` or the container
  entry point; configuration is file/environment based as defined by the Bun
  contract.
- No TUI, ACP/editor bridge, desktop application, cron scheduler, messaging
  platform gateway, voice/media pipeline, computer-use stack, Python plugin
  loader, Python skill runtime, or legacy installer.
- No migration of Python sessions, databases, credentials, configuration,
  plugins, transport protocols, or runtime flags.
- No generic plugin ABI or speculative provider/tool abstraction. New external
  capabilities enter through explicit MCP, fixed-origin OpenAPI, verified
  executable, or separately approved TypeScript adapter boundaries.

Anything in this list is removed rather than ported unless a later plan changes
the product contract and names a TypeScript package owner, security model, and
test gate.

## Non-Negotiable Engineering Rules

1. Do not add Python subprocesses, Python imports, Python RPC bridges, or
   Python compatibility readers anywhere in the new path.
2. Do not accept model-controlled shell command strings, executable paths,
   network origins, authorization headers, MCP server configuration, or
   OpenAPI documents.
3. Shell execution uses an absolute argv executable, canonical path checks,
   deny-before-allow rules, approved cwd roots, minimal explicit environment,
   timeout, cancellation, process cleanup, and bounded stdout/stderr.
4. OpenAPI operations use a trusted preloaded document, HTTPS fixed origin,
   explicit operation allowlist, declared parameters only, no redirects, body
   limits, timeout, and no model-controlled headers or host.
5. MCP starts with explicit operator-configured transports. Discovery must
   initialize, list tools, sanitize schemas/names, reject collisions, correlate
   JSON-RPC IDs, bound messages, and redacts transport errors.
6. A turn has exactly one terminal event: `completed`, `cancelled`,
   `budget_exhausted`, `provider_failed`, `tool_failed`, or
   `approval_rejected`.
7. No retry may repeat a tool side effect. A tool call gets a stable call ID;
   non-idempotent execution is checkpointed before dispatch.
8. Logs, metrics, errors, traces, and browser events must never contain prompt
   text, tool arguments, tool results, authorization values, cookies, API keys,
   or opaque credential handles.
9. All public API changes update `openapi.json` in the same change.
10. Tests assert behavior and invariants. Do not test source text, volatile
    provider catalogs, snapshots of secrets, or implementation counts.

## Meaning Of "Bun-Only Monorepo"

The migration is not complete merely because the default Docker command starts
Bun. All of the following must be true at the same time:

- Bun is the only production runtime, package manager, workspace runner, test
  runner, build runner, and release entry point for Subpolar.
- `bun.lock` is the only root JavaScript lockfile. Root and workspace scripts do
  not invoke `npm`, `npx`, `pnpm`, Yarn, `pip`, `uv`, or Python.
- Every supported request enters through `api-gateway` and completes through
  TypeScript-owned provider, harness, tool, and persistence paths.
- No active package contains a Python bridge, Python runtime selector, Python
  executable reference, legacy Python schema reader, or fallback-to-Python
  branch.
- A fresh clone can install, build, test, serve, package, and run the supported
  product without a Python interpreter or Python environment.
- Docker and release artifacts contain no Python interpreter, virtual
  environment, Python package, or copied Python runtime source.
- CI has no required Python job, Python cache, Python dependency installation,
  or Python-based release helper.
- Unsupported legacy capabilities are removed from the product and fail closed;
  they are never retained through an invisible Python sidecar.
- Historical Python implementation code is deleted from this repository or
  moved to a separately versioned archive/research repository. Documentation
  may mention Python only to describe removed compatibility or show user-owned
  tool content; it must not advertise Python as a Subpolar requirement.

This definition applies to production code, tests, scripts, CI, containers,
installers, documentation, and release automation. Optional integrations may
execute an operator-configured external program, but core must not install,
configure, assume, or special-case Python for them.

## Roadmap At A Glance

| Stage | Outcome | Blocking proof |
| --- | --- | --- |
| 0. Freeze contracts | One versioned Bun API, event model, config model, and package graph | Contract, boundary, and threat-model review |
| 1. Establish Bun product shell | One Bun process owns HTTP, WebSocket, auth, static assets, and shutdown | Authenticated browser smoke test without Python installed |
| 2. Make state TypeScript-owned | Fresh SQLite schema owns identity, sessions, turns, recovery, approvals, and usage | Restart/idempotency tests with no legacy reader |
| 3. Complete the harness | Every supported turn has one deterministic TypeScript lifecycle | Fake-provider and interrupted-turn matrix |
| 4. Make providers native | Every advertised provider is a TypeScript adapter | Recorded codec/error/stream tests per provider |
| 5. Make tools native | Resolver decisions execute only through `tool-runtime` handles | Adversarial shell/OpenAPI/MCP and approval E2E |
| 6. Cut the browser over | Every visible UI feature uses the versioned Bun API | Browser lifecycle, stream, approval, reconnect, restart E2E |
| 7. Make the monorepo Bun-native | Install, build, test, CI, Docker, and release use Bun only | Fresh-clone and container matrix on supported platforms |
| 8. Retire Python | Bridges, selectors, compatibility code, Python trees, tests, docs, and dependencies are gone | Repository/runtime scans plus full release matrix |

Stages are ordered by dependency, not by directory. Python deletion begins as
soon as a capability has a verified Bun owner, but the final bulk removal is
blocked until Stages 0-7 pass. No stage may introduce a new compatibility path
to make deletion easier.

## Python Deprecation Ledger

Every Python-owned capability must end in exactly one disposition:

1. **Replace** — a supported product capability gets a Bun/TypeScript owner and
   equivalent behavior and security tests.
2. **Remove** — the capability is outside the new product contract; remove its
   routes, controls, docs, configuration, tests, dependencies, and source.
3. **Externalize** — a genuinely independent integration becomes an
   operator-managed MCP/OpenAPI/executable integration or a separately
   versioned repository. Core retains no Python-specific adapter.

`wrap`, `bridge`, `fallback`, and `keep both` are not final dispositions.

### Why Every Python File Becomes Redundant

Python files are not removed merely because TypeScript files exist. They become
redundant when their responsibility is either owned by a verified Bun package
or intentionally absent from the product contract. The required mapping is:

| Python source family | Former responsibility | Bun owner or disposition | Why Python is redundant at completion |
| --- | --- | --- | --- |
| `run_agent.py`, `agent/` | Conversation loop, prompts, context, retries, tools, recovery, model orchestration | `harness` plus explicit provider/tool/persistence ports | The Bun state machine owns every supported turn and its invariants; a second loop would create divergent policy and duplicate-side-effect risk |
| `providers/`, Python provider adapters, model-provider plugins | Provider request/response codecs, streaming, errors, credentials | `chat-provider-interface` adapters; unported providers are removed from advertised support | Every advertised provider has a native adapter and conformance tests, so Python codecs add no supported capability |
| `model_tools.py`, `toolsets.py`, `tools/registry.py`, Python discovery helpers | Tool catalogs, aliases, schemas, permission resolution | `tool-resolver` | Resolution is deterministic and TypeScript-owned; import-time Python discovery would bypass policy and package boundaries |
| `tools/*.py`, `tools/environments/`, Python MCP/OpenAPI/browser/media helpers | Tool execution and third-party integrations | `tool-runtime`, explicit TypeScript adapters, external MCP/OpenAPI, or remove | Retained effects execute through bounded native handles; unsupported integrations are intentionally absent, so Python execution is neither fallback nor compatibility |
| `gateway/`, Python dashboard/gateway modules, platform gateways | HTTP/WebSocket transport, auth, routing, events, platform delivery | `api-gateway`; platform delivery is removed unless separately planned | One Bun origin owns the supported web protocol; a Python gateway would create a second authority and revive undocumented routes |
| `hermes_cli/`, launcher scripts, doctor/update/service-install commands | User CLI, installation, process/service management | Remove; startup is `bun run serve` or the container entry point | A general CLI is intentionally outside the product contract, so preserving command compatibility has no consumer |
| `hermes_state*.py`, Python stores, checkpoint/search helpers | Sessions, messages, search, checkpoints, recovery, usage | `data-layer`; unsupported legacy database formats are rejected | The TypeScript schema is authoritative and starts fresh; Python readers/writers would create dual ownership and block schema cleanup |
| `cron/` and cron tools | Schedules, reminders, background execution | Remove unless a later Bun scheduler plan is approved | Scheduling is intentionally unsupported, so keeping Python would be hidden production scope rather than compatibility |
| `batch_runner.py`, `mini_swe_runner.py`, `trajectory_compressor.py`, evaluation helpers | Batch/research/evaluation workflows | Remove or move to a separately versioned research repository | They are not part of the self-hosted web-agent contract and must not dictate production dependencies |
| Python TUI, ACP, desktop, messaging, voice/media, browser/computer-use modules | Legacy interaction surfaces | Remove or externalize under a later explicit TypeScript plan | The browser product intentionally excludes these surfaces; Python cannot remain as an undeclared sidecar |
| Python plugin/skill loaders and bundled Python integrations | Dynamic extension loading | External MCP/OpenAPI/executable integrations or separately versioned packages | Core uses explicit operator-configured boundaries and does not execute imported Python extension code |
| Python bootstrap, installer, packaging, update, release, and CI scripts | Environment creation and repository operations | Bun/TypeScript scripts for required operations; obsolete workflows removed | Install, test, package, and release work without Python, so these scripts have no role in the supported lifecycle |
| Python tests and fixtures | Verification of Python behavior and compatibility | Bun unit/contract/integration/E2E tests; language-neutral fixtures retained selectively | Once Python behavior is no longer a contract, testing it would preserve an implementation the product has deliberately retired |

This table is a responsibility map, not permission for bulk deletion. Before
Wave 8, generate `docs/migration/python-retirement-ledger.md` from
`rg --files -g '*.py'` and list every tracked Python file exactly once with:

- its former responsibility;
- `replace`, `remove`, or `externalize` disposition;
- owning Bun package or explicit non-goal;
- replacement tests and security/recovery evidence;
- references that must be deleted with it;
- deletion wave/change identifier and completion status.

- [ ] Create and review the per-file retirement ledger before deleting Python
  directories.
- [ ] Reject the Wave 8 exit gate if any tracked Python file is unclassified,
  has more than one owner, or lacks deletion evidence.
- [ ] Delete ledger rows only after the corresponding files are gone; retain
  the completed ledger as the historical rationale for removal.

### Runtime And Composition TODOs

- [ ] Delete `packages/api-gateway/src/python-bridge.ts` and its exports, tests,
  fixtures, configuration, and request fields.
- [ ] Delete `packages/api-gateway/src/python-runtime-bridge.ts` and all
  whole-turn subprocess protocol code.
- [ ] Replace `GatewayRuntimeName = "harness" | "python"` with a single Bun
  harness path; remove runtime adapter maps and Python fallback selection.
- [ ] Remove `RuntimeSelection = "harness" | "python"`, the runtime-selection
  persistence table, pinning APIs, migration flags, and rollback-to-Python
  policy.
- [ ] Remove Python references from harness context/model metadata. Unsupported
  context or model shapes return typed terminal errors before side effects.
- [ ] Prove that every server route, WebSocket command, scheduled internal
  action retained in scope, and browser turn calls the same Bun composition
  root.
- [ ] Add a boundary test that rejects filenames, imports, spawn arguments,
  configuration keys, and executable references that reintroduce a Python
  runtime path inside active packages.

### Persistence TODOs

- [ ] Remove Python-shaped session/message readers and `python-legacy` runtime
  metadata from `data-layer`.
- [ ] Remove migration tables and fields whose only purpose is Python/TS
  coexistence. Keep migrations only within the TypeScript schema lineage.
- [ ] Create a new database identity/version marker that rejects legacy Python
  databases with a clear operator-facing error and no mutation.
- [ ] Verify a fresh database, upgrade between TS schema versions, restart,
  retention, corruption handling, and interrupted-turn recovery.
- [ ] Remove Python database fixtures and differential tests after equivalent
  TypeScript behavior tests cover the supported contract.

### Product Surface TODOs

- [ ] Inventory every Python route, WebSocket method/event, CLI command,
  configuration key, environment variable, UI control, and documented feature;
  assign `replace`, `remove`, or `externalize` with a Bun owner.
- [ ] Remove TUI, ACP, desktop, cron, platform messaging, voice/media,
  computer-use, Python plugin loading, and Python skill execution from the
  supported product unless a later approved TypeScript plan explicitly owns
  them.
- [ ] Remove legacy dashboard pages and controls that call unsupported Python
  APIs; do not leave disabled or misleading placeholders.
- [ ] Rewrite the root README, deployment guide, security model, contribution
  guide, issue templates, command help, and provider/tool documentation around
  the Bun product contract.
- [ ] Return explicit versioned errors for removed API/configuration inputs;
  never silently ignore them or dispatch them to a sidecar.

### Source, Tests, And Dependency TODOs

- [ ] Delete Python runtime trees and entry points, including `agent/`,
  `gateway/`, `hermes_cli/`, `providers/`, `cron/`, `run_agent.py`,
  `batch_runner.py`, `mini_swe_runner.py`, `mcp_serve.py`, and their runtime
  tests, after each retained behavior has passed its deletion gate.
- [ ] Delete Python tool/plugin implementations from core. Externalize selected
  integrations through MCP, OpenAPI, or separate repositories without carrying
  Python discovery or installation logic in Subpolar.
- [ ] Remove Python manifests, lockfiles, virtual-environment setup, bootstrap
  code, dependency installers, caches, generated bytecode, and Python-specific
  security/update logic.
- [ ] Port required repository maintenance and release scripts to TypeScript
  executed by Bun; delete obsolete research, compatibility, and installer
  scripts rather than porting them automatically.
- [ ] Delete Python test commands and fixtures from the required test matrix.
  Keep language-agnostic protocol fixtures only when they test a current Bun
  contract.
- [ ] Remove the root `package-lock.json` and npm workspace scripts after
  `bun install --frozen-lockfile` and all Bun checks pass from a clean clone.
- [ ] Remove sidecar lockfiles and Node/Python bootstrappers that belong only to
  removed legacy integrations.

### CI, Container, And Release TODOs

- [ ] Pin Bun once in repository metadata and CI; document the supported Bun
  version and upgrade policy.
- [ ] Make `bun.lock` the sole root dependency lock and require frozen installs
  in CI and Docker.
- [ ] Replace required Python/npm CI jobs with Bun workspace checks, browser
  E2E, API contract tests, and Docker lifecycle tests.
- [ ] Build the production image from Bun stages only and scan the final image
  for Python binaries, virtual environments, Python packages, and copied legacy
  source.
- [ ] Run Linux and macOS tests without assuming platform-specific executable
  paths; inject process fixtures for shell cancellation tests.
- [ ] Make release versioning, changelog, artifact assembly, and publishing Bun
  scripts with dry-run coverage.
- [ ] Add a clean-environment gate that runs install/build/test/serve with
  Python absent from `PATH`, proving it is not accidentally used.

### Per-Capability Deletion Gate

A Python capability may be deleted only after all applicable items pass:

- [ ] Its disposition and Bun owner are recorded in this plan.
- [ ] Supported success, failure, authorization, cancellation, timeout, and
  redaction behavior is covered by black-box tests.
- [ ] Stateful behavior has restart, retention, idempotency, and
  no-duplicate-side-effect coverage.
- [ ] Public HTTP/WebSocket/UI behavior has contract and E2E coverage.
- [ ] Active imports, subprocess calls, configuration, documentation, CI,
  packaging, and release references to the Python implementation are gone.
- [ ] Removing it does not require weakening a package boundary or moving its
  implementation into `api-gateway`, `harness`, `shared`, or `web-ui`.

## Orchestration Model

One orchestration agent owns the plan. It delegates independent work to
subagents in parallel and integrates only reviewed, tested changes.

### Persistent Implementation Loop

The orchestrator executes the roadmap in one persistent pass. It does not stop
after analysis, scaffolding, a partial wave, or the first failing test. It loops
until the Definition Of Done passes or a genuine external decision/credential
blocker remains:

1. **Observe:** inspect the current worktree, package graph, active plan
   checkboxes, test failures, and Python retirement ledger. Preserve unrelated
   user changes.
2. **Select:** choose the earliest incomplete exit gate whose prerequisites are
   satisfied. Split it into independent work packets with exclusive files and
   explicit contracts.
3. **Parallelize:** dispatch exploration and package-local implementation
   packets concurrently. Never let two agents edit the same file, lockfile,
   shared contract, `openapi.json`, or shared fixture.
4. **Integrate:** review every returned diff and result; reject boundary drift,
   untested assumptions, broad refactors, secret exposure, compatibility
   shims, or behavior outside the product contract.
5. **Verify:** run focused tests first, then package checks, boundary checks,
   cross-package integration tests, and the applicable release-matrix prefix.
6. **Repair:** classify failures as contract, implementation, test,
   environment, or pre-existing worktree issues. Fix in-scope failures and
   rerun; do not mark a checkbox to bypass a failure.
7. **Retire:** when a Bun owner passes its deletion gate, remove the associated
   Python path and all imports, tests, docs, config, dependencies, and packaging
   references in the same bounded change.
8. **Record:** update this plan, the per-file retirement ledger, `PATCH.md`, and
   API/schema docs with evidence. Commit a coherent wave or capability slice.
9. **Repeat:** return to Observe and continue automatically until all waves and
   absence checks pass.

The orchestrator remains responsible for final correctness. A subagent report
is evidence, not acceptance; all changes must be inspected and verified in the
integrated worktree.

### Work Packet Template

Every parallel implementation packet must state:

- objective and the exact plan checkboxes it advances;
- files/directories exclusively owned by the packet;
- existing interfaces consumed and exported contract produced;
- allowed package dependencies and forbidden imports;
- success, failure, security, cancellation, timeout, persistence, and
  redaction behaviors that apply;
- focused verification commands and expected observable outcomes;
- Python files made redundant by the packet and whether they may be deleted
  now or only recorded for Wave 8;
- non-goals, especially legacy parity and intentionally removed CLI/TUI/ACP/
  cron/platform/media behavior;
- instruction to stop and report rather than redesign a shared contract or
  modify files owned by another packet.

### Orchestration Agent Responsibilities

- Keep this plan current; update a checkbox only after its named verification
  passes.
- Start each wave by reading affected package manifests, boundary rules, tests,
  and uncommitted changes. Do not overwrite another agent's changes.
- Define an interface note before parallel implementation begins: exported
  symbols, JSON shapes, error classes, ownership, package dependencies, test
  command, and files each agent may modify.
- Assign non-overlapping file ownership. When overlap is unavoidable, one agent
  writes the shared contract first; dependent agents wait for that result.
- Require each subagent to report changed files, test commands/results,
  assumptions, and unresolved risks. The orchestration agent reviews diffs
  before integration.
- Run package checks immediately after each wave. Run the full release matrix
  only after all waves are integrated.
- Stop and fix boundary, security, data-loss, duplicate-side-effect, or event
  ordering failures before starting the next wave.

### Subagent Contract

Every implementation subagent receives all of the following:

- Exact package/module ownership and the files it may edit.
- The contract it consumes and produces.
- Explicit non-goals and forbidden imports.
- Required unit, integration, and adversarial tests.
- Required verification command.
- Instruction to use `apply_patch`, preserve unrelated worktree changes, and
  avoid broad formatting or unrelated refactors.

Exploration subagents never edit files. They return source references and a
minimal recommendation. Implementation subagents do not redesign interfaces
outside their assignment; they report a blocker to the orchestrator instead.

### Parallel Work Rules

- Never run two implementation agents on the same source file.
- Parallelize package-local changes only after their dependency contracts are
  frozen.
- One agent owns lockfile regeneration after all manifest edits in a wave.
- One agent owns `openapi.json` after HTTP contract changes are approved.
- One agent owns shared test fixtures; all other agents consume them read-only.
- Run independent test commands in parallel. Run dependent build, browser, and
  Docker commands sequentially.
- Do not merge a wave while any agent reports an untested error path or an
  unresolved security assumption.

## Baseline Inventory

### Present Implemented Slice

- [x] Workspace package boundary checker includes `api-gateway` and
  `tool-runtime`.
- [x] `api-gateway` starts a Bun listener with `/api/health` and a
  non-streaming OpenAI-compatible `/v1/chat/completions` route.
- [x] The server explicitly selects the `harness` runtime for that route.
- [x] `tool-runtime` has native handles for MCP discovery/calls, fixed-origin
  OpenAPI calls, and verified argv-only shell execution.
- [x] Focused server and tool-runtime typechecks and tests pass.

### Known Gaps

- [x] Bun server serves `web-ui` static assets with safe SPA fallback; API misses
  remain API errors.
- [ ] The authenticated SSE/WebSocket chat transport and active browser workspace
  are implemented and have unit/integration coverage, but Playwright browser E2E
  was explicitly skipped; reconnect, heartbeat, and remaining administrative
  browser gates are not accepted without it.
- [x] The server has first-user bootstrap, password hashing, login/logout, cookie
  sessions, session rotation/revocation, CSRF checks, origin checks, and
  owner-scoped projects, agents, and sessions; Playwright E2E remains unrun.
- [x] The current provider path is an OpenAI-compatible adapter with streaming,
  tools, multimodal serialization, recorded error/usage tests, and a reduced
  catalog; other provider adapters and live provider tests are not implemented.
- [ ] MCP transport implementations and browser approval E2E remain unverified;
  shell process-port/cancellation and OpenAPI schema, redirect, and SSRF tests
  pass.
- [x] New SQLite session persistence, idempotency, recovery, and retention are
  connected to the server path and covered by Bun tests.
- [x] Legacy dashboard pages and unsupported controls were removed; the shipped
  `SubpolarApp` entry uses only the versioned authenticated Bun API.

### Verification Notes

- `bun install --frozen-lockfile`: passed.
- `bun run check:boundaries`: passed; all eight active packages were reported valid.
- `bun run typecheck:runtime`: passed for all runtime packages.
- `bun test`: passed, 206 tests across 25 files, 0 failures.
- `bun test tests-js/migration/foundation-migration.test.ts tests-js/migration/harness-migration.test.ts`: passed, 11 tests across 2 files, 0 failures.
- `bun run check:monorepo`: passed; boundary tests and all package checks passed (three existing web-ui lint warnings, no errors).
- `bun run build:web`: passed; Vite produced `packages/web-ui/dist`.
- `docker build -t subpolar-migration-check .`: passed; the Bun image installed with the frozen lockfile and built the web bundle.
- `bunx vitest run tests-js/migration`: not accepted as evidence because the Vitest foundation suite cannot import Bun's `bun:sqlite`; the equivalent Bun migration command above passed.
- `bun run test:e2e:browser`: explicitly skipped at the user's direction; no Playwright browser E2E result is claimed.
- Docker health, static asset, restart, and readiness smoke passed using
  `hermes-subpolar:test`; no live provider test or authenticated provider/tool
  turn was run. The browser Playwright gate remains explicitly skipped.
- Clean runtime `PATH` without Python, pip, uv, npm, or npx passed frozen install,
  runtime typecheck, 206 Bun tests, web build, and `/api/health` serve smoke.
- Final image scan found no Python/pip/uv/npm/npx executable, Python source/cache,
  virtual environment, or retired integration tree.

## Execution Waves

Each wave has a contract checkpoint, parallel assignments, integration steps,
and a hard exit gate. The orchestration agent must complete every unchecked item
in order unless a dependency is explicitly moved earlier.

## Wave 0: Freeze The New Public Contract

**Goal:** Define the clean TypeScript surface before more implementation.

### Orchestrator Preparation

1. Create `docs/contracts/` documents for HTTP, WebSocket, authentication,
   configuration, provider configuration, tool configuration, and persistence.
2. Decide public API version prefix. Use `/v1` for all new endpoints; do not
   reproduce legacy Python routes merely because the UI previously used them.
3. Define generated IDs, timestamp format, error envelope, pagination, event
   envelope, and request id semantics once.
4. Specify a single configuration source. Behavioral configuration is a
   TypeScript-owned YAML/JSON file; secrets are process environment or an
   injected secret store. Do not reuse Python config parsing.

### Parallel Assignments

| Agent | Owns | Deliverables |
| --- | --- | --- |
| Contract agent | `docs/contracts/*`, `openapi.json` proposal only | REST resources, errors, idempotency headers, examples, change log |
| Event agent | `packages/shared`, `api-gateway/client` contracts | Versioned WebSocket event union and ordering rules |
| Config agent | new config schema module and tests | Strict config parser, redacted diagnostics, invalid-config rejection |
| Security agent | docs and threat model only | Auth/session/CSRF/origin/secret and tool threat model |

### Exit Gate

- [ ] Contract types contain no `unknown` in executable paths.
- [x] `openapi.json` matches the approved REST contract.
- [ ] A strict file-backed behavioral configuration parser remains out of
  scope; the current Bun entrypoint validates only its documented process
  settings and does not load a config file.
- [x] Security review explicitly approves the first authentication and tool
  threat model.

## Wave 1: Server, Static Assets, And Authentication

**Goal:** Ship one Bun process that safely serves the browser and API.

### Required Work

- [x] Remove the general-purpose `subpolar` command parser and legacy command
  compatibility. Keep a minimal Bun server entry module consumed by
  `bun run serve` and Docker; configure host, port, and data path through the
  approved Bun process contract.
- [x] Change Vite output to `packages/web-ui/dist`; remove Python build/serve
  paths and injected token globals.
- [x] Serve hashed assets with immutable cache headers, HTML with `no-store`,
  safe SPA fallback, and no fallback for `/v1/*` or `/api/*` misses.
- [x] Reject traversal, encoded traversal, ambiguous path separators, and
  unsupported HTTP methods before static file access.
- [x] Implement first-run local administrator bootstrap, password hashing,
  login, logout, session rotation, session revocation, and password change.
- [x] Use HttpOnly, Secure in production, SameSite cookie sessions. Browser
  APIs use same-origin credentials; do not inject bearer tokens into HTML.
- [x] Require CSRF validation for state-changing cookie-authenticated requests.
- [x] Add explicit origin checks for WebSocket upgrades and state-changing
  browser requests.
- [x] Add readiness and liveness endpoints with no secret/config disclosure.
- [x] Implement SIGTERM/SIGINT stop-accepting, cancel active turns, bounded
  drain, SQLite close, and process exit behavior.

### Parallel Assignments

| Agent | Files | Required tests |
| --- | --- | --- |
| Server agent | `packages/api-gateway/src/server.ts`, `routes.ts`, `static.ts` | static cache, SPA fallback, traversal, API miss isolation |
| Auth agent | `packages/api-gateway/src/auth/*`, data-layer auth tables | bootstrap, login, logout, revocation, CSRF, origin negatives |
| Server startup agent | `packages/api-gateway/src/server.ts`, root scripts | environment validation, config path, signal shutdown |
| Web build agent | `packages/web-ui/vite.config.ts`, build tests | local dist output, no Python path/token globals |

### Exit Gate

- [x] Clean install builds the UI and `bun run serve` serves it without Python.
- [ ] Browser E2E covers bootstrap, login, logout, CSRF rejection, static asset
  loading, API 404 behavior, and graceful shutdown.
- [x] No source in active runtime packages imports Python paths or launches a
  Python process.

## Wave 2: New TypeScript Persistence And Sessions

**Goal:** Make sessions durable within the new product only.

### Required Work

- [x] Replace migration/legacy schema handling with a fresh versioned SQLite
  schema in `data-layer`.
- [x] Store users, authenticated sessions, conversations, ordered messages,
  turn attempts, provider usage, tool calls/results, approvals, checkpoints,
  idempotency records, and audit categories.
- [x] Use transaction boundaries for: user message append + idempotency claim;
  tool checkpoint + side-effect state; terminal result + usage + event cursor.
- [x] Add unique constraints for session message sequence, request id scope,
  tool call ID, terminal turn, and idempotency key plus request fingerprint.
- [x] On duplicate idempotency key with matching fingerprint, replay the stored
  terminal response without provider or tool execution. Reject a key reused
  with a different fingerprint.
- [x] On restart, identify incomplete turns. Resume only safe provider work;
  never replay an unconfirmed non-idempotent tool. Mark unsafe work for an
  explicit user-visible recovery state.
- [x] Define retention/pruning for the new schema and test it. There is no
  legacy data retention compatibility requirement.

### Parallel Assignments

| Agent | Files | Required tests |
| --- | --- | --- |
| Schema agent | `data-layer/src/sqlite.ts`, migrations | new empty DB, upgrade, FK/indexes, no legacy read path |
| Repository agent | `data-layer/src/contracts.ts`, repositories | ordering, transaction rollback, concurrent readers/writers |
| Idempotency agent | new idempotency repository + gateway integration | duplicate/restart/mismatch/no-duplicate provider or tool call |
| Recovery agent | checkpoint/recovery repository + harness port | crash before/after provider/tool, recovery state |

### Exit Gate

- [x] A fresh database supports create, resume, restart, retention, and
  idempotent replay entirely in TypeScript.
- [x] Tests demonstrate no duplicate provider request or tool side effect after
  retry, restart, or duplicate HTTP request.
- [x] The schema has no Python compatibility tables, readers, or metadata.

## Wave 3: Harness Completion And Context Policy

**Goal:** Complete a deterministic, TypeScript-owned turn lifecycle.

### Required Work

- [ ] Define explicit states: validate, lease, load, assemble, persist user,
  dispatch provider, consume stream, request approval, checkpoint, execute
  tools, persist tool result, continue, finalize, terminal.
- [x] Enforce role/tool-call adjacency and fail closed on malformed history.
- [x] Make all attempt identities deterministic and preserve them in events and
  persistence.
- [x] Enforce iteration, provider attempt, tool count, tool output, token,
  deadline, and concurrency budgets before side effects.
- [x] Add provider retry classification and bounded backoff with injected clock
  and sleeper. Retry only provider calls proven side-effect-free.
- [x] Add configurable fallback chains with eligibility checked before an
  attempt; recalculate cache hints only in adapters.
- [x] Define a canonical TS system prompt and context section order. It is a
  new product prompt, not a byte-for-byte Python copy.
- [x] Implement model metadata/token estimation and context budget decisions.
- [ ] Add new-session summaries/compression and lineage only after the basic
  turn path is durable; summaries must be stored as explicit messages.
- [ ] Implement memory/context sources as typed ports with opt-out, deadline,
  redaction, and no duplicate injection.

### Parallel Assignments

| Agent | Files | Required tests |
| --- | --- | --- |
| State machine agent | `harness/src/index.ts` and state modules | every transition, exactly one terminal event |
| Context agent | prompt assembler and token modules | role repair/reject, stable sections, near-limit decisions |
| Retry agent | retry/fallback modules | category matrix, delay bounds, attempt identity |
| Persistence integration agent | harness repository ports | atomic complete/fail/cancel/recovery write sets |

### Exit Gate

- [x] Fake-provider tests cover text, parallel tools, approval, denial, retry,
  fallback, cancellation during every await point, malformed tool calls,
  timeout, and interrupted persistence.
- [x] No `harness` module imports Bun, Node filesystem/process APIs, SQLite, a
  concrete provider, or web/server types.
- [ ] Long-context and compressed-session tests use only the new TS schema.

## Wave 4: Provider Adapters

**Goal:** Replace the provisional direct provider wiring with supported,
isolated adapters.

### Required Work Per Provider

Every adapter is a separate module/package boundary and must implement:

- [x] Configuration validation and credential handle resolution.
- [x] Non-streaming and streaming request/response codecs.
- [x] Text, reasoning, tool calls/results, multimodal content, finish reasons,
  detailed usage, request identity, and cache controls where supported.
- [ ] Cancellation, deadline, rate-limit/auth/server/context/content-policy
  error mapping, bounded credential refresh, and redacted diagnostics.
- [ ] Recorded conformance fixtures plus opt-in live tests that never run from
  the default test command.

### Provider Order

1. [x] OpenAI-compatible: complete streaming, tools, multimodal, and robust
   API configuration around the existing adapter.
2. [ ] Anthropic Messages: native tools, thinking, cache controls, usage.
3. [ ] Gemini: native content parts, thought signatures, streaming.
4. [ ] Azure and Bedrock: identity/SigV4 scopes, region/endpoint policy.
5. [ ] LM Studio and local runtimes: local endpoint policy and reasoning codecs.
6. [ ] Relay, Codex, and Copilot: only after a TypeScript-native protocol and
   credential story are designed; never revive Python ACP/process bridges.

### Parallel Assignments

Run adapters in parallel only after the shared stream/error/credential contract
is frozen. Give each provider agent exclusive ownership of its adapter,
fixtures, and live-test gate. A provider agent must not modify `harness`.

### Exit Gate

- [ ] Each shipped provider has recorded codec/error/usage/stream tests and an
  explicitly opt-in live gate.
- [x] Unknown provider/model/credential configurations reject before network
  access.
- [x] Provider secrets never enter events, persistence, logs, errors, or UI.

## Wave 5: Native Tool Runtime And Approval UX

**Goal:** Make the supported tool set useful and safe without Python.

### Shell

- [x] Replace direct `Bun.spawn` assumptions with a process port supporting
  child-tree termination and injectable tests.
- [x] Verify canonical executable immediately before spawn; document residual
  TOCTOU risk and require immutable/containerized executable roots in
  production guidance.
- [x] Enforce exact executable and argv-prefix allow rules; deny wins; empty
  allowlist denies.
- [x] Reject shell metacharacter execution by never invoking a shell.
- [x] Record redacted audit categories, not argv/output content.

### OpenAPI

- [x] Validate trusted OpenAPI 3.1 documents at startup.
- [x] Support only local refs, declared JSON request bodies, declared
  path/query/header parameters, response limits, and explicit operation IDs.
- [x] Reject external refs, server overrides, unsupported security schemes,
  redirects, credential headers from model arguments, and undocumented fields.
- [x] Add SSRF defenses to fixed-origin resolution, including DNS/IP policy if
  private networks are not intentionally allowed.

### MCP

- [ ] Implement stdio transport under the shell policy and streamable HTTPS
  transport under fixed-origin network policy.
- [ ] Implement JSON-RPC initialization, ID correlation, cancellation,
  message/body limits, transport close, and error redaction.
- [ ] Add tool-list refresh only as an explicit operator action. Do not let a
  model configure, discover, or reconnect arbitrary servers.
- [ ] Defer MCP OAuth, prompts, resources, dynamic discovery, and automatic
  reconnect until separately designed and tested.

### Approval And Tool Integration

- [ ] Persist per-session pending approvals and map them to browser events.
- [ ] Implement approve, deny, timeout, cancel, and session isolation.
- [ ] Wire executable handles into `api-gateway` composition with no reference
  executables and no Python bridge configuration.
- [ ] Add output previews, aggregate per-turn output budgets, structured errors,
  and cleanup for interrupted tools.

### Parallel Assignments

| Agent | Exclusive scope | Required adversarial tests |
| --- | --- | --- |
| Shell agent | `tool-runtime/src/shell*` | symlinks, denied executable, cwd escape, env leak, timeout, cancellation |
| OpenAPI agent | `tool-runtime/src/openapi*` | external refs, host/header injection, redirects, SSRF, body limits |
| MCP agent | `tool-runtime/src/mcp*` | ID mismatch, malformed frames, collision, cancel, close, secret redaction |
| Approval agent | gateway/server/web UI approval modules | cross-session approval, deny/timeout/cancel, one execution maximum |
| Tool integration agent | composition only after tool contracts land | harness tool continuation/order/checkpoint events |

### Exit Gate

- [ ] Every executable tool has policy, timeout, cancellation, output bounds,
  redaction, and no-side-effect-on-validation-failure tests.
- [ ] Browser approval E2E proves user decision routing and session isolation.
- [x] No tool invocation reaches Python or depends on inherited full process
  environment.

## Wave 6: Browser API, WebSocket, And UI Rewrite

**Goal:** Make `web-ui` a supported client of the Bun server.

### Required Work

- [x] Replace legacy API client calls with versioned TS server endpoints.
- [x] Replace legacy JSON-RPC assumptions with the approved event envelope.
- [ ] Implement WebSocket ticket/session binding, origin validation, heartbeat,
  reconnect cursor, backpressure limits, disconnect cancellation, and event
  ordering.
- [x] Render message, reasoning, tool progress, approval, error, status, and
  exactly one terminal event without embedding harness logic in the browser.
- [ ] Add session create/list/load/delete, transcript pagination, model/tool
  selection, cancellation, and approval UI backed by the new API only.
- [x] Remove pages/features that depend on unsupported integrations;
  present no inactive controls for unsupported capability.

### Parallel Assignments

| Agent | Scope | Required tests |
| --- | --- | --- |
| REST client agent | `web-ui/src/lib/api*` | auth, errors, pagination, cancellation |
| WS client agent | `web-ui/src/lib/gatewayClient*` | ordering, reconnect, disconnect, malformed frames |
| Chat UI agent | chat components | stream/reasoning/tool/approval accessibility |
| Server WS agent | `api-gateway/src/ws*` | ticket/origin/auth/backpressure/cancel integration |

### Exit Gate

- [ ] Browser E2E covers first-run auth, session lifecycle, text turn,
  streaming, tool approval, cancellation, reconnect, and restart.
- [x] The browser build imports no server-only packages or secret-bearing code.
- [x] All UI network requests target the Bun server contract.

## Wave 7: Bun Workspace, Operations, Packaging, And Release

**Goal:** Make the complete development and production lifecycle Bun-native
before deleting the final Python safety net.

### Workspace And Dependency Work

- [ ] Keep exactly the approved runtime packages plus `packages/shared` under
  `packages/`; remove transitional package names and duplicate application
  directories.
- [ ] Make every internal workspace dependency use the repository-approved Bun
  workspace version convention consistently.
- [x] Remove root and workspace npm scripts, `package-lock.json`, npm engine
  requirements, npm audit helpers, and npm bootstrap logic.
- [x] Keep one root `bun.lock`; verify a frozen install from a fresh clone and
  reject lockfile drift in CI.
- [x] Centralize strict TypeScript, lint, formatting, and test configuration
  without allowing browser packages to inherit server runtime globals.
- [x] Ensure `bun run check:boundaries` validates manifests, declared imports,
  browser safety, forbidden dependency edges, and absence of Python runtime
  hooks in active packages.

### Operations And Release Work

- [x] Make Docker build Bun packages and web assets, then run `bun run serve`
  from a minimal Bun-only production stage.
- [ ] Add structured redacted logs, metrics categories, readiness, liveness,
  active-turn count, provider/tool error categories, and shutdown metrics.
- [x] Implement SIGTERM/SIGINT stop-accepting, active-turn cancellation,
  bounded drain, child-process cleanup, SQLite close, and deterministic exit.
- [ ] Port required release, changelog, artifact, and publishing automation to
  TypeScript executed by Bun, with dry-run tests.
- [ ] Define release stop conditions: security finding, duplicate side effect,
  event-order violation, data corruption, secret leak, or unexplained provider
  usage drift.
- [ ] Run clean install, package build, full Bun tests, browser E2E, API
  contract tests, Docker health/restart tests, and manual live-provider gates.

### Exit Gate

- [ ] A fresh clone installs, checks, builds, tests, and serves with Bun and the
  documented TypeScript configuration only.
- [ ] The complete supported product passes in an environment where Python,
  pip, uv, npm, and npx are unavailable.
- [ ] Docker starts, serves the UI, passes authenticated API/WebSocket E2E,
  cancels and drains safely, and restarts with the new SQLite store.
- [ ] CI and release workflows require only Bun plus platform/container tools.

## Wave 8: Python Retirement And Repository Cleanup

**Goal:** Remove Python completely after every retained capability has a
verified Bun owner and every removed capability has disappeared from the
public product contract.

### Cutover

- [x] Make the Bun composition root the only gateway execution path.
- [x] Delete Python tool and whole-turn bridges, runtime adapters, fallback
  flags, session runtime pinning, and compatibility configuration.
- [x] Delete Python persistence readers, migration metadata, fixtures, and
  rollback code; legacy databases reject read-only with a documented error.
- [x] Remove every Python-backed route, command, WebSocket method/event, UI
  control, and product claim that was not replaced.
- [x] Remove Python runtime invocation from Docker, install scripts, CI,
  production documentation, health checks, and release automation.

### Source Removal

- [x] Delete Python CLI, gateway, agent loop, provider adapters, tool registry,
  tool implementations, cron, TUI, ACP, desktop compatibility, plugin loading,
  media/voice, platform adapters, installers, and packaging paths.
- [x] Delete remaining Python runtime dependencies, manifests, lockfiles,
  virtual-environment state, caches, bytecode, and Python-only tests.
- [x] Port only repository utilities that are still required by the Bun
  product. Delete obsolete evaluation, migration, compatibility, and release
  utilities instead of carrying them forward by default.
- [x] Remove intentionally out-of-scope research artifacts rather than leave a
  versioned repository; do not leave an unbuilt `legacy/` tree in the Bun
  monorepo.
- [x] Rewrite all current documentation and templates so setup, development,
  testing, deployment, troubleshooting, contribution, and release instructions
  are Bun-only.

### Auditable Absence Checks

- [x] Repository scan finds no active `.py`, Python shebang, Python subprocess,
  Python executable path, Python import, pip/uv command, virtual environment,
  or Python dependency manifest.
- [x] Active TypeScript packages contain no identifier or configuration key for
  Python bridge, Python runtime, Python fallback, legacy Python persistence, or
  Python executable references.
- [x] Root scripts and required CI contain no npm/npx or Python command; root has
  no `package-lock.json`, Python lockfile, or Python environment bootstrap.
- [x] Final Docker image scan finds no Python executable, site-packages,
  virtual environment, pip/uv binary, or copied Python source.
- [x] API, WebSocket, UI, README, security, deployment, and contribution docs
  advertise only capabilities implemented by Bun packages.
- [ ] A clean machine without Python completes the full required verification
  matrix and an authenticated provider/tool turn.

### Exit Gate

- [x] Every entry in the Python Deprecation Ledger has a completed disposition
  and deletion gate.
- [x] No supported request, build, test, container, CI, or release path can
  discover or invoke Python.
- [x] Unsupported legacy inputs fail closed before provider, tool, filesystem,
  persistence mutation, or network side effects.
- [x] The repository contains only the Bun monorepo, browser assets,
  language-agnostic fixtures, documentation, and explicitly approved external
  integration metadata.

## Required Verification Matrix

Run these after all applicable changes, in the listed order:

1. `bun run check:boundaries`
2. `bun run typecheck:runtime`
3. Package-local `bun test` for every changed package
4. `bun test`
5. Fresh `bun install --frozen-lockfile`
6. `bun run build:web` and server static-asset tests
7. API/OpenAPI contract tests
8. Browser E2E against a temporary data directory
9. Docker build, health, authenticated turn, restart, and shutdown tests
10. Opt-in live provider tests with synthetic prompts and isolated credentials
11. Clean-environment install/build/test/serve with Python, pip, uv, npm, and
    npx unavailable
12. Repository scan for Python sources, shebangs, subprocesses, bridges,
    fallback identifiers, manifests, virtual environments, and compatibility
    readers
13. Root/workspace scan confirming `bun.lock` is the only root lockfile and all
    required scripts execute through Bun
14. Final-image scan confirming no Python executable, packages, environment, or
    source is present
15. Fresh authenticated browser-to-provider and browser-to-tool turn through
    the Bun composition root with no sidecar processes

Any failure blocks the next wave. Do not change expected output merely to make a
gate pass; identify whether the contract, implementation, or test is wrong and
record the decision in this plan.

## Definition Of Done

The rewrite is complete only when all Wave 0-8 exit checkboxes are complete,
the verification matrix passes, the browser application uses only the Bun API,
all supported providers and tools are TypeScript-native, and no active runtime
or package build depends on Python. In addition, install, test, CI, Docker, and
release must succeed without Python or npm available. Unsupported capabilities
must be absent or explicitly rejected, never silently delegated.
