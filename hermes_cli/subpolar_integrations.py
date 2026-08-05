"""Owner-scoped Subpolar integration metadata.

This module stores provider configuration and references to credentials. It
never stores credential material or instantiates a concrete integration.
"""
from __future__ import annotations

import json
import re
import sqlite3
import uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator, Mapping
from urllib.parse import urlsplit, urlunsplit

from hermes_constants import get_hermes_home


INTEGRATION_KINDS = frozenset({"mcp", "openapi", "git", "model", "chat", "memory", "plugin"})
_SENSITIVE_KEY = re.compile(
    r"(?:^|[_-])(api[_-]?keys?|access[_-]?tokens?|refresh[_-]?tokens?|"
    r"tokens?|secrets?|passwords?|passwds?|private[_-]?keys?|"
    r"client[_-]?secrets?|authorizations?)(?:$|[_-])"
)
_PROJECT_CREDENTIAL_KEY = re.compile(
    r"(?:^|[_-])(?:project|workspace)[_-](?:credentials?|credential[_-]?refs?)(?:$|[_-])"
)


class IntegrationStoreError(Exception):
    """Base error for integration metadata and validation failures."""


class IntegrationNotFound(IntegrationStoreError):
    """Requested owner-scoped integration does not exist."""


class IntegrationConflict(IntegrationStoreError):
    """Integration name or ownership constraint was violated."""


def _new_id() -> str:
    return uuid.uuid4().hex


def _normalized_key(value: str) -> str:
    # Convert camelCase keys before matching apiKey/accessToken forms.
    value = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", value)
    return value.strip().lower()


def _is_sensitive_key(key: object) -> bool:
    if not isinstance(key, str):
        return False
    normalized = _normalized_key(key)
    return bool(_SENSITIVE_KEY.search(normalized)) or normalized in {
        "credential",
        "credentials",
        "credential_value",
        "secret_value",
    }


def _reject_sensitive_config(value: Any, *, path: str = "config") -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            if _is_sensitive_key(key):
                raise ValueError(f"{path}.{key} must not contain plaintext credentials")
            _reject_sensitive_config(child, path=f"{path}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            _reject_sensitive_config(child, path=f"{path}[{index}]")


def _reject_embedded_url_credentials(value: Any, *, path: str = "config") -> None:
    if isinstance(value, str):
        try:
            parsed = urlsplit(value)
        except ValueError as error:
            raise ValueError(f"{path} contains an invalid URL") from error
        if parsed.username is not None or parsed.password is not None:
            raise ValueError(f"{path} must not contain URL credentials")
    elif isinstance(value, dict):
        for key, child in value.items():
            _reject_embedded_url_credentials(child, path=f"{path}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            _reject_embedded_url_credentials(child, path=f"{path}[{index}]")


def _reject_project_credentials(value: Any, *, path: str = "config") -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            normalized = _normalized_key(key) if isinstance(key, str) else ""
            if _PROJECT_CREDENTIAL_KEY.search(normalized):
                raise ValueError("project-owned credentials are not supported")
            if normalized in {"credential_scope", "credentials_scope", "credential_ownership"}:
                if isinstance(child, str) and child.strip().lower() in {"project", "workspace"}:
                    raise ValueError("project-owned credentials are not supported")
            if normalized in {"credential_ref", "credential_refs"} and isinstance(child, str):
                _validate_credential_ref(child)
            _reject_project_credentials(child, path=f"{path}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            _reject_project_credentials(child, path=f"{path}[{index}]")


def _validate_credential_ref(value: str | None) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str) or not value.strip():
        raise ValueError("credential_ref must be a non-empty central reference")
    normalized = value.strip().lower()
    if normalized.startswith(("project:", "workspace:", "project/", "workspace/")):
        raise ValueError("project-owned credentials are not supported")
    return value.strip()


def _validate_endpoint(value: str | None) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str) or not value.strip():
        raise ValueError("endpoint must be a non-empty URL")
    try:
        parsed = urlsplit(value.strip())
        has_credentials = parsed.username is not None or parsed.password is not None
    except ValueError as error:
        raise ValueError("endpoint is invalid") from error
    if has_credentials:
        raise ValueError("endpoint must not contain credentials")
    return value.strip()


def _validate_config(value: Mapping[str, Any] | None) -> dict[str, Any]:
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise ValueError("config must be a JSON object")
    _reject_sensitive_config(value)
    _reject_embedded_url_credentials(value)
    _reject_project_credentials(value)
    try:
        encoded = json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)
    except (TypeError, ValueError) as error:
        raise ValueError("config must contain JSON values only") from error
    return json.loads(encoded)


def _redact_config(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: "[redacted]" if _is_sensitive_key(key) else _redact_config(child)
            for key, child in value.items()
        }
    if isinstance(value, list):
        return [_redact_config(child) for child in value]
    return value


