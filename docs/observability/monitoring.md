# Bun Gateway Monitoring

Monitor the single Bun process through `/api/health` and content-free structured
events. The health route is suitable for a reverse proxy or container
healthcheck; it must not expose credentials or database contents.

## Health

```bash
curl -fsS http://127.0.0.1:8080/api/health
```

An unavailable SQLite database or failed server startup is unhealthy. Provider
request failures are request outcomes and must not make the process silently
restart or create a second worker.

## Signals

Track:

- process up and startup duration;
- HTTP request counts, status classes, and duration buckets;
- WebSocket connections and close categories;
- session terminal outcomes;
- normalized provider outcome and usage buckets;
- tool resolution, approval, execution, timeout, and bounded-failure counts;
- SQLite transaction, schema-rejection, and busy-timeout counts.

Do not track prompts, responses, credentials, raw tool arguments or results,
filesystem contents, owner identity, or arbitrary URLs. Correlation values must
be opaque and short-lived where possible.

## Deployment Check

```bash
bun run check:monorepo
bun run typecheck:runtime
bun test
curl -fsS http://127.0.0.1:8080/api/health
```

The monitor must tolerate a collector outage without changing provider,
session, tool, or persistence behavior.
