# Hermes Subpolar Pi Migration Plan

## Authority and status

This is the implementation plan and task tracker for replacing the Hermes
Subpolar agent loop with the vendored Pi runtime. It is subordinate to
`AGENTS.md` and the product contract in `.plans/02-python-ts-migration.md`.
`PATCH.md` records historical changes; this file records migration intent,
ownership, gates, and remaining work.

Status vocabulary:

- `[x]` implemented in the repository and covered by an appropriate check.
- `[~]` partially implemented; the remaining work is listed in the same item.
- `[ ]` not implemented.
- A checkbox is not complete merely because a module or type exists. The
  behavior and its security/ownership boundary must be demonstrated by tests.

## Objective

Make Pi the execution engine for Hermes Subpolar while keeping Subpolar
authoritative for application policy and state.

```text
Web UI / API
    -> api-gateway
    -> Subpolar run resolution
       (user, Agent, Project, workspace, model, credentials, tools, policy)
    -> harness Pi adapter
    -> vendored Pi AgentSession / ModelRuntime
    -> Subpolar-owned tools and permission decisions
    -> Subpolar persistence and event projection
```

The governing rule is:

> Pi owns model/session execution. Subpolar owns users, Agents, Projects,
> workspaces, integrations, capabilities, permissions, approvals,
> conversations, automations, credentials, persistence, and public APIs. Pi
> must consume resolved Subpolar state and must not discover or authorize
> capabilities outside those boundaries.

## Current package layout

The embedded runtime closure is kept as an upstream-shaped subtree:

```text
packages/
├── api-gateway          # composition root and public transports
├── data-layer           # SQLite identity, sessions, messages, state
├── harness              # Subpolar-to-Pi orchestration boundary
├── tool-resolver        # capability resolution and policy reduction
├── tool-runtime         # MCP/OpenAPI/native side effects
├── web-ui               # browser presentation
├── shared               # browser-safe domain contracts
│
├── pi-agent             # vendored Pi agent core
├── pi-ai                # vendored provider/model APIs
├── pi-client            # Pi client support
├── pi-coding-agent      # Pi SDK, sessions, ModelRuntime
├── pi-protocol          # Pi protocol types
├── pi-telemetry         # Pi telemetry dependency
└── pi-tui               # pi-coding-agent runtime dependency
```

Pi packages must not import Subpolar application packages. The dependency
direction is Subpolar application -> Pi adapter -> Pi packages.

## Completed baseline

These milestones are already in `origin/pi`:

- [x] Vendored the pinned Pi `0.84.2` runtime closure and its source exports.
  The upstream pin and import procedure live under `scripts/pi/`.
- [x] Added the Subpolar resource loader, per-run context, Pi session seam,
  message hydration, event projection, and provider bridge.
- [x] Added the Tool Resolver -> Pi custom-tool adapter. Pi receives only
  resolved descriptors; execution remains behind Subpolar callbacks.
- [x] Added Pi-path persistence checkpoints, final result/usage projection,
  session setup, cancellation, approval routing, and automation invocation.
- [x] Made `startApiGatewayServer()` construct the Pi executor by default.
  Explicit injected executors and providers remain compatibility seams for
  callers and tests.
- [x] Added a Subpolar-backed Pi credential store and native Pi model
  resolution with network-disabled catalog loading.
- [x] Native resolution honors the persisted Hermes endpoint, materializes a
  configured model ID from a controlled Pi catalog template, and selects
  Pi's Chat Completions API for Hermes `openai-api`.
- [x] Added automation, approval-boundary, authenticated dispatch, native
  default-path, persistence, and tool-resolution coverage.

Reference batches:

```text
5a639e60a  feat(harness): honor configured native Pi model endpoints
75c109508  feat(api-gateway): use native Pi models by default
```

Current verification baseline:

```text
harness       85 tests passing
api-gateway   43 tests passing
package       boundary checks passing
```

## Workstreams and remaining gates

### Workstream ownership

