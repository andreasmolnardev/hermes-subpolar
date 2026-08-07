# Python And TypeScript Feature Requirements

> **Superseded scope:** The project is now a clean TypeScript rewrite. Existing
> Python runtime behavior and persisted data are not compatibility targets; TUI,
> ACP, and cron are out of scope. This document remains historical migration
> evidence only. The active contract is
> [`docs/architecture/typescript-only-rewrite.md`](./docs/architecture/typescript-only-rewrite.md).

This document contrasts the current Python implementation with the required
TypeScript end state from `.plans/02-python-ts-migration.md`.

**Status terms**

- **Python current:** The implementation that currently owns production behavior.
- **TypeScript target:** The package that must own the migrated behavior.
- **Retain/bridge:** A Python concern that remains outside the core runtime or
  remains behind a versioned bridge until its independent migration gate passes.
- **Parity gate:** Evidence required before a supported capability may move from
  Python authority to TypeScript authority.

## Architecture Contrast

| Area | Python Current | TypeScript Target | Requirement Before Cutover |
| --- | --- | --- | --- |
| Runtime orchestrator | `run_agent.py::AIAgent` and `agent/conversation_loop.py` own turns. | `packages/harness` owns the explicit turn state machine. | Match terminal outcomes, retries, fallback, cancellation, budgets, and one-terminal-event behavior. |
| Provider contracts | Python transports normalize provider SDK and wire behavior. | `packages/chat-provider-interface` owns provider-neutral contracts. | Record and validate request/result/error/usage fixtures for every supported adapter. |
| Tool discovery | `tools/registry.py`, `toolsets.py`, and plugin discovery describe tools. | `packages/tool-resolver` produces deterministic descriptors and policy decisions. | Match schemas, collisions, disabled filtering, policy layering, and stable ordering. |
| Tool execution | Python tool executor invokes local, plugin, MCP, browser, and platform tools. | `harness` coordinates supported execution; bridges execute retained Python tools. | Match approval, cancellation, checkpoints, result order, truncation, and failure behavior. |
| Persistence | `hermes_state.py::SessionDB` is the authoritative writer and reader. | `packages/data-layer` owns repository contracts and supported SQLite implementation. | Prove Python-to-TS and TS-to-Python resume, rollback, recovery, and retention-window readability. |
| Gateway | `gateway/`, `tui_gateway/`, ACP, CLI, and dashboard own production ingress. | `packages/api-gateway` validates, dispatches, and projects runtime events. | Preserve API/JSON-RPC event names, payloads, ordering, transport semantics, and cancellation. |
| Shared wire types | Python defines transport-specific payloads. | `packages/shared` contains only stable cross-surface wire types. | No runtime behavior, provider SDK, filesystem, or process ownership moves into shared. |
| Browser UI | Python server exposes dashboard APIs. | `packages/web-ui` consumes stable contracts and renders UI. | UI receives compatible gateway/API events without embedding agent-loop behavior. |

## Entry Points And Transports

| Feature | Python Current | TypeScript Requirement | Retained Boundary / Gate |
| --- | --- | --- | --- |
| Interactive CLI | `hermes_cli/main.py`, `cli.py`, and `run_agent.py` construct and run agent turns. | CLI invokes a selected TypeScript runtime through a versioned gateway boundary. | Retain CLI presentation/installation code until chat, tools, cancellation, resume, and recovery E2E pass. |
| Messaging gateway | `gateway/run.py` starts adapters, scopes profiles, leases turns, and delivers output. | `api-gateway` receives validated requests and emits compatible typed events. | Platform ingress/delivery remains Python until no-duplicate side effects and event-order E2E pass. |
| Dashboard/API | `hermes_cli/web_server.py` and `gateway/platforms/api_server.py` expose REST, WebSocket, and OpenAI-compatible APIs. | Gateway maps harness events to unchanged API/JSON-RPC responses. | Update `openapi.json` for endpoint changes; prove API, restart, and idempotency behavior. |
| TUI | `tui_gateway/` runs stdin/WebSocket JSON-RPC methods and stream rendering. | TUI remains a transport adapter over gateway/runtime ports. | Preserve method names, approvals, slash commands, session state, and delta ordering. |
| ACP | `acp_adapter/` maps editor sessions, resources, permissions, and events to Hermes. | ACP remains a transport adapter over gateway/runtime ports. | Preserve ACP session identity, permission translation, cancellation, MCP, and event mapping. |
| Cron/background work | `cron/` claims jobs, creates sessions, and delivers outputs. | Scheduler calls a pinned runtime selection through an adapter. | Background/cron sessions stay Python until claims, shutdown, delivery, and resume tests pass. |

## Agent Loop And Lifecycle

