from __future__ import annotations

import json
import sqlite3

import pytest

from hermes_cli.subpolar_integrations import (
    IntegrationConflict,
    IntegrationNotFound,
    SubpolarIntegrationStore,
)


def _store(tmp_path):
    return SubpolarIntegrationStore(tmp_path / "subpolar.db")


def _create(store, owner="alice", **overrides):
    values = {
        "owner": owner,
        "kind": "git",
        "name": "github",
        "provider": "github",
        "endpoint": "https://api.github.com",
        "credential_ref": "user:github-token",
        "config": {"organization": "hermes"},
    }
    values.update(overrides)
    return store.create_integration(**values)


def test_integrations_are_owner_scoped_and_names_unique(tmp_path):
    store = _store(tmp_path)
    created = _create(store)

    assert [item["id"] for item in store.list_integrations("alice")] == [created["id"]]
    assert store.list_integrations("bob") == []
    assert store.get_integration("bob", created["id"]) is None
    with pytest.raises(IntegrationConflict):
        _create(store, owner="alice")
    _create(store, owner="bob")


def test_crud_and_search_are_owner_scoped(tmp_path):
    store = _store(tmp_path)
    created = _create(store)

    assert store.search_integrations("alice", "github")[0]["id"] == created["id"]
    updated = store.update_integration(
        owner="alice",
        integration_id=created["id"],
        changes={"name": "github-work", "enabled": False},
    )
    assert updated["name"] == "github-work"
    assert updated["enabled"] is False
    with pytest.raises(IntegrationNotFound):
        store.update_integration(
            owner="bob", integration_id=created["id"], changes={"enabled": True}
        )

    store.delete_integration(owner="alice", integration_id=created["id"])
    assert store.get_integration("alice", created["id"]) is None
    with pytest.raises(IntegrationNotFound):
        store.delete_integration(owner="alice", integration_id=created["id"])


def test_reads_redact_sensitive_legacy_values(tmp_path):
    store = _store(tmp_path)
    created = _create(store)
    with sqlite3.connect(store.db_path) as connection:
        connection.execute(
            "UPDATE integrations SET config = ?, endpoint = ? WHERE id = ?",
            (json.dumps({"api_key": "do-not-leak", "nested": {"token": "also-secret"}}),
             "https://user:password@example.com/api", created["id"]),
        )

    result = store.get_integration("alice", created["id"])
    assert result is not None
    assert result["config"] == {
        "api_key": "[redacted]",
        "nested": {"token": "[redacted]"},
    }
    assert "password" not in result["endpoint"]


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("endpoint", "https://user:secret@example.com/api"),
        ("config", {"base_url": "https://user:secret@example.com/api"}),
        ("config", {"api_key": "secret"}),
        ("config", {"nested": {"password": "secret"}}),
        ("config", {"credential_scope": "project"}),
        ("config", {"credential_ref": "project:repo-token"}),
        ("credential_ref", "project:repo-token"),
    ],
)
def test_credentials_cannot_be_persisted(tmp_path, field, value):
    store = _store(tmp_path)
    with pytest.raises(ValueError):
        _create(store, **{field: value})
    assert store.list_integrations("alice") == []


def test_unknown_kind_rejected(tmp_path):
    with pytest.raises(ValueError, match="kind"):
        _create(_store(tmp_path), kind="home_assistant")


def test_git_provider_catalog_is_central_and_credential_ref_only(tmp_path):
    store = _store(tmp_path)
    git = _create(store, provider="gitlab", name="gitlab", config={"group": "hermes"})

    catalog = store.list_catalog("alice")
    assert catalog == [
        {
            "id": git["id"],
            "kind": "git",
            "name": "gitlab",
            "provider": "gitlab",
            "qualified_name": "gitlab:gitlab",
            "endpoint": "https://api.github.com",
            "credential_ref": "user:github-token",
            "enabled": True,
            "health": "unknown",
            "schema_version": 1,
        }
    ]
    assert "config" not in catalog[0]
    assert store.list_catalog("bob") == []


def test_health_update_and_owner_isolation(tmp_path):
    store = _store(tmp_path)
    created = _create(store)
    assert store.health_integration(owner="alice", integration_id=created["id"])["health"] == "unknown"
    assert store.health_integration(
        owner="alice", integration_id=created["id"], health="healthy"
    )["health"] == "healthy"
    with pytest.raises(IntegrationNotFound):
        store.health_integration(owner="bob", integration_id=created["id"])
