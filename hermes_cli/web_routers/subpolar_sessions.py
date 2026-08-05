"""Owner-scoped conversation reads for the Subpolar browser shell."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request

from hermes_constants import get_hermes_home
from hermes_cli.subpolar_store import SubpolarStore
from hermes_cli.web_routers.subpolar import _owner

router = APIRouter()


def _db():
    from hermes_state import SessionDB

    return SessionDB(db_path=get_hermes_home() / "state.db")


def _owned_ids(owner: str) -> set[str]:
    return SubpolarStore().session_ids(owner=owner)


@router.get("/api/subpolar/sessions")
def list_sessions(
    request: Request,
    limit: int = Query(default=100, ge=1, le=500),
    archived: str = Query(default="include", pattern="^(exclude|only|include)$"),
    cwd_prefix: str | None = Query(default=None, max_length=4096),
) -> dict[str, Any]:
    owner = _owner(request)
    ids = _owned_ids(owner)
    db = _db()
    try:
        rows = db.list_sessions_rich(
            cwd_prefix=cwd_prefix,
            limit=max(limit * 2, limit),
            order_by_last_active=True,
            include_archived=archived != "exclude",
            archived_only=archived == "only",
            compact_rows=True,
        )
        sessions = [row for row in rows if str(row.get("id")) in ids][:limit]
        return {"sessions": sessions, "total": len(sessions), "limit": limit, "offset": 0}
    finally:
        db.close()


@router.get("/api/subpolar/sessions/{session_id}/messages")
def session_messages(request: Request, session_id: str) -> dict[str, Any]:
    owner = _owner(request)
    if session_id not in _owned_ids(owner):
        raise HTTPException(status_code=404, detail="conversation not found")
    db = _db()
    try:
        messages = db.get_messages(session_id)
        return {
            "session_id": session_id,
            "messages": [
                {
                    "role": message.get("role"),
                    "content": message.get("content"),
                    "tool_calls": message.get("tool_calls"),
                    "tool_name": message.get("tool_name"),
                    "tool_call_id": message.get("tool_call_id"),
                    "timestamp": message.get("timestamp"),
                }
                for message in messages
            ],
        }
    finally:
        db.close()
