"""SQLite state store for self-hosted dashboard authentication."""

from __future__ import annotations

import hashlib
import os
import secrets
import sqlite3
import threading
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

from hermes_constants import get_hermes_home
from hermes_cli.dashboard_auth.base import ProviderError


class AuthStoreError(ProviderError):
    """Dashboard auth database could not be opened or updated."""


_THREAD_LOCK = threading.RLock()


def _digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


class SelfHostedAuthStore:
    """Persistent multi-user auth state backed by SQLite."""

    def __init__(self, path: str | os.PathLike[str] | None = None) -> None:
        self.path = Path(path) if path else get_hermes_home() / "dashboard_auth.db"
        self.path.parent.mkdir(parents=True, exist_ok=True)
        try:
            os.chmod(self.path.parent, 0o700)
        except OSError:
            pass
        self._initialize()

    @contextmanager
    def _connection(self) -> Iterator[sqlite3.Connection]:
        with _THREAD_LOCK:
            try:
                connection = sqlite3.connect(str(self.path), timeout=10.0)
                connection.row_factory = sqlite3.Row
                connection.execute("PRAGMA busy_timeout = 10000")
                connection.execute("PRAGMA foreign_keys = ON")
                connection.execute("PRAGMA journal_mode = WAL")
            except sqlite3.Error as exc:
                raise AuthStoreError(
                    f"could not open dashboard auth database: {exc}"
                ) from exc
            try:
                yield connection
                connection.commit()
            except sqlite3.Error as exc:
                connection.rollback()
                raise AuthStoreError(f"dashboard auth database error: {exc}") from exc
            finally:
                connection.close()

    def _initialize(self) -> None:
        try:
            with self._connection() as connection:
                connection.executescript(
                    """
                    CREATE TABLE IF NOT EXISTS users (
                        user_id TEXT PRIMARY KEY,
                        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                        display_name TEXT NOT NULL,
                        password_hash TEXT NOT NULL,
                        created_at INTEGER NOT NULL,
                        updated_at INTEGER NOT NULL
                    );
                    CREATE TABLE IF NOT EXISTS sessions (
                        session_id TEXT PRIMARY KEY,
                        access_token_digest TEXT NOT NULL UNIQUE,
                        refresh_token_digest TEXT NOT NULL UNIQUE,
                        user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
                        created_at INTEGER NOT NULL,
                        last_seen_at INTEGER NOT NULL,
                        expires_at INTEGER NOT NULL,
                        refresh_expires_at INTEGER NOT NULL,
                        revoked_at INTEGER
                    );
                    CREATE INDEX IF NOT EXISTS sessions_user_idx
                        ON sessions(user_id, created_at DESC);
                    CREATE TABLE IF NOT EXISTS client_tokens (
                        token_id TEXT PRIMARY KEY,
                        token_digest TEXT NOT NULL UNIQUE,
                        user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
                        scopes TEXT NOT NULL,
                        created_at INTEGER NOT NULL,
                        expires_at INTEGER,
                        revoked_at INTEGER
                    );
                    CREATE INDEX IF NOT EXISTS client_tokens_user_idx
                        ON client_tokens(user_id, created_at DESC);
                    """
                )
        except sqlite3.Error as exc:
            raise AuthStoreError(
                f"could not initialize dashboard auth database: {exc}"
            ) from exc
        try:
            os.chmod(self.path, 0o600)
            for suffix in ("-wal", "-shm"):
                sidecar = Path(f"{self.path}{suffix}")
                if sidecar.exists():
                    os.chmod(sidecar, 0o600)
        except OSError:
            pass

    @staticmethod
    def _user(row: sqlite3.Row | None) -> dict[str, Any] | None:
        return dict(row) if row is not None else None

    def user(
        self, username: str | None = None, *, user_id: str | None = None
    ) -> dict[str, Any] | None:
        with self._connection() as connection:
            if user_id is not None:
                row = connection.execute(
                    "SELECT * FROM users WHERE user_id = ?", (user_id,)
                ).fetchone()
            elif username is not None:
                row = connection.execute(
                    "SELECT * FROM users WHERE username = ? COLLATE NOCASE", (username,)
                ).fetchone()
            else:
                raise ValueError("username or user_id required")
            return self._user(row)

    def user_count(self) -> int:
        with self._connection() as connection:
            return int(connection.execute("SELECT COUNT(*) FROM users").fetchone()[0])

    def ensure_user(
        self, *, username: str, password_hash: str, display_name: str = ""
    ) -> dict[str, Any]:
        existing = self.user(username)
        if existing is not None:
            return existing
        created = self.create_user(
            username=username,
            password_hash=password_hash,
            display_name=display_name,
            user_id=username,
        )
        if created is None:
            existing = self.user(username)
            if existing is not None:
                return existing
            raise AuthStoreError("could not create configured dashboard user")
        return created

    def create_user(
        self,
        *,
        username: str,
        password_hash: str,
        display_name: str = "",
        user_id: str | None = None,
    ) -> dict[str, Any] | None:
        username = username.strip()
        if not username or not password_hash:
            return None
        now = int(time.time())
        user = {
            "user_id": user_id or secrets.token_urlsafe(18),
            "username": username,
            "display_name": display_name.strip() or username,
            "password_hash": password_hash,
            "created_at": now,
            "updated_at": now,
        }
        try:
            with self._connection() as connection:
                connection.execute(
                    """INSERT INTO users
                       (user_id, username, display_name, password_hash, created_at, updated_at)
                       VALUES (?, ?, ?, ?, ?, ?)""",
                    tuple(user.values()),
                )
            return user
        except AuthStoreError as exc:
            if "UNIQUE" in str(exc).upper():
                return None
            raise

    def update_password(self, *, user_id: str, password_hash: str) -> bool:
        now = int(time.time())
        with self._connection() as connection:
            cursor = connection.execute(
                "UPDATE users SET password_hash = ?, updated_at = ? WHERE user_id = ?",
                (password_hash, now, user_id),
            )
            connection.execute(
                "UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL",
                (now, user_id),
            )
            return cursor.rowcount == 1

    def create_session(
        self,
        *,
        user_id: str,
        access_token: str,
        refresh_token: str,
        expires_at: int,
        refresh_expires_at: int,
    ) -> tuple[str, int]:
        session_id = secrets.token_urlsafe(18)
        now = int(time.time())
        with self._connection() as connection:
            connection.execute(
                """INSERT INTO sessions
                   (session_id, access_token_digest, refresh_token_digest, user_id,
                    created_at, last_seen_at, expires_at, refresh_expires_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    session_id,
                    _digest(access_token),
                    _digest(refresh_token),
                    user_id,
                    now,
                    now,
                    expires_at,
                    refresh_expires_at,
                ),
            )
        return session_id, now

    def renew_session(
        self,
        *,
        session_id: str,
        access_token: str,
        refresh_token: str,
        expires_at: int,
        refresh_expires_at: int,
    ) -> tuple[str, int] | None:
        now = int(time.time())
        with self._connection() as connection:
            row = connection.execute(
                "SELECT created_at FROM sessions WHERE session_id = ? "
                "AND revoked_at IS NULL AND refresh_expires_at > ?",
                (session_id, now),
            ).fetchone()
            if row is None:
                return None
            connection.execute(
                """UPDATE sessions SET access_token_digest = ?, refresh_token_digest = ?,
                   last_seen_at = ?, expires_at = ?, refresh_expires_at = ?
                   WHERE session_id = ?""",
                (
                    _digest(access_token),
                    _digest(refresh_token),
                    now,
                    expires_at,
                    refresh_expires_at,
                    session_id,
                ),
            )
            return session_id, int(row[0])

    @staticmethod
    def _session(row: sqlite3.Row | None) -> dict[str, Any] | None:
        return dict(row) if row is not None else None

    def _session_query(
        self, column: str, token: str, *, expiry_column: str, touch: bool
    ) -> dict[str, Any] | None:
        if column not in {"access_token_digest", "refresh_token_digest"}:
            raise ValueError("invalid session token column")
        if expiry_column not in {"expires_at", "refresh_expires_at"}:
            raise ValueError("invalid session expiry column")
        now = int(time.time())
        with self._connection() as connection:
            row = connection.execute(
                f"SELECT s.*, u.username, u.display_name FROM sessions s "
                f"JOIN users u ON u.user_id = s.user_id "
                f"WHERE s.{column} = ? AND s.revoked_at IS NULL "
                f"AND s.{expiry_column} > ?",
                (_digest(token), now),
            ).fetchone()
            if row is None:
                return None
            if touch:
                connection.execute(
                    "UPDATE sessions SET last_seen_at = ? WHERE session_id = ?",
                    (now, row["session_id"]),
                )
                row = connection.execute(
                    "SELECT s.*, u.username, u.display_name FROM sessions s "
                    "JOIN users u ON u.user_id = s.user_id WHERE s.session_id = ?",
                    (row["session_id"],),
                ).fetchone()
            return self._session(row)

    def session_by_access_token(
        self, token: str, *, touch: bool = False
    ) -> dict[str, Any] | None:
        return self._session_query(
            "access_token_digest", token, expiry_column="expires_at", touch=touch
        )

    def session_by_refresh_token(
        self, token: str, *, touch: bool = False
    ) -> dict[str, Any] | None:
        return self._session_query(
            "refresh_token_digest",
            token,
            expiry_column="refresh_expires_at",
            touch=touch,
        )

    def list_sessions(self, user_id: str) -> list[dict[str, Any]]:
        now = int(time.time())
        with self._connection() as connection:
            rows = connection.execute(
                "SELECT * FROM sessions WHERE user_id = ? AND revoked_at IS NULL "
                "AND refresh_expires_at > ? ORDER BY created_at DESC",
                (user_id, now),
            ).fetchall()
            return [dict(row) for row in rows]

    def revoke_session(self, *, user_id: str, session_id: str) -> bool:
        with self._connection() as connection:
            cursor = connection.execute(
                "UPDATE sessions SET revoked_at = ? WHERE session_id = ? "
                "AND user_id = ? AND revoked_at IS NULL",
                (int(time.time()), session_id, user_id),
            )
            return cursor.rowcount == 1

    def issue_client_token(
        self, *, user_id: str, scopes: list[str], expires_at: int | None
    ) -> tuple[str, dict[str, Any]]:
        token = f"hct_{secrets.token_urlsafe(32)}"
        token_id = secrets.token_urlsafe(12)
        metadata = {
            "token_id": token_id,
            "user_id": user_id,
            "scopes": sorted(set(scopes)),
            "created_at": int(time.time()),
            "expires_at": expires_at,
        }
        with self._connection() as connection:
            connection.execute(
                """INSERT INTO client_tokens
                   (token_id, token_digest, user_id, scopes, created_at, expires_at)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (
                    token_id,
                    _digest(token),
                    user_id,
                    "\n".join(metadata["scopes"]),
                    metadata["created_at"],
                    expires_at,
                ),
            )
        return token, metadata

    def verify_client_token(self, token: str) -> dict[str, Any] | None:
        now = int(time.time())
        with self._connection() as connection:
            row = connection.execute(
                "SELECT * FROM client_tokens WHERE token_digest = ? "
                "AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?)",
                (_digest(token), now),
            ).fetchone()
            if row is None:
                return None
            result = dict(row)
            result["scopes"] = [
                scope for scope in str(result["scopes"]).split("\n") if scope
            ]
            return result

    def list_client_tokens(self, user_id: str) -> list[dict[str, Any]]:
        now = int(time.time())
        with self._connection() as connection:
            rows = connection.execute(
                "SELECT token_id, user_id, scopes, created_at, expires_at FROM client_tokens "
                "WHERE user_id = ? AND revoked_at IS NULL "
                "AND (expires_at IS NULL OR expires_at > ?) ORDER BY created_at DESC",
                (user_id, now),
            ).fetchall()
            result = []
            for row in rows:
                item = dict(row)
                item["scopes"] = [
                    scope for scope in str(item["scopes"]).split("\n") if scope
                ]
                result.append(item)
            return result

    def revoke_client_token(self, *, user_id: str, token_id: str) -> bool:
        with self._connection() as connection:
            cursor = connection.execute(
                "UPDATE client_tokens SET revoked_at = ? WHERE token_id = ? "
                "AND user_id = ? AND revoked_at IS NULL",
                (int(time.time()), token_id, user_id),
            )
            return cursor.rowcount == 1