| Feature | Python Current | TypeScript Target | Parity Requirement |
| --- | --- | --- | --- |
| Turn state | Python conversation loop uses established lifecycle helpers. | `harness` models load, context, provider, tool, persistence, continuation, and finalization as explicit states. | State-transition tests cover every terminal outcome and race. |
| Cancellation | Python interrupt, gateway lease, stream, subprocess, and ACP paths coordinate cancellation. | `AbortSignal`, deadlines, and typed terminal events flow through provider, approval, and tool ports. | Cancel during provider, approval, foreground/background tool, and queued follow-up without duplicate terminal events. |
| Retry/fallback | Python classifies errors and selects fallback models/providers. | Harness owns normalized classification, bounded backoff, attempt identity, and fallback selection. | Match retry counts, delay bounds, identity, eligibility, usage, and no-repeat side effects. |
| Budgets | Python limits iterations, tool calls, context, output, and time. | Harness enforces turn/provider/tool/token/output/deadline/concurrency budgets. | Match exhaustion point, refunds, grace behavior, and pre-side-effect checks. |
| Completion lifecycle | Python writes usage, trajectories, titles, callbacks, diagnostics, and session metadata. | Harness emits lifecycle events and writes supported atomic runtime data. | Match complete, partial, failed, fallback, and cancelled write sets with redacted diagnostics. |
| Delegation | Python handles subagents, MoA, and background review. | Future harness delegation port; Python workers initially bridge/retain. | Delegated turns remain Python until nested cancellation, billing, persistence, and isolation pass. |

## Prompt, Context, And Memory

| Feature | Python Current | TypeScript Target | Parity Requirement |
| --- | --- | --- | --- |
| Message normalization | Python normalizes text, images, audio, files, sidecars, and synthetic turns. | Harness and provider contracts use canonical content parts and display/API sidecars. | Exact role order, content semantics, sidecar separation, and malformed-history handling. |
| System prompt | `agent/system_prompt.py` and `prompt_builder.py` build stable/context/volatile sections. | Harness context assembler builds the same provider-facing prompt through injected sources. | Compare reviewed prompt bytes, ordering, dynamic fields, selected tools, and stable prefix. |
| Cache boundaries | Python chooses destination-specific markers and cache controls. | Provider adapters encode cache hints and harness preserves cacheable boundaries. | Match enabled/disabled markers, tool cache, fallback recaching, TTL, and unchanged non-cache bytes. |
| Context references | Python expands workspace, Git, URL, and other references with security checks. | Harness calls a security-authoritative injected reference port. | Unsupported references route before effects; supported results match security and formatting fixtures. |
| Token estimation | Python estimates provider-facing context and manages response bounds. | Harness uses versioned provider-neutral estimators and model metadata ports. | Match near-limit/over-limit decisions, bounded output, and unsupported-shape routing. |
| Compression | Python manages summaries, locks, overflow recovery, rotation, and lineage. | Harness eventually owns decisions with a compression adapter/port. | Match summaries, lineage, cache boundaries, recovery, and restart behavior; otherwise route to Python. |
| Built-in memory | Python persists curated memory and injects frozen startup snapshots. | Harness consumes memory via an injected context-source lifecycle. | No duplicate injection, same opt-out/timeout behavior, and stable cacheable prefix. |
| External memory | Python memory manager controls recall, sync, provider prompt blocks, and tools. | TypeScript adapts providers through ports, not core implementation. | Provider-specific contract, privacy/redaction, lifecycle, and timeout tests. |

## Providers And Credentials

| Feature | Python Current | TypeScript Target | Parity Requirement |
| --- | --- | --- | --- |
| Provider selection | Python config/auth/catalog code resolves provider, model, route, and credentials. | Gateway/harness selection policy chooses an approved adapter before effects. | Config/model matrix, unsupported-route rejection, and credential availability tests. |
| OpenAI-compatible first cut | Python owns production calls. | A separate `chat-provider-interface` adapter handles recorded non-streaming responses. | Recorded request/response, tools, usage, finish reasons, malformed data, and opt-in live tests. |
| Native providers | Python owns Anthropic, Gemini, Bedrock, Azure, LM Studio, Codex, Copilot, relay, and local codecs. | Each provider is a separate TypeScript adapter, never harness-core behavior. | Per-provider recorded, error, cache, multimodal, credential, E2E, and approved live gates. |
| Streaming/reasoning | Python transports reconcile deltas, reasoning, tools, usage, and finish events. | Provider interface exposes typed streams consumed by harness and projected by gateway. | Delta/reasoning/tool interleave, cancellation, finish reason, and terminal ordering fixtures. |
| Credentials/OAuth | Python secret stores, OAuth, identity, and rotation own credentials. | Adapters receive scoped opaque handles; core packages never own process-global secrets. | Rotation cap, redaction, concurrent-session isolation, and subprocess environment tests. |
| Error/usage mapping | Python owns provider-specific error, billing, and usage handling. | Adapters normalize into provider-neutral categories and detailed usage. | Auth, rate-limit, server, context, content-policy, partial usage, cache, reasoning, and billing fixtures. |

## Tools, Policies, And Bridges

