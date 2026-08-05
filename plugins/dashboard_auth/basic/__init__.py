"""BasicAuthProvider — username/password dashboard auth (no OAuth IDP).

A self-hosted "just put a password on my dashboard" provider. It plugs
into the same ``DashboardAuthProvider`` framework as the Nous OAuth
provider, but authenticates with a username + password instead of an
OAuth redirect: it sets ``supports_password = True`` and implements
``complete_password_login``. The login page renders a credential form for
it; everything downstream of login (session cookies, verify, refresh,
ws-tickets, logout) is identical to the OAuth path because a password
session is just a :class:`Session` with provider-minted opaque tokens.

This provider has **no external IDP**. Ordinary configured instances retain
stateless HMAC behavior for compatibility. Subpolar instances persist users,
opaque session-token digests, and client-token metadata in SQLite under
``HERMES_HOME`` so bootstrap and lifecycle management survive restarts.

Configuration surfaces (env wins over config.yaml when set non-empty),
mirroring the Nous provider's precedence convention:

  ``config.yaml`` — canonical surface::

      dashboard:
        basic_auth:
          username: admin               # required
          # Provide EITHER a precomputed scrypt hash (preferred — no
          # plaintext at rest) ...
          password_hash: "scrypt$..."   # see hash_password()
          # ... OR a plaintext password (hashed in-memory at load).
          password: "s3cret"
          secret: "<32+ random bytes, base64 or hex>"  # legacy stateless key
          session_ttl_seconds: 43200    # optional; access-token lifetime (default 12h)

  Environment overrides::

      HERMES_DASHBOARD_BASIC_AUTH_USERNAME
      HERMES_DASHBOARD_BASIC_AUTH_PASSWORD_HASH   # preferred
      HERMES_DASHBOARD_BASIC_AUTH_PASSWORD        # plaintext fallback
      HERMES_DASHBOARD_BASIC_AUTH_SECRET
      HERMES_DASHBOARD_BASIC_AUTH_TTL_SECONDS
      HERMES_DASHBOARD_BASIC_AUTH_RESET_TOKEN    # optional operator reset
      HERMES_DASHBOARD_BASIC_AUTH_ALLOW_REGISTRATION  # explicit signup policy

Persistent Subpolar mode stores only token digests in SQLite, so sessions do
not depend on a persisted signing secret. ``secret`` remains supported for
direct stateless ``BasicAuthProvider`` instances.

Password hashing uses stdlib :func:`hashlib.scrypt` (memory-hard, no
third-party dependency). ``complete_password_login`` runs a constant-time
comparison and always performs a hash even for an unknown username, so
the endpoint is not a username-enumeration timing oracle.

Skip reasons:
  Like the Nous provider, this exposes a module-level ``LAST_SKIP_REASON``
  the gate's fail-closed branch can surface when the plugin loads but
  declines to register (no username/password configured).
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import secrets
import time
from pathlib import Path
from typing import Any, Optional

from hermes_constants import get_hermes_home
from hermes_cli.dashboard_auth import (
    DashboardAuthProvider,
    InvalidCredentialsError,
    LoginStart,
    RefreshExpiredError,
    Session,
)
from hermes_cli.dashboard_auth.self_hosted import AuthStoreError, SelfHostedAuthStore

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------

# Access-token lifetime. The middleware transparently refreshes via the
# refresh token (30-day) when the access token lapses, so this controls
# how often a refresh round trip happens, not how long the user stays
# logged in.
_DEFAULT_TTL_SECONDS = 12 * 60 * 60  # 12h
_REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60  # 30d

# scrypt parameters (RFC 7914 / stdlib hashlib.scrypt). n must be a power
# of two; these are the widely-recommended interactive-login parameters
# (~16 MiB, a few ms on commodity hardware).
_SCRYPT_N = 2**14
_SCRYPT_R = 8
_SCRYPT_P = 1
_SCRYPT_DKLEN = 32
_SCRYPT_SALT_BYTES = 16

# Length of the HMAC-SHA256 digest appended as a fixed-length suffix to
# signed tokens (no separator — binary HMAC bytes can't be confused with
# a delimiter).
_SIG_LEN = hashlib.sha256().digest_size


LAST_SKIP_REASON: str = ""


# ---------------------------------------------------------------------------
# Password hashing (stdlib scrypt)
# ---------------------------------------------------------------------------


def hash_password(password: str) -> str:
    """Return a ``scrypt$n$r$p$<salt_b64>$<dk_b64>`` hash string.

    Use this to precompute ``password_hash`` for config.yaml so plaintext
    never sits at rest. Exposed as a module function so operators can run
    ``python -c "from plugins.dashboard_auth.basic import hash_password;
    print(hash_password('pw'))"``.
    """
    salt = secrets.token_bytes(_SCRYPT_SALT_BYTES)
    dk = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=_SCRYPT_N,
        r=_SCRYPT_R,
        p=_SCRYPT_P,
        dklen=_SCRYPT_DKLEN,
        maxmem=0,
    )
    return (
        f"scrypt${_SCRYPT_N}${_SCRYPT_R}${_SCRYPT_P}$"
        f"{base64.b64encode(salt).decode()}${base64.b64encode(dk).decode()}"
    )


def _verify_password(password: str, encoded: str) -> bool:
    """Constant-time scrypt verify. False on any malformed hash string."""
    try:
        scheme, n_s, r_s, p_s, salt_b64, dk_b64 = encoded.split("$")
        if scheme != "scrypt":
            return False
        n, r, p = int(n_s), int(r_s), int(p_s)
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(dk_b64)
    except (ValueError, TypeError):
        return False
    try:
        actual = hashlib.scrypt(
            password.encode("utf-8"),
            salt=salt,
            n=n,
            r=r,
            p=p,
            dklen=len(expected),
            maxmem=0,
        )
    except (ValueError, MemoryError):
        return False
    return hmac.compare_digest(actual, expected)


# A fixed dummy hash used to spend ~equal time when the username is
# unknown, so an attacker can't distinguish "no such user" (fast) from
# "wrong password" (slow scrypt) by timing. Computed once at import.
_DUMMY_HASH = hash_password("dummy-password-for-constant-time-verify")


# ---------------------------------------------------------------------------
# Token signing (stateless HMAC-signed blobs)
# ---------------------------------------------------------------------------


def _sign(payload: dict, secret: bytes) -> str:
    raw = json.dumps(payload, separators=(",", ":")).encode()
    sig = hmac.new(secret, raw, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(raw + sig).decode()


def _unsign(token: str, secret: bytes) -> Optional[dict]:
    try:
        blob = base64.urlsafe_b64decode(token.encode())
        if len(blob) <= _SIG_LEN:
            return None
        raw, sig = blob[:-_SIG_LEN], blob[-_SIG_LEN:]
        expected = hmac.new(secret, raw, hashlib.sha256).digest()
        if not hmac.compare_digest(sig, expected):
            return None
        return json.loads(raw)
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Provider
# ---------------------------------------------------------------------------


class BasicAuthProvider(DashboardAuthProvider):
    """Username/password provider with optional persistent SQLite sessions."""

    name = "basic"
    display_name = "Username & Password"
    supports_password = True

    def __init__(
        self,
        *,
        username: str = "",
        password_hash: str = "",
        secret: bytes | None = None,
        ttl_seconds: int = _DEFAULT_TTL_SECONDS,
        state_path: str | Path | None = None,
        allow_bootstrap: bool = False,
        allow_registration: bool = False,
        reset_token: str = "",
    ) -> None:
        if not username and state_path is None:
            raise ValueError("username must be non-empty")
        if not password_hash and state_path is None:
            raise ValueError("password_hash must be non-empty")
        if secret is not None and len(secret) < 16:
            raise ValueError("secret must be at least 16 bytes")
        self._username = username
        self._password_hash = password_hash
        self._store = SelfHostedAuthStore(state_path) if state_path else None
        try:
            # Persistent sessions use random opaque tokens and DB digests; no
            # signing secret needs to be persisted. Stateless instances retain
            # the legacy HMAC key contract.
            self._secret = secret or (secrets.token_bytes(32) if self._store else None)
        except AuthStoreError as exc:
            raise ValueError(str(exc)) from exc
        self._ttl = max(60, int(ttl_seconds))
        self._allow_bootstrap = bool(allow_bootstrap and self._store)
        self._allow_registration = bool(allow_registration and self._store)
        self._reset_token = reset_token.strip()
        if self._store and username and password_hash:
            self._store.ensure_user(
                username=username, password_hash=password_hash, display_name=username
            )
        if self._store:
            existing = self._store.user(username) if username else None
            if existing:
                self._username = str(existing.get("username", self._username))
                self._password_hash = str(
                    existing.get("password_hash", self._password_hash)
                )
            self.supports_token = True
            self.supports_bootstrap = (
                self._allow_bootstrap and self._store.user_count() == 0
            )
            self.supports_registration = (
                self._allow_registration or self.supports_bootstrap
            )
        else:
            self.supports_token = False
            self.supports_bootstrap = False
            self.supports_registration = False
        if self._secret is None:
            raise ValueError("secret must be at least 16 bytes")

    # ---- OAuth methods: not used (pure-password provider) ------------------

    def start_login(self, *, redirect_uri: str) -> LoginStart:
        raise NotImplementedError(
            "BasicAuthProvider is password-only; there is no OAuth redirect "
            "flow. The login page POSTs to /auth/password-login instead."
        )

    def complete_login(
        self, *, code: str, state: str, code_verifier: str, redirect_uri: str
    ) -> Session:
        raise NotImplementedError(
            "BasicAuthProvider is password-only; use complete_password_login."
        )

    # ---- password login ----------------------------------------------------

    def complete_password_login(self, *, username: str, password: str) -> Session:
        # Constant-time-ish: always run a scrypt verify (against the real
        # hash if the username matches, else a dummy hash) so an unknown
        # username and a wrong password take comparable time. Compare the
        # username with compare_digest too, to avoid a length/byte timing
        # leak on the username itself.
        configured = self._store.user(username) if self._store else None
        expected_username = (
            str(configured.get("username", "")) if configured else self._username
        )
        expected_hash = (
            str(configured.get("password_hash", ""))
            if configured
            else self._password_hash
        )
        username_ok = hmac.compare_digest(
            username.encode("utf-8"), expected_username.encode("utf-8")
        )
        target_hash = expected_hash if username_ok and expected_hash else _DUMMY_HASH
        password_ok = _verify_password(password, target_hash)
        if not (expected_username and username_ok and password_ok):
            raise InvalidCredentialsError("invalid username or password")
        if self._store:
            return self._mint_session(str(configured["user_id"]))
        return self._mint_session(expected_username)

    # ---- session lifecycle -------------------------------------------------

    def verify_session(self, *, access_token: str) -> Optional[Session]:
        if self._store:
            record = self._store.session_by_access_token(access_token, touch=True)
            if record is None:
                return None
            return self._session_from_record(access_token, "", record)
        payload = _unsign(access_token, self._secret)
        if (
            payload is None
            or payload.get("kind") != "access"
            or payload.get("exp", 0) <= int(time.time())
        ):
            return None
        if self._store and not payload.get("sid"):
            return None
        record = (
            self._store.session(str(payload["sid"]), touch=True)
            if self._store
            else None
        )
        if self._store and record is None:
            return None
        return self._session_from_payload(access_token, "", payload)

    def refresh_session(self, *, refresh_token: str) -> Session:
        if not refresh_token:
            raise RefreshExpiredError("no refresh token present in session")
        if self._store:
            record = self._store.session_by_refresh_token(refresh_token, touch=True)
            if record is None:
                raise RefreshExpiredError("refresh token revoked or expired")
            return self._mint_session(
                str(record["user_id"]), session_id=str(record["session_id"])
            )
        payload = _unsign(refresh_token, self._secret)
        if (
            payload is None
            or payload.get("kind") != "refresh"
            or payload.get("exp", 0) <= int(time.time())
        ):
            raise RefreshExpiredError("refresh token expired or invalid")
        if self._store:
            record = self._store.session(str(payload.get("sid", "")), touch=True)
            if record is None:
                raise RefreshExpiredError("refresh token revoked or expired")
        return self._mint_session(
            str(payload.get("sub", self._username)),
            session_id=str(payload.get("sid", "")),
        )

    def revoke_session(self, *, refresh_token: str) -> None:
        if self._store:
            record = self._store.session_by_refresh_token(refresh_token)
            if record:
                self._store.revoke_session(
                    user_id=str(record["user_id"]),
                    session_id=str(record["session_id"]),
                )
            return None
        payload = _unsign(refresh_token, self._secret)
        if self._store and payload and payload.get("sid"):
            self._store.revoke_session(
                user_id=str(payload.get("sub", "")),
                session_id=str(payload["sid"]),
            )
        return None

    # ---- internals ---------------------------------------------------------

    def _mint_session(self, user_id: str, *, session_id: str = "") -> Session:
        now = int(time.time())
        exp = now + self._ttl
        if self._store:
            access_token = secrets.token_urlsafe(32)
            refresh_token = secrets.token_urlsafe(32)
            if session_id:
                renewed = self._store.renew_session(
                    session_id=session_id,
                    access_token=access_token,
                    refresh_token=refresh_token,
                    expires_at=exp,
                    refresh_expires_at=now + _REFRESH_TTL_SECONDS,
                )
            else:
                renewed = None
            if renewed:
                sid, created_at = renewed
            else:
                sid, created_at = self._store.create_session(
                    user_id=user_id,
                    access_token=access_token,
                    refresh_token=refresh_token,
                    expires_at=exp,
                    refresh_expires_at=now + _REFRESH_TTL_SECONDS,
                )
            user = self._store.user(user_id=user_id) or {}
            return Session(
                user_id=user_id,
                email="",
                display_name=str(user.get("display_name", user_id)),
                org_id="",
                provider=self.name,
                expires_at=exp,
                access_token=access_token,
                refresh_token=refresh_token,
                session_id=sid,
                created_at=created_at,
                last_seen_at=now,
            )
        sid = ""
        created_at = 0
        if self._store:
            renewed = (
                self._store.renew_session(
                    session_id=session_id,
                    expires_at=now + _REFRESH_TTL_SECONDS,
                )
                if session_id
                else None
            )
            if renewed:
                sid, created_at = renewed
            else:
                sid, created_at = self._store.create_session(
                    user_id=user_id, expires_at=now + _REFRESH_TTL_SECONDS
                )
        access_token = _sign(
            {
                "sub": user_id,
                "kind": "access",
                "exp": exp,
                **({"sid": sid} if sid else {}),
            },
            self._secret,
        )
        refresh_token = _sign(
            {
                "sub": user_id,
                "kind": "refresh",
                "exp": now + _REFRESH_TTL_SECONDS,
                **({"sid": sid} if sid else {}),
            },
            self._secret,
        )
        return Session(
            user_id=user_id,
            email="",
            display_name=user_id,
            org_id="",
            provider=self.name,
            expires_at=exp,
            access_token=access_token,
            refresh_token=refresh_token,
            session_id=sid,
            created_at=created_at,
            last_seen_at=created_at,
        )

    def _session_from_payload(
        self, access_token: str, refresh_token: str, payload: dict
    ) -> Session:
        user_id = str(payload.get("sub", ""))
        record = (
            self._store.session(str(payload["sid"]))
            if self._store and payload.get("sid")
            else None
        )
        return Session(
            user_id=user_id,
            email="",
            display_name=user_id,
            org_id="",
            provider=self.name,
            expires_at=int(payload["exp"]),
            access_token=access_token,
            refresh_token=refresh_token,
            session_id=str(payload.get("sid", "")),
            created_at=int(record.get("created_at", 0)) if record else 0,
            last_seen_at=int(record.get("last_seen_at", 0)) if record else 0,
        )

    def _session_from_record(
        self, access_token: str, refresh_token: str, record: dict[str, Any]
    ) -> Session:
        user_id = str(record["user_id"])
        return Session(
            user_id=user_id,
            email="",
            display_name=str(record.get("display_name", user_id)),
            org_id="",
            provider=self.name,
            expires_at=int(record["expires_at"]),
            access_token=access_token,
            refresh_token=refresh_token,
            session_id=str(record["session_id"]),
            created_at=int(record.get("created_at", 0)),
            last_seen_at=int(record.get("last_seen_at", 0)),
        )

    # ---- persistent self-hosted lifecycle ---------------------------------

    def bootstrap_user(
        self, *, username: str, password: str, display_name: str = ""
    ) -> Session:
        if not self._store or not self._allow_bootstrap:
            raise InvalidCredentialsError("bootstrap is disabled")
        username = username.strip()
        if not username or not password:
            raise InvalidCredentialsError("username and password are required")
        user = self._store.create_user(
            username=username,
            password_hash=hash_password(password),
            display_name=display_name.strip() or username,
            user_id=username,
        )
        if user is None:
            raise InvalidCredentialsError("bootstrap already completed")
        self._username = username
        self._password_hash = str(user["password_hash"])
        self.supports_bootstrap = False
        self.supports_registration = self._allow_registration
        return self._mint_session(str(user["user_id"]))

    def register_user(
        self, *, username: str, password: str, display_name: str = ""
    ) -> Session:
        if not self._store or not self.supports_registration:
            raise InvalidCredentialsError("registration is disabled")
        user = self._store.create_user(
            username=username,
            password_hash=hash_password(password),
            display_name=display_name,
        )
        if user is None:
            raise InvalidCredentialsError("username is already registered")
        return self._mint_session(str(user["user_id"]))

    def change_password(
        self, *, user_id: str, current_password: str, new_password: str
    ) -> Session:
        if not self._store or not new_password:
            raise InvalidCredentialsError("password change is unavailable")
        user = self._store.user(user_id=user_id)
        if not user or not _verify_password(
            current_password, str(user.get("password_hash", ""))
        ):
            raise InvalidCredentialsError("current password is invalid")
        password_hash = hash_password(new_password)
        self._store.update_password(user_id=user_id, password_hash=password_hash)
        self._password_hash = password_hash
        return self._mint_session(user_id)

    def reset_password(
        self, *, username: str, new_password: str, reset_token: str
    ) -> Session:
        if not self._store or not self._reset_token or not new_password:
            raise InvalidCredentialsError("password reset is unavailable")
        if not hmac.compare_digest(reset_token, self._reset_token):
            raise InvalidCredentialsError("reset token is invalid")
        user = self._store.user(username)
        if not user:
            raise InvalidCredentialsError("reset token is invalid")
        password_hash = hash_password(new_password)
        self._store.update_password(
            user_id=str(user["user_id"]), password_hash=password_hash
        )
        self._password_hash = password_hash
        return self._mint_session(str(user["user_id"]))

    def list_sessions(self, *, user_id: str) -> list[dict[str, Any]]:
        return self._store.list_sessions(user_id) if self._store else []

    def revoke_session_id(self, *, user_id: str, session_id: str) -> bool:
        return bool(
            self._store
            and self._store.revoke_session(user_id=user_id, session_id=session_id)
        )

    def issue_client_token(
        self, *, user_id: str, scopes: list[str], expires_at: int | None
    ):
        if not self._store:
            raise InvalidCredentialsError("client tokens are unavailable")
        return self._store.issue_client_token(
            user_id=user_id, scopes=scopes, expires_at=expires_at
        )

    def list_client_tokens(self, *, user_id: str) -> list[dict[str, Any]]:
        return self._store.list_client_tokens(user_id) if self._store else []

    def revoke_client_token(self, *, user_id: str, token_id: str) -> bool:
        return bool(
            self._store
            and self._store.revoke_client_token(user_id=user_id, token_id=token_id)
        )

    def verify_token(self, *, token: str):
        if not self._store:
            return None
        record = self._store.verify_client_token(token)
        if record is None:
            return None
        from hermes_cli.dashboard_auth import TokenPrincipal

        return TokenPrincipal(
            principal=str(record["user_id"]),
            provider=self.name,
            scopes=tuple(str(scope) for scope in record.get("scopes", [])),
        )


# ---------------------------------------------------------------------------
# Plugin entry point
# ---------------------------------------------------------------------------


def _load_config_basic_auth_section() -> dict:
    """Return ``dashboard.basic_auth`` from config.yaml, or ``{}``.

    Robust to load_config() raising, the keys being absent, or the value
    not being a dict — every shape falls through to ``{}``.
    """
    try:
        from hermes_cli.config import cfg_get, load_config

        cfg = load_config()
    except Exception as exc:  # noqa: BLE001 — broad catch is intentional
        logger.debug(
            "dashboard-auth-basic: load_config() raised %s; "
            "falling back to env-only configuration",
            exc,
        )
        return {}
    section = cfg_get(cfg, "dashboard", "basic_auth", default=None)
    return section if isinstance(section, dict) else {}


def _resolve(env_name: str, cfg_section: dict, cfg_key: str) -> str:
    """Env-wins-over-config resolution; empty env treated as unset."""
    env = os.environ.get(env_name, "").strip()
    if env:
        return env
    return str(cfg_section.get(cfg_key, "") or "").strip()


def _resolve_secret(cfg_section: dict) -> bytes:
    """Resolve the token-signing secret.

    Accepts base64 or hex or raw text from config/env. When unset,
    generates a random per-process secret (sessions then don't survive a
    restart or span multiple workers — logged at INFO).
    """
    raw = _resolve("HERMES_DASHBOARD_BASIC_AUTH_SECRET", cfg_section, "secret")
    if not raw:
        logger.info(
            "dashboard-auth-basic: no 'secret' configured; generating a "
            "random per-process signing key. Sessions will not survive a "
            "restart or span multiple workers. Set dashboard.basic_auth."
            "secret (or HERMES_DASHBOARD_BASIC_AUTH_SECRET) for stable "
            "sessions."
        )
        return secrets.token_bytes(32)
    # Try base64, then hex, then fall back to the raw UTF-8 bytes.
    for decoder in (base64.b64decode, bytes.fromhex):
        try:
            decoded = decoder(raw)
            if len(decoded) >= 16:
                return decoded
        except (ValueError, TypeError):
            pass
    return raw.encode("utf-8")


def register(ctx) -> None:
    """Plugin entry — registers BasicAuthProvider when credentials exist.

    Loopback / ``--insecure`` operators and anyone using the OAuth
    provider leave ``dashboard.basic_auth`` unset, so this plugin is a
    no-op for them. When username + (password or password_hash) are
    configured, it registers a password provider that the login page
    renders as a credential form.
    """
    global LAST_SKIP_REASON
    LAST_SKIP_REASON = ""

    section = _load_config_basic_auth_section()
    # Subpolar deployments can bootstrap their first user through the browser.
    # Keep the legacy plugin no-op behavior for ordinary Hermes installs.
    bootstrap_enabled = os.environ.get("HERMES_SUBPOLAR_ONLY", "").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    } or str(section.get("bootstrap", "")).strip().lower() in {"1", "true", "yes", "on"}
    username = _resolve("HERMES_DASHBOARD_BASIC_AUTH_USERNAME", section, "username")
    password_hash = _resolve(
        "HERMES_DASHBOARD_BASIC_AUTH_PASSWORD_HASH", section, "password_hash"
    )
    plaintext = _resolve("HERMES_DASHBOARD_BASIC_AUTH_PASSWORD", section, "password")
    ttl_raw = _resolve(
        "HERMES_DASHBOARD_BASIC_AUTH_TTL_SECONDS", section, "session_ttl_seconds"
    )
    allow_registration = _resolve(
        "HERMES_DASHBOARD_BASIC_AUTH_ALLOW_REGISTRATION",
        section,
        "allow_registration",
    ).lower() in {"1", "true", "yes", "on"}

    if not username and not bootstrap_enabled:
        LAST_SKIP_REASON = (
            "dashboard.basic_auth.username is not set (and "
            "HERMES_DASHBOARD_BASIC_AUTH_USERNAME is empty). Set a username "
            "and a password (or password_hash) under dashboard.basic_auth in "
            "config.yaml to enable username/password dashboard login, or use "
            "the OAuth provider, or pass --insecure to skip the auth gate."
        )
        logger.debug("dashboard-auth-basic: %s", LAST_SKIP_REASON)
        return

    if not password_hash and not plaintext and not bootstrap_enabled:
        LAST_SKIP_REASON = (
            "dashboard.basic_auth.username is set but neither password_hash "
            "nor password is configured. Provide one of them (password_hash "
            "is preferred — compute it with "
            "plugins.dashboard_auth.basic.hash_password)."
        )
        logger.warning("dashboard-auth-basic: %s", LAST_SKIP_REASON)
        return

    # Precedence (env-wins convention): a password supplied via the
    # HERMES_DASHBOARD_BASIC_AUTH_PASSWORD env var overrides a config.yaml
    # password_hash, so an operator can rotate the password by setting an
    # env var without editing config. A password_hash (precomputed) wins
    # over a config-only plaintext password at the same tier — it's the
    # preferred at-rest form. Concretely:
    #   * env password set        → hash it (overrides any config hash)
    #   * else config password_hash set → use it
    #   * else config plaintext password → hash it in-memory
    plaintext_from_env = os.environ.get(
        "HERMES_DASHBOARD_BASIC_AUTH_PASSWORD", ""
    ).strip()
    if plaintext_from_env:
        password_hash = hash_password(plaintext_from_env)
        logger.info(
            "dashboard-auth-basic: hashed env-supplied password in-memory "
            "(overrides any config password_hash)."
        )
    elif not password_hash and plaintext:
        # config-only plaintext password.
        password_hash = hash_password(plaintext)
        logger.info(
            "dashboard-auth-basic: hashed plaintext password in-memory. "
            "For production, precompute dashboard.basic_auth.password_hash "
            "and remove the plaintext password from config."
        )

    # Bundled self-hosted auth always uses HERMES_HOME-backed SQLite. Direct
    # BasicAuthProvider instances without state_path retain legacy stateless
    # behavior for third-party/provider contract compatibility.
    persistent = True
    state_path = get_hermes_home() / "dashboard_auth.db"
    configured_secret = _resolve(
        "HERMES_DASHBOARD_BASIC_AUTH_SECRET", section, "secret"
    )
    # Persistent self-hosted state owns generated signing keys. Configured
    # Docker secrets still remain authoritative for first initialization.
    secret = _resolve_secret(section) if configured_secret or not persistent else None
    reset_token = os.environ.get("HERMES_DASHBOARD_BASIC_AUTH_RESET_TOKEN", "").strip()

    try:
        ttl = int(ttl_raw) if ttl_raw else _DEFAULT_TTL_SECONDS
    except ValueError:
        ttl = _DEFAULT_TTL_SECONDS

    try:
        provider = BasicAuthProvider(
            username=username,
            password_hash=password_hash,
            secret=secret,
            ttl_seconds=ttl,
            state_path=state_path,
            allow_bootstrap=bootstrap_enabled,
            allow_registration=allow_registration,
            reset_token=reset_token,
        )
    except ValueError as exc:
        LAST_SKIP_REASON = f"BasicAuthProvider construction failed: {exc}"
        logger.warning("dashboard-auth-basic: %s", LAST_SKIP_REASON)
        return

    ctx.register_dashboard_auth_provider(provider)
    logger.info(
        "dashboard-auth-basic: registered password provider (username=%s)",
        username,
    )
