"""Owner-scoped Subpolar scheduled-task API."""
from __future__ import annotations

import asyncio
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator

from hermes_cli.subpolar_schedules import (
    ScheduleConflict,
    ScheduleNotFound,
    ScheduleStoreError,
    SubpolarScheduleService,
)
from hermes_cli.web_routers.subpolar import _mutation_guard, _owner

router = APIRouter()


class ScheduleCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=200)
    prompt: str = Field(min_length=1, max_length=100_000)
    schedule: str = Field(min_length=1, max_length=500)
    workspace_id: str = Field(min_length=1, max_length=200)
    worktree_id: str | None = Field(default=None, max_length=200)
    agent_id: str = Field(min_length=1, max_length=200)
    model: str | None = Field(default=None, max_length=500)
    permission_mode: Literal["scheduled"] = "scheduled"
    timezone: str | None = Field(default=None, max_length=100)
    enabled: bool = True
    draft_json: dict[str, Any] | None = None

    @field_validator("name", "prompt", "schedule", "workspace_id", "worktree_id", "agent_id", "model", "timezone")
    @classmethod
    def strip_text(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None


class SchedulePatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=200)
    prompt: str | None = Field(default=None, min_length=1, max_length=100_000)
    schedule: str | None = Field(default=None, min_length=1, max_length=500)
    workspace_id: str | None = Field(default=None, max_length=200)
    worktree_id: str | None = Field(default=None, max_length=200)
    agent_id: str | None = Field(default=None, max_length=200)
    model: str | None = Field(default=None, max_length=500)
    timezone: str | None = Field(default=None, max_length=100)
    enabled: bool | None = None
    draft_json: dict[str, Any] | None = None

    @field_validator("name", "prompt", "schedule", "workspace_id", "worktree_id", "agent_id", "model", "timezone")
    @classmethod
    def strip_text(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None


class DraftBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    draft_json: dict[str, Any]


def _service() -> SubpolarScheduleService:
    return SubpolarScheduleService()


def _error(error: Exception) -> None:
    if isinstance(error, ScheduleNotFound):
        raise HTTPException(status_code=404, detail=str(error)) from error
    if isinstance(error, (ScheduleConflict, ScheduleStoreError, ValueError)):
        raise HTTPException(status_code=400, detail=str(error)) from error
    raise error


async def _run(call, *args, **kwargs):
    try:
        return await asyncio.to_thread(call, *args, **kwargs)
    except Exception as error:
        _error(error)
        raise AssertionError("unreachable")


def _service_call(method: str, *args, **kwargs):
    return getattr(_service(), method)(*args, **kwargs)


@router.get("/api/subpolar/schedules")
async def list_schedules(request: Request) -> dict[str, list[dict[str, Any]]]:
    return {"tasks": await _run(_service_call, "list", _owner(request))}


@router.post("/api/subpolar/schedules", status_code=201)
async def create_schedule(request: Request, body: ScheduleCreate) -> dict[str, Any]:
    _mutation_guard(request)
    return await _run(
        _service_call,
        "create",
        owner=_owner(request),
        values=body.model_dump(exclude_unset=True),
    )


@router.post("/api/subpolar/schedules/drafts", status_code=201)
async def create_schedule_draft(request: Request, body: ScheduleCreate) -> dict[str, Any]:
    _mutation_guard(request)
    return await _run(
        _service_call,
        "create",
        owner=_owner(request),
        values=body.model_dump(exclude_unset=True),
        draft=True,
    )


@router.get("/api/subpolar/schedules/{task_id}")
async def get_schedule(request: Request, task_id: str) -> dict[str, Any]:
    return await _run(_service_call, "get", _owner(request), task_id)


@router.patch("/api/subpolar/schedules/{task_id}")
async def patch_schedule(request: Request, task_id: str, body: SchedulePatch) -> dict[str, Any]:
    _mutation_guard(request)
    return await _run(
        _service_call,
        "update",
        owner=_owner(request),
        task_id=task_id,
        changes=body.model_dump(exclude_unset=True),
    )


@router.delete("/api/subpolar/schedules/{task_id}")
async def delete_schedule(request: Request, task_id: str) -> dict[str, bool]:
    _mutation_guard(request)
    await _run(_service_call, "delete", owner=_owner(request), task_id=task_id)
    return {"ok": True}


@router.post("/api/subpolar/schedules/{task_id}/run-now")
async def run_schedule_now(request: Request, task_id: str) -> dict[str, Any]:
    _mutation_guard(request)
    return await _run(_service_call, "run_now", owner=_owner(request), task_id=task_id)


@router.post("/api/subpolar/schedules/{task_id}/enable")
async def enable_schedule(request: Request, task_id: str) -> dict[str, Any]:
    _mutation_guard(request)
    return await _run(_service_call, "set_enabled", owner=_owner(request), task_id=task_id, enabled=True)


@router.post("/api/subpolar/schedules/{task_id}/disable")
async def disable_schedule(request: Request, task_id: str) -> dict[str, Any]:
    _mutation_guard(request)
    return await _run(_service_call, "set_enabled", owner=_owner(request), task_id=task_id, enabled=False)


@router.get("/api/subpolar/schedules/{task_id}/runs")
async def schedule_runs(request: Request, task_id: str) -> dict[str, Any]:
    return await _run(_service_call, "runs_summary", owner=_owner(request), task_id=task_id)


@router.put("/api/subpolar/schedules/{task_id}/draft")
@router.post("/api/subpolar/schedules/{task_id}/draft")
async def save_schedule_draft(request: Request, task_id: str, body: DraftBody) -> dict[str, Any]:
    _mutation_guard(request)
    return await _run(
        _service_call,
        "save_draft",
        owner=_owner(request),
        task_id=task_id,
        draft=body.draft_json,
    )


@router.delete("/api/subpolar/schedules/{task_id}/draft")
async def discard_schedule_draft(request: Request, task_id: str) -> dict[str, Any]:
    _mutation_guard(request)
    return await _run(_service_call, "discard_draft", owner=_owner(request), task_id=task_id)


@router.post("/api/subpolar/schedules/{task_id}/publish")
async def publish_schedule(request: Request, task_id: str) -> dict[str, Any]:
    _mutation_guard(request)
    return await _run(_service_call, "publish", owner=_owner(request), task_id=task_id)


__all__ = ["router"]
