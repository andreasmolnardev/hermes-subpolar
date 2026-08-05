"""Subpolar metadata API."""
from __future__ import annotations

import os
from typing import Literal
from urllib.parse import urlsplit

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator

from hermes_cli.subpolar_store import (
    SubpolarConflict,
    SubpolarNotFound,
    SubpolarStore,
    SubpolarStoreError,
    WorkspaceRootError,
    validate_repo_url,
)

router = APIRouter()


def _store() -> SubpolarStore:
    """Resolve store path per request so temporary homes remain isolated."""
    return SubpolarStore()


def _nonempty(value: str) -> str:
    value = value.strip()
    if not value:
        raise ValueError("value must not be empty")
    return value


class WorkspaceCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=200)
    mode: Literal["local", "clone", "ephemeral"]
    root: str = Field(min_length=1, max_length=4096)
    repo_url: str | None = Field(default=None, max_length=4096)
    git_provider: str | None = Field(default=None, max_length=200)
    archived: bool = False

    @field_validator("name", "root", "repo_url", "git_provider")
    @classmethod
    def strip_values(cls, value: str | None) -> str | None:
        return _nonempty(value) if value is not None else None

    @field_validator("repo_url")
    @classmethod
    def reject_repo_credentials(cls, value: str | None) -> str | None:
        return validate_repo_url(value)


class WorkspacePatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=200)
    mode: Literal["local", "clone", "ephemeral"] | None = None
    root: str | None = Field(default=None, min_length=1, max_length=4096)
    repo_url: str | None = Field(default=None, max_length=4096)
    git_provider: str | None = Field(default=None, max_length=200)
    archived: bool | None = None

    @field_validator("name", "root", "repo_url", "git_provider")
    @classmethod
    def strip_values(cls, value: str | None) -> str | None:
        return _nonempty(value) if value is not None else None

    @field_validator("repo_url")
    @classmethod
    def reject_repo_credentials(cls, value: str | None) -> str | None:
        return validate_repo_url(value)


class GroupCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=200)
    workspace_ids: list[str] = Field(default_factory=list, max_length=1000)

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        return _nonempty(value)

    @field_validator("workspace_ids")
    @classmethod
    def unique_workspace_ids(cls, value: list[str]) -> list[str]:
        if any(not item.strip() for item in value):
            raise ValueError("workspace_ids must contain non-empty IDs")
        if len(set(value)) != len(value):
            raise ValueError("workspace_ids must not contain duplicates")
        return value


class WorktreeCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    workspace_id: str = Field(min_length=1, max_length=200)
    root: str = Field(min_length=1, max_length=4096)
    branch: str = Field(min_length=1, max_length=512)

    @field_validator("workspace_id", "root", "branch")
    @classmethod
    def strip_values(cls, value: str) -> str:
        return _nonempty(value)


class Workspace(BaseModel):
    id: str
    owner: str
    name: str
    mode: Literal["local", "clone", "ephemeral"]
    root: str
    repo_url: str | None = None
    git_provider: str | None = None
    archived: bool


class ProjectGroup(BaseModel):
    id: str
    owner: str
    name: str
    workspace_ids: list[str]


class Worktree(BaseModel):
    id: str
    owner: str
    workspace_id: str
    root: str
    branch: str


class Bootstrap(BaseModel):
    workspaces: list[Workspace]
    groups: list[ProjectGroup]
    worktrees: list[Worktree]


class WorkspaceList(BaseModel):
    workspaces: list[Workspace]


class WorktreeList(BaseModel):
    worktrees: list[Worktree]


def _owner(request: Request) -> str:
    if getattr(request.app.state, "auth_required", False):
        session = getattr(request.state, "session", None)
        user_id = getattr(session, "user_id", None)
        if not user_id:
            raise HTTPException(status_code=401, detail="Authenticated user is missing")
        return str(user_id)
    # Loopback auth_middleware normally already checked _SESSION_TOKEN. Repeat
    # its check here so direct router invocation cannot manufacture an owner.
    from hermes_cli.web_server import _has_valid_session_token

    if not _has_valid_session_token(request):
        raise HTTPException(status_code=401, detail="Unauthorized")
    # Never use a request field as owner in this single-user mode.
    return "local-single-user"


def _session_is_organization(request: Request) -> bool:
    session = getattr(request.state, "session", None)
    return bool(getattr(session, "org_id", None))


