"""Subpolar agent definition and stateless permission APIs."""
from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator

from hermes_cli.subpolar_agents import AgentNotFound, AgentStore, AgentStoreError
from hermes_cli.web_routers.subpolar import _mutation_guard, _owner

router = APIRouter()


class AgentMutation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    scope: Literal["global", "workspace"] | None = None
    workspace_id: str | None = Field(default=None, min_length=1, max_length=200)
    role: str | None = None
    parent_id: str | None = Field(default=None, min_length=1, max_length=100)
    name: str | None = Field(default=None, min_length=1, max_length=200)
    instructions: str | None = None
    include_system_prompt: bool | None = None
    model: str | None = Field(default=None, max_length=500)
    tools: list[Any] | None = None
    skills: list[str] | None = None
    permissions: dict[str, Any] | None = None
    overrides: dict[str, Any] | None = None
    aliases: dict[str, Any] | None = None
    archived: bool | None = None

    @field_validator("role", "instructions", "model")
    @classmethod
    def strip_text(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None


class AgentCreate(AgentMutation):
    name: str = Field(min_length=1, max_length=200)
    include_system_prompt: bool = True
    archived: bool = False


class AgentFork(BaseModel):
    model_config = ConfigDict(extra="forbid")

    workspace_id: str = Field(min_length=1, max_length=200)
    name: str | None = Field(default=None, min_length=1, max_length=200)
    role: str | None = None
    instructions: str | None = None
    include_system_prompt: bool | None = None
    model: str | None = Field(default=None, max_length=500)
    tools: list[Any] | None = None
    skills: list[str] | None = None
    permissions: dict[str, Any] | None = None
    overrides: dict[str, Any] | None = None
    aliases: dict[str, Any] | None = None


def _store() -> AgentStore:
    return AgentStore()


def _public_agent(agent: dict[str, Any]) -> dict[str, Any]:
    result = dict(agent)
    aliases = result.get("overrides", {}).get("aliases", {})
    result["aliases"] = aliases if isinstance(aliases, dict) else {}
    return result


def _error(error: Exception) -> None:
    if isinstance(error, AgentNotFound):
        raise HTTPException(status_code=404, detail=str(error)) from error
    if isinstance(error, (AgentStoreError, ValueError)):
        raise HTTPException(status_code=400, detail=str(error)) from error
    raise error


@router.get("/api/subpolar/agents")
def list_agents(request: Request) -> dict[str, list[dict[str, Any]]]:
    owner = _owner(request)
    store = _store()
    return {"agents": [_public_agent(agent) for agent in store.list_agents(owner)]}


@router.post("/api/subpolar/agents", status_code=201)
def create_agent(request: Request, body: AgentCreate) -> dict[str, Any]:
    _mutation_guard(request)
    try:
        return _public_agent(_store().create_agent(owner=_owner(request), values=body.model_dump(exclude_unset=True)))
    except Exception as error:
        _error(error)
        raise AssertionError("unreachable")


@router.get("/api/subpolar/agents/{agent_id}/effective")
def effective_agent(
    request: Request,
    agent_id: str,
    workspace_id: str | None = Query(default=None),
    mode: Literal["normal", "scheduled"] = "normal",
) -> dict[str, Any]:
    try:
        return _public_agent(_store().effective_agent(
            owner=_owner(request), agent_id=agent_id, workspace_id=workspace_id, mode=mode
        ))
    except Exception as error:
        _error(error)
        raise AssertionError("unreachable")


@router.get("/api/subpolar/agents/{agent_id}")
def get_agent(request: Request, agent_id: str) -> dict[str, Any]:
    agent = _store().get_agent(_owner(request), agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="agent not found")
    return _public_agent(agent)


@router.patch("/api/subpolar/agents/{agent_id}")
def patch_agent(
    request: Request,
    agent_id: str,
    body: AgentMutation,
    workspace_id: str | None = Query(default=None),
) -> dict[str, Any]:
    _mutation_guard(request)
    try:
        return _public_agent(_store().update_agent(
            owner=_owner(request), agent_id=agent_id,
            changes=body.model_dump(exclude_unset=True), workspace_id=workspace_id,
        ))
    except Exception as error:
        _error(error)
        raise AssertionError("unreachable")


@router.delete("/api/subpolar/agents/{agent_id}")
def delete_agent(request: Request, agent_id: str) -> dict[str, bool]:
    _mutation_guard(request)
    try:
        _store().delete_agent(owner=_owner(request), agent_id=agent_id)
    except Exception as error:
        _error(error)
    return {"ok": True}


@router.post("/api/subpolar/agents/{agent_id}/fork", status_code=201)
def fork_agent(request: Request, agent_id: str, body: AgentFork) -> dict[str, Any]:
    _mutation_guard(request)
    try:
        changes = body.model_dump(exclude_unset=True)
        changes.pop("workspace_id", None)
        return _public_agent(_store().fork_agent(
            owner=_owner(request), agent_id=agent_id, workspace_id=body.workspace_id, changes=changes
        ))
    except Exception as error:
        _error(error)
        raise AssertionError("unreachable")


@router.get("/api/subpolar/tools")
def list_subpolar_tools(
    request: Request,
    search: str | None = Query(default=None),
    q: str | None = Query(default=None),
    query: str | None = Query(default=None),
) -> dict[str, list[dict[str, Any]]]:
    _owner(request)
    needle = (search or q or query or "").strip().lower()
    records: list[dict[str, Any]] = []
    try:
        from tools.registry import registry

        entries = registry._snapshot_entries()
        aliases = registry.get_registered_toolset_aliases()
    except Exception:
        entries, aliases = [], {}
    for entry in entries:
        canonical = f"{entry.toolset}.{entry.name}"
        exposed_aliases = [f"{alias}.{entry.name}" for alias, target in aliases.items() if target == entry.toolset]
        record = {
            "id": canonical,
            "canonical_id": canonical,
            "provider": entry.toolset,
            "name": entry.name,
            "description": entry.description or "",
            "aliases": exposed_aliases,
        }
        if not needle or needle in " ".join(str(value).lower() for value in record.values()):
            records.append(record)
    records.sort(key=lambda item: item["id"])
    return {"tools": records}
