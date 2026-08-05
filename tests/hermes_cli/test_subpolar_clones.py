from __future__ import annotations

import io
import threading
import time

import pytest

from hermes_cli.subpolar_clones import CloneManager
from hermes_cli.subpolar_store import SubpolarNotFound, SubpolarStore
from hermes_cli.web_routers.subpolar_clones import CloneCreate


def test_clone_request_rejects_url_credentials():
    with pytest.raises(ValueError, match="credentials"):
        CloneCreate(
            name="Unsafe",
            root="/tmp/clone",
            repo_url="https://alice:secret@example.com/repo.git",
        )


def test_clone_jobs_are_owner_scoped(tmp_path, monkeypatch):
    home = tmp_path / "home"
    allowed = tmp_path / "allowed"
    allowed.mkdir()
    monkeypatch.setenv("HERMES_HOME", str(home))
    monkeypatch.setenv("SUBPOLAR_ALLOWED_ROOTS", str(allowed))
    manager = CloneManager(home / "subpolar.db")

    class CompletedProcess:
        stdout = io.StringIO("Receiving objects: 100%\n")

        def poll(self):
            return 0

        def wait(self, **kwargs):
            return 0

        def terminate(self):
            pass

    monkeypatch.setattr("hermes_cli.subpolar_clones.subprocess.Popen", lambda *a, **k: CompletedProcess())
    job = manager.create(
        owner="alice",
        name="Alice",
        root=str(allowed / "alice"),
        repo_url="https://example.com/repo.git",
    )

    with pytest.raises(SubpolarNotFound, match="clone job not found"):
        manager.get("bob", job["id"])
    for _ in range(40):
        if manager.get("alice", job["id"])["status"] == "succeeded":
            break
        time.sleep(0.025)
    completed = manager.get("alice", job["id"])
    assert completed["status"] == "succeeded"
    workspace = SubpolarStore(home / "subpolar.db").get_workspace(
        "alice", completed["workspace_id"]
    )
    assert workspace is not None
    assert workspace["mode"] == "clone"
    assert workspace["repo_url"] == "https://example.com/repo.git"


def test_cancellation_terminates_process_and_removes_partial_destination(tmp_path, monkeypatch):
    home = tmp_path / "home"
    allowed = tmp_path / "allowed"
    allowed.mkdir()
    monkeypatch.setenv("HERMES_HOME", str(home))
    monkeypatch.setenv("SUBPOLAR_ALLOWED_ROOTS", str(allowed))
    entered = threading.Event()
    terminated = threading.Event()

    class BlockingOutput:
        def readline(self, *args):
            entered.set()
            terminated.wait(2)
            return ""

    class RunningProcess:
        stdout = BlockingOutput()

        def poll(self):
            return -15 if terminated.is_set() else None

        def wait(self, **kwargs):
            return -15

        def terminate(self):
            terminated.set()

        def kill(self):
            terminated.set()

    manager = CloneManager(home / "subpolar.db")
    monkeypatch.setattr("hermes_cli.subpolar_clones.subprocess.Popen", lambda *a, **k: RunningProcess())
    destination = allowed / "partial"
    job = manager.create(
        owner="alice",
        name="Partial",
        root=str(destination),
        repo_url="https://example.com/repo.git",
    )

    assert entered.wait(2)
    cancelled = manager.cancel("alice", job["id"])
    for _ in range(40):
        if manager.get("alice", job["id"])["status"] == "cancelled":
            break
        time.sleep(0.025)
    assert cancelled["status"] == "cancelled"
    assert not destination.exists()
    assert terminated.is_set()
