"""Fail-closed JSONL worker for the TypeScript Python tool bridge.

This migration seam intentionally provides only ``python:deterministic.echo``.
It is a deterministic test handler, not an adapter for production Python tools.
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
MAX_CONTENT_BYTES = 65_536
MAX_JSON_DEPTH = 32
_FALLBACK_REQUEST_ID = "invalid-request"
_FALLBACK_TOOL_CALL_ID = "invalid-tool-call"
_ALLOWED_TOOLS = {"deterministic.echo": "python:deterministic.echo"}
_REQUEST_FIELDS = {
    "protocolVersion",
    "type",
    "requestId",
    "toolCallId",
    "tool",
    "arguments",
    "cwd",
    "env",
    "deadline",
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
    return (
        isinstance(value, str)
        and 0 < len(value) <= 256
        and "\x00" not in value
        and "\r" not in value
        and "\n" not in value
    )


def _correlation_ids(value: Any) -> tuple[str, str]:
    if not isinstance(value, Mapping):
        return _FALLBACK_REQUEST_ID, _FALLBACK_TOOL_CALL_ID
    request_id = value.get("requestId")
    tool_call_id = value.get("toolCallId")
    return (
        request_id if _is_identifier(request_id) else _FALLBACK_REQUEST_ID,
        tool_call_id if _is_identifier(tool_call_id) else _FALLBACK_TOOL_CALL_ID,
    )


def _error(code: str, request_id: str, tool_call_id: str) -> dict[str, Any]:
    # Errors deliberately contain no parser, filesystem, or handler diagnostics.
    return {
        "protocolVersion": PROTOCOL_VERSION,
        "type": "error",
        "requestId": request_id,
        "toolCallId": tool_call_id,
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
    if request["protocolVersion"] != PROTOCOL_VERSION or request["type"] != "tool.call":
        raise _InvalidRequest("protocol_mismatch")
    if not _is_identifier(request["requestId"]) or not _is_identifier(request["toolCallId"]):
        raise _InvalidRequest()
    tool = request["tool"]
    if not isinstance(tool, dict) or set(tool) != {"name", "reference"}:
        raise _InvalidRequest()
    tool_name = tool.get("name")
    tool_reference = tool.get("reference")
    if not _is_identifier(tool_name) or not _is_identifier(tool_reference):
        raise _InvalidRequest()
    if _ALLOWED_TOOLS.get(tool_name) != tool_reference:
        raise _InvalidRequest("tool_not_allowlisted")
    if not isinstance(request["arguments"], dict) or not _is_json_value(request["arguments"]):
        raise _InvalidRequest()
    if not isinstance(request["cwd"], str) or not Path(request["cwd"]).is_absolute():
        raise _InvalidRequest()
    # This deterministic worker reads neither request nor process environment.
    if request["env"] != {}:
        raise _InvalidRequest()
    deadline = request["deadline"]
    if isinstance(deadline, bool) or not isinstance(deadline, (int, float)) or not math.isfinite(deadline):
        raise _InvalidRequest()
    if deadline <= time.time() * 1000:
        raise _InvalidRequest("deadline_exceeded")
    return request


def handle_line(line: str) -> dict[str, Any]:
    """Process one JSONL request without exposing request data in failures."""
    try:
        parsed = json.loads(line, object_pairs_hook=_reject_duplicates, parse_constant=lambda _value: (_ for _ in ()).throw(ValueError()))
    except (TypeError, ValueError, json.JSONDecodeError):
        return _error("invalid_response", _FALLBACK_REQUEST_ID, _FALLBACK_TOOL_CALL_ID)

    request_id, tool_call_id = _correlation_ids(parsed)
    try:
        request = _validate_request(parsed)
        # Deterministic test handler only: canonical JSON makes its output stable.
        content = json.dumps(request["arguments"], ensure_ascii=True, separators=(",", ":"), sort_keys=True)
        if len(content.encode("utf-8")) > MAX_CONTENT_BYTES:
            raise _InvalidRequest()
        return {
            "protocolVersion": PROTOCOL_VERSION,
            "type": "tool.result",
            "requestId": request_id,
            "toolCallId": tool_call_id,
            "content": content,
        }
    except _InvalidRequest as error:
        return _error(error.code, request_id, tool_call_id)
    except Exception:
        return _error("worker_error", request_id, tool_call_id)


def run(stdin: TextIO = sys.stdin, stdout: TextIO = sys.stdout) -> None:
    """Serve JSONL input with bounded lines and exactly one response per line."""
    while True:
        line = stdin.readline(MAX_LINE_BYTES + 1)
        if not line:
            return
        if len(line.encode("utf-8")) > MAX_LINE_BYTES:
            response = _error("invalid_response", _FALLBACK_REQUEST_ID, _FALLBACK_TOOL_CALL_ID)
            while line and not line.endswith("\n"):
                line = stdin.readline(MAX_LINE_BYTES + 1)
        else:
            response = handle_line(line)
        stdout.write(json.dumps(response, ensure_ascii=True, separators=(",", ":")) + "\n")
        stdout.flush()


if __name__ == "__main__":
    run()
