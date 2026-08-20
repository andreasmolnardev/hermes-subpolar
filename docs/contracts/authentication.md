# Authentication, CSRF, And Origin

Subpolar is a self-hosted browser service with local password authentication.
The browser uses a server-issued cookie session; bearer tokens are not injected
into HTML, JavaScript, URLs, logs, or WebSocket messages.

## Lifecycle

1. `GET /v1/auth/bootstrap` reports whether the first administrator is required.
2. `POST /v1/auth/bootstrap` accepts a username of at least 3 characters and a password of at least 8 characters. It succeeds only while no user exists.
3. `POST /v1/auth/login` verifies the password and creates a fresh session.
4. Logout revokes the current session. Password change revokes all sessions and issues one fresh session.
5. Sessions expire after the configured lifetime and are checked on every request.

Passwords are hashed with Argon2id or a stronger approved password hash. The
plaintext password is never persisted or returned. Login and bootstrap errors
use generic typed codes and do not disclose which account check failed.

Bootstrap and login bodies are `{ "username": string, "password": string }`.
Password change is `{ "currentPassword": string, "newPassword": string }`.
Successful authentication returns `{ "user": User, "expiresAt": Timestamp }`
and sets both cookies. These bodies reject unknown keys.

## Cookies

| Cookie | HttpOnly | SameSite | Purpose |
| --- | --- | --- | --- |
| `subpolar_session` | yes | `Lax` | Opaque random session credential; only its hash is persisted. |
| `subpolar_csrf` | no | `Lax` | Random CSRF value readable by the same-origin browser. |

Both cookies use `Path=/`; `Secure` is mandatory in production HTTPS. Cookie
values are random, URL-safe, and never exposed through JSON. A session rotation
changes both cookie values.

## CSRF

Every cookie-authenticated state change, including chat start, setup, logout,
password change, resource creation, and WebSocket `chat.start`, MUST satisfy
all of these checks:

- An active session cookie authenticates the principal.
- `Origin` exactly equals the configured public origin. Missing, opaque, or merely suffix-matching origins fail.
- HTTP requests include `X-CSRF-Token` equal to both the readable CSRF cookie and the server-side session value.
- WebSocket `chat.start` includes the same CSRF value in its typed command.

GET requests do not mutate state and do not require a CSRF header, but private
GET requests still require the session. Same-origin checks remain required for
the WebSocket upgrade and for all browser state changes.

## Authorization

The authenticated principal is the owner scope for projects, agents, sessions,
transcripts, provider settings, and approvals. Ownership is checked before
resource reads and before side effects. A resource belonging to another user
is treated as `forbidden` or indistinguishable `not_found` according to the
endpoint contract; it is never returned.

## Session Storage

The database stores a hash of the session token, principal ID, CSRF value,
expiry, revocation state, and creation time. It does not store a browser token
in plaintext. Secret storage and persistence rules are in
[configuration](configuration.md) and [persistence](persistence.md).

## Non-Scope

OAuth login, public API bearer authentication, cross-origin browser clients,
legacy dashboard sessions, and Python authentication routes are not supported
by this contract. Adding one requires a new versioned security review.
