"""Fail-closed JSONL worker for the Python whole-turn runtime bridge.

Only the ``test:deterministic`` model route is implemented.  This is a
protocol test seam, not a production agent-turn runtime.
"""

from __future__ import annotations

import json
import math
import sys
import time
from collections.abc import Mapping
from pathlib import Path
from typing import Any, TextIO


PROTOCOL_VERSION = 1
MAX_LINE_BYTES = 1_048_576
MAX_JSON_DEPTH = 32
_FALLBACK_REQUEST_ID = "invalid-request"
_FALLBACK_SESSION_ID = "invalid-session"
_REQUEST_FIELDS = {
    "protocolVersion",
    "type",
    "requestId",
    "sessionId",
    "model",
    "messages",
    "tools",
    "policies",
    "cwd",
    "environment",
    "credentialHandles",
    "deadline",
    "cancellation",
}


class _InvalidRequest(Exception):
    def __init__(self, code: str = "invalid_response") -> None:
        self.code = code


def _reject_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate JSON object key")
        result[key] = value
    return result


def _is_identifier(value: Any) -> bool:
    return isinstance(value, str) and 0 < len(value) <= 256 and not any(char in value for char in "\x00\r\n")


def _correlation_ids(value: Any) -> tuple[str, str]:
    if not isinstance(value, Mapping):
        return _FALLBACK_REQUEST_ID, _FALLBACK_SESSION_ID
    request_id = value.get("requestId")
    session_id = value.get("sessionId")
    return (
        request_id if _is_identifier(request_id) else _FALLBACK_REQUEST_ID,
        session_id if _is_identifier(session_id) else _FALLBACK_SESSION_ID,
    )


def _error(code: str, request_id: str, session_id: str) -> dict[str, Any]:
    # Responses must not expose malformed input, handles, or worker diagnostics.
    return {
        "protocolVersion": PROTOCOL_VERSION,
        "type": "error",
        "requestId": request_id,
        "sessionId": session_id,
        "error": {"code": code},
    }


def _is_json_value(value: Any, depth: int = 0) -> bool:
    if depth > MAX_JSON_DEPTH:
        return False
    if value is None or isinstance(value, (str, bool)):
        return True
    if isinstance(value, (int, float)):
        return not isinstance(value, float) or math.isfinite(value)
    if isinstance(value, list):
        return all(_is_json_value(item, depth + 1) for item in value)
    if isinstance(value, dict):
        return all(isinstance(key, str) and _is_json_value(item, depth + 1) for key, item in value.items())
    return False


def _validate_request(request: Any) -> dict[str, Any]:
    if not isinstance(request, dict) or set(request) != _REQUEST_FIELDS:
        raise _InvalidRequest()
    if request["protocolVersion"] != PROTOCOL_VERSION or request["type"] != "runtime.turn":
        raise _InvalidRequest("protocol_mismatch")
    if not _is_identifier(request["requestId"]) or not _is_identifier(request["sessionId"]):
        raise _InvalidRequest()
    if request["model"] != "test:deterministic":
        raise _InvalidRequest("worker_error")
    if not all(_is_json_value(request[field]) for field in ("messages", "tools", "policies")):
        raise _InvalidRequest()
    if not isinstance(request["messages"], list) or request["tools"] != [] or request["policies"] != []:
        raise _InvalidRequest()
    if not isinstance(request["cwd"], str) or not Path(request["cwd"]).is_absolute():
        raise _InvalidRequest()
    # Handles are opaque identifiers; this worker neither resolves nor returns them.
    if request["environment"] != {} or not isinstance(request["credentialHandles"], list):
        raise _InvalidRequest()
    if not all(_is_identifier(handle) and handle.startswith("credential:") for handle in request["credentialHandles"]):
        raise _InvalidRequest()
    deadline = request["deadline"]
    if isinstance(deadline, bool) or not isinstance(deadline, (int, float)) or not math.isfinite(deadline):
        raise _InvalidRequest()
    cancellation = request["cancellation"]
    if not isinstance(cancellation, dict) or set(cancellation) - {"requested", "reason"}:
        raise _InvalidRequest()
    if not isinstance(cancellation.get("requested"), bool):
        raise _InvalidRequest()
    if cancellation.get("reason") not in (None, "caller", "deadline"):
        raise _InvalidRequest()
    if cancellation["requested"]:
        raise _InvalidRequest("cancelled")
    if deadline <= time.time() * 1000:
        raise _InvalidRequest("deadline_exceeded")
    return request


def handle_line(line: str) -> dict[str, Any]:
    """Process one JSONL request, returning only a correlated terminal response."""
    if len(line.encode("utf-8")) > MAX_LINE_BYTES:
        return _error("invalid_response", _FALLBACK_REQUEST_ID, _FALLBACK_SESSION_ID)
    try:
        parsed = json.loads(line, object_pairs_hook=_reject_duplicates, parse_constant=lambda _value: (_ for _ in ()).throw(ValueError()))
    except (TypeError, ValueError, json.JSONDecodeError):
        return _error("invalid_response", _FALLBACK_REQUEST_ID, _FALLBACK_SESSION_ID)

    request_id, session_id = _correlation_ids(parsed)
    try:
        request = _validate_request(parsed)
        if request["deadline"] <= time.time() * 1000:
            raise _InvalidRequest("deadline_exceeded")
        return {
            "protocolVersion": PROTOCOL_VERSION,
            "type": "runtime.result",
            "requestId": request_id,
            "sessionId": session_id,
            "result": {
                "message": {"role": "assistant", "content": "deterministic test response"},
                "usage": {"inputTokens": 0, "outputTokens": 0},
                "finishReason": "stop",
            },
        }
    except _InvalidRequest as error:
        return _error(error.code, request_id, session_id)
    except Exception:
        return _error("worker_error", request_id, session_id)


def run(stdin: TextIO = sys.stdin, stdout: TextIO = sys.stdout) -> None:
    """Serve bounded JSONL input with exactly one terminal response per line."""
    while True:
        line = stdin.readline(MAX_LINE_BYTES + 1)
        if not line:
            return
        if len(line.encode("utf-8")) > MAX_LINE_BYTES:
            response = _error("invalid_response", _FALLBACK_REQUEST_ID, _FALLBACK_SESSION_ID)
            while line and not line.endswith("\n"):
                line = stdin.readline(MAX_LINE_BYTES + 1)
        else:
            response = handle_line(line)
        stdout.write(json.dumps(response, ensure_ascii=True, separators=(",", ":")) + "\n")
        stdout.flush()


if __name__ == "__main__":
    run()