| Workstream | Primary owner | Key files | Depends on | Acceptance evidence |
| --- | --- | --- | --- | --- |
| Pi import maintenance | `pi-*` / `scripts/pi` | `scripts/pi/*`, `packages/pi-*` | upstream pin review | reproducible import, Pi tests, boundary check |
| Session/runtime lifecycle | `harness` | `packages/harness/src/pi-runtime.ts`, `pi-events.ts`, `pi-messages.ts` | persistence/event contracts | cancellation, shutdown, restart, ordering tests |
| Models and credentials | `harness` + `api-gateway` | `pi-model-resolution.ts`, `pi-credentials.ts`, `server.ts` | provider catalog and authenticated setup | provider matrix, credential isolation, endpoint fixtures |
| Tools and permissions | `tool-resolver` + `tool-runtime` + `harness` | resolver descriptors, runtime handles, `pi-tools.ts` | Agent/Project resolution | security, approval, workspace, timeout tests |
| Persistence and events | `data-layer` + `api-gateway` | gateway persistence adapter, session repositories, event mappers | lifecycle semantics | restart, reconnect, redaction, no-duplicate-side-effect tests |
| Gateway defaults | `api-gateway` | `src/index.ts`, `src/pi-executor.ts`, `src/server.ts` | native model/credential seam | server default and compatibility-boundary tests |
| Automations and subagents | `api-gateway` + `harness` | scheduler, automation runner, Pi custom tools | policy and run persistence | parent/child privilege and deadline tests |
| UI and operations | `web-ui` + repository root | Activity Panel, browser E2E, container scripts | stable projected events | browser E2E, clean install, Docker health |

### 1. Upstream Pi maintenance

- [x] Record the upstream commit, imported package closure, and local patch
  policy.
- [x] Add a repeatable CI check that the imported package list and pinned
  commit agree with `scripts/pi/PINNED_COMMIT` and `scripts/pi/README.md`.
- [x] Define the update procedure: import, Pi package tests, Subpolar tests,
  security tests, review of local patches, then one Pi package batch commit.
- [ ] Keep changes to `pi-*` packages exceptional and independently reviewable.

Exit gate: a Pi pin update is reproducible, reviewable, and cannot silently
replace Subpolar policy code.

### 2. Harness and Pi session lifecycle

- [x] Create one Pi session per Subpolar run with immutable run context.
- [x] Hydrate persisted messages without putting system policy into the
  conversation transcript.
- [x] Project Pi text, reasoning, tool, retry, compaction, and terminal events
  into stable Subpolar events.
- [~] Route existing timeout, retry, fallback, turn-budget, and cost-budget
  policy around native Pi sessions without reimplementing Pi's agent loop.
- [~] Tie every Pi session and model runtime to the request abort signal and
  server shutdown. Ensure no model/tool work survives a cancelled or closed
  server.
- [ ] Decide and implement resumable-session hydration after process restart;
  Pi JSONL must not become the authoritative database.
- [ ] Persist compaction, model switching, steering/follow-up, and retry
  metadata where the public Activity Panel needs them.
- [x] Make event delivery awaitable and ordered at the gateway boundary;
  fire-and-forget projection must not race persistence or terminal delivery.

Exit gate: cancellation, shutdown, restart, and event ordering have behavior
tests with no duplicate side effects or terminal events.

### 3. Models, providers, and credentials

- [x] Resolve supported Hermes provider IDs explicitly to Pi provider IDs.
- [x] Keep Pi model catalogs network-disabled and credentials in the
  authenticated Subpolar setup/data flow.
- [x] Preserve configured model IDs and custom endpoints for the native
  `openai-api` path.
- [~] Complete provider/API-mode mapping for every provider intended to remain
  supported. Providers with `null` mappings currently fail closed; they must
  either receive a native Pi adapter or be removed/rejected in setup.
- [~] Preserve non-API-key credential modes. AWS credentials, GCP service
  credentials, external-process credentials, Copilot variants, and provider
  environment semantics have explicit Pi mappings or unsupported results;
  server-level native credential wiring and provider-specific fixtures remain.
- [ ] Share a server-level `ModelRuntime`/provider catalog where safe instead
  of creating a model runtime for every request.
- [x] Map native resolution errors to stable API errors such as
  `provider_not_configured`, `unsupported_provider`, and `model_not_found`.
- [ ] Add provider behavior fixtures for streaming, usage, reasoning,
  credentials, custom endpoints, errors, cancellation, and multimodal input.

