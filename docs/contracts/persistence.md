# Persistence Contract

The Bun gateway uses SQLite for identity, ownership metadata, provider setup,
sessions, and ordered transcripts. The database path is
`<SUBPOLAR_DATA_DIR>/state.db`; an embedding supplies the equivalent data
directory option. The default process launch uses a temporary directory and is
not durable.

## Ownership And Identity

Identity tables store users, hashed session tokens, CSRF values, sessions, and
owner-scoped projects, agents, and session ownership. The provider connection
is a singleton record in the same state database. Foreign keys and a busy
timeout are enabled for the identity repository.

The API claims a session owner before a new turn and verifies ownership before
reading or continuing an existing session. Project and agent references must
belong to the same authenticated user; cross-owner access returns `403
forbidden`.

## Canonical Records

Transcript persistence uses schema version `1` and the following records:

```ts
  schemaVersion: 1;
  id: string;
  workspaceId: string;
  status: "active" | "completed" | "failed" | "cancelled";
  createdAt: string;
  updatedAt: string;
  runtime: { runtimeVersion: string; schemaVersion: 1 };
  title?: string;
  model?: string;
  provider?: string;
  metadata?: Record<string, unknown>;
};

type SessionMessage = {
  schemaVersion: 1;
  id: string;
  sessionId: string;
  sequence: number;
  role: "system" | "user" | "assistant" | "tool";
  content: string | unknown[];
  createdAt: string;
  apiContent?: string | unknown[];
  displayKind?: string;
  displayMetadata?: Record<string, unknown>;
  synthetic?: boolean;
  context?: unknown;
  name?: string;
  toolCalls?: unknown[];
  toolCallId?: string;
  toolResult?: unknown;
  finishReason?: "stop" | "length" | "tool_calls" | "content_filter" | "error";
  reasoning?: string;
  metadata?: Record<string, unknown>;
  usage?: Record<string, number>;
};
```

Messages are session-scoped, contiguous, and ordered by `sequence`. Tool calls,
tool results, usage records, migration state, and checkpoints are auxiliary
schema-versioned records correlated by session and message IDs.

## Turn Writes

The harness loads existing messages before a turn, appends the inbound user
message and provider result, and commits pending messages, usage, recovery
state, and checkpoints atomically when the repository supports the operation.
Transactions commit all mutations or none. Interrupted or cancelled work is
recorded as recoverable state rather than silently replaying an unfinished tool
call.

`GET /v1/sessions` returns owner metadata only. `GET
/v1/sessions/{sessionId}` first checks ownership, then returns the persisted
session and ordered messages. It never acts as a cross-user lookup oracle.

## SQLite Rules

- The canonical repository uses WAL mode, foreign keys, serialized writes, and
  schema-version validation.
- Unsupported schema versions fail closed rather than being guessed into the
  current format.
- Defensive copies prevent callers from mutating repository state after a
  read.
- The state database contains provider API keys in the current implementation.
  Filesystem permissions and encrypted, access-controlled backups are required
  deployment controls; application-level credential encryption is not claimed
  by this contract.
- Replacing or deleting the state database deletes local identity, sessions,
  ownership metadata, and provider setup. It is not a cache.
