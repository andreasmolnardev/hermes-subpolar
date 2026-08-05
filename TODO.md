# Python to TypeScript Runtime Migration TODO

Source of truth: [`.plans/02-python-ts-migration.md`](./.plans/02-python-ts-migration.md).
This file lists remaining work only. Items already implemented in current
foundation are recorded below so they are not mistaken for full runtime parity.

## Implemented Foundation

- [x] Phase 0 audit: package inventory, Python turn trace, capability matrix,
  module classification, golden-invariant list, deferred scope, and deletion
  gates.
- [x] Provider-neutral contracts: content parts, tool calls/results, finish
  reasons, reasoning, detailed usage, metadata, cache hints, request identity,
  cancellation, deadlines, error categories, and validators.
- [x] Deterministic tool descriptors and policy resolution: schema validation,
  restrictive precedence, collision detection, disabled/denied filtering,
  stable ordering, immutable inputs, and branded executable handles.
- [x] Data-layer contracts: schema version, sessions, ordered messages, tool
  calls/results, usage, checkpoints, migration metadata, validation, and
  transaction interfaces.
- [x] In-memory repository adapter for contract tests: ordered append,
  correlation indexes, defensive copies, serialized transactions, and rollback.
- [x] Harness lifecycle foundation: injected provider/tool/approval/context/
  persistence/event/clock/id/logger ports; explicit loop; budgets; classified
  retries; fallback; cancellation; approval; deterministic tool ordering; and
  one terminal event.
- [x] Gateway adapter foundation: request validation, legacy policy compatibility,
  descriptor preservation, harness event mapping, redacted diagnostics, and
  explicit in-memory session runtime pinning with Python fallback.
- [x] Deterministic migration fixtures for message order, tool correlation,
  usage, retry/fallback, cancellation, and diagnostic redaction.
- [x] Atomic turn persistence through repository transactions, including
  assistant/tool messages, usage, checkpoints, migration metadata, rollback,
  and interrupted-turn recovery hooks.
- [x] Harness stream consumption, reasoning/tool interleaving, UTF-8 output
  bounds, timeout/concurrency controls, malformed-result rejection, strict
  role/tool adjacency validation, and checkpoint-before-side-effect tests.
- [x] Versioned Python tool bridge contracts with correlated IDs, scoped
  environment, deadlines, cancellation, structured errors, subprocess
  cleanup, and security fixtures.
- [x] Credential-injected recorded-response OpenAI-compatible adapter with
  tool schemas, usage, finish reasons, request identity, malformed-response
  validation, and retry classification.
- [x] SQLite adapter recovery, additive metadata migration, Python legacy
  tool-record normalization, ordering, rollback, and concurrent-reader tests.
- [x] Durable gateway runtime-selection and session-repository ports with
  restart/resume and no-duplicate-side-effect fixtures.
- [x] Migration black-box fixtures for streams, persistence recovery, tool
  safety, bridge security, and recorded provider responses.
- [x] Deterministic transcript normalization, provider-schema sanitization,
  reversible tool argument keys, and fail-closed malformed-history handling.
- [x] Neutral provider error classification and bounded retry/fallback policy
  with attempt identity and no-retry side-effect boundaries.
- [x] Deterministic tool-output previews, UTF-8 bounds, aggregate budgets,
  structured fallback, and truncation/error preservation.
- [x] Deterministic prompt assembly, cache boundaries, session/workspace
  scoping, multimodal provider content, and versioned token estimation.
- [x] Iteration budgets with consume/refund/remaining semantics and explicit
  pre-side-effect exhaustion checks.
- [x] Session cwd resolution, per-session leases, event projection, complete
  turn sidecar persistence, and additive Python-compatible SQLite metadata.
- [x] Versioned whole-turn Python runtime bridge for unsupported sessions,
  including correlated JSONL, scoped environment, credential handles,
  cancellation, deadlines, redaction, and subprocess cleanup.

## Remaining Migration Work

### Core Correctness

- [ ] Persist and reload runtime version, schema version, checkpoint, and
  per-session runtime selection; remove process-local gateway pin state.
- [ ] Propagate detailed reasoning, cache usage, provider metadata, finish
  reasons, and partial usage through harness events, persistence, and gateway
  payloads without leaking prompts, arguments, results, or credentials.
- [ ] Add explicit state-transition tests for every terminal outcome and every
  provider/tool/approval cancellation race.

### Phase 3: Context And Prompt Parity

- [ ] Port remaining context sidecars, synthetic-turn variants, compression,
  summaries, overflow recovery, session rotation, and lineage handling.
- [ ] Adapt memory providers, learning, insights, curator, and context review
  through injected context-source ports with opt-out and timeout behavior.
- [ ] Add Python/TypeScript differential fixtures for short, long, multimodal,
  tool-heavy, compressed, cached, and resumed conversations.