Exit gate: every advertised provider has a documented Pi transport, credential
owner, endpoint behavior, and provider-specific behavior/security test.

### 4. Tools, permissions, and workspace security

- [x] Resolve Agent/Project capabilities through `tool-resolver` before Pi
  session construction.
- [x] Expose assigned tools as Subpolar-owned Pi custom tools.
- [x] Route `allow`, `deny`, and `ask` through Subpolar policy and pending
  approval persistence; automation approval fails closed.
- [x] Keep Pi built-ins disabled by default and validate project workspaces
  before native filesystem/Git execution.
- [~] Finish native filesystem tool integration (`read`, `write`, `edit`,
  `grep`, `find`, `ls`) with canonical workspace confinement and diff metadata.
- [~] Finish explicitly gated `bash`/shell execution with timeout, output,
  cancellation, and approval coverage.
- [ ] Add regression tests for traversal, symlink escape, cross-project
  access, stale capability caches, hidden tools, approval bypass, and
  subagent/automation privilege escalation.

Exit gate: no Pi or model action can reach a Subpolar side effect without a
resolved descriptor, policy decision, workspace check, and bounded runtime.

### 5. Persistence, recovery, and public events

- [x] Keep SQLite/Subpolar persistence authoritative over Pi JSONL sessions.
- [x] Persist inbound messages, tool before/after checkpoints, final assistant
  state, and usage through the gateway persistence adapter.
- [x] Keep HTTP/SSE/WebSocket contracts outside Pi internals.
- [~] Add a restart/resume integration test that hydrates a persisted session,
  continues it through Pi, and verifies message/tool correlation.
- [~] Persist pending approvals with ownership, expiration, and reconnect
  behavior; verify a stale approval cannot execute a later run.
- [ ] Verify event ordering across HTTP, SSE, and WebSocket clients, including
  cancellation and transport disconnects.
- [ ] Add retention/redaction tests for provider payloads, credentials,
  tool arguments, tool output, reasoning, and error details.

Exit gate: a server restart or client reconnect cannot duplicate a tool effect,
lose a terminal result, expose a secret, or cross an owner/session boundary.

### 6. Gateway defaults and compatibility removal

- [x] Make the application server's default executor Pi-backed.
- [x] Keep explicit executor/provider injection available for migration tests
  and controlled compatibility callers.
- [x] Make the low-level `createGateway()` helper default to Pi, with an
  explicit `legacyHarness` compatibility option for legacy contract tests.
- [x] Ensure no production server route reaches the legacy provider loop when
  the native Pi path is configured.
- [ ] Remove duplicate provider-loop, retry, token-budget, and message
  normalization code only after the parity matrix is green.
- [x] Update public docs and package comments so “default” and “compatibility”
  have one unambiguous meaning.

Exit gate: production composition uses Pi; compatibility is explicit, bounded,
observable, and removable.

### 7. Automations and subagents

- [x] Run automations through the same server harness/Pi executor path as chat.
- [x] Preserve automation permission modes and fail interactive approval closed.
- [x] Add true native-default automation coverage and WebSocket approval E2E;
  coverage includes the native endpoint/credential path, disconnect denial,
  and stale approval rejection.
- [ ] Implement `spawn_agent` as a Subpolar-controlled Pi custom tool with a
  restricted Agent/Project capability set.
- [ ] Link parent/child run IDs and events in persistence and Activity Panel
  projections.
- [ ] Add deadline, cancellation, budget, and privilege-isolation tests for
  nested runs.

Exit gate: subagents cannot broaden parent privileges and automation execution
cannot bypass the normal Agent, Project, tool, or credential policy.

### 8. UI, operations, and release readiness

- [~] Render the projected model-step/tool timeline, reasoning state, diffs,
  pending approvals, retries, compaction, and cancellation without importing
  Pi types into `web-ui`.
- [ ] Add reconnect and pending-approval browser/protocol E2E coverage.
- [ ] Define health/readiness/shutdown behavior for active Pi sessions and
  provider/model runtime initialization.
- [ ] Verify isolated `SUBPOLAR_DATA_DIR`, workspace root confinement, clean
  install, and container startup with the Pi closure.
