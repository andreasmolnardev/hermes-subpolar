from __future__ import annotations

from hermes_cli.subpolar_agents import AgentStore
from hermes_cli.subpolar_schedules import SubpolarScheduleService, SubpolarScheduleStore
from hermes_cli.subpolar_store import SubpolarStore


def _service(tmp_path, monkeypatch):
    home = tmp_path / "home"
    root = home / "workspace"
    root.mkdir(parents=True)
    monkeypatch.setenv("HERMES_HOME", str(home))
    monkeypatch.setenv("SUBPOLAR_ALLOWED_ROOTS", str(home))
    db = home / "subpolar.db"
    subpolar = SubpolarStore(db)
    workspace = subpolar.create_workspace(
        owner="alice", name="main", mode="local", root=str(root)
    )
    agents = AgentStore(db)
    agent = agents.ensure_master("alice")
    service = SubpolarScheduleService(
        store=SubpolarScheduleStore(db), subpolar=subpolar, agents=agents
    )
    return service, workspace, agent, root


def _values(workspace, agent, **overrides):
    values = {
        "name": "daily report",
        "prompt": "prepare report",
        "schedule": "every 1h",
        "workspace_id": workspace["id"],
        "agent_id": agent["id"],
    }
    values.update(overrides)
    return values


def test_schedule_metadata_is_owner_scoped_and_cron_adapter_uses_workspace_root(
    tmp_path, monkeypatch
):
    service, workspace, agent, root = _service(tmp_path, monkeypatch)
    calls = []

    def create_job(**kwargs):
        calls.append(kwargs)
        return {"id": "cron-1"}

    def trigger_job(job_id):
        calls.append({"trigger": job_id})
        return {"id": job_id}

    monkeypatch.setattr("cron.jobs.create_job", create_job)
    monkeypatch.setattr("cron.jobs.trigger_job", trigger_job)

    task = service.create(owner="alice", values=_values(workspace, agent))

    assert task["cron_job_id"] == "cron-1"
    assert calls[0] == {
        "prompt": "prepare report",
        "schedule": "every 1h",
        "name": "daily report",
        "model": None,
        "workdir": str(root),
        "subpolar_owner": "alice",
        "subpolar_task_id": task["id"],
    }
    assert service.list("bob") == []
    assert service.get("alice", task["id"])["id"] == task["id"]

    service.run_now(owner="alice", task_id=task["id"])
    assert calls[-1] == {"trigger": "cron-1"}


def test_draft_publish_and_discard_do_not_create_cron_until_publish(
    tmp_path, monkeypatch
):
    service, workspace, agent, _ = _service(tmp_path, monkeypatch)
    created = []

    def create_job(**kwargs):
        created.append(kwargs)
        return {"id": "cron-2"}

    monkeypatch.setattr("cron.jobs.create_job", create_job)
    task = service.create(owner="alice", values=_values(workspace, agent), draft=True)
    assert task["cron_job_id"] is None
    assert created == []

    task = service.save_draft(
        owner="alice", task_id=task["id"], draft={"requested_tools": []}
    )
    assert task["draft_json"] == {"requested_tools": []}
    task = service.discard_draft(owner="alice", task_id=task["id"])
    assert task["draft_json"] is None

    task = service.publish(owner="alice", task_id=task["id"])
    assert task["cron_job_id"] == "cron-2"
    assert len(created) == 1


def test_requested_tool_without_noninteractive_scheduled_allow_fails_closed(
    tmp_path, monkeypatch
):
    service, workspace, agent, _ = _service(tmp_path, monkeypatch)
    agents = service.agents
    worker = agents.create_agent(
        owner="alice",
        values={
            "name": "worker",
            "tools": ["provider.shell"],
            "permissions": {
                "tools": {"provider.shell": "allow"},
                "scheduled": {"provider.shell": "ask"},
            },
            "parent_id": agent["id"],
        },
    )
    called = []
    monkeypatch.setattr("cron.jobs.create_job", lambda **kwargs: called.append(kwargs))

    task = service.create(
        owner="alice",
        values=_values(
            workspace,
            worker,
            draft_json={"requested_tools": ["provider.shell"]},
        ),
    )

    assert called == []
    assert task["cron_job_id"] is None
    assert "no non-interactive allow decision" in task["last_error"]
