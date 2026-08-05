"""Persistent, owner-scoped Subpolar terminal metadata."""
from __future__ import annotations

import os
import secrets
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator, Mapping

from hermes_constants import get_hermes_home
from hermes_cli.subpolar_store import (
    SubpolarStore,
    SubpolarStoreError,
    validate_workspace_root,
)


MAX_TERMINAL_NAME = 200
MAX_TERMINAL_POSITION = 10_000
MAX_ATTACH_KEY_LENGTH = 128


class TerminalStoreError(SubpolarStoreError):
    """Base error for terminal metadata and references."""


class TerminalNotFound(TerminalStoreError):
    """Terminal is absent or belongs to another owner."""


class TerminalConflict(TerminalStoreError):
    """Terminal references an invalid owner-scoped resource."""


def _new_id() -> str:
    return uuid.uuid4().hex


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _decode(row: sqlite3.Row) -> dict[str, Any]:
    result = dict(row)
    result["closed"] = bool(result["closed"])
    return result


class SubpolarTerminalStore:
    """SQLite terminal metadata sharing the Subpolar database."""

    def __init__(
        self,
        db_path: str | os.PathLike[str] | None = None,
        *,
        subpolar: SubpolarStore | None = None,
    ) -> None:
        if db_path is None:
            home = get_hermes_home()
            home.mkdir(parents=True, exist_ok=True)
            db_path = home / "subpolar.db"
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.subpolar = subpolar or SubpolarStore(self.db_path)
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
            connection.execute(
                """CREATE TABLE IF NOT EXISTS terminals (
                    owner TEXT NOT NULL,
                    id TEXT NOT NULL,
                    workspace_id TEXT NOT NULL,
                    worktree_id TEXT,
                    name TEXT NOT NULL,
                    position INTEGER NOT NULL
                        CHECK (position BETWEEN 0 AND 10000),
                    attach_key TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    closed INTEGER NOT NULL DEFAULT 0 CHECK (closed IN (0, 1)),
                    PRIMARY KEY (owner, id),
                    UNIQUE (attach_key)
                )"""
            )
            connection.execute(
                "CREATE INDEX IF NOT EXISTS terminals_owner_position_idx "
                "ON terminals(owner, closed, position, id)"
            )

    @staticmethod
    def _name(value: str) -> str:
        if not isinstance(value, str):
            raise ValueError("name is required")
        value = value.strip()
        if not value:
            raise ValueError("name is required")
        if len(value) > MAX_TERMINAL_NAME:
            raise ValueError("name is too long")
        return value

    @staticmethod
    def _position(value: Any) -> int:
        if isinstance(value, bool) or not isinstance(value, int):
            raise ValueError("position must be an integer")
        if not 0 <= value <= MAX_TERMINAL_POSITION:
            raise ValueError("position is out of bounds")
        return value

    def list_terminals(self, owner: str) -> list[dict[str, Any]]:
        with self._connection() as connection:
            rows = connection.execute(
                "SELECT * FROM terminals WHERE owner = "
                "? ORDER BY position, id",
                (owner,),
            ).fetchall()
        return [_decode(row) for row in rows]

    def list(self, owner: str) -> list[dict[str, Any]]:
        return self.list_terminals(owner)

    def get_terminal(
        self, owner: str, terminal_id: str, *, active_only: bool = False
    ) -> dict[str, Any] | None:
        query = "SELECT * FROM terminals WHERE owner = ? AND id = ?"
        parameters: list[Any] = [owner, terminal_id]
        if active_only:
            query += " AND closed = 0"
        with self._connection() as connection:
            row = connection.execute(query, parameters).fetchone()
        return _decode(row) if row else None

    def get(self, owner: str, terminal_id: str) -> dict[str, Any] | None:
        return self.get_terminal(owner, terminal_id)

    def _references(
        self, owner: str, workspace_id: str, worktree_id: str | None
    ) -> tuple[dict[str, Any], dict[str, Any] | None]:
        workspace = self.subpolar.get_workspace(owner, workspace_id)
        if workspace is None or workspace.get("archived"):
            raise TerminalConflict("workspace not found or archived")
        worktree = None
        if worktree_id is not None:
            worktrees = self.subpolar.list_worktrees(
                owner=owner, workspace_id=workspace_id
            )
            worktree = next(
                (item for item in worktrees if item["id"] == worktree_id), None
            )
            if worktree is None:
                raise TerminalConflict("worktree not found for workspace")
        return workspace, worktree

    def _reposition_locked(
        self,
        connection: sqlite3.Connection,
        *,
        owner: str,
        terminal_id: str,
        position: int,
    ) -> None:
        rows = connection.execute(
            "SELECT id FROM terminals WHERE owner = ? AND closed = 0 "
            "ORDER BY position, id",
            (owner,),
        ).fetchall()
        ids = [str(row["id"]) for row in rows if row["id"] != terminal_id]
        ids.insert(min(position, len(ids)), terminal_id)
        for index, item_id in enumerate(ids):
            connection.execute(
                "UPDATE terminals SET position = ? WHERE owner = ? AND id = ?",
                (index, owner, item_id),
            )

    def create_terminal(
        self,
        *,
        owner: str,
        workspace_id: str,
        name: str,
        worktree_id: str | None = None,
        position: int | None = None,
    ) -> dict[str, Any]:
        name = self._name(name)
        if not isinstance(workspace_id, str) or not workspace_id.strip():
            raise ValueError("workspace_id is required")
        workspace_id = workspace_id.strip()
        if worktree_id is not None:
            if not isinstance(worktree_id, str) or not worktree_id.strip():
                raise ValueError("worktree_id must not be empty")
            worktree_id = worktree_id.strip()
        if position is not None:
            position = self._position(position)
        self._references(owner, workspace_id, worktree_id)

        terminal_id = _new_id()
        attach_key = secrets.token_urlsafe(32)
        if len(attach_key) > MAX_ATTACH_KEY_LENGTH:  # defensive if entropy changes
            raise ValueError("attach key is too long")
        with self._connection() as connection:
            connection.execute("BEGIN IMMEDIATE")
            try:
                active_count = connection.execute(
                    "SELECT COUNT(*) FROM terminals WHERE owner = ? AND closed = 0",
                    (owner,),
                ).fetchone()[0]
                insert_position = (
                    min(position, active_count)
                    if position is not None
                    else active_count
                )
                connection.execute(
                    "INSERT INTO terminals "
                    "(owner, id, workspace_id, worktree_id, name, position, "
                    "attach_key, created_at, closed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)",
                    (
                        owner,
                        terminal_id,
                        workspace_id,
                        worktree_id,
                        name,
                        insert_position,
                        attach_key,
                        _now(),
                    ),
                )
                self._reposition_locked(
                    connection,
                    owner=owner,
                    terminal_id=terminal_id,
                    position=insert_position,
                )
                connection.commit()
            except Exception:
                connection.rollback()
                raise
        result = self.get_terminal(owner, terminal_id)
        assert result is not None
        return result

    def create(self, *, owner: str, values: Mapping[str, Any]) -> dict[str, Any]:
        return self.create_terminal(owner=owner, **dict(values))

    def update_terminal(
        self,
        *,
        owner: str,
        terminal_id: str,
        changes: Mapping[str, Any],
    ) -> dict[str, Any]:
        unknown = set(changes) - {"name", "position"}
        if unknown:
            raise ValueError(f"unsupported terminal fields: {', '.join(sorted(unknown))}")
        name = self._name(changes["name"]) if "name" in changes else None
        position = self._position(changes["position"]) if "position" in changes else None
        with self._connection() as connection:
            connection.execute("BEGIN IMMEDIATE")
            try:
                row = connection.execute(
                    "SELECT id FROM terminals WHERE owner = ? AND id = ? AND closed = 0",
                    (owner, terminal_id),
                ).fetchone()
                if row is None:
                    raise TerminalNotFound("terminal not found")
                if name is not None:
                    connection.execute(
                        "UPDATE terminals SET name = ? WHERE owner = ? AND id = ?",
                        (name, owner, terminal_id),
                    )
                if position is not None:
                    self._reposition_locked(
                        connection,
                        owner=owner,
                        terminal_id=terminal_id,
                        position=position,
                    )
                connection.commit()
            except Exception:
                connection.rollback()
                raise
        result = self.get_terminal(owner, terminal_id)
        assert result is not None
        return result

    def update(
        self, *, owner: str, terminal_id: str, changes: Mapping[str, Any]
    ) -> dict[str, Any]:
        return self.update_terminal(owner=owner, terminal_id=terminal_id, changes=changes)

    def close_terminal(self, *, owner: str, terminal_id: str) -> None:
        with self._connection() as connection:
            cursor = connection.execute(
                "UPDATE terminals SET closed = 1 WHERE owner = ? AND id = ? AND closed = 0",
                (owner, terminal_id),
            )
            if cursor.rowcount != 1:
                connection.rollback()
                raise TerminalNotFound("terminal not found")
            connection.commit()

    def delete_terminal(self, *, owner: str, terminal_id: str) -> None:
        self.close_terminal(owner=owner, terminal_id=terminal_id)

    def delete(self, *, owner: str, terminal_id: str) -> None:
        self.delete_terminal(owner=owner, terminal_id=terminal_id)

    def resolve_root(self, *, owner: str, terminal_id: str) -> str:
        terminal = self.get_terminal(owner, terminal_id, active_only=True)
        if terminal is None:
            raise TerminalNotFound("terminal not found")
        workspace = self.subpolar.get_workspace(owner, terminal["workspace_id"])
        if workspace is None or workspace.get("archived"):
            raise TerminalConflict("workspace not found or archived")
        root = workspace["root"]
        if terminal.get("worktree_id"):
            worktree = next(
                (
                    item
                    for item in self.subpolar.list_worktrees(
                        owner=owner, workspace_id=terminal["workspace_id"]
                    )
                    if item["id"] == terminal["worktree_id"]
                ),
                None,
            )
            if worktree is None:
                raise TerminalConflict("worktree not found for workspace")
            root = worktree["root"]
        return validate_workspace_root(root)


SubpolarTerminalService = SubpolarTerminalStore