- [ ] Run the complete repository gates from the TypeScript migration plan:
  `bun run check:monorepo`, `bun run typecheck:runtime`, `bun run test`, browser
  E2E, clean-install build, and Docker health checks.
- [ ] Remove stale Python/provider/CLI claims only after the retained Bun
  capability inventory is current.

Exit gate: a clean install and container run expose only supported Bun/Pi
behavior, with operational evidence for shutdown, health, persistence, and
browser transport.

## Parity matrix

The migration is not complete until each retained behavior has a Pi-backed
test. The matrix below is the minimum contract; add provider/tool-specific
rows as features are retained.

| Behavior | Pi-backed status | Required evidence |
| --- | --- | --- |
| Plain chat | `[x]` | harness and native server tests |
| Streaming text | `[x]` | native default SSE fixture |
| Reasoning stream | `[~]` | projection and browser rendering fixture |
| Cancellation | `[x]` | harness/gateway cancellation tests; add shutdown test |
| Provider failure/retry | `[~]` | compatibility coverage; native provider matrix pending |
| Usage | `[x]` | native default and persistence assertions |
| Tool call/continuation | `[x]` | Pi runtime and gateway tool tests |
| Multiple tool calls | `[x]` | harness/tool loop coverage |
| Deny/approval | `[x]` | approval-boundary and automation tests |
| Project cwd | `[x]` | Git/workspace security coverage |
| Persisted resume | `[~]` | session repository coverage; process-restart Pi test pending |
| Diff metadata | `[~]` | gateway Git diff exists; Pi edit patch projection pending |
| Model override | `[x]` | native configured model resolution |
| Agent/Project instructions | `[x]` | reusable instruction coverage |
| Skills/resources | `[~]` | controlled loader exists; full active skill UX pending |
| Automation invocation | `[x]` | Pi-backed automation coverage |
| Subagents | `[ ]` | restricted child-session implementation and tests |

## Batch and commit policy

Work is committed and pushed by package batch, never as an unreviewed mixed
tree:

1. `pi-*`: upstream import or isolated local patch, Pi package tests.
2. `harness`: adapters, lifecycle, model/credential seams, harness tests.
3. `tool-resolver` / `tool-runtime`: policy or effect changes with security
   tests.
4. `data-layer`: schema/persistence changes with isolated temporary data.
5. `api-gateway`: composition, public protocol, server, automation, and E2E
   changes; update `openapi.json` for endpoint changes.
6. `web-ui`: presentation and browser E2E changes.
7. Documentation: update this plan and `PATCH.md` in the same completed batch
   or in a clearly linked documentation commit.

Every batch must:

- state the invariant it establishes;
- include behavior tests for changed boundaries;
- run `git diff --check` and the relevant package `check` script;
- update `bun.lock` for dependency changes;
- be committed with a package-scoped message and pushed to the active branch.

## Decisions and non-goals

- Pi is not the Subpolar application architecture and does not become the
  source of truth for Agents, Projects, permissions, credentials, or data.
- Pi's default filesystem/resource discovery and user auth files are not
  trusted in the server runtime. Subpolar supplies a controlled loader and
  credential backend.
- Pi JSONL sessions are not canonical persistence unless a future explicit
  backend proves ownership, recovery, and retention semantics.
- Unsupported provider/API/credential combinations fail closed. There is no
  silent fallback from native Pi execution to an untracked alternate runtime.
- Voice/media, Python plugins, generic CLI/TUI/ACP, and other capabilities
  excluded by `.plans/02-python-ts-migration.md` remain out of scope.

## Definition of done

The migration reaches done when:

1. Every production entry point intended to run an agent uses the Pi-backed
   harness adapter by default, or explicitly documents why it is a lower-level
   compatibility helper.
2. Subpolar policy, credentials, tools, persistence, and public event contracts
   remain authoritative and are covered by security/isolation tests.
3. The retained provider/model matrix passes native Pi behavior fixtures,
   including custom endpoints and all credential modes it advertises.
4. Restart, cancellation, shutdown, approval, automation, and nested-run
   invariants pass without duplicate side effects or data leakage.
5. The parity matrix, repository checks, browser/protocol E2E, clean install,
   and container health checks are green.
6. Legacy engine code and documentation claims are removed or explicitly
   isolated behind a named compatibility boundary.
