"""Behavioral lifecycle coverage for persistent self-hosted dashboard auth."""

from __future__ import annotations

import sqlite3
from unittest.mock import MagicMock

from fastapi.testclient import TestClient
import pytest

from hermes_cli import web_server
from hermes_cli.dashboard_auth import (
    InvalidCredentialsError,
    clear_providers,
    list_providers,
    register_provider,
)
from plugins.dashboard_auth.basic import BasicAuthProvider
import plugins.dashboard_auth.basic as basic_plugin


@pytest.fixture
def self_hosted_client(tmp_path, monkeypatch):
    home = tmp_path / "hermes"
    home.mkdir()
    monkeypatch.setenv("HERMES_HOME", str(home))
    clear_providers()
    provider = BasicAuthProvider(
        secret=None,
        state_path=home / "dashboard_auth.db",
        allow_bootstrap=True,
        allow_registration=True,
        reset_token="operator-reset",
    )
    register_provider(provider)
    previous = (
        getattr(web_server.app.state, "auth_required", None),
        getattr(web_server.app.state, "bound_host", None),
        getattr(web_server.app.state, "bound_port", None),
    )
    web_server.app.state.auth_required = True
    web_server.app.state.bound_host = "subpolar.example.test"
    web_server.app.state.bound_port = 443
    client = TestClient(web_server.app, base_url="https://subpolar.example.test")
    yield client, home
    clear_providers()
    (
        web_server.app.state.auth_required,
        web_server.app.state.bound_host,
        web_server.app.state.bound_port,
    ) = previous


