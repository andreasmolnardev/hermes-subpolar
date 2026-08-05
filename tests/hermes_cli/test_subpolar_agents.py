from __future__ import annotations

import pytest

from hermes_cli.subpolar_agents import AgentStore, resolve_permissions, validate_tool_id


def _store(tmp_path):
    return AgentStore(tmp_path / "subpolar.db")


def test_master_is_created_lazily_per_owner(tmp_path):
    store = _store(tmp_path)

    alice = store.list_agents("alice")
    bob = store.list_agents("bob")

    assert len(alice) == 1
    assert alice[0]["name"] == "master"
    assert alice[0]["scope"] == "global"
    assert len(bob) == 1
    assert bob[0]["id"] != alice[0]["id"]
    assert store.list_agents("alice")[0]["id"] == alice[0]["id"]


def test_owner_filtering_and_inheritance_fork(tmp_path):
    store = _store(tmp_path)
    master = store.ensure_master("alice")
    parent = store.create_agent(
        owner="alice",
        values={
            "name": "builder",
            "parent_id": master["id"],
            "instructions": "build safely",
            "permissions": {"tools": {"provider.shell": "allow"}},
        },
    )
    fork = store.fork_agent(
        owner="alice",
        agent_id=parent["id"],
        workspace_id="workspace-1",
        changes={
            "name": "workspace builder",
            "permissions": {"tools": {"provider.shell": "deny"}},
        },
    )

    effective = store.effective_agent(
        owner="alice", agent_id=parent["id"], workspace_id="workspace-1"
    )
    assert effective["source_id"] == fork["id"]
    assert effective["instructions"] == "build safely"
    assert effective["permissions"]["tools"]["provider.shell"] == "deny"
    assert store.get_agent("bob", parent["id"]) is None


def test_workspace_patch_forks_global_agent(tmp_path):
    store = _store(tmp_path)
    master = store.ensure_master("alice")
    fork = store.update_agent(
        owner="alice",
        agent_id=master["id"],
        workspace_id="workspace-1",
        changes={"instructions": "workspace only"},
    )

    assert fork["scope"] == "workspace"
    assert fork["parent_id"] == master["id"]
    assert store.get_agent("alice", master["id"])["instructions"] == ""


def test_permission_resolution_is_restrictive_and_scheduled_is_noninteractive():
    parent = {
        "tools": {"provider.shell": "allow", "provider.read": "auto"},
        "scheduled": {"provider.shell": "ask"},
    }
    child = {
        "tools": {"provider.shell": "allow", "provider.read": "allow"},
        "scheduled": {"provider.read": "deny"},
    }

    normal = resolve_permissions(child, parent=parent)
    scheduled = resolve_permissions(child, parent=parent, mode="scheduled")
    assert normal == {"provider.shell": "allow", "provider.read": "auto"}
    assert scheduled == {"provider.shell": "ask", "provider.read": "deny"}


def test_tool_identity_validation_rejects_aliases_and_credentials(tmp_path):
    assert validate_tool_id("provider.search") == "provider.search"
    with pytest.raises(ValueError):
        validate_tool_id("search")
    with pytest.raises(ValueError, match="credentials"):
        _store(tmp_path).create_agent(
            owner="alice",
            values={"name": "unsafe", "overrides": {"api_key": "secret"}},
        )
    with pytest.raises(ValueError):
        _store(tmp_path).create_agent(
            owner="alice", values={"name": "bad", "tools": ["search"]}
        )


def test_agent_routes_use_same_origin_and_do_not_accept_client_owner(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient
    from hermes_cli import web_server

    monkeypatch.setenv("HERMES_HOME", str(tmp_path / "home"))
    previous_auth_required = getattr(web_server.app.state, "auth_required", None)
    web_server.app.state.auth_required = False
    client = TestClient(web_server.app, base_url="http://127.0.0.1:8080")
    auth = {
        "X-Hermes-Session-Token": web_server._SESSION_TOKEN,
        "Origin": "http://127.0.0.1:8080",
    }
    try:
        listed = client.get("/api/subpolar/agents", headers=auth)
        assert listed.status_code == 200
        assert [agent["name"] for agent in listed.json()["agents"]] == ["master"]
        assert client.post(
            "/api/subpolar/agents",
            headers={**auth, "Origin": "https://evil.example"},
            json={"name": "blocked"},
        ).status_code == 403
        assert client.post(
            "/api/subpolar/agents", headers=auth, json={"name": "bad", "owner": "bob"}
        ).status_code == 422
    finally:
        if previous_auth_required is None:
            delattr(web_server.app.state, "auth_required")
        else:
            web_server.app.state.auth_required = previous_auth_required
