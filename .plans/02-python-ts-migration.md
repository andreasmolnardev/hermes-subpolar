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

1. `subpolar` starts one Bun process.
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
| `packages/subpolar-server` | Bun CLI, HTTP/WebSocket listener, auth/session cookies, static assets, request validation, composition root, shutdown | Agent-loop policy, provider codecs, tool implementations |
| `packages/api-gateway` | Public API command mapping, gateway event projection, session turn lease, request/response envelopes | Bun listener, provider SDKs, filesystem/process execution |
| `packages/harness` | Turn state machine, cancellation, retries, fallback, budgets, tool-call continuation, lifecycle events | Network, filesystem, SQLite, process globals, web types |
| `packages/chat-provider-interface` | Provider-neutral messages, streams, usage, errors, provider adapters | Harness policy, gateway transport, secret storage |
| `packages/tool-resolver` | Schema validation, deterministic descriptors, collision checks, restrictive policy calculation | Tool execution, process/network I/O |
| `packages/tool-runtime` | MCP, OpenAPI, shell execution, operator policy enforcement, output limits | Model/provider selection, browser HTTP routes |
| `packages/data-layer` | New SQLite schema, migrations within the TS schema line, transactions, sessions, messages, usage, checkpoints | Provider/tool side effects, HTTP types |
| `packages/web-ui` | Browser UI, API client, WebSocket rendering, approval UX | Runtime behavior, server imports, credentials |
| `packages/shared` | Stable browser-safe wire types only | Runtime implementation, filesystem, process, provider SDKs |

Dependency direction is fixed:

```text
subpolar-server -> api-gateway -> harness -> chat-provider-interface
                  |              |
                  |              -> tool-resolver
                  -> tool-runtime -> tool-resolver
                  -> data-layer
web-ui -> shared, api-gateway/client, data-layer/contracts
```

`tool-runtime` may be composed by `subpolar-server` and handed to
`api-gateway`; it must not be imported by `harness`. Every new edge requires an
update to `scripts/check-package-boundaries.mjs` and its test.

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

## Orchestration Model

One orchestration agent owns the plan. It delegates independent work to
subagents in parallel and integrates only reviewed, tested changes.

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

- [x] Workspace package boundary checker includes `subpolar-server` and
  `tool-runtime`.
- [x] `subpolar-server` starts a Bun listener with `/api/health` and a
  non-streaming OpenAI-compatible `/v1/chat/completions` route.
- [x] The server explicitly selects the `harness` runtime for that route.
- [x] `tool-runtime` has native handles for MCP discovery/calls, fixed-origin
  OpenAPI calls, and verified argv-only shell execution.
- [x] Focused server and tool-runtime typechecks and tests pass.

### Known Gaps

- [x] Bun server serves `web-ui` static assets with safe SPA fallback; API misses
  remain API errors.
- [ ] The new authenticated SSE/WebSocket chat transport and active browser
  workspace are implemented, but reconnect, heartbeat, and the remaining
  administrative API surface are not yet complete.
- [ ] Full authentication/account lifecycle is not complete; the new server now
  has first-user bootstrap, password login/logout, cookie sessions, CSRF checks,
  origin checks, and owner-scoped projects, agents, and sessions.
- [ ] The current API route has only a direct OpenAI-compatible non-streaming
  provider configuration; it has no provider registry, streaming, or tool
  composition.
- [ ] MCP transport implementations, OpenAPI request schema validation, shell
  process-tree termination, and approval persistence need production hardening.
- [ ] New SQLite session persistence, idempotency, recovery, and retention are
  not yet connected to the server route.
- [ ] Legacy dashboard pages remain in the source tree, but the shipped
  `SubpolarApp` entry now uses only the versioned authenticated Bun API.

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
- [ ] `openapi.json` matches the approved REST contract.
- [x] Config rejects unknown keys and does not read behavioral settings from
  environment variables.
- [ ] Security review explicitly approves the first authentication and tool
  threat model.

## Wave 1: Server, CLI, Static Assets, And Authentication

**Goal:** Ship one Bun process that safely serves the browser and API.

### Required Work

- [x] Make `subpolar` accept only `serve`, `--host`, `--port`, `--config`, and
  `--data-dir`; reject unknown positional commands.
- [ ] Change Vite output to `packages/web-ui/dist`; remove Python build/serve
  paths and injected token globals.
- [x] Serve hashed assets with immutable cache headers, HTML with `no-store`,
  safe SPA fallback, and no fallback for `/v1/*` or `/api/*` misses.
- [x] Reject traversal, encoded traversal, ambiguous path separators, and
  unsupported HTTP methods before static file access.
- [ ] Implement first-run local administrator bootstrap, password hashing,
  login, logout, session rotation, session revocation, and password change.
- [ ] Use HttpOnly, Secure in production, SameSite cookie sessions. Browser
  APIs use same-origin credentials; do not inject bearer tokens into HTML.
- [ ] Require CSRF validation for state-changing cookie-authenticated requests.
- [ ] Add explicit origin checks for WebSocket upgrades and state-changing
  browser requests.
