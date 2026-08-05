"""Owner-scoped Subpolar scheduled-task metadata and cron adapter.

This module owns Subpolar task metadata.  The existing cron store remains the
execution store; this adapter links the two records without changing legacy
cron behavior.
"""
from __future__ import annotations

import json
import os
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator, Mapping
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from hermes_constants import get_hermes_home, reset_hermes_home_override, set_hermes_home_override

from hermes_cli.subpolar_agents import AgentStore, AgentStoreError, validate_tool_id
from hermes_cli.subpolar_store import SubpolarStore, SubpolarStoreError


class ScheduleStoreError(SubpolarStoreError):
    """Base error for scheduled-task metadata and adapter failures."""


class ScheduleNotFound(ScheduleStoreError):
    """Task is absent or belongs to another owner."""


class ScheduleConflict(ScheduleStoreError):
    """Task references an invalid owner-scoped resource."""


class ScheduledPermissionError(ScheduleStoreError):
    """Scheduled execution would require an interactive approval."""


_TASK_FIELDS = (
    "name",
    "prompt",
    "schedule",
    "workspace_id",
    "worktree_id",
    "agent_id",
    "model",
    "permission_mode",
    "timezone",
    "enabled",
    "draft_json",
)
_UPDATE_FIELDS = set(_TASK_FIELDS) - {"permission_mode"}
_UPDATE_FIELDS.update({"cron_job_id", "last_error"})


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id() -> str:
    return uuid.uuid4().hex


def _json(value: Any) -> str:
    return json.dumps(value, separators=(",", ":"), sort_keys=True)


def _decode(row: sqlite3.Row) -> dict[str, Any]:
    result = dict(row)
    result["enabled"] = bool(result["enabled"])
    if result.get("draft_json"):
        result["draft_json"] = json.loads(result["draft_json"])
    else:
        result["draft_json"] = None
    return result


