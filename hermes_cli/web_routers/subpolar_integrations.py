"""Subpolar provider integration metadata API."""
from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator

from hermes_cli.subpolar_integrations import (
    IntegrationNotFound,
    IntegrationStore,
    IntegrationStoreError,
)
from hermes_cli.web_routers.subpolar import _mutation_guard, _owner


router = APIRouter()
IntegrationKind = Literal["mcp", "openapi", "git", "model", "chat", "memory", "plugin"]


def _nonempty(value: str, field: str) -> str:
    value = value.strip()
    if not value:
        raise ValueError(f"{field} must be non-empty")
    return value


class IntegrationCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: IntegrationKind
    name: str = Field(min_length=1, max_length=200)
    provider: str = Field(min_length=1, max_length=200)
    endpoint: str | None = Field(default=None, max_length=4096)
    credential_ref: str | None = Field(default=None, max_length=1000)
    config: dict[str, Any] = Field(default_factory=dict)
    enabled: bool = True
    health: str = Field(default="unknown", min_length=1, max_length=100)
    schema_version: int = Field(default=1, ge=1)

    @field_validator("name", "provider", "health")
    @classmethod
    def strip_text(cls, value: str) -> str:
        return _nonempty(value, "value")

    @field_validator("endpoint", "credential_ref")
    @classmethod
    def strip_optional_text(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None


class IntegrationPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: IntegrationKind | None = None
    name: str | None = Field(default=None, min_length=1, max_length=200)
    provider: str | None = Field(default=None, min_length=1, max_length=200)
    endpoint: str | None = Field(default=None, max_length=4096)
    credential_ref: str | None = Field(default=None, max_length=1000)
    config: dict[str, Any] | None = None
    enabled: bool | None = None
    health: str | None = Field(default=None, min_length=1, max_length=100)
    schema_version: int | None = Field(default=None, ge=1)

    @field_validator("name", "provider", "health")
    @classmethod
    def strip_text(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None

    @field_validator("endpoint", "credential_ref")
    @classmethod
    def strip_optional_text(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None


class HealthPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    health: str = Field(min_length=1, max_length=100)

    @field_validator("health")
    @classmethod
    def strip_health(cls, value: str) -> str:
        return _nonempty(value, "health")


def _store() -> IntegrationStore:
    return IntegrationStore()


def _error(error: Exception) -> None:
    if isinstance(error, IntegrationNotFound):
        raise HTTPException(status_code=404, detail=str(error)) from error
    if isinstance(error, (IntegrationStoreError, ValueError)):
        raise HTTPException(status_code=400, detail=str(error)) from error
    raise error


def _records(records: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    return {"integrations": records}


@router.get("/api/subpolar/integrations")
def list_integrations(
    request: Request,
    search: str | None = Query(default=None),
    q: str | None = Query(default=None),
    kind: IntegrationKind | None = Query(default=None),
    provider: str | None = Query(default=None),
) -> dict[str, list[dict[str, Any]]]:
    return _records(
        _store().list_integrations(
            _owner(request), search=search or q, kind=kind, provider=provider
        )
    )


@router.get("/api/subpolar/integrations/catalog")
def integration_catalog(
    request: Request,
    search: str | None = Query(default=None),
    kind: IntegrationKind | None = Query(default=None),
    provider: str | None = Query(default=None),
) -> dict[str, list[dict[str, Any]]]:
    return {"catalog": _store().list_catalog(_owner(request), search=search, kind=kind, provider=provider)}


@router.post("/api/subpolar/integrations", status_code=201)
def create_integration(request: Request, body: IntegrationCreate) -> dict[str, Any]:
    _mutation_guard(request)
    try:
        return _store().create_integration(owner=_owner(request), **body.model_dump())
    except Exception as error:
        _error(error)
        raise AssertionError("unreachable")


@router.get("/api/subpolar/integrations/{integration_id}")
def get_integration(request: Request, integration_id: str) -> dict[str, Any]:
    result = _store().get_integration(_owner(request), integration_id)
    if result is None:
        raise HTTPException(status_code=404, detail="integration not found")
    return result


@router.patch("/api/subpolar/integrations/{integration_id}")
def update_integration(
    request: Request, integration_id: str, body: IntegrationPatch
) -> dict[str, Any]:
    _mutation_guard(request)
    try:
        return _store().update_integration(
            owner=_owner(request), integration_id=integration_id, changes=body.model_dump(exclude_unset=True)
        )
    except Exception as error:
        _error(error)
        raise AssertionError("unreachable")


@router.delete("/api/subpolar/integrations/{integration_id}")
def delete_integration(request: Request, integration_id: str) -> dict[str, bool]:
    _mutation_guard(request)
    try:
        _store().delete_integration(owner=_owner(request), integration_id=integration_id)
    except Exception as error:
        _error(error)
    return {"ok": True}


@router.get("/api/subpolar/integrations/{integration_id}/health")
def integration_health(request: Request, integration_id: str) -> dict[str, Any]:
    try:
        result = _store().health_integration(owner=_owner(request), integration_id=integration_id)
    except Exception as error:
        _error(error)
        raise AssertionError("unreachable")
    return {"id": result["id"], "health": result["health"], "integration": result}


@router.post("/api/subpolar/integrations/{integration_id}/health")
def update_integration_health(
    request: Request, integration_id: str, body: HealthPatch
) -> dict[str, Any]:
    _mutation_guard(request)
    try:
        result = _store().health_integration(
            owner=_owner(request), integration_id=integration_id, health=body.health
        )
    except Exception as error:
        _error(error)
        raise AssertionError("unreachable")
    return {"id": result["id"], "health": result["health"], "integration": result}


__all__ = ["router"]