def _bootstrap(client: TestClient) -> None:
    response = client.post(
        "/auth/bootstrap",
        json={"username": "admin", "password": "hunter2", "display_name": "Admin"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["session"]["session_id"]


def test_subpolar_plugin_registers_bootstrap_provider(tmp_path, monkeypatch):
    home = tmp_path / "hermes"
    home.mkdir()
    monkeypatch.setenv("HERMES_HOME", str(home))
    monkeypatch.setenv("HERMES_SUBPOLAR_ONLY", "1")
    monkeypatch.setattr(basic_plugin, "_load_config_basic_auth_section", lambda: {})
    context = MagicMock()

    basic_plugin.register(context)

    provider = context.register_dashboard_auth_provider.call_args.args[0]
    assert provider.supports_bootstrap
    assert provider.supports_password


def test_registration_policy_stays_closed_after_bootstrap(tmp_path):
    provider = BasicAuthProvider(
        secret=None,
        state_path=tmp_path / "dashboard_auth.db",
        allow_bootstrap=True,
        allow_registration=False,
    )
    provider.bootstrap_user(username="admin", password="hunter2")
    assert not provider.supports_registration
    with pytest.raises(InvalidCredentialsError):
        provider.register_user(username="second", password="second-password")


def test_bootstrap_persists_across_provider_restart(self_hosted_client):
    client, home = self_hosted_client
    assert client.get("/api/auth/bootstrap").json() == {
        "required": True,
        "registration": True,
        "provider": "basic",
    }
    _bootstrap(client)
    assert client.get("/api/auth/me").json()["user_id"] == "admin"
    db_path = home / "dashboard_auth.db"
    assert db_path.exists()
    access_token = next(
        value
        for key, value in client.cookies.items()
        if key.endswith("hermes_session_at")
    )
    refresh_token = next(
        value
        for key, value in client.cookies.items()
        if key.endswith("hermes_session_rt")
    )
    with sqlite3.connect(db_path) as connection:
        tables = {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            )
        }
        assert {"users", "sessions", "client_tokens"} <= tables
        assert {row[1] for row in connection.execute("PRAGMA table_info(users)")} >= {
            "user_id",
            "username",
            "display_name",
            "password_hash",
            "created_at",
            "updated_at",
        }
        assert {
            row[1] for row in connection.execute("PRAGMA table_info(sessions)")
        } >= {
            "access_token_digest",
            "refresh_token_digest",
            "user_id",
            "created_at",
            "last_seen_at",
            "expires_at",
            "revoked_at",
        }
        assert connection.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 1
        stored = connection.execute(
            "SELECT access_token_digest, refresh_token_digest, password_hash FROM users "
            "JOIN sessions USING (user_id)"
        ).fetchone()
        assert access_token not in stored
        assert refresh_token not in stored
        assert "hunter2" not in stored[2]

    restarted = BasicAuthProvider(
        secret=None,
        state_path=db_path,
        allow_bootstrap=True,
    )
    assert not restarted.supports_bootstrap
    session = restarted.complete_password_login(username="admin", password="hunter2")
    assert restarted.verify_session(access_token=session.access_token) is not None


def test_password_change_revokes_other_sessions(self_hosted_client):
    client, home = self_hosted_client
    _bootstrap(client)
    second = TestClient(web_server.app, base_url="https://subpolar.example.test")
    login = second.post(
        "/auth/password-login",
        json={"provider": "basic", "username": "admin", "password": "hunter2"},
    )
    assert login.status_code == 200
    sessions = client.get("/api/auth/sessions").json()["sessions"]
    assert len(sessions) == 2

    changed = client.post(
        "/auth/password-change",
        json={"current_password": "hunter2", "new_password": "new-password"},
    )
    assert changed.status_code == 200
    assert second.get("/api/auth/me").status_code == 401
    assert (
        client.post(
            "/auth/password-login",
            json={"provider": "basic", "username": "admin", "password": "new-password"},
        ).status_code
        == 200
    )
    assert home.joinpath("dashboard_auth.db").stat().st_mode & 0o077 == 0


def test_signup_page_and_multiple_user_ownership(self_hosted_client):
    client, home = self_hosted_client
    assert client.get("/signup").status_code == 200
    assert "/auth/register" in client.get("/signup").text
    _bootstrap(client)
    login_page = client.get("/login")
    assert "Create an account" in login_page.text

    registered = client.post(
        "/auth/register",
        json={
            "username": "second",
            "password": "second-password",
            "display_name": "Second",
        },
    )
    assert registered.status_code == 200
    second_user_session = registered.json()["session"]["session_id"]

    admin = TestClient(web_server.app, base_url="https://subpolar.example.test")
    assert (
        admin.post(
            "/auth/password-login",
            json={"provider": "basic", "username": "admin", "password": "hunter2"},
        ).status_code
        == 200
    )
    sessions = admin.get("/api/auth/sessions").json()["sessions"]
    assert all(item["session_id"] != second_user_session for item in sessions)
    with sqlite3.connect(home / "dashboard_auth.db") as connection:
        rows = connection.execute(
            "SELECT user_id, username FROM users ORDER BY username"
        ).fetchall()
    assert [row[1] for row in rows] == ["admin", "second"]
    assert rows[0][0] != rows[1][0]


def test_refresh_rotates_tokens_without_creating_session(self_hosted_client):
    client, _home = self_hosted_client
    _bootstrap(client)
    provider = next(
        provider for provider in list_providers() if provider.name == "basic"
    )
    before = len(provider.list_sessions(user_id="admin"))
    first = provider.complete_password_login(username="admin", password="hunter2")
    assert len(provider.list_sessions(user_id="admin")) == before + 1
    refreshed = provider.refresh_session(refresh_token=first.refresh_token)
    assert refreshed.session_id == first.session_id
    assert len(provider.list_sessions(user_id="admin")) == before + 1


def test_session_revocation_and_scoped_client_tokens(self_hosted_client):
    client, _home = self_hosted_client
    _bootstrap(client)
    second = TestClient(web_server.app, base_url="https://subpolar.example.test")
    second.post(
        "/auth/password-login",
        json={"provider": "basic", "username": "admin", "password": "hunter2"},
    )
    sessions = client.get("/api/auth/sessions").json()["sessions"]
    other = next(item for item in sessions if not item["current"])
    assert client.delete(f"/api/auth/sessions/{other['session_id']}").json()["ok"]
    assert second.get("/api/auth/me").status_code == 401

    issued = client.post("/api/auth/tokens", json={"scopes": ["read", "read"]})
    assert issued.status_code == 200
    payload = issued.json()
    assert payload["token"].startswith("hct_")
    provider = next(iter(list_providers()))
    principal = provider.verify_token(token=payload["token"])
    assert principal is not None
    assert principal.scopes == ("read",)
    assert client.delete(f"/api/auth/tokens/{payload['token_id']}").json() == {
        "ok": True
    }
    assert provider.verify_token(token=payload["token"]) is None


def test_operator_reset_revokes_existing_sessions(self_hosted_client):
    client, _home = self_hosted_client
    _bootstrap(client)
    reset = client.post(
        "/auth/password-reset",
        json={
            "username": "admin",
            "reset_token": "operator-reset",
            "new_password": "reset-password",
        },
    )
    assert reset.status_code == 200
    assert (
        client.post(
            "/auth/password-login",
            json={
                "provider": "basic",
                "username": "admin",
                "password": "reset-password",
            },
        ).status_code
        == 200
    )


def test_logout_revokes_persistent_session(self_hosted_client):
    client, _home = self_hosted_client
    _bootstrap(client)
    assert client.post("/auth/logout").status_code == 200
    assert client.get("/api/auth/me").status_code == 401
