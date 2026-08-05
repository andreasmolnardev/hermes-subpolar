"""Owner-scoped Subpolar agent definitions and permission resolution.

Agent definitions deliberately live beside, rather than inside, the existing
Subpolar metadata store.  Both stores use the same SQLite file and WAL mode.
This module contains no execution or credential handling.
"""
from __future__ import annotations

import json
import os
import re
import sqlite3
import uuid
from contextlib import contextmanager
from copy import deepcopy
from pathlib import Path
from typing import Any, Iterator, Mapping

from hermes_constants import get_hermes_home


class AgentStoreError(Exception):
    """Base error for agent definition validation and storage."""


class AgentNotFound(AgentStoreError):
    """Agent is absent or belongs to another owner."""


class AgentConflict(AgentStoreError):
    """Agent relationship or scope is invalid."""


_SCOPES = frozenset({"global", "workspace"})
_DECISIONS = {"deny": 0, "ask": 1, "auto": 2, "allow": 3}
_DECISION_NAMES = ("deny", "ask", "auto", "allow")
_CANONICAL_TOOL = re.compile(r"^[A-Za-z0-9_-]+\.[A-Za-z0-9_.-]+$")
_SECRET_KEYS = frozenset(
    {"api_key", "apikey", "authorization", "credential", "password", "secret", "token"}
)
_AGENT_FIELDS = (
    "scope",
    "workspace_id",
    "role",
    "parent_id",
    "name",
    "instructions",
    "include_system_prompt",
    "model",
    "tools",
    "skills",
    "permissions",
    "overrides",
    "archived",
)
_INHERITABLE_FIELDS = (
    "role",
    "name",
    "instructions",
    "include_system_prompt",
    "model",
    "tools",
    "skills",
    "permissions",
)


def _explicit_fields(agent: Mapping[str, Any]) -> set[str]:
    overrides = agent.get("overrides")
    fields = overrides.get("_fields") if isinstance(overrides, Mapping) else None
    if isinstance(fields, list):
        result = {item for item in fields if item in _INHERITABLE_FIELDS}
    else:
        result = set(_INHERITABLE_FIELDS)
    if isinstance(overrides, Mapping):
        result.update(item for item in overrides if item in _INHERITABLE_FIELDS)
    return result


def _new_id() -> str:
    return uuid.uuid4().hex


def _json(value: Any) -> str:
    return json.dumps(value, separators=(",", ":"), sort_keys=True)


def _decode(row: sqlite3.Row) -> dict[str, Any]:
    result = dict(row)
    for field in ("tools", "skills", "permissions", "overrides"):
        result[field] = json.loads(result[field])
    result["include_system_prompt"] = bool(result["include_system_prompt"])
    result["archived"] = bool(result["archived"])
    return result


def _contains_secret(value: Any) -> bool:
    if isinstance(value, Mapping):
        return any(
            str(key).lower().replace("-", "_") in _SECRET_KEYS
            or _contains_secret(item)
            for key, item in value.items()
        )
    if isinstance(value, (list, tuple)):
        return any(_contains_secret(item) for item in value)
    return False


def validate_tool_id(value: str) -> str:
    """Validate canonical ``provider.tool_name`` identity, not an alias."""
    if not isinstance(value, str) or not _CANONICAL_TOOL.fullmatch(value.strip()):
        raise ValueError("tools must use canonical provider.tool_name IDs")
    return value.strip()


def _normalise_tools(value: Any) -> list[str]:
    """Accept canonical IDs, while rejecting aliases as tool identities.

    Alias records are accepted as ``{"id": canonical, "alias": exposed}``
    for callers that need them, but only canonical IDs are persisted in the
    ``tools`` column.  Exposed aliases remain in ``overrides.aliases``.
    """
    if value is None:
        return []
    if not isinstance(value, list):
        raise ValueError("tools must be a list of canonical IDs")
    canonical: list[str] = []
    for item in value:
        if isinstance(item, str):
            tool_id = validate_tool_id(item)
        elif isinstance(item, Mapping) and "id" in item:
            tool_id = validate_tool_id(item["id"])
            alias = item.get("alias", item.get("name"))
            if alias is not None and (
                not isinstance(alias, str) or not alias.strip() or "." in alias
            ):
                raise ValueError("tool aliases must be separate exposed names")
        else:
            raise ValueError("tools must contain canonical IDs")
        if tool_id not in canonical:
            canonical.append(tool_id)
    return canonical


