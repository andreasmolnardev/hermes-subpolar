# Subpolar Threat Model

This is the Wave 0 security review for the clean TypeScript/Bun runtime. The
primary security objective is to prevent an unauthenticated browser, hostile
prompt content, provider response, or configured integration from crossing a
trust boundary without an explicit typed and policy-checked operation.

## Scope And Assets

Assets include local administrator credentials, session and CSRF tokens,
provider API keys, provider prompts/responses, project and agent instructions,
session transcripts, tool arguments/results, filesystem contents, process
capabilities, configuration, and SQLite integrity.

The scoped components are the browser, one same-origin Bun gateway, the
TypeScript harness, the OpenAI-compatible provider, SQLite persistence, and
three explicit tool boundaries: argv shell, fixed-origin OpenAPI, and
operator-configured MCP.

Python runtime paths, legacy routes, legacy sessions, Python plugins, and
provider-specific adapters are intentionally out of scope and are not trusted
fallbacks.

## Trust Boundaries

1. The browser is an untrusted input client. Its cookies are ambient credentials; its JSON, WebSocket commands, prompts, and tool approval choices are untrusted.
2. The gateway is the security composition root. It authenticates, checks origin/CSRF, validates closed schemas, applies ownership, and selects typed capabilities.
3. The harness is policy code, not a credential store. It receives opaque provider/tool ports and bounded data.
4. The provider is an external untrusted service. Provider content is data and may contain prompt injection, malicious markup, or misleading tool instructions.
5. Shell, OpenAPI, and MCP are separate effect boundaries. Each receives only an operator-created handle and bounded validated input.
6. SQLite is durable state, not a trust authority by itself. Every query result is re-scoped to the authenticated principal.

## Threats And Controls

| Threat | Required controls | Residual risk |
| --- | --- | --- |
| CSRF causes a browser state change | Same-origin `Origin`, double-submit/server-side CSRF equality, SameSite cookies, typed state-change checks | A compromised same-origin browser extension or XSS remains in scope for deployment hardening. |
| Cross-origin WebSocket hijack | Exact origin allowlist on upgrade, session cookie authentication, CSRF in `chat.start`, no bearer URL tokens | A permitted origin is trusted; reverse proxies must preserve the correct public origin. |
| Session theft or fixation | HttpOnly random cookies, token-hash persistence, rotation on login/password change, revocation and expiry, no HTML token injection | Host compromise or browser malware can still use an active session. |
| User reads another user's data | Principal ownership checks before reads, writes, session claims, tool approvals, and provider settings; indistinguishable not-found where appropriate | Authorization bugs require integration and E2E coverage. |
| Prompt injection triggers tools | Tool schemas and policy are server-owned, deny/ask defaults, approval binds argument digest, checkpoint before non-idempotent calls | An operator-approved tool can still perform its configured capability. |
| Shell command injection | No shell string, argv-only execution, absolute canonical paths, executable/cwd roots, exact allowlist, no Python, bounded environment/output/time | An allowlisted executable may contain its own vulnerabilities. Sandboxing and egress isolation are recommended. |
| OpenAPI SSRF or credential exfiltration | Fixed HTTPS origin, preloaded 3.1 document, operation allowlist, no external refs/server overrides, forbidden credential headers, redirect error, bounded response | A permitted service can return malicious content or access data authorized to its credential. |
| MCP supply-chain or server escape | Operator-configured server only, native approved transport, validated discovery/schema, sanitized names, bounded calls, redacted failures | The configured MCP server remains trusted for its own external effects. |
| Provider response injection or data leak | Provider is untrusted data, normalized parser, closed event projection, credential injection only at adapter, redacted errors, no raw frames | Prompts and responses necessarily reach the configured provider. Operators must choose providers appropriately. |
| Replay duplicates a side effect | Scoped idempotency records, request hash conflict, pending state, durable checkpoints before tools, one terminal outcome | Expired idempotency keys cannot prevent a later intentionally new operation. |
| Concurrent turns corrupt state | Owner-scoped turn lease, transactional writes, expected sequence, one terminal outcome, late-result discard | Availability can degrade under resource exhaustion. |
| DoS through large input/output or streams | Pre-parse byte limits, schema/item limits, bounded provider/tool output, timeouts, cancellation, rate limits, connection limits | Operators must size limits and host resources appropriately. |
| Secret leakage through diagnostics | Typed public errors, stable safe messages, redaction before serialization/logging, no raw provider/tool payloads | Application-level redaction cannot protect a fully compromised host. |
| Config tampering or behavior drift | One strict YAML source, unknown-key rejection, startup validation, secret references, atomic reload only | Host users with write access to the config or home directory can alter policy. |
| Legacy path reintroduces a second authority | `/v1` only, no Python fallback, no legacy config/session reads, unsupported shapes fail closed | Unremoved deployment routes must be blocked at packaging and proxy layers. |

## Security Invariants

- No unauthenticated request reaches a private read, provider, tool, or durable write.
- No cookie-authenticated state change succeeds without exact origin and CSRF checks.
- No model or provider response can create a tool handle or alter effective policy.
- No provider or tool credential crosses the public response, event, transcript, or log boundary.
- No non-idempotent tool runs without a durable pre-dispatch checkpoint.
- No input outside the closed contract is dynamically executed or silently coerced.
- No Python or legacy compatibility path is used to recover an unsupported shape.

## Verification Evidence Required Before Exit

Wave 0 approval is contingent on negative tests and review evidence for:

- Missing, foreign, opaque, and malformed origins; missing or mismatched CSRF; expired and revoked sessions.
- Cross-owner project, agent, session, transcript, and approval access.
- Duplicate idempotency keys with same and different bodies, concurrent retries, cancellation races, and restart recovery.
- Shell metacharacters, path traversal, symlink escape, denied executables, environment leakage, output limits, and Python attempts.
- OpenAPI external references, server overrides, credential headers, redirects, path traversal, unknown operation IDs, and response limits.
- MCP unconfigured servers, invalid discovery, schema violations, name collisions, arbitrary transport requests, and redacted failures.
- Raw provider error bodies, authorization headers, secrets, stack traces, filesystem paths, prompts, and tool outputs do not appear in public errors or ordinary logs.

The root `openapi.json` is deliberately not part of this packet's changed
files because it currently violates the `/v1`-only contract. It must not be
used as security or implementation authority until regenerated from these
documents.