def _normalized_origin(value: str) -> tuple[str, str, int | None] | None:
    parsed = urlsplit(value.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return None
    try:
        port = parsed.port
    except ValueError:
        return None
    if port is None and parsed.scheme == "http":
        port = 80
    if port is None and parsed.scheme == "https":
        port = 443
    return parsed.scheme.lower(), parsed.hostname.lower(), port


def _request_origin(request: Request) -> tuple[str, str, int | None] | None:
    host = request.headers.get("host", "")
    return _normalized_origin(f"{request.url.scheme}://{host}")


def _mutation_guard(request: Request) -> None:
    origin = request.headers.get("origin")
    auth_required = bool(getattr(request.app.state, "auth_required", False))
    authorization = request.headers.get("authorization", "").strip()
    has_bearer = authorization.lower().startswith("bearer ") and bool(
        authorization[7:].strip()
    )

    # Cookie sessions require an Origin header. Token-authenticated callers
    # may omit it, but any browser Origin is still checked.
    if auth_required and not has_bearer and not origin:
        raise HTTPException(status_code=403, detail="Origin header required for cookie mutation")
    if not origin:
        return

    configured = os.environ.get("HERMES_DASHBOARD_PUBLIC_URL", "").strip()
    expected = _normalized_origin(configured) if configured else _request_origin(request)
    actual = _normalized_origin(origin)
    if expected is None or actual != expected:
        raise HTTPException(status_code=403, detail="Cross-origin mutation rejected")


def _handle_store_error(error: Exception) -> None:
    if isinstance(error, SubpolarNotFound):
        raise HTTPException(status_code=404, detail=str(error)) from error
    if isinstance(error, (WorkspaceRootError, SubpolarConflict, ValueError)):
        raise HTTPException(status_code=400, detail=str(error)) from error
    if isinstance(error, SubpolarStoreError):
        raise HTTPException(status_code=400, detail=str(error)) from error
    raise error


def _workspace(value: dict) -> Workspace:
    return Workspace.model_validate(value)


def _group(value: dict) -> ProjectGroup:
    return ProjectGroup.model_validate(value)


def _worktree(value: dict) -> Worktree:
    return Worktree.model_validate(value)


@router.get("/api/subpolar/bootstrap", response_model=Bootstrap)
def bootstrap(request: Request) -> Bootstrap:
    owner = _owner(request)
    store = _store()
    return Bootstrap(
        workspaces=[_workspace(item) for item in store.list_workspaces(owner)],
        groups=[_group(item) for item in store.list_groups(owner)],
        worktrees=[_worktree(item) for item in store.list_worktrees(owner=owner)],
    )


@router.get("/api/subpolar/workspaces", response_model=WorkspaceList)
def list_workspaces(request: Request) -> WorkspaceList:
    owner = _owner(request)
    store = _store()
    return WorkspaceList(
        workspaces=[_workspace(item) for item in store.list_workspaces(owner)]
    )


@router.post("/api/subpolar/workspaces", response_model=None, status_code=201)
def create_workspace(request: Request, body: WorkspaceCreate) -> Workspace | dict:
    _mutation_guard(request)
    owner = _owner(request)
    if body.mode == "clone":
        from hermes_cli.subpolar_clones import clone_manager

        try:
            return clone_manager().create(
                owner=owner,
                name=body.name,
                root=body.root,
                repo_url=body.repo_url or "",
                git_provider=body.git_provider,
            )
        except Exception as error:
            _handle_store_error(error)
            raise AssertionError("unreachable")
    try:
        store = _store()
        return _workspace(
            store.create_workspace(owner=owner, **body.model_dump())
        )
    except Exception as error:
        _handle_store_error(error)
        raise AssertionError("unreachable")


@router.get("/api/subpolar/workspaces/{workspace_id}", response_model=Workspace)
def get_workspace(request: Request, workspace_id: str) -> Workspace:
    workspace = _store().get_workspace(_owner(request), workspace_id)
    if workspace is None:
        raise HTTPException(status_code=404, detail="workspace not found")
    return _workspace(workspace)


@router.patch("/api/subpolar/workspaces/{workspace_id}", response_model=Workspace)
def patch_workspace(
    request: Request, workspace_id: str, body: WorkspacePatch
) -> Workspace:
    _mutation_guard(request)
    try:
        store = _store()
        return _workspace(
            store.update_workspace(
                owner=_owner(request),
                workspace_id=workspace_id,
                changes=body.model_dump(exclude_unset=True),
            )
        )
    except Exception as error:
        _handle_store_error(error)
        raise AssertionError("unreachable")


@router.delete("/api/subpolar/workspaces/{workspace_id}")
def delete_workspace(request: Request, workspace_id: str) -> dict[str, bool]:
    _mutation_guard(request)
    try:
        _store().delete_workspace(owner=_owner(request), workspace_id=workspace_id)
    except Exception as error:
        _handle_store_error(error)
    return {"ok": True}


@router.post("/api/subpolar/groups", response_model=ProjectGroup, status_code=201)
def create_group(request: Request, body: GroupCreate) -> ProjectGroup:
    _mutation_guard(request)
    try:
        return _group(_store().create_group(owner=_owner(request), **body.model_dump()))
    except Exception as error:
        _handle_store_error(error)
        raise AssertionError("unreachable")


@router.get("/api/subpolar/worktrees", response_model=WorktreeList)
def list_worktrees(request: Request, workspace_id: str | None = None) -> WorktreeList:
    owner = _owner(request)
    return WorktreeList(
        worktrees=[
            _worktree(item)
            for item in _store().list_worktrees(owner=owner, workspace_id=workspace_id)
        ]
    )


@router.post("/api/subpolar/worktrees", response_model=Worktree, status_code=201)
def create_worktree(request: Request, body: WorktreeCreate) -> Worktree:
    _mutation_guard(request)
    try:
        return _worktree(
            _store().create_worktree(owner=_owner(request), **body.model_dump())
        )
    except Exception as error:
        _handle_store_error(error)
        raise AssertionError("unreachable")


@router.delete("/api/subpolar/worktrees/{worktree_id}")
def delete_worktree(request: Request, worktree_id: str) -> dict[str, bool]:
    _mutation_guard(request)
    try:
        _store().delete_worktree(owner=_owner(request), worktree_id=worktree_id)
    except Exception as error:
        _handle_store_error(error)
    return {"ok": True}


from hermes_cli.web_routers.subpolar_clones import router as _clone_router  # noqa: E402

router.include_router(_clone_router)
