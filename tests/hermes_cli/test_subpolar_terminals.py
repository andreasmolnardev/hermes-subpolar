from __future__ import annotations

import pytest

from hermes_cli.subpolar_store import SubpolarStore
from hermes_cli.subpolar_terminals import (
    MAX_TERMINAL_POSITION,
    SubpolarTerminalStore,
    TerminalConflict,
    TerminalNotFound,
)


def _workspace(tmp_path, monkeypatch, owner: str = "alice"):
    home = tmp_path / "home"
    root = home / "workspace"
    root.mkdir(parents=True)
    monkeypatch.setenv("SUBPOLAR_ALLOWED_ROOTS", str(home))
    store = SubpolarStore(home / "subpolar.db")
    workspace = store.create_workspace(
        owner=owner, name="Workspace", mode="local", root=str(root)
    )
    return store, workspace, home


def test_terminals_are_owner_scoped_and_persistent(tmp_path, monkeypatch):
    store, workspace, home = _workspace(tmp_path, monkeypatch)
    terminals = SubpolarTerminalStore(home / "subpolar.db")
    created = terminals.create_terminal(
        owner="alice", workspace_id=workspace["id"], name="Shell"
    )

    assert terminals.list("alice")[0]["id"] == created["id"]
    assert terminals.list("bob") == []
    assert terminals.get("bob", created["id"]) is None
    assert SubpolarTerminalStore(home / "subpolar.db").get(
        "alice", created["id"]
    )["attach_key"] == created["attach_key"]


def test_terminal_root_resolves_from_workspace_or_worktree(tmp_path, monkeypatch):
    store, workspace, home = _workspace(tmp_path, monkeypatch)
    worktree_root = home / "workspace" / "worktree"
    worktree_root.mkdir()
    worktree = store.create_worktree(
        owner="alice",
        workspace_id=workspace["id"],
        root=str(worktree_root),
        branch="main",
    )
    terminals = SubpolarTerminalStore(home / "subpolar.db")
    workspace_terminal = terminals.create_terminal(
        owner="alice", workspace_id=workspace["id"], name="Root"
    )
    worktree_terminal = terminals.create_terminal(
        owner="alice",
        workspace_id=workspace["id"],
        worktree_id=worktree["id"],
        name="Tree",
    )

    assert terminals.resolve_root(owner="alice", terminal_id=workspace_terminal["id"]) == workspace["root"]
    assert terminals.resolve_root(owner="alice", terminal_id=worktree_terminal["id"]) == worktree["root"]


def test_terminal_positions_and_attach_keys_are_bounded(tmp_path, monkeypatch):
    _, workspace, home = _workspace(tmp_path, monkeypatch)
    terminals = SubpolarTerminalStore(home / "subpolar.db")
    first = terminals.create_terminal(
        owner="alice", workspace_id=workspace["id"], name="First", position=0
    )
    second = terminals.create_terminal(
        owner="alice", workspace_id=workspace["id"], name="Second", position=0
    )
    assert [item["id"] for item in terminals.list("alice")] == [second["id"], first["id"]]
    assert all(0 <= item["position"] <= MAX_TERMINAL_POSITION for item in terminals.list("alice"))
    assert first["attach_key"] != second["attach_key"]

    with pytest.raises(ValueError):
        terminals.create_terminal(
            owner="alice",
            workspace_id=workspace["id"],
            name="Bad",
            position=MAX_TERMINAL_POSITION + 1,
        )


def test_terminal_delete_is_owner_scoped_close(tmp_path, monkeypatch):
    _, workspace, home = _workspace(tmp_path, monkeypatch)
    terminals = SubpolarTerminalStore(home / "subpolar.db")
    created = terminals.create_terminal(
        owner="alice", workspace_id=workspace["id"], name="Shell"
    )

    with pytest.raises(TerminalNotFound):
        terminals.delete_terminal(owner="bob", terminal_id=created["id"])
    terminals.delete_terminal(owner="alice", terminal_id=created["id"])
    assert terminals.get("alice", created["id"])["closed"] is True
    with pytest.raises(TerminalNotFound):
        terminals.update_terminal(
            owner="alice", terminal_id=created["id"], changes={"name": "Nope"}
        )


def test_terminal_requires_owner_workspace(tmp_path, monkeypatch):
    _, workspace, home = _workspace(tmp_path, monkeypatch)
    terminals = SubpolarTerminalStore(home / "subpolar.db")
    with pytest.raises(TerminalConflict):
        terminals.create_terminal(
            owner="bob", workspace_id=workspace["id"], name="No access"
        )