def _redact_endpoint(value: str | None) -> str | None:
    if value is None:
        return None
    try:
        parsed = urlsplit(value)
        if parsed.username is None and parsed.password is None:
            return value
        host = parsed.hostname or ""
        if parsed.port is not None:
            host = f"{host}:{parsed.port}"
        return urlunsplit((parsed.scheme, host, parsed.path, parsed.query, parsed.fragment))
    except ValueError:
        return "[redacted]"


class SubpolarIntegrationStore:
    """SQLite store for owner-scoped provider metadata."""

    def __init__(self, db_path: str | Path | None = None) -> None:
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
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS integrations (
                    owner TEXT NOT NULL,
                    id TEXT NOT NULL PRIMARY KEY,
                    kind TEXT NOT NULL CHECK (kind IN ('mcp', 'openapi', 'git', 'model', 'chat', 'memory', 'plugin')),
                    name TEXT NOT NULL,
                    provider TEXT NOT NULL,
                    endpoint TEXT,
                    credential_ref TEXT,
                    config JSON NOT NULL,
                    enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
                    health TEXT NOT NULL DEFAULT 'unknown',
                    schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version > 0),
                    UNIQUE (owner, name)
                );
                CREATE INDEX IF NOT EXISTS integrations_owner_idx ON integrations(owner);
                CREATE INDEX IF NOT EXISTS integrations_provider_idx ON integrations(owner, provider);
                """
            )

    @staticmethod
    def _row(row: sqlite3.Row) -> dict[str, Any]:
        result = dict(row)
        try:
            config = json.loads(result["config"])
        except (TypeError, ValueError):
            config = {}
        result["config"] = _redact_config(config)
        result["endpoint"] = _redact_endpoint(result.get("endpoint"))
        result["enabled"] = bool(result["enabled"])
        return result

    @staticmethod
    def _validate_kind(kind: str) -> str:
        if kind not in INTEGRATION_KINDS:
            raise ValueError("kind must be one of: " + ", ".join(sorted(INTEGRATION_KINDS)))
        return kind

    @staticmethod
    def _validate_text(value: str, field: str, *, max_length: int = 500) -> str:
        if not isinstance(value, str) or not value.strip():
            raise ValueError(f"{field} must be non-empty")
        value = value.strip()
        if len(value) > max_length:
            raise ValueError(f"{field} is too long")
        return value

    @staticmethod
    def _validate_health(value: str) -> str:
        return SubpolarIntegrationStore._validate_text(value, "health", max_length=100)

    def _validated_values(self, values: Mapping[str, Any]) -> dict[str, Any]:
        allowed = {
            "kind",
            "name",
            "provider",
            "endpoint",
            "credential_ref",
            "config",
            "enabled",
            "health",
            "schema_version",
        }
        unknown = set(values) - allowed
        if unknown:
            raise ValueError(f"unknown integration fields: {', '.join(sorted(unknown))}")
        result = dict(values)
        if "kind" in result:
            result["kind"] = self._validate_kind(result["kind"])
        if "name" in result:
            result["name"] = self._validate_text(result["name"], "name", max_length=200)
        if "provider" in result:
            result["provider"] = self._validate_text(result["provider"], "provider", max_length=200)
        if "endpoint" in result:
            result["endpoint"] = _validate_endpoint(result["endpoint"])
        if "credential_ref" in result:
            result["credential_ref"] = _validate_credential_ref(result["credential_ref"])
        if "config" in result:
            result["config"] = _validate_config(result["config"])
        if "enabled" in result and not isinstance(result["enabled"], bool):
            raise ValueError("enabled must be a boolean")
        if "health" in result:
            result["health"] = self._validate_health(result["health"])
        if "schema_version" in result:
            if not isinstance(result["schema_version"], int) or isinstance(result["schema_version"], bool):
                raise ValueError("schema_version must be a positive integer")
            if result["schema_version"] < 1:
                raise ValueError("schema_version must be a positive integer")
        return result

    def list_integrations(
        self,
        owner: str,
        *,
        search: str | None = None,
        kind: str | None = None,
        provider: str | None = None,
    ) -> list[dict[str, Any]]:
        if kind is not None:
            self._validate_kind(kind)
        clauses = ["owner = ?"]
        parameters: list[Any] = [owner]
        if search and search.strip():
            needle = f"%{search.strip()}%"
            clauses.append("(name LIKE ? OR provider LIKE ? OR kind LIKE ? OR endpoint LIKE ?)")
            parameters.extend([needle] * 4)
        if kind is not None:
            clauses.append("kind = ?")
            parameters.append(kind)
        if provider is not None:
            clauses.append("provider = ?")
            parameters.append(provider.strip())
        with self._connection() as connection:
            rows = connection.execute(
                f"SELECT * FROM integrations WHERE {' AND '.join(clauses)} ORDER BY name, id",
                parameters,
            ).fetchall()
        return [self._row(row) for row in rows]

    def search_integrations(self, owner: str, query: str) -> list[dict[str, Any]]:
        return self.list_integrations(owner, search=query)

    def get_integration(self, owner: str, integration_id: str) -> dict[str, Any] | None:
        with self._connection() as connection:
            row = connection.execute(
                "SELECT * FROM integrations WHERE owner = ? AND id = ?",
                (owner, integration_id),
            ).fetchone()
        return self._row(row) if row else None

    def create_integration(
        self,
        *,
        owner: str,
        kind: str,
        name: str,
        provider: str,
        endpoint: str | None = None,
        credential_ref: str | None = None,
        config: Mapping[str, Any] | None = None,
        enabled: bool = True,
        health: str = "unknown",
        schema_version: int = 1,
    ) -> dict[str, Any]:
        values = self._validated_values(
            {
                "kind": kind,
                "name": name,
                "provider": provider,
                "endpoint": endpoint,
                "credential_ref": credential_ref,
                "config": config,
                "enabled": enabled,
                "health": health,
                "schema_version": schema_version,
            }
        )
        integration_id = _new_id()
        try:
            with self._connection() as connection:
                connection.execute(
                    """
                    INSERT INTO integrations
                        (owner, id, kind, name, provider, endpoint, credential_ref,
                         config, enabled, health, schema_version)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        owner,
                        integration_id,
                        values["kind"],
                        values["name"],
                        values["provider"],
                        values["endpoint"],
                        values["credential_ref"],
                        json.dumps(values["config"], sort_keys=True, separators=(",", ":")),
                        int(values["enabled"]),
                        values["health"],
                        values["schema_version"],
                    ),
                )
                connection.commit()
        except sqlite3.IntegrityError as error:
            if "UNIQUE constraint failed: integrations.owner, integrations.name" in str(error):
                raise IntegrationConflict("integration name already exists for owner") from error
            raise IntegrationConflict("integration could not be created") from error
        result = self.get_integration(owner, integration_id)
        assert result is not None
        return result

    def update_integration(
        self,
        *,
        owner: str,
        integration_id: str,
        changes: Mapping[str, Any],
    ) -> dict[str, Any]:
        values = self._validated_values(changes)
        if not values:
            result = self.get_integration(owner, integration_id)
            if result is None:
                raise IntegrationNotFound("integration not found")
            return result
        columns = list(values)
        assignments = ", ".join(f"{column} = ?" for column in columns)
        parameters: list[Any] = [
            json.dumps(values[column], sort_keys=True, separators=(",", ":"))
            if column == "config"
            else int(values[column])
            if column == "enabled"
            else values[column]
            for column in columns
        ]
        parameters.extend([owner, integration_id])
        with self._connection() as connection:
            try:
                cursor = connection.execute(
                    f"UPDATE integrations SET {assignments} WHERE owner = ? AND id = ?",
                    parameters,
                )
            except sqlite3.IntegrityError as error:
                if "UNIQUE constraint failed: integrations.owner, integrations.name" in str(error):
                    raise IntegrationConflict("integration name already exists for owner") from error
                raise IntegrationConflict("integration could not be updated") from error
            if cursor.rowcount == 0:
                raise IntegrationNotFound("integration not found")
            connection.commit()
        result = self.get_integration(owner, integration_id)
        assert result is not None
        return result

    def delete_integration(self, *, owner: str, integration_id: str) -> None:
        with self._connection() as connection:
            cursor = connection.execute(
                "DELETE FROM integrations WHERE owner = ? AND id = ?",
                (owner, integration_id),
            )
            connection.commit()
        if cursor.rowcount == 0:
            raise IntegrationNotFound("integration not found")

    def health_integration(
        self,
        *,
        owner: str,
        integration_id: str,
        health: str | None = None,
    ) -> dict[str, Any]:
        if health is not None:
            return self.update_integration(
                owner=owner,
                integration_id=integration_id,
                changes={"health": health},
            )
        result = self.get_integration(owner, integration_id)
        if result is None:
            raise IntegrationNotFound("integration not found")
        return result

    def list_catalog(
        self,
        owner: str,
        *,
        search: str | None = None,
        kind: str | None = None,
        provider: str | None = None,
    ) -> list[dict[str, Any]]:
        records = self.list_integrations(owner, search=search, kind=kind, provider=provider)
        return [
            {
                "id": record["id"],
                "kind": record["kind"],
                "name": record["name"],
                "provider": record["provider"],
                "qualified_name": f"{record['provider']}:{record['name']}",
                "endpoint": record["endpoint"],
                "credential_ref": record["credential_ref"],
                "enabled": record["enabled"],
                "health": record["health"],
                "schema_version": record["schema_version"],
            }
            for record in records
        ]

    catalog = list_catalog


# Short alias follows AgentStore/SubpolarStore naming used by sibling modules.
IntegrationStore = SubpolarIntegrationStore


__all__ = [
    "INTEGRATION_KINDS",
    "IntegrationConflict",
    "IntegrationNotFound",
    "IntegrationStore",
    "IntegrationStoreError",
    "SubpolarIntegrationStore",
]
