"""Owner-scoped SQLite metadata store for Subpolar.

This module stores metadata only. It does not clone repositories, run git, or
store credentials.
"""
from __future__ import annotations

import json
import os
import sqlite3
import uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator, Mapping
from urllib.parse import urlsplit

from hermes_constants import get_hermes_home


class SubpolarStoreError(Exception):
    """Base exception for metadata and validation failures."""


class WorkspaceRootError(SubpolarStoreError, ValueError):
    """Workspace root is not safe for Subpolar use."""


class SubpolarNotFound(SubpolarStoreError):
    """Requested owner-scoped record does not exist."""


class SubpolarConflict(SubpolarStoreError):
    """Requested metadata violates an ownership or relationship constraint."""


_WORKSPACE_MODES = frozenset({"local", "clone", "ephemeral"})


def _new_id() -> str:
    return uuid.uuid4().hex


def _row_dict(row: sqlite3.Row) -> dict[str, Any]:
    result = dict(row)
    if "archived" in result:
        result["archived"] = bool(result["archived"])
    if "workspace_ids" in result:
        result["workspace_ids"] = json.loads(result["workspace_ids"])
    return result


def _has_symlink_component(path: str, *, start: str | None = None) -> bool:
    """Return whether any existing component of path is a symlink."""
    if start is not None:
        relative = os.path.relpath(path, start)
        if relative == ".":
            return False
        current = start
        parts = Path(relative).parts
    else:
        current = Path(path).anchor
        parts = Path(path).parts[1:]
    for component in parts:
        current = os.path.join(current, component)
        if os.path.islink(current):
            return True
    return False


def _configured_allowed_roots() -> list[str]:
    configured = os.environ.get("SUBPOLAR_ALLOWED_ROOTS", "").strip()
    if configured:
        values = configured.split(os.pathsep)
    else:
        values = [
            os.environ.get("HERMES_WRITE_SAFE_ROOT", "").strip(),
            str(get_hermes_home()),
        ]
    return [value for value in values if value]


def validate_workspace_root(root: str) -> str:
    """Canonicalize and validate a client-provided workspace root.

    Roots may be absent on disk yet, but every existing path component must be
    real and non-symlinked. ``commonpath`` is intentional: string prefixes
    would incorrectly allow siblings such as ``/safe-other``.
    """
    if not isinstance(root, str) or not root.strip():
        raise WorkspaceRootError("workspace root is required")

    expanded = os.path.expanduser(root.strip())
    if not os.path.isabs(expanded):
        raise WorkspaceRootError("workspace root must be absolute")
    if ".." in Path(expanded).parts:
        raise WorkspaceRootError("workspace root traversal is not allowed")
    raw = os.path.normpath(expanded)
    allowed = []
    for configured in _configured_allowed_roots():
        configured_raw = os.path.abspath(os.path.expanduser(configured))
        allowed.append((configured_raw, os.path.realpath(configured_raw)))
    if not allowed:
        raise WorkspaceRootError("no allowed workspace roots are configured")

    canonical = os.path.realpath(raw)

    try:
        inside_allowed = any(
            os.path.commonpath((canonical, allowed_root)) == allowed_root
            for _, allowed_root in allowed
        )
    except ValueError:
        inside_allowed = False
    if not inside_allowed:
        raise WorkspaceRootError("workspace root is outside allowed roots")

    # System paths such as macOS /var may themselves be symlinked. Treat the
    # configured allowed-root prefix as trusted, but reject symlinks below it.
    for allowed_raw, allowed_root in allowed:
        try:
            canonical_match = os.path.commonpath((canonical, allowed_root)) == allowed_root
            raw_match = os.path.commonpath((raw, allowed_raw)) == allowed_raw
        except ValueError:
            canonical_match = raw_match = False
        if canonical_match:
            has_symlink = (
                _has_symlink_component(raw, start=allowed_raw)
                if raw_match
                else _has_symlink_component(raw)
            )
            if has_symlink:
                raise WorkspaceRootError("workspace root cannot contain symlink components")

    if os.path.exists(canonical) and not os.path.isdir(canonical):
        raise WorkspaceRootError("workspace root must be a directory")
    return canonical


