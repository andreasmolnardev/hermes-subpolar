"""Workspace-authorized Subpolar source-control routes."""
from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field

from hermes_cli.subpolar_source_control import SubpolarSourceControlService
from hermes_cli.subpolar_store import (
    SubpolarConflict,
    SubpolarNotFound,
    SubpolarStoreError,
    WorkspaceRootError,
)
from hermes_cli.web_routers.subpolar import _mutation_guard, _owner

router = APIRouter()


class _WorkspaceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    workspace_id: str = Field(min_length=1, max_length=200)
    integration_id: str | None = Field(default=None, min_length=1, max_length=200)


class _FileRequest(_WorkspaceRequest):
    file: str | None = Field(default=None, max_length=1000)


class _CommitRequest(_WorkspaceRequest):
    message: str = Field(min_length=1, max_length=10000)
    push: bool = False


class _WorktreeAddRequest(_WorkspaceRequest):
    name: str | None = Field(default=None, max_length=200)
    branch: str | None = Field(default=None, max_length=500)
    base: str | None = Field(default=None, max_length=500)
    existing_branch: str | None = Field(default=None, max_length=500)


class _WorktreeRemoveRequest(_WorkspaceRequest):
    branch: str = Field(min_length=1, max_length=500)
    force: bool = False


class _BaselineRequest(_WorkspaceRequest):
    task_id: str = Field(min_length=1, max_length=200)


def _service() -> SubpolarSourceControlService:
    return SubpolarSourceControlService()


def _error(error: Exception) -> None:
    if isinstance(error, SubpolarNotFound):
        raise HTTPException(status_code=404, detail=str(error)) from error
    if isinstance(error, WorkspaceRootError):
        raise HTTPException(status_code=409, detail=str(error)) from error
    if isinstance(error, (SubpolarConflict, SubpolarStoreError, ValueError)):
        raise HTTPException(status_code=400, detail=str(error)) from error
    raise error


def _owner_and_service(request: Request) -> tuple[str, SubpolarSourceControlService]:
    return _owner(request), _service()


@router.get("/api/subpolar/source-control/status")
def status(
    request: Request,
    workspace_id: str = Query(min_length=1, max_length=200),
    integration_id: str | None = Query(default=None, min_length=1, max_length=200),
) -> dict[str, Any] | None:
    owner, service = _owner_and_service(request)
    try:
        return service.status(owner, workspace_id, integration_id)
    except Exception as error:
        _error(error)
        raise AssertionError("unreachable")


@router.get("/api/subpolar/source-control/branches")
def branches(
    request: Request,
    workspace_id: str = Query(min_length=1, max_length=200),
    integration_id: str | None = Query(default=None, min_length=1, max_length=200),
) -> dict[str, list[dict]]:
    owner, service = _owner_and_service(request)
    try:
        return {"branches": service.branches(owner, workspace_id, integration_id)}
    except Exception as error:
        _error(error)
        raise AssertionError("unreachable")


@router.get("/api/subpolar/source-control/changed-files")
def changed_files(
    request: Request,
    workspace_id: str = Query(min_length=1, max_length=200),
    scope: Literal["uncommitted", "branch", "lastTurn"] = "uncommitted",
    base: str | None = None,
    integration_id: str | None = Query(default=None, min_length=1, max_length=200),
) -> dict:
    owner, service = _owner_and_service(request)
    try:
        return service.changed_files(
            owner,
            workspace_id,
            scope=scope,
            base_ref=base,
            integration_id=integration_id,
        )
    except Exception as error:
        _error(error)
        raise AssertionError("unreachable")


@router.get("/api/subpolar/source-control/diff")
def diff(
    request: Request,
    workspace_id: str = Query(min_length=1, max_length=200),
    file: str = Query(min_length=1, max_length=1000),
    scope: Literal["uncommitted", "branch", "lastTurn"] = "uncommitted",
    base: str | None = None,
    staged: bool = False,
    integration_id: str | None = Query(default=None, min_length=1, max_length=200),
) -> dict[str, str]:
    owner, service = _owner_and_service(request)
    try:
        return {
            "diff": service.diff(
                owner,
                workspace_id,
                file,
                scope=scope,
                base_ref=base,
                staged=staged,
                integration_id=integration_id,
            )
        }
    except Exception as error:
        _error(error)
        raise AssertionError("unreachable")