def _normalise_aliases(value: Any) -> dict[str, list[str]]:
    if not isinstance(value, Mapping):
        raise ValueError("aliases must be an object")
    result: dict[str, list[str]] = {}
    for key, raw_value in value.items():
        if _CANONICAL_TOOL.fullmatch(str(key)):
            canonical = validate_tool_id(str(key))
            aliases = raw_value if isinstance(raw_value, list) else [raw_value]
        else:
            alias = str(key).strip()
            canonical = validate_tool_id(str(raw_value))
            aliases = [alias]
        for alias in aliases:
            if not isinstance(alias, str) or not alias.strip() or "." in alias:
                raise ValueError("aliases must be separate exposed names")
        result.setdefault(canonical, []).extend(alias.strip() for alias in aliases)
    return {key: list(dict.fromkeys(value)) for key, value in result.items()}


def _deep_merge(parent: Any, child: Any) -> Any:
    if isinstance(parent, Mapping) and isinstance(child, Mapping):
        merged = deepcopy(dict(parent))
        for key, value in child.items():
            merged[key] = _deep_merge(merged[key], value) if key in merged else deepcopy(value)
        return merged
    return deepcopy(child)


def _permission_map(value: Any) -> dict[str, str]:
    if not isinstance(value, Mapping):
        return {}
    tools = value.get("tools")
    if isinstance(tools, Mapping):
        source = tools
    elif isinstance(value.get("normal"), Mapping):
        source = value["normal"]
    else:
        source = {key: item for key, item in value.items() if isinstance(item, str)}
    result: dict[str, str] = {}
    for tool, decision in source.items():
        tool_id = validate_tool_id(str(tool))
        if decision not in _DECISIONS:
            raise ValueError("tool permissions must be deny, ask, auto, or allow")
        result[tool_id] = decision
    return result


def _scheduled_map(value: Any) -> dict[str, str]:
    if not isinstance(value, Mapping):
        return {}
    source = value.get("scheduled")
    if not isinstance(source, Mapping):
        source = value.get("scheduled_policy")
    if not isinstance(source, Mapping):
        return {}
    result: dict[str, str] = {}
    for tool, decision in source.items():
        tool_id = validate_tool_id(str(tool))
        if decision not in {"ask", "deny"}:
            raise ValueError("scheduled tool policy must be ask or deny")
        result[tool_id] = decision
    return result


def resolve_permissions(
    permissions: Mapping[str, Any] | None,
    *,
    parent: Mapping[str, Any] | None = None,
    mode: str = "normal",
) -> dict[str, str]:
    """Resolve permissions without state or approval side effects.

    Normal inheritance is restrictive: a child cannot widen a parent's
    decision.  Scheduled policy explicitly maps potentially interactive
    decisions to ``ask`` or ``deny``; absent policy fails closed to ``deny``.
    The returned ``ask`` decision is declarative only and never waits for UI.
    """
    if mode not in {"normal", "scheduled"}:
        raise ValueError("mode must be normal or scheduled")
    parent_map = _permission_map(parent or {})
    own_map = _permission_map(permissions or {})
    if mode == "normal":
        result = dict(parent_map)
        for tool, decision in own_map.items():
            if tool in result:
                decision = _DECISION_NAMES[
                    min(_DECISIONS[result[tool]], _DECISIONS[decision])
                ]
            result[tool] = decision
        return result

    scheduled = _scheduled_map(permissions or {})
    scheduled_parent = _scheduled_map(parent or {})
    normal = resolve_permissions(permissions, parent=parent, mode="normal")
    result: dict[str, str] = {}
    for tool, decision in normal.items():
        if decision in {"auto", "allow"}:
            result[tool] = scheduled.get(tool, scheduled_parent.get(tool, "deny"))
        else:
            result[tool] = decision
    return result


def resolve_effective_permissions(
    permissions: Mapping[str, Any] | None,
    *,
    parent: Mapping[str, Any] | None = None,
    mode: str = "normal",
) -> dict[str, str]:
    """Named alias for callers resolving one effective permission map."""
    return resolve_permissions(permissions, parent=parent, mode=mode)


