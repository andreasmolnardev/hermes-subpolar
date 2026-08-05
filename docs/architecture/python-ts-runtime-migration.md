# Python to TypeScript Runtime Boundary

This documents implemented boundary, not completed migration. TypeScript is not
default runtime and no full Python replacement or parity claim exists.

## Implemented Boundary

### Harness lifecycle

`packages/harness` exposes `executeHarness` and `run` around an explicit turn
lifecycle. Request ports provide provider calls, tool execution, approvals,
clock/sleeper, cancellation, persistence events, context assembly, IDs, and
logging. Lifecycle emits typed events for request start, provider calls,
approvals, tools, retry, fallback, and one terminal outcome.

Implemented control behavior includes:

- Abort and deadline propagation through provider, approval, and tool work.
- Turn, provider-call, tool-call, and token budgets.
- Classified retry with injected sleep, then eligible provider fallback.
- Tool argument parsing, policy checks, approval, result correlation, and
  duplicate-call/result suppression.
- Terminal outcomes for completion, cancellation, budget exhaustion, provider
  failure, tool failure, and approval rejection.

The legacy `execute(request, provider)` overload remains a direct provider
adapter. It does not mean production turns have moved to TypeScript.

### Provider-neutral contracts

`packages/chat-provider-interface` defines `ChatProvider.complete` and optional
typed streaming. Contracts carry content parts, tool-call IDs, tool results,
finish reasons, reasoning, usage, metadata, request identity, cache hints,
timeouts/deadlines, and `AbortSignal`. Validators reject non-JSON metadata and
non-finite usage/options; provider errors have normalized categories and retry
classification.

No provider SDK, credential flow, OAuth flow, or provider-specific codec belongs
in these contracts or in `harness`.

### Deterministic tool resolver

`packages/tool-resolver` resolves descriptors and policy separately from
execution. It validates schemas and branded executable handles, rejects name
collisions, applies restrictive policy precedence (`deny`, `ask`, `allow`,
`auto`), filters denied/disabled tools, clones inputs, and returns stable name
order. Resolver never executes a tool. Invalid or unsupported resolution must
fail closed or remain on Python path.

### Persistence adapters

`packages/data-layer` defines schema-versioned contracts for sessions, ordered
messages, tool calls/results, usage, migration state, and checkpoints.
`InMemorySessionRepository` enforces schema/runtime metadata, contiguous message
sequences, tool correlations, defensive copies, serialized transactions, and
all-or-nothing transaction commit/rollback.

`SQLiteSessionRepository` provides a Bun SQLite implementation with WAL,
transaction rollback, additive contract-native tables, restart durability, and
read-only compatibility for supported Python-shaped sessions and messages. It
does not yet replace Python's authoritative transcript writer or prove every
historical schema variant readable. Callers provide database paths; the adapter
never hardcodes `HERMES_HOME`.

### Gateway adapter status

`packages/api-gateway/src/index.ts` validates requests, resolves legacy policy
snapshots or full descriptors, adapts provider-neutral contracts to harness,
maps typed harness events to existing gateway/transport event shapes, redacts
diagnostics, and supports explicit per-session in-memory runtime pinning with a
Python adapter fallback.

It does not yet own production auth, session routing/leases, persisted runtime
selection, Python tool bridging, or rollback. Production gateway behavior and
fallback remain Python-authoritative until those gates pass.

## First-Cut Routing

First cut may use TypeScript only for an explicitly supported, contract-tested
turn. Route to Python before provider or tool side effects for:

- Unsupported or native provider codecs, streaming/reasoning/multimodal
  behavior not covered by the selected adapter, OAuth, credential rotation,
  and unknown provider/model routes.
- Unknown persistence schema or lineage, compression/recovery paths not
  covered by compatibility tests, and any legacy SQLite shape not proven
  readable.
- MCP, plugins, dynamic skills, subagents/MoA, browser/computer-use, sandbox,
  terminal/OS backends, and other non-deterministic or security-sensitive
  integrations.
- Platform/media/voice turns, cron/background workers, ACP/TUI-specific
  behavior, interactive approval without a compatible callback, and unknown
  tool descriptors or policy conflicts.

No unsupported route may execute partly in both runtimes. Unknown or unsafe
behavior routes to Python or is denied; it must not silently broaden TypeScript
scope.

## Session Pinning

Runtime selection must be made before a session turn starts and persisted in
session/migration metadata (`runtimeVersion`, schema version, and migration
identity). Resume must honor that pin. Runtime cannot switch mid-turn, after a
provider request, or after a tool side effect. A session with an unsupported,
unknown, or mixed-runtime state routes wholly to Python before side effects.

The current data-layer metadata supports this requirement; current gateway
adapter does not implement default runtime cutover or automatic session
selection.

## Invariants

- Stable system-prompt sections, message roles, prompt-cache boundaries, and
  tool-call/result ordering remain unchanged.
- Provider requests and results use provider-neutral IDs, usage, finish/error
  categories, and cancellation semantics.
- Resolver output is deterministic, restrictive, sorted, non-mutating, and
  never executes tools.
- Persisted messages are schema-valid, session-scoped, contiguous, ordered,
  and correlated to at most one tool result.
- Persistence transactions commit all mutations or none; retries and fallback
  do not repeat completed side effects.
- Each harness request emits at most one terminal event. Cancellation,
  deadline, budget, approval rejection, and unsafe tool input stop before new
  effects.
- Public gateway event names, order, IDs, and payload shape remain compatible.

## Rollback And Deletion Gates

- Keep TypeScript runtime selection disabled by default; enable only through an
  explicit, observable session/turn pin.
- Roll back to Python before provider/tool effects on contract mismatch,
  unsupported capability, persistence uncertainty, or event incompatibility.
- Keep Python persistence readers/writers until Python-created data resumes in
  TypeScript, TypeScript-created data remains Python-readable through the
  retention window, and recovery/rollback tests pass.
- Delete a Python capability only after TypeScript owns its supported behavior,
  black-box and differential tests pass, temporary-`HERMES_HOME` E2E passes,
  and unsupported cases have an explicit route or rejection.
- Remove gateway fallback, flags, compatibility readers, or bridge code only
  after the release/retention window, zero supported Python routes, rollback
  without data repair, packaging checks, and release documentation pass.
- Delete capability-by-capability. Never bulk-delete Python persistence,
  provider, gateway, security, or integration code.

## Verification Commands

Run from repository root:

```sh
bun run check:monorepo
bun run typecheck:runtime
bun test packages/chat-provider-interface/test packages/tool-resolver/test packages/harness/test packages/data-layer/test packages/api-gateway/test
scripts/run_tests.sh
git diff --check -- PATCH.md docs/architecture/python-ts-runtime-migration.md
git diff -- PATCH.md
git diff --no-index -- /dev/null docs/architecture/python-ts-runtime-migration.md
git status --short
```

The `--no-index` command returns status 1 when showing this untracked file.

The Python command is required for Python compatibility coverage. Migration
E2E additions must use a temporary `HERMES_HOME`; this boundary document does
not convert existing Python production paths into TypeScript.