| Feature | Python Current | TypeScript Target | Parity Requirement |
| --- | --- | --- | --- |
| Schemas and policy | Python registry, approvals, and configuration layer policies. | Tool resolver applies deterministic descriptor validation and restrictive policy precedence. | Shared black-box schema, allow/ask/auto/deny, override, disabled, and collision tests. |
| Deterministic tools | Python currently executes local deterministic tools. | Harness executes explicitly migrated, allowlisted deterministic tools. | Result insertion, errors, truncation, correlation, cancellation, and atomic persistence match. |
| Python tool bridge | Python tool implementations remain callable through subprocess/process infrastructure. | API gateway owns versioned request/response bridge protocol. | Validate version, tool/call IDs, cwd, scoped env, opaque credentials, timeout, cancellation, cleanup, and redaction. |
| OS/native tools | Python owns terminal, sandbox, browser, MCP, plugins, skills, and platform tools. | Retain behind bridge or Python route until independently migrated. | No direct TypeScript shell/secret access; security, recovery, and adversarial tests required. |
| Approval queues | Python owns interactive adapter queues and callbacks. | Harness approval port and transport adapters preserve UI-specific approval flow. | Allow/deny/timeout/cancel and cross-session isolation tests. |
| Tool output | Python bounds output, spill behavior, and malformed-result handling. | Harness applies UTF-8 bounds, previews, aggregate budgets, and structured errors. | Exact byte limits, truncation/error preservation, spill cleanup, and no unsafe continuation. |

## Persistence, Session, And Gateway Cutover

| Feature | Python Current | TypeScript Target | Parity Requirement |
| --- | --- | --- | --- |
| Session storage | Python SQLite `SessionDB` owns sessions, messages, search, metadata, and lineage. | Data layer owns contract-native repositories and additive supported SQLite records. | Real Python-created session resumes in TS and real TS-created data resumes in Python. |
| Checkpoints/recovery | Python checkpoints tool effects and restores/rewinds sessions. | Harness/data layer persist checkpoint and recoverable turn metadata. | Interrupted before/after-tool restart, rollback, no replay, retention, and restore tests. |
| Runtime selection | Python gateway currently selects production behavior. | Gateway stores validated, durable per-session/turn selection and freezes it for the turn. | Restart/resume, concurrent lease, provider/approval/tool cancellation, and rollback tests. |
| Feature flag | Python config owns behavioral configuration. | `config.yaml` supplies disabled-by-default TypeScript enablement, default, shadow, and allowlist policy. | Invalid config rejection, profile isolation, explicit Python fallback, and no `.env` behavioral settings. |
| Shadow mode | Python remains authoritative. | TypeScript may assemble/compare redacted parity diagnostics only. | Prove no duplicate provider/tool call and no prompt/argument/result/credential leak. |
| Rollback | Python fallback is available. | Gateway rolls unsupported/new sessions to Python before effects. | Rollback without data repair, durable pin behavior, and release-window evidence. |

## Transport, Security, And Operations

| Feature | Python Current | TypeScript Target | Retained Boundary / Gate |
| --- | --- | --- | --- |
| Messaging platforms | Python adapters implement platform authentication, media, delivery, and callbacks. | Gateway projects runtime events to stable transport contracts. | Platform adapters remain Python until each replacement has explicit protocol and full platform E2E. |
| Dashboard auth | Python owns pairing, authorization, dashboard authentication, and secret handling. | TypeScript receives only authenticated runtime request context. | Never fall back from authorization failure into execution; require independent security review. |
| Secret scope | Python context-local secret scopes prevent profile cross-contamination. | Harness/bridges receive opaque scoped handles only. | Concurrency, logs, child environment, rollback, and redaction coverage. |
| Filesystem/network security | Python owns path, URL, SSRF, TLS, and dangerous-command authorities. | TypeScript validates contracts but does not bypass security authority. | Equivalent adversarial corpus and independent review required before replacement. |
| Observability | Python exporters, logs, health, OTLP, and redaction are production authority. | Harness exposes redacted logger/event ports; exporters remain adapters. | Metrics may include categories/counters only, never prompts, args, results, or credentials. |
| Process supervision | Python owns signals, watchdogs, cleanup, restart, and launcher behavior. | Harness exposes cancellable lifecycle; launchers may remain Python. | Killed-turn, orphan cleanup, shutdown, and platform installation E2E required. |

## Verification And Deletion Requirements

- **Contract coverage:** Run package boundary checks, strict TypeScript checks,
  provider/resolver/data/harness/gateway tests, and bridge protocol tests.
- **Differential coverage:** Compare Python and TypeScript behavior for short,
  long, multimodal, tool-heavy, cached, compressed, resumed, cancellation, and
  unsupported-route fixtures.
- **E2E coverage:** Use temporary `HERMES_HOME` for CLI, TUI, ACP, dashboard,
  gateway, restart, cancellation, resume, recovery, tools, legacy SQLite, and
  rollback tests.
- **Release coverage:** Run full Bun tests, Python tests through
  `scripts/run_tests.sh`, clean-install/package builds, browser/API contracts,
  and Docker health checks.
- **Deletion rule:** Delete a Python capability only when its TypeScript owner
  passes black-box, differential, E2E, rollback, retention-window, and
  clean-install gates.
- **Final state:** Remove runtime flags, fallback, bridge paths, compatibility
  readers, migration metadata, and Python runtime dependencies only after the
  release/retention window ends and no supported capability needs them.
