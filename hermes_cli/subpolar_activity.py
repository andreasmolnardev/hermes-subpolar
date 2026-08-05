"""Owner-scoped Subpolar activity and security-audit storage.

Activity is an append-oriented event log.  Audit records use a separate table
and API so security history cannot be confused with user-facing activity.
"""
from __future__ import annotations

import base64
import binascii
import json
import os
import sqlite3
import uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator, Mapping

from hermes_constants import get_hermes_home


EVENT_KINDS = frozenset(
    {
        "thinking",
        "planning",
        "tool",
        "search",
        "browser",
        "subagent",
        "git",
        "file",
        "approval",
        "error",
        "completion",
    }
)
REDACTED_VALUE = "[redacted]"
MAX_DETAILS_BYTES = 32 * 1024
MAX_RESULT_BYTES = 8 * 1024
MAX_PAGE_SIZE = 100


class ActivityStoreError(Exception):
    """Base error for activity and audit persistence."""


class ActivityNotFound(ActivityStoreError):
    """Record is absent or belongs to another owner."""


class ActivityConflict(ActivityStoreError):
    """Record violates an owner-scoped uniqueness constraint."""


def _new_id() -> str:
    return uuid.uuid4().hex


def _required_text(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field} is required")
    return value.strip()


def _optional_text(value: Any, field: str) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError(f"{field} must be a string")
    value = value.strip()
    return value or None


def _is_sensitive_key(key: Any) -> bool:
    normalized = str(key).lower().replace("-", "_")
    return any(
        marker in normalized
        for marker in ("token", "password", "secret", "authorization", "api_key", "apikey")
    )


def redact_details(value: Any) -> Any:
    """Deep-copy JSON data, replacing values under secret-looking keys."""
    if isinstance(value, Mapping):
        return {
            str(key): REDACTED_VALUE if _is_sensitive_key(key) else redact_details(item)
            for key, item in value.items()
        }
    if isinstance(value, (list, tuple)):
        return [redact_details(item) for item in value]
    return value