class AgentStore:
    """SQLite agent definitions sharing ``subpolar.db`` with SubpolarStore."""

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
            connection.execute("PRAGMA foreign_keys = ON")
            yield connection
        finally:
            connection.close()

    def _initialize(self) -> None:
        with self._connection() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS agents (
                    id TEXT PRIMARY KEY,
                    owner TEXT NOT NULL,
                    scope TEXT NOT NULL CHECK (scope IN ('global', 'workspace')),
                    workspace_id TEXT,
                    role TEXT,
                    parent_id TEXT,
                    name TEXT NOT NULL,
                    instructions TEXT NOT NULL,
                    include_system_prompt INTEGER NOT NULL CHECK (include_system_prompt IN (0, 1)),
                    model TEXT,
                    tools TEXT NOT NULL,
                    skills TEXT NOT NULL,
                    permissions TEXT NOT NULL,
                    overrides TEXT NOT NULL,
                    archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))
                );
                CREATE INDEX IF NOT EXISTS agents_owner_idx ON agents(owner);
                CREATE INDEX IF NOT EXISTS agents_owner_workspace_idx ON agents(owner, workspace_id);
                """
            )

    def _get(self, connection: sqlite3.Connection, owner: str, agent_id: str) -> dict[str, Any] | None:
        row = connection.execute(
            "SELECT * FROM agents WHERE owner = ? AND id = ?", (owner, agent_id)
        ).fetchone()
        return _decode(row) if row else None

    def get_agent(self, owner: str, agent_id: str) -> dict[str, Any] | None:
        with self._connection() as connection:
            return self._get(connection, owner, agent_id)

    def list_agents(self, owner: str) -> list[dict[str, Any]]:
        self.ensure_master(owner)
        with self._connection() as connection:
            rows = connection.execute(
                "SELECT * FROM agents WHERE owner = ? ORDER BY scope, name, id", (owner,)
            ).fetchall()
        return [_decode(row) for row in rows]

    def ensure_master(self, owner: str) -> dict[str, Any]:
        with self._connection() as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute(
                "SELECT * FROM agents WHERE owner = ? AND scope = 'global' AND name = 'master' "
                "ORDER BY id LIMIT 1",
                (owner,),
            ).fetchone()
            if row is None:
                agent_id = _new_id()
                connection.execute(
                    """INSERT INTO agents
                    (id, owner, scope, workspace_id, role, parent_id, name,
                     instructions, include_system_prompt, model, tools, skills,
                     permissions, overrides, archived)
                    VALUES (?, ?, 'global', NULL, NULL, NULL, 'master', '', 1, NULL, ?, ?, ?, ?, 0)""",
                    (agent_id, owner, _json([]), _json([]), _json({"tools": {}, "scheduled": {}}), _json({})),
                )
            connection.commit()
            result = connection.execute(
                "SELECT * FROM agents WHERE owner = ? AND scope = 'global' AND name = 'master' "
                "ORDER BY id LIMIT 1", (owner,)
            ).fetchone()
            assert result is not None
            return _decode(result)

    @staticmethod
    def _validate_payload(payload: Mapping[str, Any], *, partial: bool = False) -> dict[str, Any]:
        unknown = set(payload) - set(_AGENT_FIELDS) - {"aliases"}
        if unknown:
            raise ValueError(f"unsupported agent fields: {', '.join(sorted(unknown))}")
        values = dict(payload)
        if "scope" in values and values["scope"] not in _SCOPES:
            raise ValueError("scope must be global or workspace")
        for field in ("include_system_prompt", "archived"):
            if field in values and not isinstance(values[field], bool):
                raise ValueError(f"{field} must be boolean")
        if values.get("scope") == "global" and values.get("workspace_id") is not None:
            raise ValueError("global agents cannot have workspace_id")
        if values.get("scope") == "workspace" and not values.get("workspace_id"):
            raise ValueError("workspace agents require workspace_id")
        if "tools" in values:
            raw_tools = values["tools"]
            values["tools"] = _normalise_tools(raw_tools)
            tool_aliases: dict[str, list[str]] = {}
            for item in raw_tools:
                if isinstance(item, Mapping):
                    alias = item.get("alias", item.get("name"))
                    if alias is not None:
                        tool_aliases.setdefault(item["id"], []).append(alias)
            if tool_aliases:
                overrides = dict(values.get("overrides") or {})
                overrides["aliases"] = _deep_merge(overrides.get("aliases", {}), tool_aliases)
                values["overrides"] = overrides
        if "skills" in values:
            if not isinstance(values["skills"], list) or any(not isinstance(item, str) for item in values["skills"]):
                raise ValueError("skills must be a list of names")
            values["skills"] = list(dict.fromkeys(values["skills"]))
        for field in ("permissions", "overrides"):
            if field in values and not isinstance(values[field], Mapping):
                raise ValueError(f"{field} must be an object")
        if "permissions" in values:
            _permission_map(values["permissions"])
            _scheduled_map(values["permissions"])
        if "aliases" in values:
            aliases = _normalise_aliases(values.pop("aliases"))
            overrides = dict(values.get("overrides") or {})
            overrides["aliases"] = dict(aliases)
            values["overrides"] = overrides
        if _contains_secret(values):
            raise ValueError("agent definitions must not contain credentials")
        if not partial and not values.get("name", "").strip():
            raise ValueError("name is required")
        return values

    def create_agent(
        self,
        *,
        owner: str,
        values: Mapping[str, Any],
        _explicit_fields: set[str] | None = None,
    ) -> dict[str, Any]:
        values = self._validate_payload(values)
        explicit_fields = (
            set(values) & set(_INHERITABLE_FIELDS)
            if _explicit_fields is None
            else set(_explicit_fields) & set(_INHERITABLE_FIELDS)
        )
        scope = values.get("scope", "global")
        workspace_id = values.get("workspace_id")
        if scope == "workspace" and not workspace_id:
            raise ValueError("workspace agents require workspace_id")
        if scope == "global":
            workspace_id = None
        parent_id = values.get("parent_id")
        if scope == "workspace" and parent_id is None:
            parent_id = self.ensure_master(owner)["id"]
        with self._connection() as connection:
            connection.execute("BEGIN IMMEDIATE")
            if scope == "global" and values.get("name") == "master":
                existing = connection.execute(
                    "SELECT 1 FROM agents WHERE owner = ? AND scope = 'global' AND name = 'master' LIMIT 1",
                    (owner,),
                ).fetchone()
                if existing is not None:
                    raise AgentConflict("global master already exists")
            if parent_id:
                parent = self._get(connection, owner, parent_id)
                if parent is None:
                    raise AgentConflict("parent agent not found")
            agent_id = _new_id()
            row_values = {
                "role": values.get("role"),
                "parent_id": parent_id,
                "name": values.get("name"),
                "instructions": values.get("instructions", ""),
                "include_system_prompt": values.get("include_system_prompt", True),
                "model": values.get("model"),
                "tools": values.get("tools", []),
                "skills": values.get("skills", []),
                "permissions": values.get("permissions", {}),
                "overrides": values.get("overrides", {}),
                "archived": values.get("archived", False),
            }
            row_values["overrides"] = dict(row_values["overrides"])
            row_values["overrides"]["_fields"] = sorted(explicit_fields)
            connection.execute(
                """INSERT INTO agents
                (id, owner, scope, workspace_id, role, parent_id, name,
                 instructions, include_system_prompt, model, tools, skills,
                 permissions, overrides, archived)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    agent_id, owner, scope, workspace_id, row_values["role"], parent_id,
                    row_values["name"], row_values["instructions"],
                    int(row_values["include_system_prompt"]), row_values["model"],
                    _json(row_values["tools"]), _json(row_values["skills"]),
                    _json(row_values["permissions"]), _json(row_values["overrides"]),
                    int(row_values["archived"]),
                ),
            )
            connection.commit()
            result = self._get(connection, owner, agent_id)
            assert result is not None
            return result

    def fork_agent(self, *, owner: str, agent_id: str, workspace_id: str, changes: Mapping[str, Any] | None = None) -> dict[str, Any]:
        source = self.get_agent(owner, agent_id)
        if source is None:
            raise AgentNotFound("agent not found")
        if not workspace_id:
            raise ValueError("workspace_id is required")
        values: dict[str, Any] = {
            field: deepcopy(source[field]) for field in _INHERITABLE_FIELDS
        }
        values.update({"scope": "workspace", "workspace_id": workspace_id, "parent_id": source["id"]})
        values["overrides"] = {}
        explicit_fields: set[str] = set()
        if changes:
            patch = self._validate_payload(changes, partial=True)
            if patch.get("scope") == "global":
                raise ValueError("fork must be a workspace agent")
            values.update({key: deepcopy(value) for key, value in patch.items() if key not in {"id", "owner"}})
            values["scope"] = "workspace"
            values["workspace_id"] = workspace_id
            values["parent_id"] = source["id"]
            explicit_fields = set(patch) & set(_INHERITABLE_FIELDS)
        values["overrides"] = {"_fields": sorted(explicit_fields)}
        return self.create_agent(owner=owner, values=values, _explicit_fields=explicit_fields)

    def update_agent(
        self, *, owner: str, agent_id: str, changes: Mapping[str, Any], workspace_id: str | None = None
    ) -> dict[str, Any]:
        current = self.get_agent(owner, agent_id)
        if current is None:
            raise AgentNotFound("agent not found")
        if current["scope"] == "global" and workspace_id:
            return self.fork_agent(owner=owner, agent_id=agent_id, workspace_id=workspace_id, changes=changes)
        values = self._validate_payload(changes, partial=True)
        if values.get("scope") and values["scope"] != current["scope"]:
            raise ValueError("agent scope cannot be changed")
        if current["scope"] == "workspace" and values.get("workspace_id", current["workspace_id"]) != current["workspace_id"]:
            raise ValueError("workspace agent cannot move workspace")
        assignments: list[str] = []
        params: list[Any] = []
        for field in _AGENT_FIELDS:
            if field not in values or field in {"scope", "workspace_id"}:
                continue
            assignments.append(f"{field} = ?")
            item = values[field]
            if field in {"tools", "skills", "permissions", "overrides"}:
                item = _json(item)
            elif field in {"include_system_prompt", "archived"}:
                item = int(item)
            params.append(item)
        if not assignments:
            return current
        params.extend((agent_id, owner))
        with self._connection() as connection:
            connection.execute("BEGIN IMMEDIATE")
            cursor = connection.execute(
                f"UPDATE agents SET {', '.join(assignments)} WHERE id = ? AND owner = ?", params
            )
            if cursor.rowcount != 1:
                connection.rollback()
                raise AgentNotFound("agent not found")
            connection.commit()
        result = self.get_agent(owner, agent_id)
        assert result is not None
        return result

    def delete_agent(self, *, owner: str, agent_id: str) -> None:
        with self._connection() as connection:
            connection.execute("BEGIN IMMEDIATE")
            cursor = connection.execute(
                "UPDATE agents SET archived = 1 WHERE id = ? AND owner = ?", (agent_id, owner)
            )
            if cursor.rowcount != 1:
                connection.rollback()
                raise AgentNotFound("agent not found")
            connection.commit()

    def _chain(self, owner: str, agent_id: str) -> list[dict[str, Any]]:
        chain: list[dict[str, Any]] = []
        seen: set[str] = set()
        current_id: str | None = agent_id
        while current_id:
            if current_id in seen:
                raise AgentConflict("agent inheritance cycle")
            seen.add(current_id)
            current = self.get_agent(owner, current_id)
            if current is None:
                raise AgentNotFound("parent agent not found")
            chain.append(current)
            current_id = current["parent_id"]
        chain.reverse()
        return chain

    def effective_agent(self, *, owner: str, agent_id: str, workspace_id: str | None = None, mode: str = "normal") -> dict[str, Any]:
        requested = self.get_agent(owner, agent_id)
        if requested is None:
            raise AgentNotFound("agent not found")
        selected = requested
        if workspace_id and requested["scope"] == "global":
            candidates = [
                item for item in self.list_agents(owner)
                if item["scope"] == "workspace" and item["workspace_id"] == workspace_id and not item["archived"]
            ]
            for candidate in candidates:
                if any(item["id"] == requested["id"] for item in self._chain(owner, candidate["id"])):
                    selected = candidate
                    break
        chain = self._chain(owner, selected["id"])
        effective = deepcopy(chain[0])
        for item in chain[1:]:
            explicit_fields = _explicit_fields(item)
            for field in _INHERITABLE_FIELDS:
                if field == "permissions" or field not in explicit_fields:
                    continue
                effective[field] = _deep_merge(effective[field], item[field])
            scheduled = _scheduled_map(effective.get("permissions"))
            for tool, decision in _scheduled_map(item["permissions"]).items():
                if tool in scheduled:
                    decision = "deny" if "deny" in {scheduled[tool], decision} else "ask"
                scheduled[tool] = decision
            effective["permissions"] = {
                "tools": resolve_permissions(
                    item["permissions"], parent=effective.get("permissions"), mode="normal"
                ),
                "scheduled": scheduled,
            }
            effective["overrides"] = _deep_merge(effective.get("overrides", {}), item["overrides"])
        effective["permissions"] = {
            "tools": resolve_permissions(
                effective.get("permissions"), mode=mode
            ) if mode == "normal" else resolve_permissions(effective.get("permissions"), mode="scheduled"),
            "scheduled": _scheduled_map(effective.get("permissions")),
        }
        effective["source_id"] = selected["id"]
        effective["requested_id"] = requested["id"]
        effective["workspace_id"] = workspace_id or selected["workspace_id"]
        return effective


__all__ = [
    "AgentConflict",
    "AgentNotFound",
    "AgentStore",
    "AgentStoreError",
    "resolve_permissions",
    "resolve_effective_permissions",
    "validate_tool_id",
]
