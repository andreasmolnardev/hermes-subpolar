# Session Lifecycle

A session is an owner-scoped conversation stored by the Bun API. The browser
uses the authenticated `/v1` routes and WebSocket events; it does not own the
transcript or provider call.

## States

```text
new -> active -> completed
             |-> failed
             `-> cancelled
```

`new` is created before the first turn. `active` means a turn may append work.
Every turn ends exactly once in `completed`, `failed`, or `cancelled`.

## Turn Order

1. Authenticate the request and verify project, agent, and session ownership.
2. Load the ordered SQLite transcript and validate its schema version.
3. Append the user message in memory while preserving role alternation and the
   stable system-prompt and cache boundaries.
4. Resolve the configured OpenAI-compatible provider and native tool set before
   side effects.
5. Run the harness turn with cancellation, deadlines, budgets, and bounded tool
   output.
6. Persist messages, usage, tool records, and terminal state atomically.
7. Project typed events to the HTTP response or `/v1/ws` stream.

An invalid owner, schema, provider, tool descriptor, or policy stops before
provider or tool effects. A cancelled turn records recoverable state and does
not replay a completed tool call.

## Persistence

The canonical database is `<SUBPOLAR_DATA_DIR>/state.db`. Session records and
messages are owner-scoped, contiguous, and ordered. SQLite uses WAL mode,
foreign keys, serialized writes, and schema validation. Replacing the database
removes local identity, setup, sessions, and transcripts; it is not a cache.

## Restart And Resume

On restart, the API reads session status and ordered messages from SQLite. A
completed session can continue in a new turn. An interrupted session resumes
only from committed records; uncommitted provider or tool work is never
silently replayed.
