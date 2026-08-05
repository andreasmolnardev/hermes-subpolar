from __future__ import annotations

import pytest

from hermes_cli.subpolar_activity import (
    EVENT_KINDS,
    MAX_DETAILS_BYTES,
    MAX_RESULT_BYTES,
    ActivityStore,
    AuditStore,
)


def _activity(kind: str, *, activity_id: str, started_at: str, workspace_id: str = "ws-1"):
    return {
        "id": activity_id,
        "workspace_id": workspace_id,
        "kind": kind,
        "label": kind,
        "started_at": started_at,
    }


def test_activity_kinds_ordering_cursor_and_workspace_filter(tmp_path):
    store = ActivityStore(tmp_path / "subpolar.db")
    assert EVENT_KINDS == {
        "thinking", "planning", "tool", "search", "browser", "subagent",
        "git", "file", "approval", "error", "completion",
    }
    for index, kind in enumerate(("completion", "tool", "thinking")):
        store.append_activity(
            owner="alice",
            values=_activity(kind, activity_id=f"a-{index}", started_at=f"2026-01-01T00:0{index}:00+00:00"),
        )
    store.append_activity(
        owner="alice",
        values=_activity("git", activity_id="other", started_at="2026-01-01T00:00:30+00:00", workspace_id="ws-2"),
    )

    first = store.list_activity(owner="alice", workspace_id="ws-1", limit=2)
    assert [item["id"] for item in first["items"]] == ["a-0", "a-1"]
    assert first["next_cursor"]
    second = store.list_activity(owner="alice", workspace_id="ws-1", cursor=first["next_cursor"], limit=2)
    assert [item["id"] for item in second["items"]] == ["a-2"]
    assert second["next_cursor"] is None


def test_activity_redacts_nested_secrets_and_preserves_artifact_link(tmp_path):
    store = ActivityStore(tmp_path / "subpolar.db")
    item = store.append_activity(
        owner="alice",
        values={
            **_activity("git", activity_id="change-1", started_at="2026-01-01T00:00:00+00:00"),
            "artifact_id": "review-42",
            "details": {
                "command": "git diff",
                "api_key": "hidden",
                "nested": [{"passwordValue": "hidden"}],
            },
        },
    )
    assert item["artifact_id"] == "review-42"
    assert item["details"]["api_key"] == "[redacted]"
    assert item["details"]["nested"][0]["passwordValue"] == "[redacted]"


def test_activity_owner_isolation_and_validation(tmp_path):
    store = ActivityStore(tmp_path / "subpolar.db")
    store.append_activity(owner="alice", values=_activity("tool", activity_id="same", started_at="2026-01-01"))
    store.append_activity(owner="bob", values=_activity("tool", activity_id="same", started_at="2026-01-01"))
    assert [item["id"] for item in store.list_activity(owner="alice")["items"]] == ["same"]
    assert store.get_activity(owner="bob", activity_id="same")["id"] == "same"
    with pytest.raises(ValueError, match="kind"):
        store.append_activity(owner="alice", values=_activity("unknown", activity_id="bad", started_at="2026-01-01"))


def test_details_and_audit_result_size_limits(tmp_path):
    activity = ActivityStore(tmp_path / "subpolar.db")
    with pytest.raises(ValueError, match="details"):
        activity.append_activity(
            owner="alice",
            values={**_activity("file", activity_id="large", started_at="2026-01-01"), "details": {"x": "a" * MAX_DETAILS_BYTES}},
        )

    audit = AuditStore(tmp_path / "subpolar.db")
    with pytest.raises(ValueError, match="result"):
        audit.append_audit(
            owner="alice",
            values={"actor": "user", "action": "review", "resource": "change", "result": "x" * (MAX_RESULT_BYTES + 1)},
        )
    saved = audit.append_audit(
        owner="alice",
        values={
            "id": "audit-1",
            "actor": "user",
            "action": "approve",
            "resource": "change-1",
            "result": "success",
            "redacted_details": {"authorization": "secret", "ok": True},
        },
    )
    assert saved["redacted_details"] == {"authorization": "[redacted]", "ok": True}
    assert "secret" not in str(saved["redacted_details"])
