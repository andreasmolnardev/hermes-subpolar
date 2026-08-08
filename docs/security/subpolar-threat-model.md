# Subpolar Threat Model

This document records the Wave 0 security decisions for the Bun-only Subpolar
browser product. The protected deployment is a self-hosted gateway serving one
browser application and its authenticated owner sessions.

## Assets

- Password hashes, session tokens, CSRF tokens, and provider API keys.
- Owner identity and the confidentiality of projects, agents, sessions, and
  transcripts.
- Provider requests, system instructions, prompt-cache boundaries, tool
  arguments, tool results, and usage data.
- SQLite integrity, ordered message history, recovery state, and checkpoints.
- Gateway availability and the ability to cancel an active turn.

## Actors And Trust

- The authenticated owner is trusted to configure providers and their own
  workspace, but not to bypass server ownership checks by choosing another ID.
- The browser application is a client, not an authority. User content and
  provider output are untrusted data.
- A different website is an untrusted origin and must not be able to use the
  owner's ambient session to mutate state or start a turn.
- The configured provider and any returned model content are external and
  untrusted. Provider credentials are trusted secrets but the provider is not
  trusted with unrelated local state.
- The host account and the private data directory are deployment trust
  boundaries. A compromised host is out of scope for application isolation.

## Security Decisions

### Browser session and CSRF

Authentication uses an `HttpOnly`, `SameSite=Lax` session cookie plus a
readable, session-bound CSRF cookie. State-changing HTTP requests require both
an exact same-origin `Origin` and a matching `X-CSRF-Token`; login and initial
bootstrap require origin but have no pre-existing CSRF session. WebSocket
upgrades require origin and authentication, and every `chat.start` carries the
session CSRF token.

This is deliberate defense in depth. SameSite limits ambient cross-site cookie
submission; origin validation rejects mismatched browser origins; the CSRF
value protects state-changing requests and WebSocket messages that otherwise
have no normal form submission equivalent.

### Owner isolation

The server derives the principal from the session and never accepts a
client-selected owner. Every project, agent, and session read or write is
filtered or checked against that principal. A failed ownership check returns a
generic forbidden result, while a missing session returns unauthorized.

### Secret handling

Provider credentials are accepted only by authenticated setup, stored in the
private state database, and passed server-side to the provider adapter. They
are not returned by catalog, setup status, identity, transcript, or completion
responses. The current database stores the API key as application data rather
than encrypting it, so filesystem permissions, encrypted backups, and host
access control are mandatory.

### Provider and network boundary

Provider URLs must use HTTPS except for loopback HTTP during local setup. The
current contract does not impose a host allowlist for HTTPS, so an operator
could configure an internal HTTPS endpoint. Deployments must use firewall or
egress-proxy policy to constrain provider destinations and prevent unintended
network access. The provider adapter must not retrieve media URLs merely
because a message contains them.

### Tool boundary

No public `/v1` request can register or select a tool in Wave 0; turns start
with an empty tool policy. Internal tool resolution is deny-by-default,
separate from execution, validates schemas and policy, and uses explicit
handles or references instead of shell command strings. Provider-generated
names and arguments are never authorization decisions.

### Persistence integrity

SQLite WAL, foreign keys, schema-version validation, serialized writes, and
atomic turn commits protect transcript ordering and recovery invariants.
Unknown schema shapes fail closed. Session IDs are not authorization tokens;
ownership is checked before persistence reads.

### Availability controls

The gateway bounds JSON request bodies, validates input before provider
execution, propagates cancellation and deadlines, serializes turns per
session, and aborts active work when a WebSocket closes. These controls reduce
resource exhaustion but are not a complete rate limiter. A public deployment
should add proxy-level connection and request limits.

## Deployment Requirements

- Keep the default listener on loopback unless a trusted TLS reverse proxy is
  used.
- Preserve the browser-visible origin through proxy routing because the
  gateway compares `Origin` to the request URL origin.
- Run the gateway with exclusive access to its persistent data directory.
- Restrict outbound network access to configured provider destinations where
  practical.
- Treat the static browser bundle as trusted code and deploy standard TLS,
  security headers, and content-security policy at the serving layer. The Wave
  0 gateway does not claim that application-level XSS defenses replace those
  controls.

## Residual Risks

- A stolen session cookie remains usable until expiry or password rotation;
  HTTPS and host/browser protection are required.
- The readable CSRF cookie is intentionally available to same-origin browser
  code; an XSS compromise can read it and the session can then be abused.
- Provider API keys are not encrypted inside SQLite.
- The default data directory is temporary and can cause loss if used for a
  deployment.
- Provider prompt injection can influence model behavior. It cannot grant a
  tool or ownership capability through the public contract, but the model's
  output remains untrusted and must not be treated as an authorization signal.
