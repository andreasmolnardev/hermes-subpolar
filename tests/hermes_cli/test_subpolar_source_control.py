from __future__ import annotations

import json

import pytest

from hermes_cli import web_git
from hermes_cli.subpolar_source_control import SubpolarSourceControlService
from hermes_cli.subpolar_integrations import SubpolarIntegrationStore
from hermes_cli.subpolar_store import SubpolarNotFound, SubpolarStore, WorkspaceRootError


@pytest.fixture
def source_control(tmp_path, monkeypatch):
    home = tmp_path / "home"
    root = home / "workspace"
    root.mkdir(parents=True)
    monkeypatch.setenv("HERMES_HOME", str(home))
    monkeypatch.setenv("SUBPOLAR_ALLOWED_ROOTS", str(home))
    store = SubpolarStore(home / "subpolar.db")
    integration = SubpolarIntegrationStore(home / "subpolar.db").create_integration(
        owner="alice", kind="git", name="git-main", provider="git"
    )
    workspace = store.create_workspace(
        owner="alice", name="Alice", mode="local", root=str(root), git_provider=integration["id"]
    )
    return SubpolarSourceControlService(store), store, workspace, root


def test_operations_resolve_workspace_root_and_filter_owner(
    source_control, monkeypatch
):
    service, store, workspace, root = source_control
    calls = []
    monkeypatch.setattr(web_git, "repo_status", lambda cwd: calls.append(cwd) or {"ok": True})

    assert service.status("alice", workspace["id"], workspace["git_provider"]) == {"ok": True}
    assert calls == [str(root)]

    with pytest.raises(SubpolarNotFound):
        service.status("bob", workspace["id"])


def test_root_replacement_is_rejected_before_git(source_control, monkeypatch):
    service, store, workspace, root = source_control
    outside = root.parent / "outside"
    outside.mkdir()
    root.rename(root.parent / "old-workspace")
    root.symlink_to(outside, target_is_directory=True)
    monkeypatch.setattr(web_git, "repo_status", lambda _cwd: pytest.fail("git called"))

    with pytest.raises(WorkspaceRootError):
        service.status("alice", workspace["id"])


def test_baseline_artifact_remains_stable_after_edits(source_control, monkeypatch):
    service, store, workspace, root = source_control
    listing = {"files": [{"path": "note.txt", "added": 1}], "base": None}
    diffs = {"note.txt": "diff --git a/note.txt b/note.txt\n-old\n+new\n"}
    baseline_diff = diffs["note.txt"]
    monkeypatch.setattr(web_git, "review_list", lambda *_args: listing)
    monkeypatch.setattr(web_git, "review_diff", lambda *_args: diffs["note.txt"])

    first = service.capture_baseline("alice", workspace["id"], "task-1")
    assert first["files"] == listing["files"]
    assert first["diffs"] == diffs

    listing["files"][0]["added"] = 99
    diffs["note.txt"] = "later edit"
    second = service.get_stable_review_artifact("alice", workspace["id"], "task-1")
    assert second == first

    service.capture_baseline(
        "alice",
        workspace["id"],
        "task-1",
        files=[{"path": "other.txt"}],
        diffs={"other.txt": "other"},
    )
    assert service.get_review_artifact("bob", workspace["id"], "task-1") is None
    assert service.get_review_artifact("alice", workspace["id"], "task-1") == first

    with store._connection() as connection:
        row = connection.execute(
            "SELECT files_json, diffs_json FROM task_baselines WHERE owner = ?",
            ("alice",),
        ).fetchone()
    assert json.loads(row["diffs_json"]) == {"note.txt": baseline_diff}


def test_worktree_remove_uses_server_resolved_path(source_control, monkeypatch):
    service, _store, workspace, root = source_control
    target = root / ".worktrees" / "feature"
    target.parent.mkdir()
    target.mkdir()
    removed = []
    monkeypatch.setattr(
        web_git,
        "worktree_list",
        lambda _cwd: [{"path": str(target), "branch": "feature", "isMain": False}],
    )
    monkeypatch.setattr(
        web_git,
        "worktree_remove",
        lambda cwd, path, force: removed.append((cwd, path, force)) or {"removed": path},
    )

    service.worktree_remove("alice", workspace["id"], "feature", force=True)
    assert removed == [(str(root), str(target), True)]
