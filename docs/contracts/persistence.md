# Persistence, Idempotency, And Recovery

The new runtime owns a fresh versioned SQLite database under the path derived
from `get_hermes_home()`. It does not read or migrate Python session files,
legacy databases, or legacy configuration. A deployment can import data only
through a separately approved typed import contract; no such import exists in
Wave 0.

## Durable Records

The database contains versioned records for users, sessions, projects, agents,
messages, tool calls/results, usage, checkpoints, recovery state, and
idempotency entries. Every record has a schema version, server ID where
applicable, and RFC 3339 timestamp. Message sequence numbers are positive
integers unique within a session and assigned transactionally.

Credentials use the secret boundary in [configuration](configuration.md).
Session tokens are stored only as hashes. API keys, passwords, CSRF tokens, and
secret-store values are never persisted in transcripts, events, idempotency
responses, or logs.

## Ownership And Transactions

- A principal owns every session and its transcript; ownership is checked in the same authorization boundary as the read or write.
- Session creation claims the requested ID atomically. A second principal cannot claim an existing ID.
- A turn write commits messages, usage, checkpoint metadata, and recovery state atomically, or commits none of them.
- `expectedNextSequence` may be supplied internally to detect concurrent writers; a mismatch is `conflict`, not an overwrite.
- The database uses foreign keys and transactions. Partial message or tool-result writes are not valid states.

## Turn Recovery

Before a non-idempotent tool dispatch, the runtime writes a checkpoint with the
turn ID, tool call ID, message sequence, effective policy, and bounded argument
digest. A crash marks the turn `interrupted` or `recoverable`. Recovery may
resume provider streaming from durable state, but it MUST NOT dispatch a
checkpointed non-idempotent tool again without a new approval/dispatch decision.

Each turn ends in exactly one of `completed`, `failed`, or `cancelled`. A late
provider or tool result after terminal state is ignored and cannot mutate the
transcript.

## Idempotency

Every state-changing HTTP request except login/bootstrap, and every
`chat.start`, uses an `Idempotency-Key` or typed request ID. A key is scoped to
principal, method, path, and operation version and is limited to 255 ASCII
characters. The server stores:

```text
IdempotencyEntry = {
  scope: string,
  key: string,
  requestHash: lowercase hex digest,
  state: pending | completed | failed,
  statusCode: positive integer,
  response: typed redacted response,
  createdAt: Timestamp,
  expiresAt: Timestamp
}
```

The same scope, key, and request hash returns the original typed response and
does not repeat provider, tool, or durable side effects. Reuse with a different
hash returns `idempotency_conflict`. A matching pending entry returns
`request_in_progress` unless the operation supports a durable replay. Keys are
retained long enough to cover the configured retry window and then expire as a
single transaction with their response.

WebSocket request IDs use the same rule. A reconnect does not replay events;
the client reads the transcript or submits a new request. Cancellation is
idempotent: repeating it for a completed or cancelled request has no effect.

## Ordering And Retention

Durable message order is `(sessionId, sequence)`. Public event sequence is a
transport concern and is not used as the durable message sequence. List
endpoints return stable cursor ordering by `(createdAt, id)`.

Retention deletes expired sessions, transcripts, tool output, checkpoints, and
idempotency responses according to validated configuration. Deletion is
owner-scoped and transactional. Audit records may have a separate operator
retention policy, but must retain redacted correlation data only.

SQLite backup, file permissions, disk encryption, and host-level access control
are deployment responsibilities. The contract does not claim encryption at
rest; it does require that application responses and logs never expose stored
secrets.