- [x] Add readiness and liveness endpoints with no secret/config disclosure.
- [ ] Implement SIGTERM/SIGINT stop-accepting, cancel active turns, bounded
  drain, SQLite close, and process exit behavior.

### Parallel Assignments

| Agent | Files | Required tests |
| --- | --- | --- |
| Server agent | `packages/subpolar-server/src/server.ts`, `routes.ts`, `static.ts` | static cache, SPA fallback, traversal, API miss isolation |
| Auth agent | `packages/subpolar-server/src/auth/*`, data-layer auth tables | bootstrap, login, logout, revocation, CSRF, origin negatives |
| CLI agent | `packages/subpolar-server/src/cli.ts`, root scripts | argument rejection, config path, signal shutdown |
| Web build agent | `packages/web-ui/vite.config.ts`, build tests | local dist output, no Python path/token globals |

### Exit Gate

- [ ] Clean install builds the UI and `bun run serve` serves it without Python.
- [ ] Browser E2E covers bootstrap, login, logout, CSRF rejection, static asset
  loading, API 404 behavior, and graceful shutdown.
- [ ] No source in active runtime packages imports Python paths or launches a
  Python process.

## Wave 2: New TypeScript Persistence And Sessions

**Goal:** Make sessions durable within the new product only.

### Required Work

- [ ] Replace migration/legacy schema handling with a fresh versioned SQLite
  schema in `data-layer`.
- [ ] Store users, authenticated sessions, conversations, ordered messages,
  turn attempts, provider usage, tool calls/results, approvals, checkpoints,
  idempotency records, and audit categories.
- [ ] Use transaction boundaries for: user message append + idempotency claim;
  tool checkpoint + side-effect state; terminal result + usage + event cursor.
- [ ] Add unique constraints for session message sequence, request id scope,
  tool call ID, terminal turn, and idempotency key plus request fingerprint.
- [ ] On duplicate idempotency key with matching fingerprint, replay the stored
  terminal response without provider or tool execution. Reject a key reused
  with a different fingerprint.
- [ ] On restart, identify incomplete turns. Resume only safe provider work;
  never replay an unconfirmed non-idempotent tool. Mark unsafe work for an
  explicit user-visible recovery state.
- [ ] Define retention/pruning for the new schema and test it. There is no
  legacy data retention compatibility requirement.

### Parallel Assignments

| Agent | Files | Required tests |
| --- | --- | --- |
| Schema agent | `data-layer/src/sqlite.ts`, migrations | new empty DB, upgrade, FK/indexes, no legacy read path |
| Repository agent | `data-layer/src/contracts.ts`, repositories | ordering, transaction rollback, concurrent readers/writers |
| Idempotency agent | new idempotency repository + gateway integration | duplicate/restart/mismatch/no-duplicate provider or tool call |
| Recovery agent | checkpoint/recovery repository + harness port | crash before/after provider/tool, recovery state |

### Exit Gate

- [ ] A fresh database supports create, resume, restart, retention, and
  idempotent replay entirely in TypeScript.
- [ ] Tests demonstrate no duplicate provider request or tool side effect after
  retry, restart, or duplicate HTTP request.
- [ ] The schema has no Python compatibility tables, readers, or metadata.

## Wave 3: Harness Completion And Context Policy

**Goal:** Complete a deterministic, TypeScript-owned turn lifecycle.

### Required Work

- [ ] Define explicit states: validate, lease, load, assemble, persist user,
  dispatch provider, consume stream, request approval, checkpoint, execute
  tools, persist tool result, continue, finalize, terminal.
- [ ] Enforce role/tool-call adjacency and fail closed on malformed history.
- [ ] Make all attempt identities deterministic and preserve them in events and
  persistence.
- [ ] Enforce iteration, provider attempt, tool count, tool output, token,
  deadline, and concurrency budgets before side effects.
- [ ] Add provider retry classification and bounded backoff with injected clock
  and sleeper. Retry only provider calls proven side-effect-free.
- [ ] Add configurable fallback chains with eligibility checked before an
  attempt; recalculate cache hints only in adapters.
- [ ] Define a canonical TS system prompt and context section order. It is a
  new product prompt, not a byte-for-byte Python copy.
- [ ] Implement model metadata/token estimation and context budget decisions.
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

- [ ] Fake-provider tests cover text, parallel tools, approval, denial, retry,
  fallback, cancellation during every await point, malformed tool calls,
  timeout, and interrupted persistence.
- [ ] No `harness` module imports Bun, Node filesystem/process APIs, SQLite, a
  concrete provider, or web/server types.
- [ ] Long-context and compressed-session tests use only the new TS schema.

## Wave 4: Provider Adapters

**Goal:** Replace the provisional direct provider wiring with supported,
isolated adapters.

### Required Work Per Provider

Every adapter is a separate module/package boundary and must implement:

- [ ] Configuration validation and credential handle resolution.
- [ ] Non-streaming and streaming request/response codecs.
- [ ] Text, reasoning, tool calls/results, multimodal content, finish reasons,
  detailed usage, request identity, and cache controls where supported.
- [ ] Cancellation, deadline, rate-limit/auth/server/context/content-policy
  error mapping, bounded credential refresh, and redacted diagnostics.
