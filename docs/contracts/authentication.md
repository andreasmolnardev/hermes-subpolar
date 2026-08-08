# Authentication Contract

Subpolar uses local username/password identity and opaque, cookie-backed
browser sessions. Authentication is implemented by the Bun gateway and the
identity repository in the gateway state database.

## Bootstrap And Login

`GET /v1/auth/bootstrap` returns `{required:true}` until the first user has
been created, otherwise `{required:false}`.

`POST /v1/auth/bootstrap` is allowed only while bootstrap is required. It
requires an exact same-origin `Origin` and a JSON body containing a username
of at least three trimmed characters and a password of at least eight
characters. It returns `201` and sets a session.

`POST /v1/auth/login` has the same request shape, requires an exact same-origin
`Origin`, and returns `200` with a new session. Login failures return
`401 invalid_credentials` without distinguishing an unknown username from a
bad password.

## Cookies

Successful bootstrap and login responses set:

- `subpolar_session`: opaque, `HttpOnly`, `SameSite=Lax`, `Path=/`, seven-day
  lifetime, and `Secure` when the request is HTTPS;
- `subpolar_csrf`: the session's CSRF value, readable by browser JavaScript,
  `SameSite=Lax`, `Path=/`, and the same lifetime.

Only a SHA-256 hash of the session token is used for repository lookup. The
raw token is sent only as the cookie value and is never included in JSON.

## Request Checks

Unauthenticated requests to protected paths return `401 {error:"unauthorized"}`.
The server does not accept an owner ID from the client. Project, agent, and
session ownership is derived from the authenticated principal.

`GET` reads do not require CSRF. Every authenticated state-changing HTTP
request must satisfy both checks:

1. `Origin` is present and exactly equals the request URL's origin.
2. `X-CSRF-Token` equals the token stored for the session and equals the value
   in the `subpolar_csrf` cookie.

Failure of the first check returns `403 origin_rejected`; failure of the
second returns `403 csrf_rejected`.

The browser client sends cookies with `credentials: include` and copies the
CSRF cookie into `X-CSRF-Token`. Non-browser clients must implement the same
cookie and header behavior; there is no alternate API-key mode.

## Session Rotation

`POST /v1/auth/password` requires the current password and a new password of
at least eight characters. On success it revokes every existing session for
the user and issues a new session, returning `200 {user,expiresAt}` with fresh
cookies. The old cookie is immediately invalid.

`POST /v1/auth/logout` requires the normal origin and CSRF checks, revokes the
current session, returns `200 {ok:true}`, and expires both cookies.

## WebSocket CSRF

The WebSocket handshake authenticates the session cookie and checks `Origin`.
The handshake does not carry an HTTP CSRF header. Each `chat.start` message
must carry `csrfToken`, which is checked against the session-bound token before
execution. This prevents a page that can cause a same-site WebSocket request
from starting a turn without the browser's CSRF value.

## Failure Semantics

Authentication errors are deliberately low detail. Password hashes use Bun's
Argon2id password facility. Session expiry and revocation are checked on every
protected request. Credentials, session tokens, CSRF values, and password
hashes are not response fields.
