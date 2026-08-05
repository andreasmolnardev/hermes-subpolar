"""Owner-scoped persistent Subpolar terminal API and WebSocket."""
from __future__ import annotations

import json
import os
from typing import Any

try:
    import pwd
except ImportError:  # pragma: no cover - native Windows
    pwd = None  # type: ignore[assignment]

from fastapi import APIRouter, HTTPException, Request, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, ConfigDict, Field, field_validator

from hermes_cli.subpolar_terminals import (
    MAX_TERMINAL_NAME,
    MAX_TERMINAL_POSITION,
    SubpolarTerminalStore,
    TerminalConflict,
    TerminalNotFound,
    TerminalStoreError,
)
from hermes_cli.web_routers.subpolar import _mutation_guard, _owner

router = APIRouter()


class TerminalCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    workspace_id: str = Field(min_length=1, max_length=200)
    worktree_id: str | None = Field(default=None, min_length=1, max_length=200)
    name: str = Field(default="Terminal", min_length=1, max_length=MAX_TERMINAL_NAME)
    position: int | None = Field(default=None, ge=0, le=MAX_TERMINAL_POSITION)

    @field_validator("workspace_id", "worktree_id", "name")
    @classmethod
    def strip_values(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None


class TerminalPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=MAX_TERMINAL_NAME)
    position: int | None = Field(default=None, ge=0, le=MAX_TERMINAL_POSITION)

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None


class Terminal(BaseModel):
    owner: str
    id: str
    workspace_id: str
    worktree_id: str | None
    name: str
    position: int
    created_at: str
    closed: bool


class TerminalList(BaseModel):
    terminals: list[Terminal]


def _store() -> SubpolarTerminalStore:
    return SubpolarTerminalStore()


def _terminal(value: dict[str, Any]) -> Terminal:
    return Terminal.model_validate(value)


def _handle_store_error(error: Exception) -> None:
    if isinstance(error, TerminalNotFound):
        raise HTTPException(status_code=404, detail=str(error)) from error
    if isinstance(error, (TerminalConflict, ValueError)):
        raise HTTPException(status_code=400, detail=str(error)) from error
    if isinstance(error, TerminalStoreError):
        raise HTTPException(status_code=400, detail=str(error)) from error
    raise error


@router.get("/api/subpolar/terminals", response_model=TerminalList)
def list_terminals(request: Request) -> TerminalList:
    owner = _owner(request)
    return TerminalList(
        terminals=[_terminal(item) for item in _store().list_terminals(owner)]
    )


@router.post("/api/subpolar/terminals", response_model=Terminal, status_code=201)
def create_terminal(request: Request, body: TerminalCreate) -> Terminal:
    _mutation_guard(request)
    try:
        return _terminal(
            _store().create_terminal(owner=_owner(request), **body.model_dump())
        )
    except Exception as error:
        _handle_store_error(error)
        raise AssertionError("unreachable")


@router.patch("/api/subpolar/terminals/{terminal_id}", response_model=Terminal)
def patch_terminal(
    request: Request, terminal_id: str, body: TerminalPatch
) -> Terminal:
    _mutation_guard(request)
    try:
        return _terminal(
            _store().update_terminal(
                owner=_owner(request),
                terminal_id=terminal_id,
                changes=body.model_dump(exclude_unset=True),
            )
        )
    except Exception as error:
        _handle_store_error(error)
        raise AssertionError("unreachable")


async def _close_registry_session(terminal_id: str) -> None:
    """Close deleted terminal's PTY; normal socket disconnect only detaches."""
    from hermes_cli.web_server import PTY_REGISTRY

    sessions = getattr(PTY_REGISTRY, "_sessions", {})
    session = sessions.pop(terminal_id, None)
    if session is None:
        return
    attached = getattr(session, "_ws", None)
    if attached is not None:
        try:
            await attached.close(code=1000)
        except Exception:
            pass
    await session.close()


@router.delete("/api/subpolar/terminals/{terminal_id}")
async def delete_terminal(request: Request, terminal_id: str) -> dict[str, bool]:
    _mutation_guard(request)
    try:
        _store().delete_terminal(owner=_owner(request), terminal_id=terminal_id)
        await _close_registry_session(terminal_id)
    except Exception as error:
        _handle_store_error(error)
    return {"ok": True}