- [ ] Do not route a turn to TypeScript until outbound roles, prompt bytes,
  cache boundaries, selected tools, and compression decisions match reviewed
  Python expectations.

### Phase 4: Tools And Python Bridge

- [ ] Migrate pure deterministic tools first; retain OS-native, browser, MCP,
  plugin, skill, sandbox, terminal, and platform tools behind the bridge.
- [ ] Preserve approval queues, policy layering, hooks, and plugin contracts
  through the bridge; checkpoint and idempotent recovery foundations are done.
- [ ] Add shared Python/TypeScript black-box suites for schemas, policy,
  approval, execution, result insertion, truncation, and failure behavior.

### Phase 5: Provider Adapters

- [ ] Preserve prompt cache controls, reasoning blocks, multimodal encoding,
  provider metadata, and provider-specific usage/error mappings.
- [ ] Migrate additional providers in usage order: Anthropic, Gemini, Bedrock,
  Azure, LM Studio, relay, Codex, Copilot, and local/native runtimes as
  supported; keep adapters out of harness core.
- [ ] Add deterministic fallback fault injection, credential rotation limits,
  auth/rate-limit/server/context/content-policy coverage, and opt-in live tests.
- [ ] Keep Python adapters as fallback until each adapter passes recorded,
  black-box, E2E, and approved live integration gates.

### Phase 6: Persistence And Gateway Cutover

- [x] Implement the current production SQLite adapter slice with additive
  migrations, transactions, ordering, recovery, concurrent-reader tests, and
  Python-created database compatibility.
- [ ] Prove Python-created sessions resume in TypeScript and TypeScript-created
  sessions remain readable by Python during retention window.
- [ ] Preserve durable session ID separately from ephemeral gateway transport ID.
- [ ] Wire runtime selection to validated `config.yaml`, persist selection per
  session/turn, and make selection immutable during a turn.
- [ ] Add disabled-by-default feature flag, explicit Python fallback, shadow
  mode, rollback, parity diagnostics, and no-duplicate provider/tool tests.
- [ ] Map all existing JSON-RPC/API events, including deltas, completion,
  reasoning, tools, approvals, clarify, status, errors, session metadata, and
  terminal ordering. Update `openapi.json` for any endpoint change.
- [ ] Add CLI, TUI, dashboard, ACP, gateway, restart, cancellation, resume,
  tool, failure-recovery, legacy SQLite, and temporary-`HERMES_HOME` E2E tests.
- [ ] Keep Python gateway/session/persistence authoritative until all boundary
  and rollback tests pass; no partial dual-runtime execution.

### Phase 7: Rollout

- [ ] Roll out internal development, opt-in users, first-cut provider/tool
  subset, broader supported capabilities, then default-on in separate gates.
- [ ] Compare completion/retry/tool-failure/cancellation-latency/token-usage/
  recovery/event-order metrics using redacted diagnostics only.
- [ ] Stop rollout on invariant violations, persistence incompatibility,
  unexplained usage drift, event-order changes, or elevated failures.
- [ ] Maintain one release window with Python fallback after TypeScript default.
- [ ] Document every unsupported route and verify it reaches Python before any
  provider or tool side effect.

### Phase 8: Python Removal

- [ ] Delete bridge and Python runtime paths capability by capability only after
  each row's black-box, differential, E2E, rollback, and temporary-
  `HERMES_HOME` gates pass.
- [ ] Remove obsolete Python dependencies and regenerate `uv.lock` after each
  bounded deletion; keep version upper bounds.
- [ ] Remove runtime flags, fallback, compatibility readers, and migration
  metadata only after persisted-data retention window and rollback gates end.
- [ ] Retain only explicitly approved installation, launcher, platform, and
  transport Python concerns; classify each retained module in the plan.
- [ ] Update packaging, install scripts, architecture docs, API specification,
  `PATCH.md`, support matrix, and release/rollback documentation.
- [ ] Verify fresh supported installs do not require Python runtime dependencies
  for migrated execution paths.

## Required Verification Gates

- [ ] `bun run check:boundaries`
- [ ] `bun run test:boundaries`
- [ ] `bun run typecheck:runtime`
- [ ] `bun run check:monorepo`
- [ ] `bun test`
- [ ] `scripts/run_tests.sh`
- [ ] `bun test tests-js/migration` with temporary `HERMES_HOME`
- [ ] Python migration and E2E suites through `scripts/run_tests.sh` with
  temporary `HERMES_HOME`
- [ ] Clean-install verification, package builds, browser E2E, gateway/API
  contract checks, and Docker health checks
- [ ] Final review reports no unresolved high- or medium-severity findings.

## Completion Rule

Do not mark migration complete while any checklist item remains unchecked,
Python fallback handles a supported capability, persisted-data interoperability
is unproven, required verification is skipped, or final acceptance criteria in
`.plans/02-python-ts-migration.md` are unmet.