- [ ] Recorded conformance fixtures plus opt-in live tests that never run from
  the default test command.

### Provider Order

1. [ ] OpenAI-compatible: complete streaming, tools, multimodal, and robust
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
- [ ] Unknown provider/model/credential configurations reject before network
  access.
- [ ] Provider secrets never enter events, persistence, logs, errors, or UI.

## Wave 5: Native Tool Runtime And Approval UX

**Goal:** Make the supported tool set useful and safe without Python.

### Shell

- [ ] Replace direct `Bun.spawn` assumptions with a process port supporting
  child-tree termination and injectable tests.
- [ ] Verify canonical executable immediately before spawn; document residual
  TOCTOU risk and require immutable/containerized executable roots in
  production guidance.
- [x] Enforce exact executable and argv-prefix allow rules; deny wins; empty
  allowlist denies.
- [x] Reject shell metacharacter execution by never invoking a shell.
- [ ] Record redacted audit categories, not argv/output content.

### OpenAPI

- [x] Validate trusted OpenAPI 3.1 documents at startup.
- [ ] Support only local refs, declared JSON request bodies, declared
  path/query/header parameters, response limits, and explicit operation IDs.
- [ ] Reject external refs, server overrides, unsupported security schemes,
  redirects, credential headers from model arguments, and undocumented fields.
- [ ] Add SSRF defenses to fixed-origin resolution, including DNS/IP policy if
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
- [ ] No tool invocation reaches Python or depends on inherited full process
  environment.

## Wave 6: Browser API, WebSocket, And UI Rewrite

**Goal:** Make `web-ui` a supported client of the Bun server.

### Required Work

- [ ] Replace legacy API client calls with versioned TS server endpoints.
- [ ] Replace legacy JSON-RPC assumptions with the approved event envelope.
- [ ] Implement WebSocket ticket/session binding, origin validation, heartbeat,
  reconnect cursor, backpressure limits, disconnect cancellation, and event
  ordering.
- [ ] Render message, reasoning, tool progress, approval, error, status, and
  exactly one terminal event without embedding harness logic in the browser.
- [ ] Add session create/list/load/delete, transcript pagination, model/tool
  selection, cancellation, and approval UI backed by the new API only.
- [ ] Remove pages/features that depend on unsupported Python integrations;
  present no inactive controls for unsupported capability.

### Parallel Assignments

| Agent | Scope | Required tests |
| --- | --- | --- |
| REST client agent | `web-ui/src/lib/api*` | auth, errors, pagination, cancellation |
| WS client agent | `web-ui/src/lib/gatewayClient*` | ordering, reconnect, disconnect, malformed frames |
| Chat UI agent | chat components | stream/reasoning/tool/approval accessibility |
| Server WS agent | `subpolar-server/src/ws*` | ticket/origin/auth/backpressure/cancel integration |

### Exit Gate

- [ ] Browser E2E covers first-run auth, session lifecycle, text turn,
  streaming, tool approval, cancellation, reconnect, and restart.
- [ ] The browser build imports no server-only packages or secret-bearing code.
- [ ] All UI network requests target the Bun server contract.

## Wave 7: Operations, Packaging, And Removal

**Goal:** Ship the TypeScript product and remove obsolete runtime ownership.

### Required Work

- [ ] Make Docker build Bun packages and web assets, then run `subpolar serve`.
- [ ] Remove Python runtime invocation from Docker, install scripts, root npm
  scripts, CI runtime jobs, and production documentation.
- [ ] Add structured redacted logs, metrics categories, readiness, liveness,
  active-turn count, provider/tool error categories, and shutdown metrics.
- [ ] Define release stop conditions: security finding, duplicate side effect,
  event-order violation, data corruption, secret leak, or unexplained provider
  usage drift.
- [ ] Run clean install, package build, full Bun tests, browser E2E, API
  contract tests, Docker health/restart tests, and manual live-provider gates.
- [ ] Delete Python runtime directories and dependencies only after the Bun
  product has passed the complete TypeScript release matrix. No compatibility
  window or data migration is needed, but the deletion must not happen before a
  functioning replacement exists.

### Exit Gate

- [ ] A fresh clone runs the web product with Bun and documented TypeScript
  configuration only.
- [ ] `git grep` confirms active runtime paths contain no Python bridge,
  subprocess, config, or persistence dependency.
- [ ] Docker starts, serves the UI, passes authenticated API/WebSocket E2E, and
  restarts safely with the new SQLite store.
- [ ] Python runtime code, Python test commands, and Python production
  dependencies are removed in the same bounded cleanup wave.

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

Any failure blocks the next wave. Do not change expected output merely to make a
gate pass; identify whether the contract, implementation, or test is wrong and
record the decision in this plan.

## Definition Of Done

The rewrite is complete only when all Wave 0-7 exit checkboxes are complete,
the verification matrix passes, the browser application uses only the Bun API,
all supported providers and tools are TypeScript-native, and no active runtime
or package build depends on Python. Unsupported capabilities must be absent or
explicitly rejected, never silently delegated.