def _browser_owner(ws: WebSocket) -> str | None:
    principal = ws.scope.get("subpolar_principal")
    if isinstance(principal, dict):
        if principal.get("provider") == "server-internal":
            return None
        user_id = principal.get("user_id")
        if user_id:
            return str(user_id)
    # _ws_auth_ok accepted the token in loopback mode, but test clients and
    # older auth shims may not populate principal on scope.
    if not getattr(ws.app.state, "auth_required", False) and ws.query_params.get("token"):
        return "local-single-user"
    return None


def _shell_argv() -> list[str]:
    if os.name == "nt":
        return [os.environ.get("COMSPEC") or "cmd.exe"]
    shell = os.environ.get("SHELL")
    if not shell:
        try:
            shell = pwd.getpwuid(os.getuid()).pw_shell if pwd is not None else None
        except (KeyError, OSError):
            shell = None
    return [shell or "/bin/sh"]


def _resize(raw: bytes | None, text: str | None) -> tuple[int, int] | None:
    from hermes_cli.web_server import _RESIZE_RE

    if raw:
        match = _RESIZE_RE.match(raw)
        if match and match.end() == len(raw):
            return int(match.group(1)), int(match.group(2))
    if text:
        try:
            message = json.loads(text)
        except (TypeError, ValueError):
            return None
        if isinstance(message, dict) and message.get("type") == "resize":
            try:
                return int(message["cols"]), int(message["rows"])
            except (KeyError, TypeError, ValueError):
                return None
    return None


@router.websocket("/api/subpolar/terminals/ws")
async def terminal_ws(ws: WebSocket) -> None:
    from hermes_cli.web_server import (
        PTY_REGISTRY,
        PtyBridge,
        PtyUnavailableError,
        RegistryFull,
        _PTY_BRIDGE_AVAILABLE,
        _ws_auth_ok,
        _ws_request_is_allowed,
    )

    if not _ws_auth_ok(ws):
        await ws.close(code=4401, reason="unauthorized")
        return
    if not _ws_request_is_allowed(ws):
        await ws.close(code=4403, reason="request not allowed")
        return
    owner = _browser_owner(ws)
    if owner is None:
        await ws.close(code=4401, reason="browser credential required")
        return

    terminal_id = ws.query_params.get("terminal_id", "").strip()
    if not terminal_id:
        await ws.close(code=4400, reason="terminal_id required")
        return
    store = SubpolarTerminalStore()
    try:
        terminal = store.get_terminal(owner, terminal_id, active_only=True)
        if terminal is None:
            await ws.close(code=4404, reason="terminal not found")
            return
        cwd = store.resolve_root(owner=owner, terminal_id=terminal_id)
    except Exception as error:
        if isinstance(error, (TerminalNotFound, TerminalConflict, ValueError)):
            await ws.close(code=4404, reason="terminal unavailable")
            return
        raise

    await ws.accept()
    if not _PTY_BRIDGE_AVAILABLE or PtyBridge is None:
        await ws.close(code=1011, reason="PTY unavailable")
        return

    from tools.environments.local import build_subprocess_env

    env = build_subprocess_env()
    env.setdefault("TERM", "xterm-256color")
    argv = _shell_argv()

    try:
        session, _created = await PTY_REGISTRY.attach_or_spawn(
            terminal_id,
            spawn=lambda: PtyBridge.spawn(argv, cwd=cwd, env=env),
        )
    except (PtyUnavailableError, FileNotFoundError, OSError, RegistryFull) as error:
        await ws.send_text(f"\r\n\x1b[31mTerminal failed to start: {error}\x1b[0m\r\n")
        await ws.close(code=1011)
        return

    await session.attach(ws)
    try:
        while True:
            try:
                message = await ws.receive()
            except RuntimeError:
                break
            if message.get("type") == "websocket.disconnect":
                break
            raw = message.get("bytes")
            text = message.get("text")
            size = _resize(raw, text)
            if size is not None:
                session.bridge.resize(cols=size[0], rows=size[1])
                continue
            if raw is None:
                raw = text.encode("utf-8") if isinstance(text, str) else b""
            if raw:
                session.bridge.write(raw)
    except WebSocketDisconnect:
        pass
    finally:
        PTY_REGISTRY.detach(terminal_id, ws)
        if not session.alive:
            try:
                store.close_terminal(owner=owner, terminal_id=terminal_id)
            except TerminalNotFound:
                pass
