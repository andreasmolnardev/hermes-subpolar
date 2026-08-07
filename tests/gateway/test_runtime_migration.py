"""Tests for the fail-closed TypeScript runtime migration gate."""

import pytest

from gateway.config import GatewayConfig, RuntimeMigrationConfig, TypeScriptRuntimeMigrationConfig
from gateway.runtime_migration import (
    RuntimeMigrationEligibilityReason,
    runtime_migration_eligibility,
)


def _config(**overrides):
    settings = {
        "enabled": True,
        "default_runtime": "typescript",
        "shadow_mode": False,
        "allowed_models": ["migratable-model"],
    }
    settings.update(overrides)
    return GatewayConfig(
        runtime_migration=RuntimeMigrationConfig(
            typescript=TypeScriptRuntimeMigrationConfig(**settings)
        )
    )


def _request(**overrides):
    request = {
        "model": "migratable-model",
        "messages": [{"role": "user", "content": "hello"}],
        "stream": False,
    }
    request.update(overrides)
    return request


def test_approves_only_the_first_cut_request_shape():
    result = runtime_migration_eligibility(
        _config(), _request(), {"idempotency-key": "request-1"}
    )

    assert result.approved is True
    assert result.reason is RuntimeMigrationEligibilityReason.APPROVED


@pytest.mark.parametrize(
    ("config_overrides", "request_overrides", "headers", "reason"),
    [
        ({"enabled": False}, {}, {"Idempotency-Key": "key"}, "DISABLED"),
        ({"default_runtime": "python"}, {}, {"Idempotency-Key": "key"}, "DEFAULT_RUNTIME_NOT_TYPESCRIPT"),
        ({"shadow_mode": True}, {}, {"Idempotency-Key": "key"}, "SHADOW_MODE_ENABLED"),
        ({"allowed_models": []}, {}, {"Idempotency-Key": "key"}, "MODEL_ALLOWLIST_EMPTY"),
        ({}, {"model": "other-model"}, {"Idempotency-Key": "key"}, "MODEL_NOT_ALLOWLISTED"),
        ({}, {"stream": "false"}, {"Idempotency-Key": "key"}, "STREAMING_REQUEST"),
        ({}, {"stream": 0}, {"Idempotency-Key": "key"}, "STREAMING_REQUEST"),
        ({}, {}, {}, "MISSING_IDEMPOTENCY_KEY"),
        ({}, {"previous_response_id": "resp_1"}, {"Idempotency-Key": "key"}, "CONTINUATION_REQUEST"),
        ({}, {}, {"Idempotency-Key": "key", "X-Hermes-Session-Id": "session-1"}, "CONTINUATION_REQUEST"),
        ({}, {"conversation_history": [{"role": "user", "content": "old"}]}, {"Idempotency-Key": "key"}, "HISTORY_REQUEST"),
        ({}, {"provider": "openai"}, {"Idempotency-Key": "key"}, "PROVIDER_OVERRIDE"),
        ({}, {"tools": [{"type": "function"}]}, {"Idempotency-Key": "key"}, "TOOLS_REQUEST"),
        ({}, {"messages": [{"role": "assistant", "content": "hello"}]}, {"Idempotency-Key": "key"}, "NOT_SINGLE_TEXT_USER_MESSAGE"),
        ({}, {"messages": [{"role": "user", "content": [{"type": "text", "text": "hello"}]}]}, {"Idempotency-Key": "key"}, "NOT_SINGLE_TEXT_USER_MESSAGE"),
        ({}, {"messages": [{"role": "user", "content": " "}]}, {"Idempotency-Key": "key"}, "NOT_SINGLE_TEXT_USER_MESSAGE"),
        ({}, {"messages": [{"role": "user", "content": "one"}, {"role": "user", "content": "two"}]}, {"Idempotency-Key": "key"}, "NOT_SINGLE_TEXT_USER_MESSAGE"),
    ],
)
def test_rejects_each_ineligible_request_shape(config_overrides, request_overrides, headers, reason):
    result = runtime_migration_eligibility(
        _config(**config_overrides), _request(**request_overrides), headers
    )

    assert result.approved is False
    assert result.reason is getattr(RuntimeMigrationEligibilityReason, reason)


def test_rejects_a_non_mapping_request():
    result = runtime_migration_eligibility(_config(), [], {"Idempotency-Key": "key"})

    assert result.approved is False
    assert result.reason is RuntimeMigrationEligibilityReason.INVALID_REQUEST
