"""Subpolar repository clone job API."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator

from hermes_cli.subpolar_clones import clone_manager
from hermes_cli.subpolar_store import SubpolarNotFound, validate_repo_url


router = APIRouter()


def _owner(request: Request) -> str:
    from hermes_cli.web_routers.subpolar import _owner as resolve_owner

    return resolve_owner(request)


def _mutation_guard(request: Request) -> None:
    from hermes_cli.web_routers.subpolar import _mutation_guard as guard

    guard(request)


def _nonempty(value: str, field: str) -> str:
    value = value.strip()
    if not value:
        raise ValueError(f"{field} must not be empty")
    return value


class CloneCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=200)
    root: str = Field(min_length=1, max_length=4096)
    repo_url: str = Field(min_length=1, max_length=4096)
    git_provider: str | None = Field(default=None, min_length=1, max_length=200)

    @field_validator("name", "root")
    @classmethod
    def strip_required(cls, value: str) -> str:
        return _nonempty(value, "value")

    @field_validator("git_provider")
    @classmethod
    def strip_provider(cls, value: str | None) -> str | None:
        return _nonempty(value, "git_provider") if value is not None else None

    @field_validator("repo_url")
    @classmethod
    def reject_credentials(cls, value: str) -> str:
        value = _nonempty(value, "repo_url")
        result = validate_repo_url(value)
        assert result is not None
        return result


class CloneJob(BaseModel):
    owner: str
    id: str
    workspace_id: str
    repo_url: str
    provider: str | None = None
    status: str
    progress: int
    started_at: str | None = None
    finished_at: str | None = None
    error: str | None = None
    cancelled: bool


def _job(value: dict[str, Any]) -> CloneJob:
    return CloneJob.model_validate(value)


def _error(error: Exception) -> None:
    if isinstance(error, SubpolarNotFound):
        raise HTTPException(status_code=404, detail=str(error)) from error
    if isinstance(error, ValueError):
        raise HTTPException(status_code=400, detail=str(error)) from error
    raise error


@router.post("/api/subpolar/clones", response_model=CloneJob, status_code=202)
def create_clone(request: Request, body: CloneCreate) -> CloneJob:
    _mutation_guard(request)
    try:
        return _job(clone_manager().create(owner=_owner(request), **body.model_dump()))
    except Exception as error:
        _error(error)
        raise AssertionError("unreachable")


@router.get("/api/subpolar/clones/{clone_id}", response_model=CloneJob)
def get_clone(request: Request, clone_id: str) -> CloneJob:
    try:
        return _job(clone_manager().get(_owner(request), clone_id))
    except Exception as error:
        _error(error)
        raise AssertionError("unreachable")


@router.post("/api/subpolar/clones/{clone_id}/cancel", response_model=CloneJob)
def cancel_clone(request: Request, clone_id: str) -> CloneJob:
    _mutation_guard(request)
    try:
        return _job(clone_manager().cancel(_owner(request), clone_id))
    except Exception as error:
        _error(error)
        raise AssertionError("unreachable")


__all__ = ["CloneCreate", "CloneJob", "router"]
