"""Fail-closed eligibility checks for the first TypeScript migration route."""

from dataclasses import dataclass
from enum import Enum
from typing import Any, Mapping, Optional

from gateway.config import GatewayConfig


class RuntimeMigrationEligibilityReason(str, Enum):
    """The single gate that approved or rejected a migration request."""

    APPROVED = "approved"
    DISABLED = "disabled"
    DEFAULT_RUNTIME_NOT_TYPESCRIPT = "default_runtime_not_typescript"
    SHADOW_MODE_ENABLED = "shadow_mode_enabled"
    MODEL_ALLOWLIST_EMPTY = "model_allowlist_empty"
    MODEL_NOT_ALLOWLISTED = "model_not_allowlisted"
    STREAMING_REQUEST = "streaming_request"
    MISSING_IDEMPOTENCY_KEY = "missing_idempotency_key"
    CONTINUATION_REQUEST = "continuation_request"
    HISTORY_REQUEST = "history_request"
    PROVIDER_OVERRIDE = "provider_override"
    TOOLS_REQUEST = "tools_request"
    NOT_SINGLE_TEXT_USER_MESSAGE = "not_single_text_user_message"
    INVALID_REQUEST = "invalid_request"


@dataclass(frozen=True)
class RuntimeMigrationEligibility:
    """The outcome of a pure runtime-migration eligibility check."""

    approved: bool
    reason: RuntimeMigrationEligibilityReason


def runtime_migration_eligibility(
    config: GatewayConfig,
    request: Any,
    headers: Optional[Mapping[str, Any]] = None,
) -> RuntimeMigrationEligibility:
    """Approve only the deliberately narrow, stateless first-cut request shape."""
    if not isinstance(request, Mapping):
        return _rejected(RuntimeMigrationEligibilityReason.INVALID_REQUEST)
    migration = config.runtime_migration.typescript
    if not migration.enabled:
        return _rejected(RuntimeMigrationEligibilityReason.DISABLED)
    if migration.default_runtime != "typescript":
        return _rejected(RuntimeMigrationEligibilityReason.DEFAULT_RUNTIME_NOT_TYPESCRIPT)
    if migration.shadow_mode:
        return _rejected(RuntimeMigrationEligibilityReason.SHADOW_MODE_ENABLED)

    allowed_models = migration.allowed_models
    if (
        not isinstance(allowed_models, list)
        or not allowed_models
        or not all(isinstance(allowed_model, str) and allowed_model for allowed_model in allowed_models)
    ):
        return _rejected(RuntimeMigrationEligibilityReason.MODEL_ALLOWLIST_EMPTY)
    model = request.get("model")
    if not isinstance(model, str) or model not in allowed_models:
        return _rejected(RuntimeMigrationEligibilityReason.MODEL_NOT_ALLOWLISTED)

    if request.get("stream") is not None and request.get("stream") is not False:
        return _rejected(RuntimeMigrationEligibilityReason.STREAMING_REQUEST)
    if not _header_value(headers, "Idempotency-Key"):
        return _rejected(RuntimeMigrationEligibilityReason.MISSING_IDEMPOTENCY_KEY)
    if any(
        _header_value(headers, name)
        for name in ("X-Hermes-Session-Id", "X-Hermes-Session-Key")
    ) or any(request.get(name) for name in ("previous_response_id", "conversation")):
        return _rejected(RuntimeMigrationEligibilityReason.CONTINUATION_REQUEST)
    if request.get("conversation_history") or request.get("history"):
        return _rejected(RuntimeMigrationEligibilityReason.HISTORY_REQUEST)
    if any(request.get(name) for name in ("provider", "provider_id")) or _has_provider_override(
        request.get("model_options")
    ):
        return _rejected(RuntimeMigrationEligibilityReason.PROVIDER_OVERRIDE)
    if any(request.get(name) not in (None, []) for name in ("tools", "functions")) or request.get(
        "tool_choice"
    ) not in (None, "none"):
        return _rejected(RuntimeMigrationEligibilityReason.TOOLS_REQUEST)

    messages = request.get("messages")
    if (
        not isinstance(messages, list)
        or len(messages) != 1
        or not isinstance(messages[0], Mapping)
        or messages[0].get("role") != "user"
        or not isinstance(messages[0].get("content"), str)
        or not messages[0]["content"].strip()
    ):
        return _rejected(RuntimeMigrationEligibilityReason.NOT_SINGLE_TEXT_USER_MESSAGE)
    return RuntimeMigrationEligibility(True, RuntimeMigrationEligibilityReason.APPROVED)


def _rejected(reason: RuntimeMigrationEligibilityReason) -> RuntimeMigrationEligibility:
    return RuntimeMigrationEligibility(False, reason)


def _header_value(headers: Optional[Mapping[str, Any]], name: str) -> Optional[str]:
    if not isinstance(headers, Mapping):
        return None
    for key, value in headers.items():
        if isinstance(key, str) and key.lower() == name.lower() and isinstance(value, str):
            value = value.strip()
            return value or None
    return None


def _has_provider_override(model_options: Any) -> bool:
    if not isinstance(model_options, Mapping):
        return False
    return any(
        model_options.get(name)
        for name in ("provider", "provider_id", "api_key", "base_url", "api_mode")
    )
