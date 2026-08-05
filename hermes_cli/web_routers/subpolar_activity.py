"""Standalone Subpolar activity and security-audit API."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator

from hermes_cli.subpolar_activity import (
    EVENT_KINDS,
    ActivityConflict,
    ActivityNotFound,
    ActivityStore,
    AuditStore,
    MAX_DETAILS_BYTES,
    MAX_RESULT_BYTES,
)
from hermes_cli.web_routers.subpolar import _mutation_guard, _owner

router = APIRouter()


class ActivityCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str | None = Field(default=None, min_length=1, max_length=200)
    workspace_id: str | None = Field(default=None, max_length=200)
    session_id: str | None = Field(default=None, max_length=200)
    task_id: str | None = Field(default=None, max_length=200)
    kind: str
    label: str = Field(min_length=1, max_length=500)
    status: str | None = Field(default=None, max_length=100)
    started_at: str | None = Field(default=None, max_length=100)
    ended_at: str | None = Field(default=None, max_length=100)
    duration_ms: int | None = Field(default=None, ge=0)
    details: dict[str, Any] = Field(default_factory=dict)
    artifact_id: str | None = Field(default=None, max_length=200)

    @field_validator("id", "workspace_id", "session_id", "task_id", "status", "started_at", "ended_at", "artifact_id")
    @classmethod
    def strip_optional(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None

    @field_validator("kind")
    @classmethod
    def valid_kind(cls, value: str) -> str:
        value = value.strip()
        if value not in EVENT_KINDS:
            raise ValueError("kind is invalid")
        return value


class ActivityPatch(ActivityCreate):
    kind: str | None = None
    label: str | None = Field(default=None, min_length=1, max_length=500)


class AuditCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str | None = Field(default=None, min_length=1, max_length=200)
    actor: str = Field(min_length=1, max_length=200)
    action: str = Field(min_length=1, max_length=300)
    resource: str = Field(min_length=1, max_length=500)
    workspace_id: str | None = Field(default=None, max_length=200)
    result: str = Field(default="success", max_length=MAX_RESULT_BYTES)
    timestamp: str | None = Field(default=None, max_length=100)
    redacted_details: dict[str, Any] = Field(default_factory=dict)

    @field_validator("id", "actor", "action", "resource", "workspace_id", "timestamp")
    @classmethod
    def strip_text(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None


def _activity_store() -> ActivityStore:
    return ActivityStore()


def _audit_store() -> AuditStore:
    return AuditStore()


def _error(error: Exception) -> None:
    if isinstance(error, ActivityNotFound):
        raise HTTPException(status_code=404, detail=str(error)) from error
    if isinstance(error, (ActivityConflict, ValueError)):
        raise HTTPException(status_code=400, detail=str(error)) from error
    raise error


@router.post("/api/subpolar/activity", status_code=201)
@router.post("/api/subpolar/activities", status_code=201)
def append_activity(request: Request, body: ActivityCreate) -> dict[str, Any]:
    _mutation_guard(request)
    try:
        return _activity_store().append_activity(owner=_owner(request), values=body.model_dump())
    except Exception as error:
        _error(error)
        raise AssertionError("unreachable")


@router.get("/api/subpolar/activity")
@router.get("/api/subpolar/activities")
def list_activity(
    request: Request,
    workspace_id: str | None = Query(default=None),
    cursor: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
) -> dict[str, Any]:
    try:
        page = _activity_store().list_activity(
            owner=_owner(request), workspace_id=workspace_id, cursor=cursor, limit=limit
        )
    except Exception as error:
        _error(error)
        raise AssertionError("unreachable")
    return {"activities": page["items"], "next_cursor": page["next_cursor"]}


@router.get("/api/subpolar/activity/{activity_id}")
@router.get("/api/subpolar/activities/{activity_id}")
def get_activity(request: Request, activity_id: str) -> dict[str, Any]:
    result = _activity_store().get_activity(owner=_owner(request), activity_id=activity_id)
    if result is None:
        raise HTTPException(status_code=404, detail="activity not found")
    return result


@router.patch("/api/subpolar/activity/{activity_id}")
def update_activity(request: Request, activity_id: str, body: ActivityPatch) -> dict[str, Any]:
    _mutation_guard(request)
    try:
        return _activity_store().update_activity(
            owner=_owner(request), activity_id=activity_id,
            changes=body.model_dump(exclude_unset=True),
        )
    except Exception as error:
        _error(error)
        raise AssertionError("unreachable")


@router.delete("/api/subpolar/activity/{activity_id}")
def delete_activity(request: Request, activity_id: str) -> dict[str, bool]:
    _mutation_guard(request)
    try:
        _activity_store().delete_activity(owner=_owner(request), activity_id=activity_id)
    except Exception as error:
        _error(error)
    return {"ok": True}


@router.post("/api/subpolar/audit", status_code=201)
@router.post("/api/subpolar/audits", status_code=201)
def append_audit(request: Request, body: AuditCreate) -> dict[str, Any]:
    _mutation_guard(request)
    try:
        return _audit_store().append_audit(owner=_owner(request), values=body.model_dump())
    except Exception as error:
        _error(error)
        raise AssertionError("unreachable")


@router.get("/api/subpolar/audit")
@router.get("/api/subpolar/audits")
def list_audit(
    request: Request,
    workspace_id: str | None = Query(default=None),
    cursor: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
) -> dict[str, Any]:
    try:
        page = _audit_store().list_audit(
            owner=_owner(request), workspace_id=workspace_id, cursor=cursor, limit=limit
        )
    except Exception as error:
        _error(error)
        raise AssertionError("unreachable")
    return {"audits": page["items"], "next_cursor": page["next_cursor"]}


@router.get("/api/subpolar/audit/{audit_id}")
@router.get("/api/subpolar/audits/{audit_id}")
def get_audit(request: Request, audit_id: str) -> dict[str, Any]:
    result = _audit_store().get_audit(owner=_owner(request), audit_id=audit_id)
    if result is None:
        raise HTTPException(status_code=404, detail="audit record not found")
    return result


__all__ = ["router"]
