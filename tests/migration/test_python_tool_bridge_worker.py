"""Black-box contract tests for the deterministic migration bridge worker."""

from __future__ import annotations

import io
import json
import time

from hermes_cli.migration.python_tool_bridge_worker import handle_line, run


def _request(**overrides: object) -> dict[str, object]:
    request: dict[str, object] = {
        "protocolVersion": 1,
        "type": "tool.call",
        "requestId": "request-1",
        "toolCallId": "call-1",
        "tool": {"name": "deterministic.echo", "reference": "python:deterministic.echo"},
        "arguments": {"message": "hello", "count": 2},
        "cwd": "/workspace",
        "env": {},
        "deadline": time.time() * 1000 + 10_000,
    }
    request.update(overrides)
    return request


def test_deterministic_test_handler_preserves_correlation_ids() -> None:
    response = handle_line(json.dumps(_request()))

    assert response == {
        "protocolVersion": 1,
        "type": "tool.result",
        "requestId": "request-1",
        "toolCallId": "call-1",
        "content": '{"count":2,"message":"hello"}',
    }


def test_worker_fails_closed_for_unknown_reference_and_scoped_environment() -> None:
    secret = "private-token-that-must-not-leak"
    for request in (
        _request(tool={"name": "deterministic.echo", "reference": "python:other"}),
        _request(env={"TOKEN": secret}),
    ):
        response = handle_line(json.dumps(request))

        assert response["type"] == "error"
        assert response["requestId"] == "request-1"
        assert response["toolCallId"] == "call-1"
        assert secret not in json.dumps(response)


def test_worker_rejects_protocol_mismatch_without_losing_valid_correlation() -> None:
    response = handle_line(json.dumps(_request(protocolVersion=2)))

    assert response == {
        "protocolVersion": 1,
        "type": "error",
        "requestId": "request-1",
        "toolCallId": "call-1",
        "error": {"code": "protocol_mismatch"},
    }


def test_worker_emits_one_redacted_jsonl_response_per_input_line() -> None:
    secret = "do-not-return-this"
    stdin = io.StringIO("not-json\n" + json.dumps(_request(arguments={"secret": secret})) + "\n")
    stdout = io.StringIO()

    run(stdin, stdout)

    responses = [json.loads(line) for line in stdout.getvalue().splitlines()]
    assert [response["type"] for response in responses] == ["error", "tool.result"]
    assert secret not in json.dumps(responses[0])
    assert responses[1]["content"] == '{"secret":"do-not-return-this"}'
