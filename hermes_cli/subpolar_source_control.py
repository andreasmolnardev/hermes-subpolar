"""Owner- and workspace-scoped source-control operations for Subpolar."""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import PurePath
from typing import Any, Mapping

from hermes_cli import web_git
from hermes_cli.subpolar_store import (
    SubpolarConflict,
    SubpolarNotFound,
    SubpolarStore,
    SubpolarStoreError,
    WorkspaceRootError,
)


class SourceControlError(SubpolarStoreError):
    """Base exception for workspace source-control failures."""


class SubpolarSourceControlService:
    """Run git only against roots resolved from owner-scoped workspaces."""

    def __init__(self, store: SubpolarStore | None = None) -> None:
        self.store = store or SubpolarStore()
        self._initialize_baselines()

    def _initialize_baselines(self) -> None:
        with self.store._connection() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS task_baselines (
                    owner TEXT NOT NULL,
                    workspace_id TEXT NOT NULL,
                    task_id TEXT NOT NULL,
                    files_json TEXT NOT NULL,
                    diffs_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    PRIMARY KEY (owner, workspace_id, task_id)
                );
                CREATE INDEX IF NOT EXISTS task_baselines_owner_idx
                    ON task_baselines(owner, workspace_id);
                """
            )

    @staticmethod
    def _under(root: str, candidate: str) -> bool:
        try:
            return os.path.commonpath((root, candidate)) == root
        except ValueError:
            return False

    def _workspace_root(
        self, owner: str, workspace_id: str
    ) -> tuple[dict[str, Any], str]:
        workspace = self.store.get_workspace(owner, workspace_id)
        if workspace is None:
            raise SubpolarNotFound("workspace not found")

        stored_root = os.path.abspath(os.path.normpath(str(workspace["root"])))
        current_root = os.path.realpath(stored_root)
        if not self._under(stored_root, current_root):
            raise WorkspaceRootError("workspace root moved outside its stored root")
        return workspace, current_root

    @staticmethod
    def _integration_id(
        workspace: Mapping[str, Any], integration_id: str | None
    ) -> str | None:
        if integration_id is not None:
            integration_id = str(integration_id).strip()
            if not integration_id:
                raise ValueError("integration_id must not be empty")
        # Provider credentials never enter this service. Git uses the configured
        # local credential helper; this value is only an opaque integration ref.
        return integration_id or workspace.get("git_provider")

    def _operation_root(
        self, owner: str, workspace_id: str, integration_id: str | None
    ) -> str:
        workspace, root = self._workspace_root(owner, workspace_id)
        selected = self._integration_id(workspace, integration_id)
        if selected:
            from hermes_cli.subpolar_integrations import SubpolarIntegrationStore

            integration = SubpolarIntegrationStore(self.store.db_path).get_integration(
                owner, selected
            )
            if integration is None or integration.get("kind") != "git":
                raise SourceControlError("Git integration is not owned by current user")
            if not integration.get("enabled", True):
                raise SourceControlError("Git integration is disabled")
        return root

    @staticmethod
    def _file_path(file_path: str | None) -> str | None:
        if file_path is None:
            return None
        if not isinstance(file_path, str) or not file_path or "\x00" in file_path:
            raise ValueError("file must be a non-empty relative path")
        path = PurePath(file_path)
        if path.is_absolute() or ".." in path.parts or file_path.startswith(":"):
            raise ValueError("file must be a relative workspace path")
        return file_path

    @staticmethod
    def _git_ref(ref: str | None) -> str | None:
        if ref is None:
            return None
        if not isinstance(ref, str) or not ref or "\x00" in ref or ref.startswith("-"):
            raise ValueError("git ref is invalid")
        return ref

    def status(
        self, owner: str, workspace_id: str, integration_id: str | None = None
    ) -> dict | None:
        root = self._operation_root(owner, workspace_id, integration_id)
        return web_git.repo_status(root)

    def branches(
        self, owner: str, workspace_id: str, integration_id: str | None = None
    ) -> list[dict]:
        root = self._operation_root(owner, workspace_id, integration_id)
        return web_git.branch_list(root)

    def changed_files(
        self,
        owner: str,
        workspace_id: str,
        *,
        scope: str = "uncommitted",
        base_ref: str | None = None,
        integration_id: str | None = None,
    ) -> dict:
        base_ref = self._git_ref(base_ref)
        if scope not in {"uncommitted", "branch", "lastTurn"}:
            raise ValueError("scope must be uncommitted, branch, or lastTurn")
        root = self._operation_root(owner, workspace_id, integration_id)
        return web_git.review_list(root, scope, base_ref)

    def diff(
        self,
        owner: str,
        workspace_id: str,
        file_path: str,
        *,
        scope: str = "uncommitted",
        base_ref: str | None = None,
        staged: bool = False,
        integration_id: str | None = None,
    ) -> str:
        file_path = self._file_path(file_path)
        assert file_path is not None
        base_ref = self._git_ref(base_ref)
        if scope not in {"uncommitted", "branch", "lastTurn"}:
            raise ValueError("scope must be uncommitted, branch, or lastTurn")
        root = self._operation_root(owner, workspace_id, integration_id)
        return web_git.review_diff(root, file_path, scope, base_ref, staged)

    def stage(
        self,
        owner: str,
        workspace_id: str,
        file_path: str | None = None,
        integration_id: str | None = None,
    ) -> dict:
        file_path = self._file_path(file_path)
        root = self._operation_root(owner, workspace_id, integration_id)
        return web_git.review_stage(root, file_path)

    def unstage(
        self,
        owner: str,
        workspace_id: str,
        file_path: str | None = None,
        integration_id: str | None = None,
    ) -> dict:
        file_path = self._file_path(file_path)
        root = self._operation_root(owner, workspace_id, integration_id)
        return web_git.review_unstage(root, file_path)

    def discard(
        self,
        owner: str,
        workspace_id: str,
        file_path: str | None = None,
        integration_id: str | None = None,
    ) -> dict:
        file_path = self._file_path(file_path)
        root = self._operation_root(owner, workspace_id, integration_id)
        return web_git.review_revert(root, file_path)

    def commit(
        self,
        owner: str,
        workspace_id: str,
        message: str,
        *,
        push: bool = False,
        integration_id: str | None = None,
    ) -> dict:
        message = str(message).strip()
        if not message:
            raise ValueError("commit message is required")
        root = self._operation_root(owner, workspace_id, integration_id)
        return web_git.review_commit(root, message, push)

    def push(
        self, owner: str, workspace_id: str, integration_id: str | None = None
    ) -> dict:
        root = self._operation_root(owner, workspace_id, integration_id)
        return web_git.review_push(root)

    def worktree_list(
        self, owner: str, workspace_id: str, integration_id: str | None = None
    ) -> list[dict]:
        root = self._operation_root(owner, workspace_id, integration_id)
        trees = []
        for tree in web_git.worktree_list(root):
            path = tree.get("path")
            if not isinstance(path, str):
                continue
            real_path = os.path.realpath(path)
            if self._under(root, real_path):
                trees.append({**tree, "path": real_path})
        return trees

    def worktree_add(
        self,
        owner: str,
        workspace_id: str,
        *,
        name: str | None = None,
        branch: str | None = None,
        base: str | None = None,
        existing_branch: str | None = None,
        integration_id: str | None = None,
    ) -> dict:
        base = self._git_ref(base)
        root = self._operation_root(owner, workspace_id, integration_id)
        options = {
            key: value
            for key, value in {
                "name": name,
                "branch": branch,
                "base": base,
                "existingBranch": existing_branch,
            }.items()
            if value
        }
        result = web_git.worktree_add(root, options)
        path = result.get("path") if isinstance(result, dict) else None
        if path is not None:
            if not isinstance(path, str) or not self._under(root, os.path.realpath(path)):
                raise WorkspaceRootError("git worktree is outside workspace root")
            result = {**result, "path": os.path.realpath(path)}
        return result

    def worktree_remove(
        self,
        owner: str,
        workspace_id: str,
        branch: str,
        *,
        force: bool = False,
        integration_id: str | None = None,
    ) -> dict:
        branch = str(branch).strip()
        if not branch:
            raise ValueError("worktree branch is required")

        # Resolve target from git's current server-side worktree list. The
        # client supplies only a branch selector, never a filesystem path.
        trees = self.worktree_list(owner, workspace_id, integration_id)
        target = next((tree for tree in trees if tree.get("branch") == branch), None)
        if target is None:
            raise SubpolarNotFound("worktree not found")
        if target.get("isMain"):
            raise SubpolarConflict("main worktree cannot be removed")

        root = self._operation_root(owner, workspace_id, integration_id)
        path = target.get("path")
        if not isinstance(path, str) or not self._under(root, os.path.realpath(path)):
            raise WorkspaceRootError("worktree is outside workspace root")
        return web_git.worktree_remove(root, os.path.realpath(path), force)

    @staticmethod
    def _json_text(value: Any) -> str:
        try:
            return json.dumps(value, ensure_ascii=True, sort_keys=True, separators=(",", ":"))
        except (TypeError, ValueError) as error:
            raise ValueError("baseline artifacts must be JSON serializable") from error

    def capture_baseline(
        self,
        owner: str,
        workspace_id: str,
        task_id: str,
        files: Any = None,
        diffs: Mapping[str, str] | None = None,
        *,
        integration_id: str | None = None,
    ) -> dict[str, Any]:
        task_id = str(task_id).strip()
        if not task_id:
            raise ValueError("task_id is required")

        if files is None:
            listing = self.changed_files(
                owner,
                workspace_id,
                integration_id=integration_id,
            )
            files = listing.get("files", []) if isinstance(listing, dict) else listing
        if diffs is None:
            diffs = {}
            file_rows = files if isinstance(files, list) else []
            for row in file_rows:
                file_path = row if isinstance(row, str) else row.get("path")
                if not isinstance(file_path, str):
                    continue
                diffs[file_path] = self.diff(
                    owner,
                    workspace_id,
                    file_path,
                    integration_id=integration_id,
                )

        files_json = self._json_text(files)
        diffs_json = self._json_text(dict(diffs))
        # Root validation also protects explicit caller-provided artifacts from
        # being associated with an owner/workspace that no longer exists.
        self._operation_root(owner, workspace_id, integration_id)
        created_at = datetime.now(timezone.utc).isoformat()
        with self.store._connection() as connection:
            connection.execute(
                """
                INSERT OR IGNORE INTO task_baselines
                    (owner, workspace_id, task_id, files_json, diffs_json, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (owner, workspace_id, task_id, files_json, diffs_json, created_at),
            )
            connection.commit()
        artifact = self.get_review_artifact(owner, workspace_id, task_id)
        assert artifact is not None
        return artifact

    def get_review_artifact(
        self, owner: str, workspace_id: str, task_id: str
    ) -> dict[str, Any] | None:
        with self.store._connection() as connection:
            row = connection.execute(
                """
                SELECT owner, workspace_id, task_id, files_json, diffs_json, created_at
                FROM task_baselines
                WHERE owner = ? AND workspace_id = ? AND task_id = ?
                """,
                (owner, workspace_id, task_id),
            ).fetchone()
        if row is None:
            return None
        return {
            "owner": row["owner"],
            "workspace_id": row["workspace_id"],
            "task_id": row["task_id"],
            "files": json.loads(row["files_json"]),
            "diffs": json.loads(row["diffs_json"]),
            "created_at": row["created_at"],
        }

    def get_stable_review_artifact(
        self, owner: str, workspace_id: str, task_id: str
    ) -> dict[str, Any] | None:
        """Return task baseline, never a live post-edit recomputation."""
        return self.get_review_artifact(owner, workspace_id, task_id)


__all__ = [
    "SourceControlError",
    "SubpolarSourceControlService",
]
