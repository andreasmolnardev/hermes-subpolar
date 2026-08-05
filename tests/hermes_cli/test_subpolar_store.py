from __future__ import annotations

import os

import pytest

from hermes_cli.subpolar_store import (
    SubpolarStore,
    WorkspaceRootError,
    validate_workspace_root,
)


def test_workspace_records_are_owner_scoped(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / "home"))
    root = tmp_path / "home" / "workspace"
    root.mkdir(parents=True)
    store = SubpolarStore(tmp_path / "home" / "subpolar.db")

    created = store.create_workspace(
        owner="alice", name="Alice", mode="local", root=str(root)
    )

    assert [item["id"] for item in store.list_workspaces("alice")] == [created["id"]]
    assert store.list_workspaces("bob") == []
    assert store.get_workspace("bob", created["id"]) is None


def test_workspace_roots_reject_siblings_and_symlinks(tmp_path, monkeypatch):
    allowed = tmp_path / "allowed"
    allowed.mkdir()
    outside = tmp_path / "outside"
    outside.mkdir()
    monkeypatch.setenv("SUBPOLAR_ALLOWED_ROOTS", str(allowed))

    with pytest.raises(WorkspaceRootError):
        validate_workspace_root(str(tmp_path / "allowed-sibling"))
    with pytest.raises(WorkspaceRootError):
        validate_workspace_root(str(outside))

    link = allowed / "linked"
    link.symlink_to(outside, target_is_directory=True)
    with pytest.raises(WorkspaceRootError):
        validate_workspace_root(str(link))


def test_repo_urls_cannot_store_credentials(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / "home"))
    root = tmp_path / "home" / "workspace"
    root.mkdir(parents=True)
    store = SubpolarStore(tmp_path / "home" / "subpolar.db")

    with pytest.raises(ValueError, match="credentials"):
        store.create_workspace(
            owner="alice",
            name="Unsafe",
            mode="local",
            root=os.fspath(root),
            repo_url="https://alice:secret@example.com/repo.git",
        )
