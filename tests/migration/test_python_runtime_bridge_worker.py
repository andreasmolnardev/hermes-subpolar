"""Contract tests for the fail-closed whole-turn runtime bridge worker."""

from __future__ import annotations

import io
import json
import time

from hermes_cli.migration.python_runtime_bridge_worker import MAX_LINE_BYTES, handle_line, run


def _request(**overrides: object) -> dict[str, object]:
    request: dict[str, object] = {
        "protocolVersion": 1,
        "type": "runtime.turn",
        "requestId": "request-1",
        "sessionId": "session-1",
        "model": "test:deterministic",
        "messages": [{"role": "user", "content": "test input"}],
        "tools": [],
        "policies": [],
        "cwd": "/workspace",
        "environment": {},
        "credentialHandles": [],
        "deadline": time.time() * 1000 + 10_000,
        "cancellation": {"requested": False},
    }
    request.update(overrides)
    return request


def test_test_only_route_returns_fixed_whole_turn_result() -> None:
    response = handle_line(json.dumps(_request(messages=[{"role": "user", "content": "private input"}])))

    assert response == {
        "protocolVersion": 1,
        "type": "runtime.result",
        "requestId": "request-1",
        "sessionId": "session-1",
        "result": {
            "message": {"role": "assistant", "content": "deterministic test response"},
            "usage": {"inputTokens": 0, "outputTokens": 0},
            "finishReason": "stop",
        },
    }


def test_worker_rejects_production_route_and_capability_inputs_without_leaking_them() -> None:
    secret = "private-handle-or-environment-value"
    for request in (
        _request(model="production-model"),
        _request(environment={"TOKEN": secret}),
        _request(credentialHandles=[secret]),
        _request(tools=[{"name": "tool"}]),
    ):
        response = handle_line(json.dumps(request))

        assert response["type"] == "error"
        assert response["requestId"] == "request-1"
        assert response["sessionId"] == "session-1"
        assert secret not in json.dumps(response)


def test_worker_accepts_but_never_resolves_or_returns_opaque_handles() -> None:
    handle = "credential:test-provider"
    response = handle_line(json.dumps(_request(credentialHandles=[handle])))

    assert response["type"] == "runtime.result"
    assert handle not in json.dumps(response)


def test_worker_validates_protocol_correlation_deadline_and_cancellation() -> None:
    cases = (
        (_request(protocolVersion=2), "protocol_mismatch"),
        (_request(deadline=time.time() * 1000 - 1), "deadline_exceeded"),
        (_request(cancellation={"requested": True, "reason": "caller"}), "cancelled"),
    )
    for request, code in cases:
        response = handle_line(json.dumps(request))

        assert response == {
            "protocolVersion": 1,
            "type": "error",
            "requestId": "request-1",
            "sessionId": "session-1",
            "error": {"code": code},
        }


def test_worker_bounds_jsonl_and_redacts_malformed_input() -> None:
    secret = "do-not-expose-this"
    stdin = io.StringIO("not-json " + secret + "\n" + ("x" * (MAX_LINE_BYTES + 1)) + "\n")
    stdout = io.StringIO()

    run(stdin, stdout)

    responses = [json.loads(line) for line in stdout.getvalue().splitlines()]
    assert len(responses) == 2
    assert all(response["type"] == "error" for response in responses)
    assert all(response["requestId"] == "invalid-request" for response in responses)
    assert secret not in json.dumps(responses)
