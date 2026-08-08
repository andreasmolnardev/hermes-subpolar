# Observability

The Bun gateway emits structured, content-free operational events for the one
HTTP process. Observability is an adapter boundary, not a second runtime and
not a provider or tool execution path.

## Principles

- Emit lifecycle, health, duration, status, and bounded error categories.
- Never emit API keys, session tokens, prompts, provider responses, tool
  arguments, tool results, filesystem contents, or raw exception text.
- Use owner-neutral opaque IDs only when correlation is required.
- Keep collection fail-open for the request path and bounded for shutdown.
- Preserve one terminal event per turn and one completion event per tool call.

## Event Families

| Family | Examples |
| --- | --- |
| HTTP | request duration, route class, status, authentication outcome |
| WebSocket | connection state, event type, close category |
| Session | created, resumed, completed, failed, cancelled |
| Provider | attempt, normalized outcome, retry category, usage buckets |
| Tool | resolved, approved, started, completed, bounded failure category |
| Persistence | transaction outcome, schema rejection, busy timeout |
| Process | startup, shutdown, health, database availability |

Consumers should use typed fields instead of parsing messages. New fields must
be bounded, documented, redacted where necessary, and covered by behavior
tests.