def _json_payload(value: Any, *, field: str, limit: int) -> str:
    if value is None:
        value = {}
    cleaned = redact_details(value)
    try:
        encoded = json.dumps(cleaned, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    except (TypeError, ValueError) as error:
        raise ValueError(f"{field} must contain JSON values") from error
    if len(encoded.encode("utf-8")) > limit:
        raise ValueError(f"{field} exceeds {limit} bytes")
    return encoded


def _bounded_result(value: Any) -> str:
    if value is None:
        value = ""
    if not isinstance(value, str):
        raise ValueError("result must be a string")
    if len(value.encode("utf-8")) > MAX_RESULT_BYTES:
        raise ValueError(f"result exceeds {MAX_RESULT_BYTES} bytes")
    return value


def _decode_json(row: sqlite3.Row) -> dict[str, Any]:
    result = dict(row)
    for field in ("details", "redacted_details"):
        if field in result:
            result[field] = json.loads(result[field]) if result[field] else {}
    return result


def _validate_limit(limit: int) -> int:
    if not isinstance(limit, int) or not 1 <= limit <= MAX_PAGE_SIZE:
        raise ValueError(f"limit must be between 1 and {MAX_PAGE_SIZE}")
    return limit


def _encode_cursor(timestamp: str, record_id: str) -> str:
    payload = json.dumps([timestamp, record_id], separators=(",", ":")).encode("utf-8")
    return base64.urlsafe_b64encode(payload).decode("ascii").rstrip("=")


def _decode_cursor(cursor: str | None) -> tuple[str, str] | None:
    if not cursor:
        return None
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        timestamp, record_id = json.loads(base64.urlsafe_b64decode(padded).decode("utf-8"))
    except (ValueError, TypeError, binascii.Error, json.JSONDecodeError, UnicodeDecodeError):
        raise ValueError("cursor is invalid") from None
    if not isinstance(timestamp, str) or not isinstance(record_id, str):
        raise ValueError("cursor is invalid")
    return timestamp, record_id


class _SQLiteStore:
    def __init__(self, db_path: str | os.PathLike[str] | None = None) -> None:
        if db_path is None:
            home = get_hermes_home()
            home.mkdir(parents=True, exist_ok=True)
            db_path = home / "subpolar.db"
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    @contextmanager
    def _connection(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(str(self.db_path), timeout=10.0)
        connection.row_factory = sqlite3.Row
        try:
            connection.execute("PRAGMA busy_timeout = 10000")
            connection.execute("PRAGMA journal_mode = WAL")
            yield connection
        finally:
            connection.close()

    def _initialize(self) -> None:
        with self._connection() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS activity (
                    owner TEXT NOT NULL,
                    id TEXT NOT NULL,
                    workspace_id TEXT,
                    session_id TEXT,
                    task_id TEXT,
                    kind TEXT NOT NULL,
                    label TEXT NOT NULL,
                    status TEXT,
                    started_at TEXT NOT NULL,
                    ended_at TEXT,
                    duration_ms INTEGER,
                    details JSON NOT NULL,
                    artifact_id TEXT,
                    PRIMARY KEY (owner, id),
                    CHECK (duration_ms IS NULL OR duration_ms >= 0)
                );
                CREATE INDEX IF NOT EXISTS activity_owner_time_idx
                    ON activity(owner, started_at, id);
                CREATE INDEX IF NOT EXISTS activity_owner_workspace_time_idx
                    ON activity(owner, workspace_id, started_at, id);

                CREATE TABLE IF NOT EXISTS audit (
                    owner TEXT NOT NULL,
                    id TEXT NOT NULL,
                    actor TEXT NOT NULL,
                    action TEXT NOT NULL,
                    resource TEXT NOT NULL,
                    workspace_id TEXT,
                    result TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    redacted_details JSON NOT NULL,
                    PRIMARY KEY (owner, id)
                );
                CREATE INDEX IF NOT EXISTS audit_owner_time_idx
                    ON audit(owner, timestamp, id);
                CREATE INDEX IF NOT EXISTS audit_owner_workspace_time_idx
                    ON audit(owner, workspace_id, timestamp, id);
                """
            )


class ActivityStore(_SQLiteStore):
    """SQLite store for owner-scoped activity events."""

    def append_activity(self, *, owner: str, values: Mapping[str, Any]) -> dict[str, Any]:
        owner = _required_text(owner, "owner")
        kind = _required_text(values.get("kind"), "kind")
        if kind not in EVENT_KINDS:
            raise ValueError(f"kind must be one of: {', '.join(sorted(EVENT_KINDS))}")
        label = _required_text(values.get("label"), "label")
        started_at = _required_text(values.get("started_at"), "started_at") if values.get("started_at") else _now()
        duration_ms = values.get("duration_ms")
        if duration_ms is not None and (not isinstance(duration_ms, int) or duration_ms < 0):
            raise ValueError("duration_ms must be a non-negative integer")
        record_id = str(values.get("id") or _new_id())
        row = (
            owner,
            record_id,
            _optional_text(values.get("workspace_id"), "workspace_id"),
            _optional_text(values.get("session_id"), "session_id"),
            _optional_text(values.get("task_id"), "task_id"),
            kind,
            label,
            _optional_text(values.get("status"), "status"),
            started_at,
            _optional_text(values.get("ended_at"), "ended_at"),
            duration_ms,
            _json_payload(values.get("details", {}), field="details", limit=MAX_DETAILS_BYTES),
            _optional_text(values.get("artifact_id"), "artifact_id"),
        )
        with self._connection() as connection:
            try:
                connection.execute("BEGIN IMMEDIATE")
                connection.execute(
                    """INSERT INTO activity
                    (owner, id, workspace_id, session_id, task_id, kind, label, status,
                     started_at, ended_at, duration_ms, details, artifact_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    row,
                )
                connection.commit()
            except sqlite3.IntegrityError as error:
                connection.rollback()
                raise ActivityConflict("activity already exists") from error
        result = self.get_activity(owner=owner, activity_id=record_id)
        assert result is not None
        return result

    append = append_activity
    create_activity = append_activity
    create = append_activity

    def get_activity(self, owner: str, activity_id: str) -> dict[str, Any] | None:
        with self._connection() as connection:
            row = connection.execute(
                "SELECT * FROM activity WHERE owner = ? AND id = ?", (owner, activity_id)
            ).fetchone()
        return _decode_json(row) if row else None

    get = get_activity
    record_activity = append_activity

    def list_activity(
        self,
        owner: str,
        *,
        workspace_id: str | None = None,
        cursor: str | None = None,
        limit: int = 50,
    ) -> dict[str, Any]:
        owner = _required_text(owner, "owner")
        limit = _validate_limit(limit)
        marker = _decode_cursor(cursor)
        query = "SELECT * FROM activity WHERE owner = ?"
        parameters: list[Any] = [owner]
        if workspace_id is not None:
            query += " AND workspace_id = ?"
            parameters.append(workspace_id)
        if marker:
            query += " AND (started_at > ? OR (started_at = ? AND id > ?))"
            parameters.extend((marker[0], marker[0], marker[1]))
        query += " ORDER BY started_at ASC, id ASC LIMIT ?"
        parameters.append(limit + 1)
        with self._connection() as connection:
            rows = connection.execute(query, parameters).fetchall()
        has_more = len(rows) > limit
        rows = rows[:limit]
        items = [_decode_json(row) for row in rows]
        next_cursor = _encode_cursor(rows[-1]["started_at"], rows[-1]["id"]) if has_more else None
        return {"items": items, "next_cursor": next_cursor}

    list_page = list_activity
    list_activities = list_activity
    list = list_activity

    def update_activity(
        self, *, owner: str, activity_id: str, changes: Mapping[str, Any]
    ) -> dict[str, Any]:
        allowed = {
            "workspace_id", "session_id", "task_id", "kind", "label", "status",
            "started_at", "ended_at", "duration_ms", "details", "artifact_id",
        }
        unknown = set(changes) - allowed
        if unknown:
            raise ValueError(f"unsupported activity fields: {', '.join(sorted(unknown))}")
        if "kind" in changes and changes["kind"] not in EVENT_KINDS:
            raise ValueError("kind is invalid")
        if "duration_ms" in changes and (
            changes["duration_ms"] is not None
            and (not isinstance(changes["duration_ms"], int) or changes["duration_ms"] < 0)
        ):
            raise ValueError("duration_ms must be a non-negative integer")
        assignments: list[str] = []
        parameters: list[Any] = []
        for field in allowed:
            if field not in changes:
                continue
            value = changes[field]
            if field in {"workspace_id", "session_id", "task_id", "status", "ended_at", "artifact_id"}:
                value = _optional_text(value, field)
            elif field in {"kind", "label", "started_at"}:
                value = _required_text(value, field)
            elif field == "details":
                value = _json_payload(value, field="details", limit=MAX_DETAILS_BYTES)
            assignments.append(f"{field} = ?")
            parameters.append(value)
        if not assignments:
            result = self.get_activity(owner=owner, activity_id=activity_id)
            if result is None:
                raise ActivityNotFound("activity not found")
            return result
        parameters.extend((owner, activity_id))
        with self._connection() as connection:
            connection.execute("BEGIN IMMEDIATE")
            updated = connection.execute(
                f"UPDATE activity SET {', '.join(assignments)} WHERE owner = ? AND id = ?",
                parameters,
            ).rowcount
            if updated != 1:
                connection.rollback()
                raise ActivityNotFound("activity not found")
            connection.commit()
        result = self.get_activity(owner=owner, activity_id=activity_id)
        assert result is not None
        return result

    update = update_activity

    def delete_activity(self, *, owner: str, activity_id: str) -> None:
        with self._connection() as connection:
            connection.execute("BEGIN IMMEDIATE")
            deleted = connection.execute(
                "DELETE FROM activity WHERE owner = ? AND id = ?", (owner, activity_id)
            ).rowcount
            if deleted != 1:
                connection.rollback()
                raise ActivityNotFound("activity not found")
            connection.commit()

    delete = delete_activity


class AuditStore(_SQLiteStore):
    """SQLite store for immutable, redacted security audit records."""

    def append_audit(self, *, owner: str, values: Mapping[str, Any]) -> dict[str, Any]:
        owner = _required_text(owner, "owner")
        record_id = str(values.get("id") or _new_id())
        row = (
            owner,
            record_id,
            _required_text(values.get("actor"), "actor"),
            _required_text(values.get("action"), "action"),
            _required_text(values.get("resource"), "resource"),
            _optional_text(values.get("workspace_id"), "workspace_id"),
            _bounded_result(values.get("result")),
            _required_text(values.get("timestamp"), "timestamp") if values.get("timestamp") else _now(),
            _json_payload(
                values.get("redacted_details", values.get("details", {})),
                field="redacted_details",
                limit=MAX_DETAILS_BYTES,
            ),
        )
        with self._connection() as connection:
            try:
                connection.execute("BEGIN IMMEDIATE")
                connection.execute(
                    """INSERT INTO audit
                    (owner, id, actor, action, resource, workspace_id, result, timestamp,
                     redacted_details)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    row,
                )
                connection.commit()
            except sqlite3.IntegrityError as error:
                connection.rollback()
                raise ActivityConflict("audit record already exists") from error
        result = self.get_audit(owner=owner, audit_id=record_id)
        assert result is not None
        return result

    append = append_audit
    create_audit = append_audit
    create = append_audit

    def get_audit(self, owner: str, audit_id: str) -> dict[str, Any] | None:
        with self._connection() as connection:
            row = connection.execute(
                "SELECT * FROM audit WHERE owner = ? AND id = ?", (owner, audit_id)
            ).fetchone()
        return _decode_json(row) if row else None

    get = get_audit
    record_audit = append_audit

    def list_audit(
        self,
        owner: str,
        *,
        workspace_id: str | None = None,
        cursor: str | None = None,
        limit: int = 50,
    ) -> dict[str, Any]:
        owner = _required_text(owner, "owner")
        limit = _validate_limit(limit)
        marker = _decode_cursor(cursor)
        query = "SELECT * FROM audit WHERE owner = ?"
        parameters: list[Any] = [owner]
        if workspace_id is not None:
            query += " AND workspace_id = ?"
            parameters.append(workspace_id)
        if marker:
            query += " AND (timestamp > ? OR (timestamp = ? AND id > ?))"
            parameters.extend((marker[0], marker[0], marker[1]))
        query += " ORDER BY timestamp ASC, id ASC LIMIT ?"
        parameters.append(limit + 1)
        with self._connection() as connection:
            rows = connection.execute(query, parameters).fetchall()
        has_more = len(rows) > limit
        rows = rows[:limit]
        items = [_decode_json(row) for row in rows]
        next_cursor = _encode_cursor(rows[-1]["timestamp"], rows[-1]["id"]) if has_more else None
        return {"items": items, "next_cursor": next_cursor}

    list_page = list_audit
    list_audits = list_audit
    list = list_audit


def _now() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()


SubpolarActivityStore = ActivityStore
SubpolarAuditStore = AuditStore


__all__ = [
    "ActivityConflict",
    "ActivityNotFound",
    "ActivityStore",
    "ActivityStoreError",
    "AuditStore",
    "EVENT_KINDS",
    "MAX_DETAILS_BYTES",
    "MAX_PAGE_SIZE",
    "MAX_RESULT_BYTES",
    "REDACTED_VALUE",
    "SubpolarActivityStore",
    "SubpolarAuditStore",
    "redact_details",
]