def validate_repo_url(repo_url: str | None) -> str | None:
    """Reject repository URLs that would persist embedded credentials."""
    if repo_url is None:
        return None
    try:
        parsed = urlsplit(repo_url)
    except ValueError as error:
        raise ValueError("repo_url is invalid") from error
    if parsed.username is not None or parsed.password is not None:
        raise ValueError("repo_url must not contain credentials")
    return repo_url


class SubpolarStore:
    """Small SQLite store with one connection and transaction per operation."""

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
            connection.execute("PRAGMA foreign_keys = ON")
            yield connection
        finally:
            connection.close()

    def _initialize(self) -> None:
        with self._connection() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS workspaces (
                    id TEXT PRIMARY KEY,
                    owner TEXT NOT NULL,
                    name TEXT NOT NULL,
                    mode TEXT NOT NULL CHECK (mode IN ('local', 'clone', 'ephemeral')),
                    root TEXT NOT NULL,
                    repo_url TEXT,
                    git_provider TEXT,
                    archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))
                );
                CREATE INDEX IF NOT EXISTS workspaces_owner_idx
                    ON workspaces(owner);

                CREATE TABLE IF NOT EXISTS project_groups (
                    id TEXT PRIMARY KEY,
                    owner TEXT NOT NULL,
                    name TEXT NOT NULL,
                    workspace_ids TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS project_groups_owner_idx
                    ON project_groups(owner);

                CREATE TABLE IF NOT EXISTS worktrees (
                    id TEXT PRIMARY KEY,
                    owner TEXT NOT NULL,
                    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                    root TEXT NOT NULL,
                    branch TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS worktrees_owner_workspace_idx
                    ON worktrees(owner, workspace_id);

                CREATE TABLE IF NOT EXISTS session_owners (
                    owner TEXT NOT NULL,
                    session_id TEXT NOT NULL,
                    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
                    PRIMARY KEY (owner, session_id)
                );
                CREATE INDEX IF NOT EXISTS session_owners_session_idx
                    ON session_owners(session_id);
                CREATE UNIQUE INDEX IF NOT EXISTS session_owners_unique_session_idx
                    ON session_owners(session_id);
                """
            )

    @staticmethod
    def _require_mode(mode: str) -> None:
        if mode not in _WORKSPACE_MODES:
            raise ValueError("mode must be one of: local, clone, ephemeral")

    def list_workspaces(self, owner: str) -> list[dict[str, Any]]:
        with self._connection() as connection:
            rows = connection.execute(
                "SELECT * FROM workspaces WHERE owner = ? ORDER BY name, id",
                (owner,),
            ).fetchall()
        return [_row_dict(row) for row in rows]

    def get_workspace(self, owner: str, workspace_id: str) -> dict[str, Any] | None:
        with self._connection() as connection:
            row = connection.execute(
                "SELECT * FROM workspaces WHERE id = ? AND owner = ?",
                (workspace_id, owner),
            ).fetchone()
        return _row_dict(row) if row else None

    def create_workspace(
        self,
        *,
        owner: str,
        name: str,
        mode: str,
        root: str,
        repo_url: str | None = None,
        git_provider: str | None = None,
        archived: bool = False,
    ) -> dict[str, Any]:
        self._require_mode(mode)
        canonical_root = validate_workspace_root(root)
        repo_url = validate_repo_url(repo_url)
        workspace_id = _new_id()
        with self._connection() as connection:
            connection.execute("BEGIN IMMEDIATE")
            try:
                existing = connection.execute(
                    "SELECT owner, root FROM workspaces WHERE archived = 0"
                ).fetchall()
                for row in existing:
                    existing_root = os.path.realpath(str(row["root"]))
                    if row["owner"] != owner:
                        try:
                            overlaps = os.path.commonpath((canonical_root, existing_root)) in {
                                canonical_root,
                                existing_root,
                            }
                        except ValueError:
                            overlaps = False
                        if overlaps:
                            raise SubpolarConflict(
                                "workspace root belongs to another owner"
                            )
                connection.execute(
                    """
                    INSERT INTO workspaces
                        (id, owner, name, mode, root, repo_url, git_provider, archived)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        workspace_id,
                        owner,
                        name,
                        mode,
                        canonical_root,
                        repo_url,
                        git_provider,
                        int(archived),
                    ),
                )
                connection.commit()
            except Exception:
                connection.rollback()
                raise
        result = self.get_workspace(owner, workspace_id)
        assert result is not None
        return result

    def update_workspace(
        self,
        *,
        owner: str,
        workspace_id: str,
        changes: Mapping[str, Any],
    ) -> dict[str, Any]:
        allowed = {"name", "mode", "root", "repo_url", "git_provider", "archived"}
        unknown = set(changes) - allowed
        if unknown:
            raise ValueError("unsupported workspace fields")
        values = dict(changes)
        if "mode" in values:
            self._require_mode(values["mode"])
        if "root" in values:
            values["root"] = validate_workspace_root(values["root"])
        if "repo_url" in values:
            values["repo_url"] = validate_repo_url(values["repo_url"])
        if not values:
            result = self.get_workspace(owner, workspace_id)
            if result is None:
                raise SubpolarNotFound("workspace not found")
            return result

        assignments = []
        parameters: list[Any] = []
        for field in ("name", "mode", "root", "repo_url", "git_provider", "archived"):
            if field in values:
                assignments.append(f"{field} = ?")
                parameters.append(int(values[field]) if field == "archived" else values[field])
        parameters.extend((workspace_id, owner))
        with self._connection() as connection:
            connection.execute("BEGIN IMMEDIATE")
            try:
                cursor = connection.execute(
                    f"UPDATE workspaces SET {', '.join(assignments)} "
                    "WHERE id = ? AND owner = ?",
                    parameters,
                )
                if cursor.rowcount != 1:
                    connection.rollback()
                    raise SubpolarNotFound("workspace not found")
                connection.commit()
            except Exception:
                connection.rollback()
                raise
        result = self.get_workspace(owner, workspace_id)
        assert result is not None
        return result

    def delete_workspace(self, *, owner: str, workspace_id: str) -> None:
        with self._connection() as connection:
            connection.execute("BEGIN IMMEDIATE")
            try:
                cursor = connection.execute(
                    "DELETE FROM workspaces WHERE id = ? AND owner = ?",
                    (workspace_id, owner),
                )
                if cursor.rowcount != 1:
                    connection.rollback()
                    raise SubpolarNotFound("workspace not found")
                rows = connection.execute(
                    "SELECT id, workspace_ids FROM project_groups WHERE owner = ?",
                    (owner,),
                ).fetchall()
                for row in rows:
                    workspace_ids = [
                        item for item in json.loads(row["workspace_ids"])
                        if item != workspace_id
                    ]
                    connection.execute(
                        "UPDATE project_groups SET workspace_ids = ? WHERE id = ? AND owner = ?",
                        (json.dumps(workspace_ids), row["id"], owner),
                    )
                connection.commit()
            except Exception:
                connection.rollback()
                raise

    def list_groups(self, owner: str) -> list[dict[str, Any]]:
        with self._connection() as connection:
            rows = connection.execute(
                "SELECT * FROM project_groups WHERE owner = ? ORDER BY name, id",
                (owner,),
            ).fetchall()
        return [_row_dict(row) for row in rows]

    def create_group(
        self, *, owner: str, name: str, workspace_ids: list[str]
    ) -> dict[str, Any]:
        if len(set(workspace_ids)) != len(workspace_ids):
            raise SubpolarConflict("group workspace IDs must be unique")
        group_id = _new_id()
        with self._connection() as connection:
            connection.execute("BEGIN IMMEDIATE")
            try:
                if workspace_ids:
                    placeholders = ",".join("?" for _ in workspace_ids)
                    rows = connection.execute(
                        f"SELECT id FROM workspaces WHERE owner = ? AND id IN ({placeholders})",
                        [owner, *workspace_ids],
                    ).fetchall()
                    if {row["id"] for row in rows} != set(workspace_ids):
                        raise SubpolarConflict(
                            "all group workspaces must belong to current owner"
                        )
                connection.execute(
                    "INSERT INTO project_groups (id, owner, name, workspace_ids) VALUES (?, ?, ?, ?)",
                    (group_id, owner, name, json.dumps(workspace_ids)),
                )
                connection.commit()
            except Exception:
                connection.rollback()
                raise
        with self._connection() as connection:
            row = connection.execute(
                "SELECT * FROM project_groups WHERE id = ? AND owner = ?",
                (group_id, owner),
            ).fetchone()
        assert row is not None
        return _row_dict(row)

    def list_worktrees(
        self, *, owner: str, workspace_id: str | None = None
    ) -> list[dict[str, Any]]:
        query = "SELECT * FROM worktrees WHERE owner = ?"
        parameters: list[Any] = [owner]
        if workspace_id is not None:
            query += " AND workspace_id = ?"
            parameters.append(workspace_id)
        query += " ORDER BY branch, id"
        with self._connection() as connection:
            rows = connection.execute(query, parameters).fetchall()
        return [_row_dict(row) for row in rows]

    def create_worktree(
        self,
        *,
        owner: str,
        workspace_id: str,
        root: str,
        branch: str,
    ) -> dict[str, Any]:
        canonical_root = validate_workspace_root(root)
        worktree_id = _new_id()
        with self._connection() as connection:
            connection.execute("BEGIN IMMEDIATE")
            try:
                workspace = connection.execute(
                    "SELECT id FROM workspaces WHERE id = ? AND owner = ?",
                    (workspace_id, owner),
                ).fetchone()
                if workspace is None:
                    raise SubpolarNotFound("workspace not found")
                workspace_row = connection.execute(
                    "SELECT root FROM workspaces WHERE id = ? AND owner = ?",
                    (workspace_id, owner),
                ).fetchone()
                if workspace_row is None:
                    raise SubpolarNotFound("workspace not found")
                workspace_root = os.path.realpath(str(workspace_row["root"]))
                if os.path.commonpath((workspace_root, canonical_root)) != workspace_root:
                    raise WorkspaceRootError("worktree root must be inside workspace root")
                connection.execute(
                    "INSERT INTO worktrees (id, owner, workspace_id, root, branch) "
                    "VALUES (?, ?, ?, ?, ?)",
                    (worktree_id, owner, workspace_id, canonical_root, branch),
                )
                connection.commit()
            except Exception:
                connection.rollback()
                raise
        with self._connection() as connection:
            row = connection.execute(
                "SELECT * FROM worktrees WHERE id = ? AND owner = ?",
                (worktree_id, owner),
            ).fetchone()
        assert row is not None
        return _row_dict(row)

    def delete_worktree(self, *, owner: str, worktree_id: str) -> None:
        with self._connection() as connection:
            connection.execute("BEGIN IMMEDIATE")
            try:
                cursor = connection.execute(
                    "DELETE FROM worktrees WHERE id = ? AND owner = ?",
                    (worktree_id, owner),
                )
                if cursor.rowcount != 1:
                    connection.rollback()
                    raise SubpolarNotFound("worktree not found")
                connection.commit()
            except Exception:
                connection.rollback()
                raise

    def claim_session_owner(self, *, owner: str, session_id: str) -> None:
        """Associate durable conversation identity with authenticated owner."""
        if not owner or not session_id:
            raise ValueError("owner and session_id are required")
        with self._connection() as connection:
            existing = connection.execute(
                "SELECT owner FROM session_owners WHERE session_id = ?", (session_id,)
            ).fetchone()
            if existing is not None and existing["owner"] != owner:
                raise SubpolarConflict("conversation already belongs to another owner")
            connection.execute(
                "INSERT OR IGNORE INTO session_owners (owner, session_id) VALUES (?, ?)",
                (owner, session_id),
            )
            connection.commit()

    def session_owner(self, *, owner: str, session_id: str) -> bool:
        with self._connection() as connection:
            return connection.execute(
                "SELECT 1 FROM session_owners WHERE owner = ? AND session_id = ?",
                (owner, session_id),
            ).fetchone() is not None

    def session_ids(self, *, owner: str) -> set[str]:
        with self._connection() as connection:
            rows = connection.execute(
                "SELECT session_id FROM session_owners WHERE owner = ?", (owner,)
            ).fetchall()
        return {str(row["session_id"]) for row in rows}