def _validate_timezone(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    if not value:
        return None
    try:
        ZoneInfo(value)
    except (ZoneInfoNotFoundError, ValueError) as error:
        raise ValueError("timezone must be a valid IANA timezone") from error
    return value


class SubpolarScheduleStore:
    """SQLite task metadata store sharing the Subpolar database."""

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
            connection.execute(
                """CREATE TABLE IF NOT EXISTS tasks (
                    owner TEXT NOT NULL,
                    id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    prompt TEXT NOT NULL,
                    schedule TEXT NOT NULL,
                    workspace_id TEXT NOT NULL,
                    worktree_id TEXT,
                    agent_id TEXT NOT NULL,
                    model TEXT,
                    permission_mode TEXT NOT NULL DEFAULT 'scheduled'
                        CHECK (permission_mode = 'scheduled'),
                    timezone TEXT,
                    enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
                    cron_job_id TEXT,
                    last_error TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    draft_json TEXT,
                    PRIMARY KEY (owner, id)
                )"""
            )
            connection.execute(
                "CREATE INDEX IF NOT EXISTS tasks_owner_updated_idx "
                "ON tasks(owner, updated_at DESC, id)"
            )

    def list_tasks(self, owner: str) -> list[dict[str, Any]]:
        with self._connection() as connection:
            rows = connection.execute(
                "SELECT * FROM tasks WHERE owner = ? ORDER BY updated_at DESC, id",
                (owner,),
            ).fetchall()
        return [_decode(row) for row in rows]

    def list(self, owner: str) -> list[dict[str, Any]]:
        return self.list_tasks(owner)

    def get_task(self, owner: str, task_id: str) -> dict[str, Any] | None:
        with self._connection() as connection:
            row = connection.execute(
                "SELECT * FROM tasks WHERE owner = ? AND id = ?", (owner, task_id)
            ).fetchone()
        return _decode(row) if row else None

    def get(self, owner: str, task_id: str) -> dict[str, Any] | None:
        return self.get_task(owner, task_id)

    def insert_task(self, *, owner: str, values: Mapping[str, Any]) -> dict[str, Any]:
        task_id = str(values.get("id") or _new_id())
        now = _now()
        row = {
            "name": values["name"],
            "prompt": values["prompt"],
            "schedule": values["schedule"],
            "workspace_id": values["workspace_id"],
            "worktree_id": values.get("worktree_id"),
            "agent_id": values["agent_id"],
            "model": values.get("model"),
            "permission_mode": "scheduled",
            "timezone": values.get("timezone"),
            "enabled": int(values.get("enabled", True)),
            "cron_job_id": values.get("cron_job_id"),
            "last_error": values.get("last_error"),
            "draft_json": _json(values["draft_json"]) if values.get("draft_json") is not None else None,
        }
        with self._connection() as connection:
            try:
                connection.execute(
                    """INSERT INTO tasks
                    (owner, id, name, prompt, schedule, workspace_id, worktree_id,
                     agent_id, model, permission_mode, timezone, enabled, cron_job_id,
                     last_error, created_at, updated_at, draft_json)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        owner,
                        task_id,
                        row["name"],
                        row["prompt"],
                        row["schedule"],
                        row["workspace_id"],
                        row["worktree_id"],
                        row["agent_id"],
                        row["model"],
                        row["permission_mode"],
                        row["timezone"],
                        row["enabled"],
                        row["cron_job_id"],
                        row["last_error"],
                        now,
                        now,
                        row["draft_json"],
                    ),
                )
                connection.commit()
            except sqlite3.IntegrityError as error:
                connection.rollback()
                raise ScheduleConflict("task already exists") from error
        result = self.get_task(owner, task_id)
        assert result is not None
        return result

    def create(self, *, owner: str, values: Mapping[str, Any]) -> dict[str, Any]:
        return self.insert_task(owner=owner, values=values)

    def update_task(
        self, *, owner: str, task_id: str, changes: Mapping[str, Any]
    ) -> dict[str, Any]:
        unknown = set(changes) - _UPDATE_FIELDS
        if unknown:
            raise ValueError(f"unsupported task fields: {', '.join(sorted(unknown))}")
        if not changes:
            result = self.get_task(owner, task_id)
            if result is None:
                raise ScheduleNotFound("task not found")
            return result
        assignments: list[str] = []
        parameters: list[Any] = []
        for field in (*_TASK_FIELDS, "cron_job_id", "last_error"):
            if field not in changes or field == "permission_mode":
                continue
            assignments.append(f"{field} = ?")
            value = changes[field]
            if field == "enabled":
                value = int(value)
            elif field == "draft_json":
                value = _json(value) if value is not None else None
            parameters.append(value)
        assignments.append("updated_at = ?")
        parameters.append(_now())
        parameters.extend((owner, task_id))
        with self._connection() as connection:
            cursor = connection.execute(
                f"UPDATE tasks SET {', '.join(assignments)} WHERE owner = ? AND id = ?",
                parameters,
            )
            if cursor.rowcount != 1:
                connection.rollback()
                raise ScheduleNotFound("task not found")
            connection.commit()
        result = self.get_task(owner, task_id)
        assert result is not None
        return result

    def update(
        self, *, owner: str, task_id: str, changes: Mapping[str, Any]
    ) -> dict[str, Any]:
        return self.update_task(owner=owner, task_id=task_id, changes=changes)

    def delete_task(self, *, owner: str, task_id: str) -> None:
        with self._connection() as connection:
            cursor = connection.execute(
                "DELETE FROM tasks WHERE owner = ? AND id = ?", (owner, task_id)
            )
            if cursor.rowcount != 1:
                connection.rollback()
                raise ScheduleNotFound("task not found")
            connection.commit()

    def delete(self, *, owner: str, task_id: str) -> None:
        self.delete_task(owner=owner, task_id=task_id)


def _requested_tools(task: Mapping[str, Any]) -> list[str]:
    draft = task.get("draft_json")
    if not isinstance(draft, Mapping):
        return []
    raw = draft.get("requested_tools", draft.get("tools", []))
    if isinstance(raw, str):
        raw = [raw]
    if not isinstance(raw, list):
        raise ValueError("draft requested_tools must be a list")
    return [validate_tool_id(str(item)) for item in raw]


class SubpolarScheduleService:
    """Validate Subpolar ownership and adapt task mutations to legacy cron."""

    def __init__(
        self,
        *,
        store: SubpolarScheduleStore | None = None,
        subpolar: SubpolarStore | None = None,
        agents: AgentStore | None = None,
    ) -> None:
        self.store = store or SubpolarScheduleStore()
        self.subpolar = subpolar or SubpolarStore(self.store.db_path)
        self.agents = agents or AgentStore(self.store.db_path)

    def _references(self, owner: str, values: Mapping[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
        workspace_id = str(values.get("workspace_id") or "")
        agent_id = str(values.get("agent_id") or "")
        workspace = self.subpolar.get_workspace(owner, workspace_id)
        if workspace is None or workspace.get("archived"):
            raise ScheduleConflict("workspace not found or archived")
        worktree_id = values.get("worktree_id")
        if worktree_id is not None:
            worktrees = self.subpolar.list_worktrees(owner=owner, workspace_id=workspace_id)
            if not any(item["id"] == worktree_id for item in worktrees):
                raise ScheduleConflict("worktree not found for workspace")
        agent = self.agents.get_agent(owner, agent_id)
        if agent is None or agent.get("archived"):
            raise ScheduleConflict("agent not found or archived")
        if agent.get("scope") == "workspace" and agent.get("workspace_id") != workspace_id:
            raise ScheduleConflict("agent does not belong to workspace")
        try:
            effective = self.agents.effective_agent(
                owner=owner, agent_id=agent_id, workspace_id=workspace_id, mode="scheduled"
            )
        except AgentStoreError as error:
            raise ScheduleConflict(str(error)) from error
        if effective.get("archived"):
            raise ScheduleConflict("effective agent is archived")
        return workspace, effective

    @staticmethod
    def _check_values(values: Mapping[str, Any]) -> dict[str, Any]:
        result = dict(values)
        for field in ("name", "prompt", "schedule", "workspace_id", "agent_id"):
            if not isinstance(result.get(field), str) or not result[field].strip():
                raise ValueError(f"{field} is required")
            result[field] = result[field].strip()
        if result.get("permission_mode", "scheduled") != "scheduled":
            raise ValueError("permission_mode must be scheduled")
        result["timezone"] = _validate_timezone(result.get("timezone"))
        if not isinstance(result.get("enabled", True), bool):
            raise ValueError("enabled must be boolean")
        if result.get("draft_json") is not None and not isinstance(result["draft_json"], Mapping):
            raise ValueError("draft_json must be an object")
        return result

    def _scheduled_agent(self, owner: str, task: Mapping[str, Any]) -> dict[str, Any]:
        _, effective = self._references(owner, task)
        permissions = effective.get("permissions", {}).get("tools", {})
        for tool in _requested_tools(task):
            decision = permissions.get(tool)
            # ``ask`` is declarative only.  Scheduled execution cannot pause
            # for approval, and an absent/deny decision is fail-closed too.
            if decision not in {"auto", "allow"}:
                raise ScheduledPermissionError(
                    f"scheduled execution denied for tool {tool}: "
                    f"no non-interactive allow decision (got {decision or 'missing'})"
                )
        return effective

    def resolve_runtime_policy(
        self, *, owner: str, task_id: str, cron_job_id: str
    ) -> dict[str, Any]:
        """Revalidate published task policy immediately before cron execution."""
        if not isinstance(owner, str) or not owner.strip():
            raise ScheduleConflict("scheduled owner context is missing")
        if not isinstance(task_id, str) or not task_id.strip():
            raise ScheduleConflict("scheduled task context is missing")
        if not isinstance(cron_job_id, str) or not cron_job_id.strip():
            raise ScheduleConflict("scheduled cron job context is missing")

        task = self.store.get_task(owner, task_id)
        if task is None:
            raise ScheduleNotFound("scheduled task not found")
        if task.get("cron_job_id") != cron_job_id:
            raise ScheduleConflict("scheduled task is not linked to this cron job")
        if not task.get("enabled", False):
            raise ScheduleConflict("scheduled task is disabled")
        if task.get("permission_mode") != "scheduled":
            raise ScheduledPermissionError("scheduled task permission mode is invalid")

        try:
            self._scheduled_agent(owner, task)
        except Exception as error:
            try:
                self.store.update_task(
                    owner=owner,
                    task_id=task_id,
                    changes={"last_error": str(error)},
                )
            except Exception:
                pass
            if isinstance(error, ScheduleStoreError):
                raise
            raise ScheduleConflict(f"scheduled policy is invalid: {error}") from error
        return task

    @contextmanager
    def _cron(self) -> Iterator[Any]:
        from cron import jobs as cron_jobs

        home = get_hermes_home()
        home.mkdir(parents=True, exist_ok=True)
        token = set_hermes_home_override(str(home))
        try:
            with cron_jobs.use_cron_store(home):
                yield cron_jobs
        finally:
            reset_hermes_home_override(token)

    def _record_error(self, owner: str, task_id: str, error: Exception) -> dict[str, Any]:
        return self.store.update_task(
            owner=owner,
            task_id=task_id,
            changes={"last_error": str(error)},
        )

    def list(self, owner: str) -> list[dict[str, Any]]:
        return self.store.list_tasks(owner)

    def get(self, owner: str, task_id: str) -> dict[str, Any]:
        task = self.store.get_task(owner, task_id)
        if task is None:
            raise ScheduleNotFound("task not found")
        return task

    def create(self, *, owner: str, values: Mapping[str, Any], draft: bool = False) -> dict[str, Any]:
        values = self._check_values(values)
        workspace, _ = self._references(owner, values)
        task = self.store.insert_task(owner=owner, values=values)
        if draft:
            return task
        return self._publish_task(owner, task, workspace)

    def _publish_task(
        self, owner: str, task: Mapping[str, Any], workspace: Mapping[str, Any]
    ) -> dict[str, Any]:
        try:
            effective = self._scheduled_agent(owner, task)
            with self._cron() as cron_jobs:
                job = cron_jobs.create_job(
                    prompt=task["prompt"],
                    schedule=task["schedule"],
                    name=task["name"],
                    model=task.get("model") or effective.get("model"),
                    workdir=workspace["root"],
                    subpolar_owner=owner,
                    subpolar_task_id=task["id"],
                )
            published = self.store.update_task(
                owner=owner,
                task_id=task["id"],
                changes={"cron_job_id": job["id"], "last_error": None},
            )
            if not task.get("enabled", True):
                with self._cron() as cron_jobs:
                    cron_jobs.pause_job(job["id"])
            return published
        except ScheduledPermissionError as error:
            return self._record_error(owner, task["id"], error)
        except Exception as error:
            self._record_error(owner, task["id"], error)
            raise

    def update(self, *, owner: str, task_id: str, changes: Mapping[str, Any]) -> dict[str, Any]:
        current = self.get(owner, task_id)
        values = {**current, **dict(changes)}
        values = self._check_values(values)
        workspace, _ = self._references(owner, values)
        try:
            self._scheduled_agent(owner, values)
            if current.get("cron_job_id") is None:
                return self.store.update_task(owner=owner, task_id=task_id, changes=changes)
            cron_changes: dict[str, Any] = {}
            for field in ("prompt", "schedule", "model"):
                if field in changes:
                    cron_changes[field] = values[field]
            if workspace["root"] != self.subpolar.get_workspace(owner, current["workspace_id"])["root"]:
                cron_changes["workdir"] = workspace["root"]
            if cron_changes:
                with self._cron() as cron_jobs:
                    if not cron_jobs.update_job(current["cron_job_id"], cron_changes):
                        raise ScheduleNotFound("cron job not found")
            if "enabled" in changes and values["enabled"] != current["enabled"]:
                with self._cron() as cron_jobs:
                    toggle = (
                        cron_jobs.resume_job
                        if values["enabled"]
                        else cron_jobs.pause_job
                    )
                    if not toggle(current["cron_job_id"]):
                        raise ScheduleNotFound("cron job not found")
            return self.store.update_task(owner=owner, task_id=task_id, changes=changes)
        except ScheduledPermissionError as error:
            return self._record_error(owner, task_id, error)
        except Exception as error:
            self._record_error(owner, task_id, error)
            raise

    def delete(self, *, owner: str, task_id: str) -> None:
        task = self.get(owner, task_id)
        if task.get("cron_job_id"):
            with self._cron() as cron_jobs:
                delete_job = getattr(cron_jobs, "delete_job", None) or cron_jobs.remove_job
                if not delete_job(task["cron_job_id"]):
                    raise ScheduleNotFound("cron job not found")
        self.store.delete_task(owner=owner, task_id=task_id)

    def set_enabled(self, *, owner: str, task_id: str, enabled: bool) -> dict[str, Any]:
        task = self.get(owner, task_id)
        if not task.get("cron_job_id"):
            raise ScheduleConflict("task has not been published")
        try:
            self._scheduled_agent(owner, task)
        except Exception as error:
            return self._record_error(owner, task_id, error)
        with self._cron() as cron_jobs:
            job = (
                cron_jobs.resume_job(task["cron_job_id"])
                if enabled
                else cron_jobs.pause_job(task["cron_job_id"])
            )
        if not job:
            raise ScheduleNotFound("cron job not found")
        return self.store.update_task(
            owner=owner, task_id=task_id, changes={"enabled": enabled, "last_error": None}
        )

    def run_now(self, *, owner: str, task_id: str) -> dict[str, Any]:
        task = self.get(owner, task_id)
        try:
            self._scheduled_agent(owner, task)
        except Exception as error:
            # Never hand an ``ask`` decision to an approval waiter. Other
            # preflight failures are recorded too, before any cron call.
            return self._record_error(owner, task_id, error)
        if not task.get("cron_job_id"):
            return self._record_error(owner, task_id, ScheduleConflict("task has not been published"))
        with self._cron() as cron_jobs:
            job = cron_jobs.trigger_job(task["cron_job_id"])
        if not job:
            raise ScheduleNotFound("cron job not found")
        return self.store.update_task(owner=owner, task_id=task_id, changes={"last_error": None})

    def save_draft(self, *, owner: str, task_id: str, draft: Mapping[str, Any]) -> dict[str, Any]:
        if not isinstance(draft, Mapping):
            raise ValueError("draft_json must be an object")
        self.get(owner, task_id)
        return self.store.update_task(owner=owner, task_id=task_id, changes={"draft_json": dict(draft)})

    def discard_draft(self, *, owner: str, task_id: str) -> dict[str, Any]:
        self.get(owner, task_id)
        return self.store.update_task(owner=owner, task_id=task_id, changes={"draft_json": None})

    def publish(self, *, owner: str, task_id: str) -> dict[str, Any]:
        task = self.get(owner, task_id)
        if task.get("cron_job_id"):
            return task
        draft = task.get("draft_json")
        if isinstance(draft, Mapping):
            draft_changes = {
                field: draft[field]
                for field in _UPDATE_FIELDS
                if field in draft and field not in {"cron_job_id", "last_error", "draft_json"}
            }
            if draft_changes:
                values = self._check_values({**task, **draft_changes})
                self._references(owner, values)
                task = self.store.update_task(
                    owner=owner, task_id=task_id, changes=draft_changes
                )
        workspace, _ = self._references(owner, task)
        return self._publish_task(owner, task, workspace)

    def runs_summary(self, *, owner: str, task_id: str) -> dict[str, Any]:
        task = self.get(owner, task_id)
        summary: dict[str, Any] = {
            "task_id": task["id"],
            "cron_job_id": task.get("cron_job_id"),
            "last_run_at": None,
            "last_status": None,
            "last_error": task.get("last_error"),
            "counts": {"completed": 0, "failed": 0, "unknown": 0, "running": 0, "claimed": 0},
        }
        if not task.get("cron_job_id"):
            return summary
        try:
            with self._cron() as cron_jobs:
                job = cron_jobs.get_job(task["cron_job_id"])
            if job:
                summary["last_run_at"] = job.get("last_run_at")
                summary["last_status"] = job.get("last_status")
                summary["last_error"] = job.get("last_error") or summary["last_error"]
                completed = job.get("repeat", {}).get("completed")
                if isinstance(completed, int):
                    summary["counts"]["completed"] = completed
        except Exception:
            pass
        path = get_hermes_home() / "cron" / "executions.db"
        if not path.exists():
            return summary
        try:
            connection = sqlite3.connect(str(path))
            rows = connection.execute(
                "SELECT status, COUNT(*) FROM executions WHERE job_id = ? GROUP BY status",
                (task["cron_job_id"],),
            ).fetchall()
            latest = connection.execute(
                "SELECT claimed_at, status, error FROM executions WHERE job_id = ? "
                "ORDER BY claimed_at DESC, id DESC LIMIT 1",
                (task["cron_job_id"],),
            ).fetchone()
            connection.close()
        except sqlite3.Error:
            return summary
        for status, count in rows:
            if status in summary["counts"]:
                summary["counts"][status] = count
        if latest:
            summary["last_run_at"], summary["last_status"], execution_error = latest
            summary["last_error"] = execution_error or summary["last_error"]
        return summary


# Short aliases keep direct callers independent from route naming.
ScheduleStore = SubpolarScheduleStore


__all__ = [
    "ScheduleConflict",
    "ScheduleNotFound",
    "ScheduleStore",
    "ScheduleStoreError",
    "ScheduledPermissionError",
    "SubpolarScheduleService",
    "SubpolarScheduleStore",
]
