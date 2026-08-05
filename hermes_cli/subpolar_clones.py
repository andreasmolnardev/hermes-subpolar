"""Owner-scoped Subpolar repository clone jobs."""
from __future__ import annotations

import os
import re
import shutil
import sqlite3
import subprocess
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

from hermes_constants import get_hermes_home
from hermes_cli.subpolar_integrations import SubpolarIntegrationStore
from hermes_cli.subpolar_store import (
    SubpolarNotFound,
    SubpolarStore,
    validate_repo_url,
    validate_workspace_root,
)


_TERMINAL_STATUSES = frozenset({"succeeded", "failed", "cancelled"})
_MAX_OUTPUT_LINE = 4096
_MAX_ERROR = 1024
_PROGRESS_RE = re.compile(r"(?:objects|deltas|files):\s+(\d{1,3})%", re.IGNORECASE)
_SAFE_ENV_KEYS = frozenset(
    {
        "HOME",
        "LANG",
        "LC_ALL",
        "LC_CTYPE",
        "LOGNAME",
        "PATH",
        "SSH_AUTH_SOCK",
        "USER",
        "XDG_CONFIG_HOME",
        "GIT_CONFIG_GLOBAL",
    }
)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id() -> str:
    return uuid.uuid4().hex


def _row(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    result = dict(row)
    result["cancelled"] = bool(result["cancelled"])
    return result


class CloneManager:
    """Persistent clone jobs with server-owned worker processes."""

    def __init__(self, db_path: str | os.PathLike[str] | None = None) -> None:
        if db_path is None:
            home = get_hermes_home()
            home.mkdir(parents=True, exist_ok=True)
            db_path = home / "subpolar.db"
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._store = SubpolarStore(self.db_path)
        self._lock = threading.RLock()
        self._controls: dict[str, tuple[threading.Event, Any]] = {}
        self._workers = ThreadPoolExecutor(max_workers=4, thread_name_prefix="subpolar-clone")
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
                CREATE TABLE IF NOT EXISTS clone_jobs (
                    owner TEXT NOT NULL,
                    id TEXT PRIMARY KEY,
                    workspace_id TEXT NOT NULL,
                    repo_url TEXT NOT NULL,
                    provider TEXT,
                    status TEXT NOT NULL CHECK (status IN
                        ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
                    progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
                    started_at TEXT,
                    finished_at TEXT,
                    error TEXT,
                    cancelled INTEGER NOT NULL DEFAULT 0 CHECK (cancelled IN (0, 1))
                );
                CREATE INDEX IF NOT EXISTS clone_jobs_owner_idx
                    ON clone_jobs(owner, id);
                """
            )

    def _get(self, owner: str, job_id: str) -> dict[str, Any] | None:
        with self._connection() as connection:
            return _row(
                connection.execute(
                    "SELECT * FROM clone_jobs WHERE owner = ? AND id = ?",
                    (owner, job_id),
                ).fetchone()
            )

    def get(self, owner: str, job_id: str) -> dict[str, Any]:
        job = self._get(owner, job_id)
        if job is None:
            raise SubpolarNotFound("clone job not found")
        return job

    @staticmethod
    def _provider(owner: str, provider: str | None, db_path: Path) -> str | None:
        if provider is None:
            return None
        provider = provider.strip()
        if not provider:
            return None
        integration = SubpolarIntegrationStore(db_path).get_integration(owner, provider)
        if integration is None or integration.get("kind") != "git":
            raise ValueError("git_provider must reference an owner-owned git integration")
        if not integration.get("enabled", True):
            raise ValueError("git_provider integration is disabled")
        return provider

    @staticmethod
    def _sanitized_env() -> dict[str, str]:
        env = {key: value for key, value in os.environ.items() if key in _SAFE_ENV_KEYS}
        # Credential helpers use HOME/configuration, but git must never prompt
        # on a server worker with no interactive owner.
        env["GIT_TERMINAL_PROMPT"] = "0"
        return env

    @staticmethod
    def _reserve_destination(destination: str) -> None:
        path = Path(destination)
        if path.exists() or path.is_symlink():
            raise ValueError("clone destination already exists")
        try:
            path.mkdir(parents=True, exist_ok=False)
        except FileExistsError as error:
            raise ValueError("clone destination already exists") from error
        try:
            if validate_workspace_root(os.fspath(path)) != os.fspath(path):
                raise ValueError("clone destination changed during validation")
        except Exception:
            CloneManager._remove_destination(destination)
            raise

    @staticmethod
    def _remove_destination(destination: str) -> None:
        """Remove only a non-symlink destination that still passes root checks."""
        try:
            validated = validate_workspace_root(destination)
        except Exception:
            return
        if validated != destination or os.path.islink(destination):
            return
        try:
            if os.path.isdir(destination):
                shutil.rmtree(destination)
            elif os.path.lexists(destination):
                os.unlink(destination)
        except OSError:
            pass

    def create(
        self,
        *,
        owner: str,
        name: str,
        root: str,
        repo_url: str,
        git_provider: str | None = None,
    ) -> dict[str, Any]:
        canonical_root = validate_workspace_root(root)
        canonical_repo = validate_repo_url(repo_url)
        if canonical_repo is None:
            raise ValueError("repo_url is required")
        provider = self._provider(owner, git_provider, self.db_path)
        self._reserve_destination(canonical_root)

        workspace: dict[str, Any] | None = None
        try:
            workspace = self._store.create_workspace(
                owner=owner,
                name=name,
                mode="clone",
                root=canonical_root,
                repo_url=canonical_repo,
                git_provider=provider,
            )
            job_id = _new_id()
            with self._connection() as connection:
                connection.execute(
                    """
                    INSERT INTO clone_jobs
                        (owner, id, workspace_id, repo_url, provider, status, progress, cancelled)
                    VALUES (?, ?, ?, ?, ?, 'queued', 0, 0)
                    """,
                    (owner, job_id, workspace["id"], canonical_repo, provider),
                )
                connection.commit()
        except Exception:
            self._remove_destination(canonical_root)
            if workspace is not None:
                try:
                    self._store.delete_workspace(owner=owner, workspace_id=workspace["id"])
                except Exception:
                    pass
            raise

        cancel_event = threading.Event()
        with self._lock:
            self._controls[job_id] = (cancel_event, None)
        self._workers.submit(
            self._run,
            owner,
            job_id,
            workspace["id"],
            canonical_root,
            canonical_repo,
            provider,
            cancel_event,
        )
        return self.get(owner, job_id)

    def cancel(self, owner: str, job_id: str) -> dict[str, Any]:
        job = self.get(owner, job_id)
        if job["status"] in _TERMINAL_STATUSES:
            return job
        finished = _now()
        with self._connection() as connection:
            cursor = connection.execute(
                """
                UPDATE clone_jobs
                SET cancelled = 1, status = 'cancelled', finished_at = ?
                WHERE owner = ? AND id = ? AND status NOT IN ('succeeded', 'failed', 'cancelled')
                """,
                (finished, owner, job_id),
            )
            connection.commit()
        if cursor.rowcount != 1:
            return self.get(owner, job_id)
        with self._lock:
            control = self._controls.get(job_id)
            if control is not None:
                event, process = control
                event.set()
            else:
                process = None
        self._terminate(process)
        self._remove_for_job(job)
        return self.get(owner, job_id)

    def _clear_process(self, job_id: str) -> None:
        with self._lock:
            self._controls.pop(job_id, None)

    @staticmethod
    def _terminate(process: Any) -> None:
        if process is None:
            return
        try:
            process.terminate()
        except (AttributeError, OSError):
            return
        try:
            process.wait(timeout=2)
        except subprocess.TimeoutExpired:
            try:
                process.kill()
                process.wait(timeout=2)
            except (AttributeError, OSError, subprocess.TimeoutExpired):
                pass
        except TypeError:
            process.wait()

    def _remove_for_job(self, job: dict[str, Any]) -> None:
        with self._connection() as connection:
            row = connection.execute(
                "SELECT root FROM workspaces WHERE owner = ? AND id = ?",
                (job["owner"], job["workspace_id"]),
            ).fetchone()
        if row is not None:
            self._remove_destination(row["root"])

    def _update_progress(self, owner: str, job_id: str, progress: int) -> None:
        progress = max(0, min(100, int(progress)))
        with self._connection() as connection:
            connection.execute(
                "UPDATE clone_jobs SET progress = ? WHERE owner = ? AND id = ? AND status = 'running'",
                (progress, owner, job_id),
            )
            connection.commit()

    def _mark_finished(
        self,
        owner: str,
        job_id: str,
        *,
        status: str,
        error: str | None = None,
        progress: int | None = None,
    ) -> None:
        fields = ["status = ?", "finished_at = ?", "error = ?"]
        values: list[Any] = [status, _now(), error[:_MAX_ERROR] if error else None]
        if progress is not None:
            fields.append("progress = ?")
            values.append(max(0, min(100, progress)))
        values.extend((owner, job_id))
        with self._connection() as connection:
            connection.execute(
                f"UPDATE clone_jobs SET {', '.join(fields)} WHERE owner = ? AND id = ?",
                values,
            )
            connection.commit()

    def _run(
        self,
        owner: str,
        job_id: str,
        workspace_id: str,
        destination: str,
        repo_url: str,
        provider: str | None,
        cancel_event: threading.Event,
    ) -> None:
        with self._connection() as connection:
            connection.execute(
                """
                UPDATE clone_jobs SET status = 'running', started_at = ?
                WHERE owner = ? AND id = ? AND status = 'queued' AND cancelled = 0
                """,
                (_now(), owner, job_id),
            )
            connection.commit()
        job = self._get(owner, job_id)
        if job is None:
            self._clear_process(job_id)
            return
        if job["cancelled"] or cancel_event.is_set():
            self._remove_for_job(job)
            self._mark_finished(owner, job_id, status="cancelled")
            self._clear_process(job_id)
            return

        process: Any = None
        try:
            if (
                validate_workspace_root(destination) != destination
                or not os.path.isdir(destination)
                or os.path.islink(destination)
            ):
                raise ValueError("clone destination failed safety validation")
            with self._lock:
                current = self._get(owner, job_id)
                if cancel_event.is_set() or (current is not None and current["cancelled"]):
                    self._remove_for_job(job or current or {})
                    self._mark_finished(owner, job_id, status="cancelled")
                    return
                process = subprocess.Popen(
                    ["git", "clone", "--progress", "--", repo_url, destination],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    env=self._sanitized_env(),
                    shell=False,
                )
                self._controls[job_id] = (cancel_event, process)
            progress = 0
            stream = getattr(process, "stdout", None)
            while stream is not None:
                if cancel_event.is_set():
                    self._terminate(process)
                    break
                try:
                    line = stream.readline(_MAX_OUTPUT_LINE)
                except TypeError:
                    line = stream.readline()
                if line in ("", b"", None):
                    returncode = process.poll()
                    if returncode is not None or cancel_event.is_set():
                        break
                    time.sleep(0.05)
                    continue
                match = _PROGRESS_RE.search(str(line)[:_MAX_OUTPUT_LINE])
                if match:
                    progress = max(progress, min(100, int(match.group(1))))
                    self._update_progress(owner, job_id, progress)
            returncode = process.wait()
            current = self._get(owner, job_id)
            if cancel_event.is_set() or (current is not None and current["cancelled"]):
                self._remove_for_job(job or current or {})
                self._mark_finished(owner, job_id, status="cancelled")
            elif returncode == 0:
                self._store.update_workspace(
                    owner=owner,
                    workspace_id=workspace_id,
                    changes={
                        "mode": "clone",
                        "root": destination,
                        "repo_url": repo_url,
                        "git_provider": provider,
                    },
                )
                self._mark_finished(owner, job_id, status="succeeded", progress=100)
            else:
                self._remove_for_job(job or current or {})
                self._mark_finished(
                    owner,
                    job_id,
                    status="failed",
                    error=f"git clone exited with status {returncode}",
                )
        except Exception as error:
            current = self._get(owner, job_id)
            cancelled = cancel_event.is_set() or (current is not None and current["cancelled"])
            if process is not None and cancelled:
                self._terminate(process)
            self._remove_for_job(job or current or {})
            self._mark_finished(
                owner,
                job_id,
                status="cancelled" if cancelled else "failed",
                error=None if cancelled else str(error),
            )
        finally:
            self._clear_process(job_id)


_MANAGERS: dict[Path, CloneManager] = {}
_MANAGERS_LOCK = threading.Lock()


def clone_manager() -> CloneManager:
    home = get_hermes_home()
    home.mkdir(parents=True, exist_ok=True)
    db_path = (home / "subpolar.db").resolve()
    with _MANAGERS_LOCK:
        manager = _MANAGERS.get(db_path)
        if manager is None:
            manager = CloneManager(db_path)
            _MANAGERS[db_path] = manager
        return manager


__all__ = ["CloneManager", "clone_manager"]