def _mutate(request: Request) -> str:
    _mutation_guard(request)
    return _owner(request)


@router.post("/api/subpolar/source-control/stage")
def stage(request: Request, body: _FileRequest) -> dict:
    owner = _mutate(request)
    try:
        return _service().stage(owner, body.workspace_id, body.file, body.integration_id)
    except Exception as error:
        _error(error)
        raise AssertionError("unreachable")


@router.post("/api/subpolar/source-control/unstage")
def unstage(request: Request, body: _FileRequest) -> dict:
    owner = _mutate(request)
    try:
        return _service().unstage(owner, body.workspace_id, body.file, body.integration_id)
    except Exception as error:
        _error(error)
        raise AssertionError("unreachable")


@router.post("/api/subpolar/source-control/discard")
def discard(request: Request, body: _FileRequest) -> dict:
    owner = _mutate(request)
    try:
        return _service().discard(owner, body.workspace_id, body.file, body.integration_id)
    except Exception as error:
        _error(error)
        raise AssertionError("unreachable")


@router.post("/api/subpolar/source-control/commit")
def commit(request: Request, body: _CommitRequest) -> dict:
    owner = _mutate(request)
    try:
        return _service().commit(
            owner,
            body.workspace_id,
            body.message,
            push=body.push,
            integration_id=body.integration_id,
        )
    except Exception as error:
        _error(error)
        raise AssertionError("unreachable")


@router.post("/api/subpolar/source-control/push")
def push(request: Request, body: _WorkspaceRequest) -> dict:
    owner = _mutate(request)
    try:
        return _service().push(owner, body.workspace_id, body.integration_id)
    except Exception as error:
        _error(error)
        raise AssertionError("unreachable")


@router.get("/api/subpolar/source-control/worktrees")
def worktree_list(
    request: Request,
    workspace_id: str = Query(min_length=1, max_length=200),
    integration_id: str | None = Query(default=None, min_length=1, max_length=200),
) -> dict[str, list[dict]]:
    owner, service = _owner_and_service(request)
    try:
        return {"worktrees": service.worktree_list(owner, workspace_id, integration_id)}
    except Exception as error:
        _error(error)
        raise AssertionError("unreachable")


@router.post("/api/subpolar/source-control/worktrees/add")
def worktree_add(request: Request, body: _WorktreeAddRequest) -> dict:
    owner = _mutate(request)
    try:
        return _service().worktree_add(
            owner,
            body.workspace_id,
            name=body.name,
            branch=body.branch,
            base=body.base,
            existing_branch=body.existing_branch,
            integration_id=body.integration_id,
        )
    except Exception as error:
        _error(error)
        raise AssertionError("unreachable")


@router.post("/api/subpolar/source-control/worktrees/remove")
def worktree_remove(request: Request, body: _WorktreeRemoveRequest) -> dict:
    owner = _mutate(request)
    try:
        return _service().worktree_remove(
            owner,
            body.workspace_id,
            body.branch,
            force=body.force,
            integration_id=body.integration_id,
        )
    except Exception as error:
        _error(error)
        raise AssertionError("unreachable")


@router.post("/api/subpolar/source-control/baselines")
def capture_baseline(request: Request, body: _BaselineRequest) -> dict[str, Any]:
    owner = _mutate(request)
    try:
        return _service().capture_baseline(
            owner,
            body.workspace_id,
            body.task_id,
            integration_id=body.integration_id,
        )
    except Exception as error:
        _error(error)
        raise AssertionError("unreachable")


@router.get("/api/subpolar/source-control/baselines/{task_id}")
def review_artifact(
    request: Request,
    task_id: str,
    workspace_id: str = Query(min_length=1, max_length=200),
) -> dict[str, Any]:
    owner, service = _owner_and_service(request)
    artifact = service.get_stable_review_artifact(owner, workspace_id, task_id)
    if artifact is None:
        raise HTTPException(status_code=404, detail="baseline not found")
    return artifact


__all__ = ["router"]
