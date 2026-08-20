# Python Retirement Ledger

This ledger is generated from `git ls-files '*.py'` at the migration baseline. Every
tracked Python path appears exactly once below, including tests and standalone skill
scripts. The disposition is capability-level, not a claim that deletion is currently
safe.

**Codes**

- `replace`: Bun owns the replacement, subject to the listed gates.
- `remove`: unsupported, stale, or test-only Python surface is deleted from Subpolar.
- `externalize`: retain only in a separately owned plugin, skill, or research tool.
- Owners: `AG` = `api-gateway`; `H` = `harness`; `CP` = `chat-provider-interface`; `DL` = `data-layer`; `TR` = `tool-resolver`; `TX` = `tool-runtime`; `SH` = `@hermes/shared`; `NG:*` = explicit non-goal.
- Evidence: `B` = Bun boundary/package tests; `S` = security/fail-closed tests; `C` = cancellation/cleanup tests; `P` = persistence/restart/recovery tests; `E` = protocol/browser E2E; `N` = no Bun replacement, remove or externalize.
- Reference codes: `R1` = Python imports/entrypoints; `R2` = provider catalog/config; `R3` = tool/skill/plugin discovery; `R4` = session/schema/state docs; `R5` = platform/media/cron claims; `R6` = test-only reference.
- Waves: `W1` = stale claims and unsupported tests; `W2` = external plugins/skills/research; `W3` = deterministic runtime replacements; `W4` = state, gateway, providers, and security after retention gates.
- Status is `planned` unless the path is already outside the active Bun contract (`scoped-out`).

| Path | Disposition | Former responsibility | Bun owner or non-goal | Replacement/security/recovery evidence | References/config/docs to remove | Wave/change | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `agent/__init__.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/account_usage.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/agent_init.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/agent_runtime_helpers.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/anthropic_adapter.py` | replace | provider/transport runtime | CP | BSEC | R2 | W4/PY-PROVIDER | planned |
| `agent/async_utils.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/aux_accounting.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/auxiliary_client.py` | replace | provider/transport runtime | CP | BSEC | R2 | W4/PY-PROVIDER | planned |
| `agent/azure_identity_adapter.py` | replace | provider/transport runtime | CP | BSEC | R2 | W4/PY-PROVIDER | planned |
| `agent/backend_identity.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/background_review.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/battery.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/bedrock_adapter.py` | replace | provider/transport runtime | CP | BSEC | R2 | W4/PY-PROVIDER | planned |
| `agent/billing_links.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/billing_usage.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/billing_view.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/bounded_response.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/browser_provider.py` | replace | provider/transport runtime | CP | BSEC | R2 | W4/PY-PROVIDER | planned |
| `agent/browser_registry.py` | replace | provider/media runtime | CP | BSEC | R2 | W4/PY-PROVIDER | planned |
| `agent/chat_completion_helpers.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/codex_responses_adapter.py` | replace | provider/transport runtime | CP | BSEC | R2 | W4/PY-PROVIDER | planned |
| `agent/codex_runtime.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/coding_context.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/context_breakdown.py` | replace | prompt/context/turn runtime | H | BSC | R1/R4 | W3/PY-RUNTIME | planned |
| `agent/context_compressor.py` | replace | prompt/context/turn runtime | H | BSC | R1/R4 | W3/PY-RUNTIME | planned |
| `agent/context_engine.py` | replace | prompt/context/turn runtime | H | BSC | R1/R4 | W3/PY-RUNTIME | planned |
| `agent/context_references.py` | replace | prompt/context/turn runtime | H | BSC | R1/R4 | W3/PY-RUNTIME | planned |
| `agent/conversation_compression.py` | replace | prompt/context/turn runtime | H | BSC | R1/R4 | W3/PY-RUNTIME | planned |
| `agent/conversation_loop.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/copilot_acp_client.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/credential_persistence.py` | replace | secret/credential runtime | DL | BSP | R1 | W4/PY-SECURITY | planned |
| `agent/credential_pool.py` | replace | secret/credential runtime | DL | BSP | R1 | W4/PY-SECURITY | planned |
| `agent/credential_sources.py` | replace | secret/credential runtime | DL | BSP | R1 | W4/PY-SECURITY | planned |
| `agent/credits_tracker.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/curator.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/curator_backup.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/delegation_context.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/display.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/error_classifier.py` | replace | prompt/context/turn runtime | H | BSC | R1/R4 | W3/PY-RUNTIME | planned |
| `agent/errors.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/file_safety.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/gemini_native_adapter.py` | replace | provider/transport runtime | CP | BSEC | R2 | W4/PY-PROVIDER | planned |
| `agent/gemini_schema.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/i18n.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/image_gen_provider.py` | replace | provider/transport runtime | CP | BSEC | R2 | W4/PY-PROVIDER | planned |
| `agent/image_gen_registry.py` | replace | provider/media runtime | CP | BSEC | R2 | W4/PY-PROVIDER | planned |
| `agent/image_routing.py` | remove | unsupported media runtime | NG:media | N | R5 | W1/PY-CLAIMS | scoped-out |
| `agent/insights.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/interrupt_compat.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/iteration_budget.py` | replace | prompt/context/turn runtime | H | BSC | R1/R4 | W3/PY-RUNTIME | planned |
| `agent/jiter_preload.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/kanban_stop.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/learn_prompt.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/learning_graph.py` | replace | memory/learning runtime | H | BSP | R3/R4 | W4/PY-STATE | planned |
| `agent/learning_graph_render.py` | replace | memory/learning runtime | H | BSP | R3/R4 | W4/PY-STATE | planned |
| `agent/learning_mutations.py` | replace | memory/learning runtime | H | BSP | R3/R4 | W4/PY-STATE | planned |
| `agent/lmstudio_reasoning.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/lsp/__init__.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/lsp/cli.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/lsp/client.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/lsp/eventlog.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/lsp/install.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/lsp/manager.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/lsp/protocol.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/lsp/range_shift.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/lsp/reporter.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/lsp/servers.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/lsp/workspace.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/manual_compression_feedback.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/markdown_tables.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/memory_manager.py` | replace | memory/learning runtime | H | BSP | R3/R4 | W4/PY-STATE | planned |
| `agent/memory_provider.py` | replace | provider/transport runtime | CP | BSEC | R2 | W4/PY-PROVIDER | planned |
| `agent/message_content.py` | replace | prompt/context/turn runtime | H | BSC | R1/R4 | W3/PY-RUNTIME | planned |
| `agent/message_sanitization.py` | replace | prompt/context/turn runtime | H | BSC | R1/R4 | W3/PY-RUNTIME | planned |
| `agent/moa_loop.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/moa_trace.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/model_metadata.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/models_dev.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/monitoring/__init__.py` | replace | health/logging runtime | AG | BSC | R1 | W4/PY-GATEWAY | planned |
| `agent/monitoring/cron_health.py` | replace | health/logging runtime | AG | BSC | R1 | W4/PY-GATEWAY | planned |
| `agent/monitoring/emitter.py` | replace | health/logging runtime | AG | BSC | R1 | W4/PY-GATEWAY | planned |
| `agent/monitoring/events.py` | replace | health/logging runtime | AG | BSC | R1 | W4/PY-GATEWAY | planned |
| `agent/monitoring/gateway_health.py` | replace | health/logging runtime | AG | BSC | R1 | W4/PY-GATEWAY | planned |
| `agent/monitoring/gateway_health_export.py` | replace | health/logging runtime | AG | BSC | R1 | W4/PY-GATEWAY | planned |
| `agent/monitoring/otlp_exporter.py` | replace | health/logging runtime | AG | BSC | R1 | W4/PY-GATEWAY | planned |
| `agent/monitoring/policy.py` | replace | health/logging runtime | AG | BSC | R1 | W4/PY-GATEWAY | planned |
| `agent/monitoring/redaction.py` | replace | health/logging runtime | AG | BSC | R1 | W4/PY-GATEWAY | planned |
| `agent/moonshot_schema.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/nous_rate_guard.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/onboarding.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/oneshot.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/outbound_webhooks.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/pet/__init__.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/pet/constants.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/pet/generate/__init__.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/pet/generate/atlas.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/pet/generate/imagegen.py` | remove | unsupported media runtime | NG:media | N | R5 | W1/PY-CLAIMS | scoped-out |
| `agent/pet/generate/orchestrate.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/pet/generate/prompts.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/pet/manifest.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/pet/render.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/pet/state.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/pet/store.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/plugin_llm.py` | replace | provider/transport runtime | CP | BSEC | R2 | W4/PY-PROVIDER | planned |
| `agent/portal_tags.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/process_bootstrap.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/prompt_builder.py` | replace | prompt/context/turn runtime | H | BSC | R1/R4 | W3/PY-RUNTIME | planned |
| `agent/prompt_caching.py` | replace | prompt/context/turn runtime | H | BSC | R1/R4 | W3/PY-RUNTIME | planned |
| `agent/proxy_sources/__init__.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/proxy_sources/iron_proxy.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/rate_limit_tracker.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/reactions.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/reasoning_timeouts.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/redact.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/relay_llm.py` | replace | provider/transport runtime | CP | BSEC | R2 | W4/PY-PROVIDER | planned |
| `agent/relay_runtime.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/relay_tools.py` | replace | tool/turn policy runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `agent/replay_cleanup.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/retry_utils.py` | replace | prompt/context/turn runtime | H | BSC | R1/R4 | W3/PY-RUNTIME | planned |
| `agent/runtime_cwd.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/secret_scope.py` | replace | secret/credential runtime | DL | BSP | R1 | W4/PY-SECURITY | planned |
| `agent/secret_sources/__init__.py` | replace | secret/credential runtime | DL | BSP | R1 | W4/PY-SECURITY | planned |
| `agent/secret_sources/_cache.py` | replace | secret/credential runtime | DL | BSP | R1 | W4/PY-SECURITY | planned |
| `agent/secret_sources/base.py` | replace | secret/credential runtime | DL | BSP | R1 | W4/PY-SECURITY | planned |
| `agent/secret_sources/bitwarden.py` | replace | secret/credential runtime | DL | BSP | R1 | W4/PY-SECURITY | planned |
| `agent/secret_sources/command.py` | replace | secret/credential runtime | DL | BSP | R1 | W4/PY-SECURITY | planned |
| `agent/secret_sources/onepassword.py` | replace | secret/credential runtime | DL | BSP | R1 | W4/PY-SECURITY | planned |
| `agent/secret_sources/registry.py` | replace | secret/credential runtime | DL | BSP | R1 | W4/PY-SECURITY | planned |
| `agent/session_activity.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/shell_hooks.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/skill_bundles.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/skill_commands.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/skill_preprocessing.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/skill_utils.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/ssl_guard.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/ssl_verify.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/stream_diag.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/stream_single_writer.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/subagent_lifecycle.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/subdirectory_hints.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/subscription_view.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/system_prompt.py` | replace | prompt/context/turn runtime | H | BSC | R1/R4 | W3/PY-RUNTIME | planned |
| `agent/think_scrubber.py` | replace | prompt/context/turn runtime | H | BSC | R1/R4 | W3/PY-RUNTIME | planned |
| `agent/thinking_timeout_guidance.py` | replace | prompt/context/turn runtime | H | BSC | R1/R4 | W3/PY-RUNTIME | planned |
| `agent/thread_scoped_output.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/title_generator.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/tool_dispatch_helpers.py` | replace | tool/turn policy runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `agent/tool_executor.py` | replace | tool/turn policy runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `agent/tool_guardrails.py` | replace | tool/turn policy runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `agent/tool_result_classification.py` | replace | tool/turn policy runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `agent/trace_upload.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/trajectory.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/transcription_provider.py` | replace | provider/transport runtime | CP | BSEC | R2 | W4/PY-PROVIDER | planned |
| `agent/transcription_registry.py` | replace | provider/media runtime | CP | BSEC | R2 | W4/PY-PROVIDER | planned |
| `agent/transports/__init__.py` | replace | provider/transport runtime | CP | BSEC | R2 | W4/PY-PROVIDER | planned |
| `agent/transports/anthropic.py` | replace | provider/transport runtime | CP | BSEC | R2 | W4/PY-PROVIDER | planned |
| `agent/transports/base.py` | replace | provider/transport runtime | CP | BSEC | R2 | W4/PY-PROVIDER | planned |
| `agent/transports/bedrock.py` | replace | provider/transport runtime | CP | BSEC | R2 | W4/PY-PROVIDER | planned |
| `agent/transports/chat_completions.py` | replace | provider/transport runtime | CP | BSEC | R2 | W4/PY-PROVIDER | planned |
| `agent/transports/codex.py` | replace | provider/transport runtime | CP | BSEC | R2 | W4/PY-PROVIDER | planned |
| `agent/transports/codex_app_server.py` | replace | provider/transport runtime | CP | BSEC | R2 | W4/PY-PROVIDER | planned |
| `agent/transports/codex_app_server_session.py` | replace | provider/transport runtime | CP | BSEC | R2 | W4/PY-PROVIDER | planned |
| `agent/transports/codex_event_projector.py` | replace | provider/transport runtime | CP | BSEC | R2 | W4/PY-PROVIDER | planned |
| `agent/transports/hermes_tools_mcp_server.py` | replace | provider/transport runtime | CP | BSEC | R2 | W4/PY-PROVIDER | planned |
| `agent/transports/types.py` | replace | provider/transport runtime | CP | BSEC | R2 | W4/PY-PROVIDER | planned |
| `agent/tts_provider.py` | replace | provider/transport runtime | CP | BSEC | R2 | W4/PY-PROVIDER | planned |
| `agent/tts_registry.py` | replace | provider/media runtime | CP | BSEC | R2 | W4/PY-PROVIDER | planned |
| `agent/turn_context.py` | replace | prompt/context/turn runtime | H | BSC | R1/R4 | W3/PY-RUNTIME | planned |
| `agent/turn_finalizer.py` | replace | prompt/context/turn runtime | H | BSC | R1/R4 | W3/PY-RUNTIME | planned |
| `agent/turn_retry_state.py` | replace | prompt/context/turn runtime | H | BSC | R1/R4 | W3/PY-RUNTIME | planned |
| `agent/turn_summary.py` | replace | prompt/context/turn runtime | H | BSC | R1/R4 | W3/PY-RUNTIME | planned |
| `agent/usage_pricing.py` | replace | agent lifecycle runtime | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `agent/verification_evidence.py` | replace | tool/turn policy runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `agent/verification_stop.py` | replace | tool/turn policy runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `agent/verify_hooks.py` | replace | tool/turn policy runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `agent/vertex_adapter.py` | replace | provider/transport runtime | CP | BSEC | R2 | W4/PY-PROVIDER | planned |
| `agent/video_gen_provider.py` | replace | provider/transport runtime | CP | BSEC | R2 | W4/PY-PROVIDER | planned |
| `agent/video_gen_registry.py` | replace | provider/media runtime | CP | BSEC | R2 | W4/PY-PROVIDER | planned |
| `agent/web_search_provider.py` | replace | provider/transport runtime | CP | BSEC | R2 | W4/PY-PROVIDER | planned |
| `agent/web_search_registry.py` | replace | provider/media runtime | CP | BSEC | R2 | W4/PY-PROVIDER | planned |
| `batch_runner.py` | externalize | research/evaluation runtime | NG:research | N | R5 | W2/PY-EXT | scoped-out |
| `cron/__init__.py` | remove | cron runtime | NG:cron | N | R5 | W1/PY-CLAIMS | scoped-out |
| `cron/blueprint_catalog.py` | remove | cron runtime | NG:cron | N | R5 | W1/PY-CLAIMS | scoped-out |
| `cron/executions.py` | remove | cron runtime | NG:cron | N | R5 | W1/PY-CLAIMS | scoped-out |
| `cron/jobs.py` | remove | cron runtime | NG:cron | N | R5 | W1/PY-CLAIMS | scoped-out |
| `cron/lifecycle_guard.py` | remove | cron runtime | NG:cron | N | R5 | W1/PY-CLAIMS | scoped-out |
| `cron/scheduler.py` | remove | cron runtime | NG:cron | N | R5 | W1/PY-CLAIMS | scoped-out |
| `cron/scheduler_provider.py` | remove | cron runtime | NG:cron | N | R5 | W1/PY-CLAIMS | scoped-out |
| `cron/scripts/__init__.py` | remove | cron runtime | NG:cron | N | R5 | W1/PY-CLAIMS | scoped-out |
| `cron/scripts/classify_items.py` | remove | cron runtime | NG:cron | N | R5 | W1/PY-CLAIMS | scoped-out |
| `cron/suggestion_catalog.py` | remove | cron runtime | NG:cron | N | R5 | W1/PY-CLAIMS | scoped-out |
| `cron/suggestions.py` | remove | cron runtime | NG:cron | N | R5 | W1/PY-CLAIMS | scoped-out |
| `hermes_bootstrap.py` | remove | Python launcher/config runtime | NG:python-launcher | N | R1/R4 | W1/PY-CLAIMS | scoped-out |
| `hermes_constants.py` | remove | Python launcher/config runtime | NG:python-launcher | N | R1/R4 | W1/PY-CLAIMS | scoped-out |
| `hermes_logging.py` | replace | health/logging runtime | AG | BSC | R1 | W4/PY-GATEWAY | planned |
| `hermes_state.py` | replace | session/state runtime | DL | BSP | R4 | W4/PY-STATE | planned |
| `hermes_state_common.py` | replace | session/state runtime | DL | BSP | R4 | W4/PY-STATE | planned |
| `hermes_state_portability.py` | replace | session/state runtime | DL | BSP | R4 | W4/PY-STATE | planned |
| `hermes_state_schema.py` | replace | session/state runtime | DL | BSP | R4 | W4/PY-STATE | planned |
| `hermes_state_search.py` | replace | session/state runtime | DL | BSP | R4 | W4/PY-STATE | planned |
| `hermes_time.py` | remove | Python launcher/config runtime | NG:python-launcher | N | R1/R4 | W1/PY-CLAIMS | scoped-out |
| `mcp_serve.py` | replace | MCP command/runtime | TX | BSEC | R1/R3 | W3/PY-TOOLS | planned |
| `mini_swe_runner.py` | externalize | research/evaluation runtime | NG:research | N | R5 | W2/PY-EXT | scoped-out |
| `model_tools.py` | replace | tool registry/toolset runtime | TR | BSC | R3 | W3/PY-TOOLS | planned |
| `optional-skills/blockchain/evm/scripts/evm_client.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/blockchain/hyperliquid/scripts/hyperliquid_client.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/blockchain/solana/scripts/solana_client.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/creative/kanban-video-orchestrator/scripts/bootstrap_pipeline.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/creative/kanban-video-orchestrator/scripts/monitor.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/creative/meme-generation/scripts/generate_meme.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/creative/pixel-art/scripts/__init__.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/creative/pixel-art/scripts/palettes.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/creative/pixel-art/scripts/pixel_art.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/creative/pixel-art/scripts/pixel_art_video.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/devops/watchers/scripts/_watermark.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/devops/watchers/scripts/watch_github.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/devops/watchers/scripts/watch_http_json.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/devops/watchers/scripts/watch_rss.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/finance/dcf-model/scripts/validate_dcf.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/finance/excel-author/scripts/recalc.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/finance/stocks/scripts/stocks_client.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/health/fitness-nutrition/scripts/body_calc.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/health/fitness-nutrition/scripts/nutrition_search.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/mcp/fastmcp/scripts/scaffold_fastmcp.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/mcp/fastmcp/templates/api_wrapper.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/mcp/fastmcp/templates/database_server.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/mcp/fastmcp/templates/file_processor.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/mcp/mcp-oauth-remote-gateway/scripts/diagnose-oauth-mcp.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/migration/openclaw-migration/scripts/openclaw_to_hermes.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/mlops/training/trl-fine-tuning/templates/basic_grpo_training.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/productivity/canvas/scripts/canvas_api.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/productivity/memento-flashcards/scripts/memento_cards.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/productivity/memento-flashcards/scripts/youtube_quiz.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/productivity/telephony/scripts/telephony.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/research/darwinian-evolver/scripts/parrot_openrouter.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/research/darwinian-evolver/scripts/show_snapshot.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/research/darwinian-evolver/templates/custom_problem_template.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/research/domain-intel/scripts/domain_intel.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/research/drug-discovery/scripts/chembl_target.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/research/drug-discovery/scripts/ro5_screen.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/research/osint-investigation/scripts/_http.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/research/osint-investigation/scripts/_normalize.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/research/osint-investigation/scripts/build_findings.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/research/osint-investigation/scripts/entity_resolution.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/research/osint-investigation/scripts/fetch_courtlistener.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/research/osint-investigation/scripts/fetch_gdelt.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/research/osint-investigation/scripts/fetch_icij_offshore.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/research/osint-investigation/scripts/fetch_nyc_acris.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/research/osint-investigation/scripts/fetch_ofac_sdn.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/research/osint-investigation/scripts/fetch_opencorporates.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/research/osint-investigation/scripts/fetch_sec_edgar.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/research/osint-investigation/scripts/fetch_senate_ld.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/research/osint-investigation/scripts/fetch_usaspending.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/research/osint-investigation/scripts/fetch_wayback.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/research/osint-investigation/scripts/fetch_wikipedia.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/research/osint-investigation/scripts/timing_analysis.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/research/pinecone-research/scripts/memory_manager.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/research/pinecone-research/scripts/rag_pipeline.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/security/godmode/scripts/auto_jailbreak.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/security/godmode/scripts/godmode_race.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/security/godmode/scripts/load_godmode.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/security/godmode/scripts/parseltongue.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/security/oss-forensics/scripts/evidence-store.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/security/unbroker/scripts/autopilot.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/security/unbroker/scripts/badbool.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/security/unbroker/scripts/brokers.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/security/unbroker/scripts/cdp.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/security/unbroker/scripts/config.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/security/unbroker/scripts/crypto.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/security/unbroker/scripts/dossier.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/security/unbroker/scripts/email_modes.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/security/unbroker/scripts/emailer.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/security/unbroker/scripts/ledger.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/security/unbroker/scripts/legal.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/security/unbroker/scripts/paths.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/security/unbroker/scripts/pdd.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/security/unbroker/scripts/registry.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/security/unbroker/scripts/report.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/security/unbroker/scripts/scan.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/security/unbroker/scripts/storage.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/security/unbroker/scripts/tiers.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/security/unbroker/scripts/vectors.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `optional-skills/web-development/cloudflare-temporary-deploy/scripts/parse_deploy_output.py` | externalize | skill script/template | NG:optional-skill | N | R3 | W2/PY-EXT | scoped-out |
| `plugins/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/browser/browser_use/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/browser/browser_use/provider.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/browser/browserbase/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/browser/browserbase/provider.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/browser/firecrawl/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/browser/firecrawl/provider.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/context_engine/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/cron_providers/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/cron_providers/chronos/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/cron_providers/chronos/_nas_client.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/cron_providers/chronos/verify.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/dashboard_auth/basic/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/dashboard_auth/drain/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/dashboard_auth/nous/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/dashboard_auth/self_hosted/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/disk-cleanup/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/disk-cleanup/disk_cleanup.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/google_meet/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/google_meet/audio_bridge.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/google_meet/cli.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/google_meet/meet_bot.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/google_meet/node/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/google_meet/node/cli.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/google_meet/node/client.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/google_meet/node/protocol.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/google_meet/node/registry.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/google_meet/node/server.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/google_meet/process_manager.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/google_meet/realtime/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/google_meet/realtime/openai_client.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/google_meet/tools.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/hermes-achievements/dashboard/plugin_api.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/hermes-achievements/tests/test_achievement_engine.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/image_gen/deepinfra/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/image_gen/fal/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/image_gen/krea/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/image_gen/openai-codex/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/image_gen/openai/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/image_gen/openrouter/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/image_gen/xai/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/kanban/dashboard/plugin_api.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/memory/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/memory/byterover/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/memory/config_schema.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/memory/hindsight/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/memory/hindsight/config_schema.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/memory/holographic/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/memory/holographic/holographic.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/memory/holographic/retrieval.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/memory/holographic/store.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/memory/honcho/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/memory/honcho/cli.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/memory/honcho/client.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/memory/honcho/config_schema.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/memory/honcho/oauth.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/memory/honcho/oauth_flow.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/memory/honcho/session.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/memory/mem0/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/memory/mem0/_backend.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/memory/mem0/_oss_providers.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/memory/mem0/_setup.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/memory/openviking/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/memory/query_rewrite.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/memory/retaindb/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/memory/supermemory/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/model-providers/ai-gateway/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/model-providers/alibaba-coding-plan/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/model-providers/alibaba/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/model-providers/anthropic/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/model-providers/arcee/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/model-providers/azure-foundry/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/model-providers/bedrock/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/model-providers/copilot-acp/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/model-providers/copilot/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/model-providers/custom/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/model-providers/deepinfra/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/model-providers/deepseek/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/model-providers/fireworks/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/model-providers/gemini/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/model-providers/gmi/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/model-providers/huggingface/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/model-providers/kilocode/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/model-providers/kimi-coding/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/model-providers/minimax/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/model-providers/nous/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/model-providers/novita/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/model-providers/nvidia/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/model-providers/ollama-cloud/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/model-providers/openai-codex/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/model-providers/opencode-zen/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/model-providers/openrouter/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/model-providers/qwen-oauth/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/model-providers/stepfun/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/model-providers/upstage/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/model-providers/vertex/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/model-providers/xai/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/model-providers/xiaomi/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/model-providers/zai/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/observability/langfuse/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/observability/nemo_relay/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/platforms/a2a/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/platforms/a2a/adapter.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/platforms/a2a/protocol.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/platforms/a2a/security.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/platforms/a2a/tools.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/platforms/buzz/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/platforms/buzz/adapter.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/platforms/buzz/nostr_auth.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/platforms/dingtalk/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/platforms/dingtalk/adapter.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/platforms/discord/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/platforms/discord/adapter.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/platforms/discord/ffmpeg_utils.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/platforms/discord/recovery.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/platforms/discord/voice_mixer.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/platforms/email/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/platforms/email/adapter.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/platforms/feishu/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/platforms/feishu/adapter.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/platforms/feishu/feishu_comment.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/platforms/feishu/feishu_comment_rules.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/platforms/feishu/feishu_meeting_invite.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/platforms/google_chat/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/platforms/google_chat/adapter.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/platforms/google_chat/oauth.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/platforms/homeassistant/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/platforms/homeassistant/adapter.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/platforms/irc/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/platforms/irc/adapter.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/platforms/line/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/platforms/line/adapter.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/platforms/matrix/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/platforms/matrix/adapter.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/platforms/mattermost/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/platforms/mattermost/adapter.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/platforms/ntfy/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/platforms/ntfy/adapter.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/platforms/photon/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/platforms/photon/adapter.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/platforms/photon/auth.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/platforms/photon/cli.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/platforms/photon/sidecar_paths.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/platforms/raft/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/platforms/raft/adapter.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/platforms/simplex/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/platforms/simplex/adapter.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/platforms/slack/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/platforms/slack/adapter.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/platforms/slack/block_kit.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/platforms/sms/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/platforms/sms/adapter.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/platforms/teams/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/platforms/teams/adapter.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/platforms/telegram/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/platforms/telegram/adapter.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/platforms/telegram/telegram_ids.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/platforms/telegram/telegram_network.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/platforms/wecom/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/platforms/wecom/adapter.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/platforms/wecom/callback_adapter.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/platforms/wecom/wecom_crypto.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/platforms/whatsapp/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/platforms/whatsapp/adapter.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/plugin_utils.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/security-guidance/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/security-guidance/patterns.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/spotify/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/spotify/client.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/spotify/tools.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/teams_pipeline/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/teams_pipeline/cli.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/teams_pipeline/meetings.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/teams_pipeline/models.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/teams_pipeline/pipeline.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/teams_pipeline/runtime.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/teams_pipeline/store.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/teams_pipeline/subscriptions.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/video_gen/deepinfra/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/video_gen/fal/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/video_gen/xai/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/web/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/web/brave_free/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/web/brave_free/provider.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/web/ddgs/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/web/ddgs/_search_worker.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/web/ddgs/provider.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/web/exa/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/web/exa/provider.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/web/firecrawl/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/web/firecrawl/provider.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/web/parallel/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/web/parallel/provider.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/web/searxng/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/web/searxng/provider.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/web/tavily/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/web/tavily/provider.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/web/xai/__init__.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `plugins/web/xai/provider.py` | externalize | plugin implementation/test | NG:plugin | N | R3/R5 | W2/PY-EXT | scoped-out |
| `providers/__init__.py` | replace | provider contract/runtime | CP | BSE | R2 | W4/PY-PROVIDER | planned |
| `providers/base.py` | replace | provider contract/runtime | CP | BSE | R2 | W4/PY-PROVIDER | planned |
| `run_agent.py` | replace | agent entrypoint | H | BCEP | R1 | W3/PY-RUNTIME | planned |
| `scripts/add_contributor.py` | externalize | repository maintenance script | NG:repo-maintenance | N | R1/R6 | W2/PY-EXT | scoped-out |
| `scripts/analyze_livetest.py` | externalize | repository maintenance script | NG:repo-maintenance | N | R1/R6 | W2/PY-EXT | scoped-out |
| `scripts/audit_pr_attribution.py` | externalize | repository maintenance script | NG:repo-maintenance | N | R1/R6 | W2/PY-EXT | scoped-out |
| `scripts/benchmark_browser_eval.py` | externalize | repository maintenance script | NG:repo-maintenance | N | R1/R6 | W2/PY-EXT | scoped-out |
| `scripts/check-windows-footguns.py` | externalize | repository maintenance script | NG:repo-maintenance | N | R1/R6 | W2/PY-EXT | scoped-out |
| `scripts/check_subprocess_stdin.py` | externalize | repository maintenance script | NG:repo-maintenance | N | R1/R6 | W2/PY-EXT | scoped-out |
| `scripts/ci/assemble_review_comment.py` | externalize | repository maintenance script | NG:repo-maintenance | N | R1/R6 | W2/PY-EXT | scoped-out |
| `scripts/ci/classify_changes.py` | externalize | repository maintenance script | NG:repo-maintenance | N | R1/R6 | W2/PY-EXT | scoped-out |
| `scripts/ci/e2e_screenshot_status.py` | externalize | repository maintenance script | NG:repo-maintenance | N | R1/R6 | W2/PY-EXT | scoped-out |
| `scripts/ci/emit_review_status.py` | externalize | repository maintenance script | NG:repo-maintenance | N | R1/R6 | W2/PY-EXT | scoped-out |
| `scripts/ci/live_comment.py` | externalize | repository maintenance script | NG:repo-maintenance | N | R1/R6 | W2/PY-EXT | scoped-out |
| `scripts/ci/lockfile_diff.py` | externalize | repository maintenance script | NG:repo-maintenance | N | R1/R6 | W2/PY-EXT | scoped-out |
| `scripts/ci/publish_e2e_evidence.py` | externalize | repository maintenance script | NG:repo-maintenance | N | R1/R6 | W2/PY-EXT | scoped-out |
| `scripts/ci/timings_report.py` | externalize | repository maintenance script | NG:repo-maintenance | N | R1/R6 | W2/PY-EXT | scoped-out |
| `scripts/contributor_audit.py` | externalize | repository maintenance script | NG:repo-maintenance | N | R1/R6 | W2/PY-EXT | scoped-out |
| `scripts/discord-voice-doctor.py` | externalize | repository maintenance script | NG:repo-maintenance | N | R1/R6 | W2/PY-EXT | scoped-out |
| `scripts/docker_config_migrate.py` | externalize | repository maintenance script | NG:repo-maintenance | N | R1/R6 | W2/PY-EXT | scoped-out |
| `scripts/docker_rebootstrap_nous_session.py` | externalize | repository maintenance script | NG:repo-maintenance | N | R1/R6 | W2/PY-EXT | scoped-out |
| `scripts/generate_conformance_vectors.py` | externalize | repository maintenance script | NG:repo-maintenance | N | R1/R6 | W2/PY-EXT | scoped-out |
| `scripts/install_psutil_android.py` | externalize | repository maintenance script | NG:repo-maintenance | N | R1/R6 | W2/PY-EXT | scoped-out |
| `scripts/iso-certify.py` | externalize | repository maintenance script | NG:repo-maintenance | N | R1/R6 | W2/PY-EXT | scoped-out |
| `scripts/keystroke_diagnostic.py` | externalize | repository maintenance script | NG:repo-maintenance | N | R1/R6 | W2/PY-EXT | scoped-out |
| `scripts/lint_diff.py` | externalize | repository maintenance script | NG:repo-maintenance | N | R1/R6 | W2/PY-EXT | scoped-out |
| `scripts/micro_compaction_report.py` | externalize | repository maintenance script | NG:repo-maintenance | N | R1/R6 | W2/PY-EXT | scoped-out |
| `scripts/observability/gateway_health_export_probe.py` | externalize | repository maintenance script | NG:repo-maintenance | N | R1/R6 | W2/PY-EXT | scoped-out |
| `scripts/observability/otel_capture_collector.py` | externalize | repository maintenance script | NG:repo-maintenance | N | R1/R6 | W2/PY-EXT | scoped-out |
| `scripts/release.py` | externalize | repository maintenance script | NG:repo-maintenance | N | R1/R6 | W2/PY-EXT | scoped-out |
| `scripts/run_tests_parallel.py` | externalize | repository maintenance script | NG:repo-maintenance | N | R1/R6 | W2/PY-EXT | scoped-out |
| `scripts/sample_and_compress.py` | externalize | repository maintenance script | NG:repo-maintenance | N | R1/R6 | W2/PY-EXT | scoped-out |
| `scripts/smoke_nemo_relay_shared_metrics.py` | externalize | repository maintenance script | NG:repo-maintenance | N | R1/R6 | W2/PY-EXT | scoped-out |
| `scripts/tool_search_livetest.py` | externalize | repository maintenance script | NG:repo-maintenance | N | R1/R6 | W2/PY-EXT | scoped-out |
| `scripts/tool_search_livetest2.py` | externalize | repository maintenance script | NG:repo-maintenance | N | R1/R6 | W2/PY-EXT | scoped-out |
| `scripts/tool_search_livetest_ue.py` | externalize | repository maintenance script | NG:repo-maintenance | N | R1/R6 | W2/PY-EXT | scoped-out |
| `scripts/tool_search_livetest_ue_disc.py` | externalize | repository maintenance script | NG:repo-maintenance | N | R1/R6 | W2/PY-EXT | scoped-out |
| `scripts/tool_search_livetest_ue_hard.py` | externalize | repository maintenance script | NG:repo-maintenance | N | R1/R6 | W2/PY-EXT | scoped-out |
| `skills/creative/comfyui/scripts/_common.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/creative/comfyui/scripts/auto_fix_deps.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/creative/comfyui/scripts/check_deps.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/creative/comfyui/scripts/extract_schema.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/creative/comfyui/scripts/fetch_logs.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/creative/comfyui/scripts/hardware_check.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/creative/comfyui/scripts/health_check.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/creative/comfyui/scripts/run_batch.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/creative/comfyui/scripts/run_workflow.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/creative/comfyui/scripts/ws_monitor.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/creative/comfyui/tests/conftest.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/creative/comfyui/tests/test_check_deps.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/creative/comfyui/tests/test_cloud_integration.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/creative/comfyui/tests/test_common.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/creative/comfyui/tests/test_extract_schema.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/creative/comfyui/tests/test_run_workflow.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/creative/excalidraw/scripts/upload.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/github/github-auth/scripts/git-credential-token.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/media/youtube-content/scripts/fetch_transcript.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/productivity/docx/scripts/__init__.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/productivity/docx/scripts/accept_changes.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/productivity/docx/scripts/comment.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/productivity/docx/scripts/merge_runs.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/productivity/docx/scripts/office/helpers/__init__.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/productivity/docx/scripts/office/helpers/pptx_chart.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/productivity/docx/scripts/office/helpers/pptx_slide.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/productivity/docx/scripts/office/helpers/pptx_theme.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/productivity/docx/scripts/office/soffice.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/productivity/docx/scripts/office/validate.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/productivity/docx/scripts/office/validators/__init__.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/productivity/docx/scripts/office/validators/base.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/productivity/docx/scripts/office/validators/docx.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/productivity/docx/scripts/office/validators/pptx.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/productivity/docx/scripts/office/validators/redlining.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/productivity/google-workspace/scripts/_hermes_home.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/productivity/google-workspace/scripts/google_api.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/productivity/google-workspace/scripts/gws_bridge.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/productivity/google-workspace/scripts/setup.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/productivity/maps/scripts/maps_client.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/productivity/ocr-and-documents/scripts/extract_marker.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/productivity/ocr-and-documents/scripts/extract_pymupdf.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/productivity/pdf/scripts/check_bounding_boxes.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/productivity/pdf/scripts/check_fillable_fields.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/productivity/pdf/scripts/convert_pdf_to_images.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/productivity/pdf/scripts/create_validation_image.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/productivity/pdf/scripts/extract_form_field_info.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/productivity/pdf/scripts/extract_form_structure.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/productivity/pdf/scripts/fill_fillable_fields.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/productivity/pdf/scripts/fill_pdf_form_with_annotations.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/productivity/powerpoint/scripts/__init__.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/productivity/powerpoint/scripts/add_slide.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/productivity/powerpoint/scripts/clean.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/productivity/powerpoint/scripts/office/helpers/__init__.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/productivity/powerpoint/scripts/office/helpers/pptx_chart.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/productivity/powerpoint/scripts/office/helpers/pptx_slide.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/productivity/powerpoint/scripts/office/helpers/pptx_theme.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/productivity/powerpoint/scripts/office/soffice.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/productivity/powerpoint/scripts/office/validate.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/productivity/powerpoint/scripts/office/validators/__init__.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/productivity/powerpoint/scripts/office/validators/base.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/productivity/powerpoint/scripts/office/validators/docx.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/productivity/powerpoint/scripts/office/validators/pptx.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/productivity/powerpoint/scripts/office/validators/redlining.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/productivity/powerpoint/scripts/thumbnail.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/productivity/xlsx/scripts/office/soffice.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/productivity/xlsx/scripts/recalc.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/research/arxiv/scripts/search_arxiv.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/research/grounded-citations/scripts/_hermes_home.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/research/grounded-citations/scripts/sources.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `skills/research/polymarket/scripts/polymarket.py` | externalize | skill script/test | NG:skill | N | R3 | W2/PY-EXT | scoped-out |
| `tests/__init__.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/acp/__init__.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/acp/conftest.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/acp/test_approval_isolation.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/acp/test_auth.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/acp/test_edit_approval.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/acp/test_entry.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/acp/test_events.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/acp/test_mcp_e2e.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/acp/test_named_provider_catalogs.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/acp/test_permissions.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/acp/test_ping_suppression.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/acp/test_server.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/acp/test_session.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/acp/test_session_db_private_access.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/acp/test_session_provenance.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/acp/test_tools.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/acp_adapter/test_acp_commands.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/acp_adapter/test_acp_images.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/acp_adapter/test_acp_mcp_discovery.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/acp_adapter/test_detect_provider_entra.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/agent/__init__.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/lsp/__init__.py` | remove | LSP behavior test | NG:LSP | N | R6 | W1/PY-TEST | scoped-out |
| `tests/agent/lsp/_mock_lsp_server.py` | remove | LSP behavior test | NG:LSP | N | R6 | W1/PY-TEST | scoped-out |
| `tests/agent/lsp/test_backend_gate.py` | remove | LSP behavior test | NG:LSP | N | R6 | W1/PY-TEST | scoped-out |
| `tests/agent/lsp/test_broken_set.py` | remove | LSP behavior test | NG:LSP | N | R6 | W1/PY-TEST | scoped-out |
| `tests/agent/lsp/test_client_e2e.py` | remove | LSP behavior test | NG:LSP | N | R6 | W1/PY-TEST | scoped-out |
| `tests/agent/lsp/test_delta_key.py` | remove | LSP behavior test | NG:LSP | N | R6 | W1/PY-TEST | scoped-out |
| `tests/agent/lsp/test_diagnostics_field.py` | remove | LSP behavior test | NG:LSP | N | R6 | W1/PY-TEST | scoped-out |
| `tests/agent/lsp/test_eventlog.py` | remove | LSP behavior test | NG:LSP | N | R6 | W1/PY-TEST | scoped-out |
| `tests/agent/lsp/test_install_and_lint_fixes.py` | remove | LSP behavior test | NG:LSP | N | R6 | W1/PY-TEST | scoped-out |
| `tests/agent/lsp/test_lifecycle.py` | remove | LSP behavior test | NG:LSP | N | R6 | W1/PY-TEST | scoped-out |
| `tests/agent/lsp/test_powershell_server.py` | remove | LSP behavior test | NG:LSP | N | R6 | W1/PY-TEST | scoped-out |
| `tests/agent/lsp/test_protocol.py` | remove | LSP behavior test | NG:LSP | N | R6 | W1/PY-TEST | scoped-out |
| `tests/agent/lsp/test_reporter.py` | remove | LSP behavior test | NG:LSP | N | R6 | W1/PY-TEST | scoped-out |
| `tests/agent/lsp/test_service.py` | remove | LSP behavior test | NG:LSP | N | R6 | W1/PY-TEST | scoped-out |
| `tests/agent/lsp/test_shell_linter_lsp_skip.py` | remove | LSP behavior test | NG:LSP | N | R6 | W1/PY-TEST | scoped-out |
| `tests/agent/lsp/test_stale_diagnostics.py` | remove | LSP behavior test | NG:LSP | N | R6 | W1/PY-TEST | scoped-out |
| `tests/agent/lsp/test_workspace.py` | remove | LSP behavior test | NG:LSP | N | R6 | W1/PY-TEST | scoped-out |
| `tests/agent/test_account_usage.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_anthropic_adapter.py` | replace | provider/transport test | CP | BSC | R6 | W4/PY-PROVIDER | planned |
| `tests/agent/test_anthropic_billing_guidance.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_anthropic_keychain.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_anthropic_kimi_signed_thinking_replay.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_anthropic_kwargs_sanitize.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_anthropic_mcp_prefix_strip.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_anthropic_oauth_pkce.py` | replace | credential/secret test | DL | BSP | R6 | W4/PY-SECURITY | planned |
| `tests/agent/test_anthropic_oauth_ua_prefix.py` | replace | credential/secret test | DL | BSP | R6 | W4/PY-SECURITY | planned |
| `tests/agent/test_anthropic_output_field_leak.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_anthropic_thinking_block_order.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_anthropic_token_scope_isolation.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_anthropic_whitespace_text_blocks.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_api_content_sidecar.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_arcee_trinity_overrides.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_async_token_accounting.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_async_utils.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_aux_progress_streaming.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_auxiliary_anthropic_pool_fallback_regression.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_auxiliary_client.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_auxiliary_client_anthropic_custom.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_auxiliary_client_azure_foundry.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_auxiliary_client_base_url_host_validation_52608.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_auxiliary_client_bootstrap_skew.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_auxiliary_client_proxy_env.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_auxiliary_client_resolve_dedup.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_auxiliary_client_ssl_verify.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_auxiliary_client_xai_oauth_recovery.py` | replace | credential/secret test | DL | BSP | R6 | W4/PY-SECURITY | planned |
| `tests/agent/test_auxiliary_compression_timeout_floor.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_auxiliary_concurrency.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_auxiliary_config_bridge.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_auxiliary_explicit_cancellation.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_auxiliary_main_first.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_auxiliary_named_custom_providers.py` | replace | provider/transport test | CP | BSC | R6 | W4/PY-PROVIDER | planned |
| `tests/agent/test_auxiliary_relay.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_auxiliary_runtime_cache_key.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_auxiliary_transient_retry.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_auxiliary_transport_autodetect.py` | replace | provider/transport test | CP | BSC | R6 | W4/PY-PROVIDER | planned |
| `tests/agent/test_auxiliary_user_default_headers.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_azure_identity_adapter.py` | replace | provider/transport test | CP | BSC | R6 | W4/PY-PROVIDER | planned |
| `tests/agent/test_backend_identity.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_battery.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_bedrock_1m_context.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_bedrock_adapter.py` | replace | provider/transport test | CP | BSC | R6 | W4/PY-PROVIDER | planned |
| `tests/agent/test_bedrock_empty_text_blocks.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_bedrock_integration.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_bedrock_interrupt_post_worker.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_billing_links.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_billing_usage.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_billing_view.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_bounded_response.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_budget_reasoning_details_exclusion.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_cache_disabled_on_stubs.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_canon_args_memo_parity.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_cascading_interrupt_6600.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_chat_completion_helpers_provider_sort.py` | replace | provider/transport test | CP | BSC | R6 | W4/PY-PROVIDER | planned |
| `tests/agent/test_cjk_token_estimation.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_close_interrupted_tool_sequence.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_codex_app_server_event_bridge.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_codex_app_server_persist.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_codex_cloudflare_headers.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_codex_gpt55_autoraise_notice.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_codex_responses_adapter.py` | replace | provider/transport test | CP | BSC | R6 | W4/PY-PROVIDER | planned |
| `tests/agent/test_codex_runtime_live_events.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_codex_ttfb_watchdog.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_coding_context.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_compaction_anti_thrash.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_compaction_redaction_boundaries.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_compress_context_progress_timeout.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_compress_focus.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_compress_signal_leak.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_compressed_summary_metadata.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_compression_anti_thrash_persistence.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_compression_anti_thrash_recovery.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_compression_attempt_telemetry.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_compression_concurrent_fork.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_compression_count_warning_36908.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_compression_fallback_budget.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_compression_interrupt_protection.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_compression_logging_session_context.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_compression_max_attempts_config.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_compression_progress.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_compression_review_76354.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_compression_rotation_state.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_compression_small_ctx_threshold_floor.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_compression_worker_isolation_76354.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_compressor_actionable_tail_anchor.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_compressor_assistant_tail_anchor.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_compressor_historical_media.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_compressor_image_tokens.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_compressor_media_stripping.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_compressor_tail_cut_oob_fix.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_compressor_tail_cut_tool_pair_floor.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_compressor_tool_call_budget.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_compressor_zero_user_guard.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_context_breakdown.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_context_compressor.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_context_compressor_cross_session_guard.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_context_compressor_session_end_clears_state.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_context_compressor_summary_continuity.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_context_compressor_temporal_anchoring.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_context_compressor_zero_user_provenance.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_context_engine.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_context_engine_host_contract.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_context_engine_on_turn_complete_usage.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_context_engine_select_context.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_context_references.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_context_refs_concurrent.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_context_route_mismatch.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_copilot_acp_client.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_copilot_acp_deprecation.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_credential_pool.py` | replace | credential/secret test | DL | BSP | R6 | W4/PY-SECURITY | planned |
| `tests/agent/test_credential_pool_deferred_refresh.py` | replace | credential/secret test | DL | BSP | R6 | W4/PY-SECURITY | planned |
| `tests/agent/test_credential_pool_lease_refresh_reselect.py` | replace | credential/secret test | DL | BSP | R6 | W4/PY-SECURITY | planned |
| `tests/agent/test_credential_pool_no_entries_log_throttle.py` | replace | credential/secret test | DL | BSP | R6 | W4/PY-SECURITY | planned |
| `tests/agent/test_credential_pool_oat_authtype.py` | replace | credential/secret test | DL | BSP | R6 | W4/PY-SECURITY | planned |
| `tests/agent/test_credential_pool_oauth_writethrough.py` | replace | credential/secret test | DL | BSP | R6 | W4/PY-SECURITY | planned |
| `tests/agent/test_credential_pool_provider_boundary.py` | replace | provider/transport test | CP | BSC | R6 | W4/PY-PROVIDER | planned |
| `tests/agent/test_credential_pool_quarantine_locking.py` | replace | credential/secret test | DL | BSP | R6 | W4/PY-SECURITY | planned |
| `tests/agent/test_credential_pool_routing.py` | replace | credential/secret test | DL | BSP | R6 | W4/PY-SECURITY | planned |
| `tests/agent/test_credential_pool_unmatched_rotation_bound.py` | replace | credential/secret test | DL | BSP | R6 | W4/PY-SECURITY | planned |
| `tests/agent/test_credits_cold_start.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_credits_fixture_snapshot.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_credits_policy.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_credits_tracker.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_credits_view.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_cron_inline_api_call_62151.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_crossloop_client_cache.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_curator.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_curator_activity.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_curator_backup.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_curator_classification.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_curator_reports.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_cursor_optimizations_parity.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_custom_pool_mismatch_guard.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_custom_provider_extra_body.py` | replace | provider/transport test | CP | BSC | R6 | W4/PY-PROVIDER | planned |
| `tests/agent/test_custom_provider_extra_body_matching.py` | replace | provider/transport test | CP | BSC | R6 | W4/PY-PROVIDER | planned |
| `tests/agent/test_custom_providers_vision.py` | replace | provider/transport test | CP | BSC | R6 | W4/PY-PROVIDER | planned |
| `tests/agent/test_deepseek_anthropic_thinking.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_direct_provider_url_detection.py` | replace | provider/transport test | CP | BSC | R6 | W4/PY-PROVIDER | planned |
| `tests/agent/test_display.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_display_emoji.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_display_todo_progress.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_display_tool_failure.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_empty_tool_name_loop_dampening.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_endpoint_blackhole.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_engine_preflight_wire.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_error_classifier.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_external_skills.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_external_skills_dirs_cache.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_failover_identity.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_file_safety.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_file_safety_container_mirror.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_file_safety_credentials.py` | replace | credential/secret test | DL | BSP | R6 | W4/PY-SECURITY | planned |
| `tests/agent/test_file_safety_cross_profile.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_file_safety_sandbox_mirror.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_file_safety_session_state.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_gateway_turn_sidecar.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_gemini_fast_fallback.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_gemini_free_tier_gate.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_gemini_native_adapter.py` | replace | provider/transport test | CP | BSC | R6 | W4/PY-PROVIDER | planned |
| `tests/agent/test_gemini_schema.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_gemini_standard_key_guidance.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_ghost_skill_pruning.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_i18n.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_idle_compaction.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_idle_compaction_lock_and_guards.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_image_gen_registry.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_image_routing.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_insights.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_intent_ack_continuation.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_interrupt_compat.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_jiter_preload.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_kanban_stop.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_kimi_coding_anthropic_thinking.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_last_total_tokens.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_learn_prompt.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_learning_graph.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_learning_graph_render.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_learning_mutations.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_lmstudio_reasoning.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_local_probe_disk_cache.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_local_stream_timeout.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_manual_compression_feedback.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_markdown_tables.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_memory_async_sync.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_memory_boundary_commit.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_memory_provider.py` | replace | provider/transport test | CP | BSC | R6 | W4/PY-PROVIDER | planned |
| `tests/agent/test_memory_session_switch.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_memory_skill_scaffolding.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_memory_user_id.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_memory_write_bridge.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_message_content.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_message_sanitization_policy.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_micro_compaction.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_minimax_auxiliary_url.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_minimax_provider.py` | replace | provider/transport test | CP | BSC | R6 | W4/PY-PROVIDER | planned |
| `tests/agent/test_moa_aggregator_cache_control.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_moa_aggregator_cost_slot.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_moa_cold_start_cache_66793.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_moa_context_max_tokens.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_moa_progress.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_moa_quiet_reference_output.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_moa_reasoning_effort.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_moa_reference_system_prompt.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_moa_slot_api_mode.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_moa_slot_max_tokens.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_moa_switch_api_mode.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_moa_trace_streamed_capture.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_model_extra_type_guard.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_model_metadata.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_model_metadata_local_ctx.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_model_metadata_ssl.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_models_dev.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_moonshot_schema.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_non_stream_stale_timeout.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_none_deref_guards.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_nous_credits_gauge.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_nous_credits_snapshot.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_nous_oauth_401_guidance.py` | replace | credential/secret test | DL | BSP | R6 | W4/PY-SECURITY | planned |
| `tests/agent/test_nous_portal_anthropic_wire.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_nous_rate_guard.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_onboarding.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_oneshot.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_openrouter_response_cache.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_org_skill_namespace.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_outbound_webhooks.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_pet_engine.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_pet_generate.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_platform_hint_desktop.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_platform_hint_overrides.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_plugin_llm.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_portal_tags.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_post_compression_trim.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_pre_compress_memory_context.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_preflight_compression_gate.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_preflight_lock_defer.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_proactive_prune_config.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_proactive_tool_result_pruning.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_probe_cache_followups.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_prompt_builder.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_prompt_caching.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_protected_tail_pressure_61932.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_proxy_and_url_validation.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_rate_limit_tracker.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_reactions.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_reasoning_stale_timeout_floor.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_redact.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_relay_llm.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_relay_tools.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_replay_cleanup.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_request_client_reuse.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_restore_primary_pool_reselect.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_resume_stale_active_task.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_rotation_flush_persisted_boundary_68196.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_runtime_cwd.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_save_url_image.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_secret_scope.py` | replace | credential/secret test | DL | BSP | R6 | W4/PY-SECURITY | planned |
| `tests/agent/test_secret_scope_tier1_migration.py` | replace | credential/secret test | DL | BSP | R6 | W4/PY-SECURITY | planned |
| `tests/agent/test_session_activity.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_session_rotation_flush_cold_resume_68454.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_set_runtime_main_custom_provider.py` | replace | provider/transport test | CP | BSC | R6 | W4/PY-PROVIDER | planned |
| `tests/agent/test_shell_hooks.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_shell_hooks_consent.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_skill_bundles.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_skill_commands.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_skill_commands_reload.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_skill_invocation_description.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_skill_utils.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_skip_memory_store_65429.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_ssl_ca_guard.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_ssl_verify.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_stream_chunk_byte_estimate.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_stream_read_timeout_floor.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_stream_single_writer_guard.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_streaming_context_scrubber.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_subagent_lifecycle.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_subagent_progress.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_subagent_stop_hook.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_subdirectory_hints.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_subdirectory_hints_tilde.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_subprocess_env_guard.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_subscription_view.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_summarize_tool_result_type_safety.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_summary_prefix_semantics.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_summary_prefix_tool_use.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_summary_role_template_alternation.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_synthetic_turn_display_kind.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_system_prompt.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_system_prompt_restore.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_think_scrubber.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_thinking_timeout_guidance.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_thread_scoped_output.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_title_generator.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_tool_call_arg_no_redaction.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_tool_dispatch_helpers.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_tool_executor_checkpoint_paths.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_tool_guardrails.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_tool_result_classification.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_trace_upload.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_transcription_registry.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_tts_registry.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_turn_context.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_turn_context_overflow_warning.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_turn_finalizer_cleanup_guard.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_turn_finalizer_final_response_persistence.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_turn_finalizer_interrupt_alternation.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_turn_finalizer_iteration_limit_exit.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_turn_overlap_tripwire.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_turn_retry_state.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_turn_summary.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_unsupported_parameter_retry.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_unsupported_temperature_retry.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_usage_pricing.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_verification_evidence.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_verification_evidence_fd_leak.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_verification_stop.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_verification_stop_caching.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_verify_hooks.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_vertex_adapter.py` | replace | provider/transport test | CP | BSC | R6 | W4/PY-PROVIDER | planned |
| `tests/agent/test_video_gen_registry.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_vision_resolved_args.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/test_vision_routing_31179.py` | replace | agent lifecycle test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/agent/transports/__init__.py` | replace | provider/transport test | CP | BSC | R6 | W4/PY-PROVIDER | planned |
| `tests/agent/transports/test_bedrock_transport.py` | replace | provider/transport test | CP | BSC | R6 | W4/PY-PROVIDER | planned |
| `tests/agent/transports/test_chat_completions.py` | replace | provider/transport test | CP | BSC | R6 | W4/PY-PROVIDER | planned |
| `tests/agent/transports/test_codex_app_server_runtime.py` | replace | provider/transport test | CP | BSC | R6 | W4/PY-PROVIDER | planned |
| `tests/agent/transports/test_codex_app_server_session.py` | replace | provider/transport test | CP | BSC | R6 | W4/PY-PROVIDER | planned |
| `tests/agent/transports/test_codex_event_projector.py` | replace | provider/transport test | CP | BSC | R6 | W4/PY-PROVIDER | planned |
| `tests/agent/transports/test_codex_transport.py` | replace | provider/transport test | CP | BSC | R6 | W4/PY-PROVIDER | planned |
| `tests/agent/transports/test_hermes_tools_mcp_server.py` | replace | provider/transport test | CP | BSC | R6 | W4/PY-PROVIDER | planned |
| `tests/agent/transports/test_transport.py` | replace | provider/transport test | CP | BSC | R6 | W4/PY-PROVIDER | planned |
| `tests/agent/transports/test_types.py` | replace | provider/transport test | CP | BSC | R6 | W4/PY-PROVIDER | planned |
| `tests/ci/test_assemble_review_comment.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/ci/test_classify_changes.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/ci/test_e2e_screenshot_status.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/ci/test_emit_review_status.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/ci/test_live_comment.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/ci/test_lockfile_diff.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/ci/test_publish_e2e_evidence.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/ci/test_timings_report.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/cli/__init__.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/conftest.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_bang_shell_mode.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_bracketed_paste_timeout.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_branch_command.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_busy_input_mode_command.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_chat_q_exit_clear.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_cli_active_agent_ref_wiring.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_cli_approval_ui.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_cli_async_delegation_delivery.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_cli_background_busy_path.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_cli_background_status_indicator.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_cli_bracketed_paste_sanitizer.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_cli_browser_connect.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_cli_cmd_backspace.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_cli_codex_context_reference.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_cli_context_warning.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_cli_copy_command.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_cli_delegate_background_notice.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_cli_extension_hooks.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_cli_external_editor.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_cli_file_drop.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_cli_first_run_setup.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_cli_force_redraw.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_cli_goal_interrupt.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_cli_image_command.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_cli_init.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_cli_insights_command.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_cli_interrupt_ack_race.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_cli_interrupt_drain_regression.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_cli_interrupt_subagent.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_cli_light_mode.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_cli_loading_indicator.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_cli_markdown_rendering.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_cli_mcp_config_watch.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_cli_new_session.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_cli_pet_pane.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_cli_prefix_matching.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_cli_preloaded_skills.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_cli_provider_resolution.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_cli_queue_paste.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_cli_reload_skills.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_cli_resume_command.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_cli_retry.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_cli_save_config_value.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_cli_secret_capture.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_cli_shift_enter_newline.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_cli_shutdown_memory_messages.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_cli_skin_integration.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_cli_status_bar.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_cli_status_bar_goal.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_cli_status_command.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_cli_steer_busy_path.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_cli_terminal_response_sanitizer.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_cli_terminal_shortcuts.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_cli_tools_command.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_cli_user_message_preview.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_cli_yolo_resume_persistence.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_cli_yolo_toggle.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_compress_flags.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_compress_focus.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_compress_here.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_compress_type_ahead.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_cpr_local_leak.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_cprint_bg_thread.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_ctrl_enter_newline.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_cwd_env_respect.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_destructive_slash_confirm.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_destructive_slash_inline_skip_e2e.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_exit_delete_session.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_exit_summary_resume_hint.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_exit_watchdog_signal_arm.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_fast_command.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_focus_view.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_indicator_command.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_manual_compress.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_moa_command.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_partial_compress.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_personality_none.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_prefill_config.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_prepend_note_to_message.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_prompt_stash.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_prompt_stash_cli.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_prompt_text_input_thread_safety.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_quick_commands.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_reasoning_command.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_resume_display.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_resume_quiet_stderr.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_save_conversation_location.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_session_boundary_hooks.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_single_query_session_finalize.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_slash_command_interrupt.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_slash_confirm_windows.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_steer_inline_repaint_34569.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_stream_delta_think_tag.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_stream_flush_left.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_stream_partial_line_flush.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_surrogate_sanitization.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_terminal_interrupt_recovery.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_tool_progress_scrollback.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_update_command.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_version_command.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_worktree.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_worktree_security.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cli/test_worktree_sync_base.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/computer_use/live_cua_0_9_smoke.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/computer_use/test_cua_atexit_teardown.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/computer_use/test_cua_cli_fallback_env.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/computer_use/test_cua_no_overlay.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/computer_use/test_cua_perf_knobs.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/computer_use/test_cua_spawn_env_sanitization.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/computer_use/test_cua_telemetry.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/computer_use/test_cua_wsl_manifest_path.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/computer_use/test_doctor.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/computer_use/test_permissions_resolution.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/conformance/__init__.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/conformance/test_vector_generator.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/conftest.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/cron/__init__.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cron/conftest.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cron/test_blueprint_catalog.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cron/test_claim_job_for_fire.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cron/test_codex_execution_paths.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cron/test_compute_next_run_last_run_at.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cron/test_cron_context_from.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cron/test_cron_direct_api_call_62151.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cron/test_cron_inactivity_timeout.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cron/test_cron_no_agent.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cron/test_cron_profile_isolation.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cron/test_cron_prompt_injection_skill.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cron/test_cron_provider_pin.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cron/test_cron_script.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cron/test_cron_workdir.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cron/test_cronjob_schema.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cron/test_execution_ledger.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cron/test_file_permissions.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cron/test_idle_tick_config_skip.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cron/test_jobs.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cron/test_jobs_changed_notify.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cron/test_jobs_crossprocess_lock.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cron/test_jobs_file_ownership.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cron/test_parallel_pool.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cron/test_reasoning_config_per_model.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cron/test_rewrite_skill_refs.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cron/test_run_one_job.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cron/test_scheduler.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cron/test_scheduler_cron_session_isolation.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cron/test_scheduler_mcp_init.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cron/test_scheduler_provider.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cron/test_scheduler_shutdown_guard.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cron/test_script_claim_heartbeat.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cron/test_sessiondb_init_hang.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cron/test_shutdown_interrupt.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cron/test_suggestions.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cron/test_terminal_cwd_lock.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/cron/test_ticker_stall_60703.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/dashboard/test_ws_client_host.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/docker/__init__.py` | replace | gateway/deployment E2E test | AG | BSECP | R6 | W4/PY-GATEWAY | planned |
| `tests/docker/conftest.py` | replace | gateway/deployment E2E test | AG | BSECP | R6 | W4/PY-GATEWAY | planned |
| `tests/docker/test_config_migration.py` | replace | gateway/deployment E2E test | AG | BSECP | R6 | W4/PY-GATEWAY | planned |
| `tests/docker/test_container_restart.py` | replace | gateway/deployment E2E test | AG | BSECP | R6 | W4/PY-GATEWAY | planned |
| `tests/docker/test_dashboard.py` | replace | gateway/deployment E2E test | AG | BSECP | R6 | W4/PY-GATEWAY | planned |
| `tests/docker/test_docker_exec_privilege_drop.py` | replace | gateway/deployment E2E test | AG | BSECP | R6 | W4/PY-GATEWAY | planned |
| `tests/docker/test_dump_build_sha.py` | replace | gateway/deployment E2E test | AG | BSECP | R6 | W4/PY-GATEWAY | planned |
| `tests/docker/test_gateway_bootstrap_state.py` | replace | gateway/deployment E2E test | AG | BSECP | R6 | W4/PY-GATEWAY | planned |
| `tests/docker/test_gateway_run_supervised.py` | replace | gateway/deployment E2E test | AG | BSECP | R6 | W4/PY-GATEWAY | planned |
| `tests/docker/test_home_override_scripts.py` | replace | gateway/deployment E2E test | AG | BSECP | R6 | W4/PY-GATEWAY | planned |
| `tests/docker/test_immutable_install.py` | replace | gateway/deployment E2E test | AG | BSECP | R6 | W4/PY-GATEWAY | planned |
| `tests/docker/test_immutable_install_permissions.py` | replace | gateway/deployment E2E test | AG | BSECP | R6 | W4/PY-GATEWAY | planned |
| `tests/docker/test_license_file_present.py` | replace | gateway/deployment E2E test | AG | BSECP | R6 | W4/PY-GATEWAY | planned |
| `tests/docker/test_log_dir_seed.py` | replace | gateway/deployment E2E test | AG | BSECP | R6 | W4/PY-GATEWAY | planned |
| `tests/docker/test_main_invocation.py` | replace | gateway/deployment E2E test | AG | BSECP | R6 | W4/PY-GATEWAY | planned |
| `tests/docker/test_profile_gateway.py` | replace | gateway/deployment E2E test | AG | BSECP | R6 | W4/PY-GATEWAY | planned |
| `tests/docker/test_puid_pgid_remap.py` | replace | gateway/deployment E2E test | AG | BSECP | R6 | W4/PY-GATEWAY | planned |
| `tests/docker/test_s6_profile_gateway_integration.py` | replace | gateway/deployment E2E test | AG | BSECP | R6 | W4/PY-GATEWAY | planned |
| `tests/docker/test_smoke.py` | replace | gateway/deployment E2E test | AG | BSECP | R6 | W4/PY-GATEWAY | planned |
| `tests/docker/test_sqlite_runtime.py` | replace | gateway/deployment E2E test | AG | BSECP | R6 | W4/PY-GATEWAY | planned |
| `tests/docker/test_stage2_browser_discovery.py` | replace | gateway/deployment E2E test | AG | BSECP | R6 | W4/PY-GATEWAY | planned |
| `tests/docker/test_tini_compat_shim.py` | replace | gateway/deployment E2E test | AG | BSECP | R6 | W4/PY-GATEWAY | planned |
| `tests/docker/test_toplevel_chown.py` | replace | gateway/deployment E2E test | AG | BSECP | R6 | W4/PY-GATEWAY | planned |
| `tests/docker/test_user_flag_guard.py` | replace | gateway/deployment E2E test | AG | BSECP | R6 | W4/PY-GATEWAY | planned |
| `tests/docker/test_zombie_reaping.py` | replace | gateway/deployment E2E test | AG | BSECP | R6 | W4/PY-GATEWAY | planned |
| `tests/e2e/__init__.py` | replace | gateway/deployment E2E test | AG | BSECP | R6 | W4/PY-GATEWAY | planned |
| `tests/e2e/conftest.py` | replace | gateway/deployment E2E test | AG | BSECP | R6 | W4/PY-GATEWAY | planned |
| `tests/e2e/matrix_xsign_bootstrap/test_bootstrap.py` | replace | gateway/deployment E2E test | AG | BSECP | R6 | W4/PY-GATEWAY | planned |
| `tests/e2e/test_discord_adapter.py` | externalize | platform/relay test | NG:plugin-platform | N | R5/R6 | W2/PY-EXT | scoped-out |
| `tests/e2e/test_platform_commands.py` | externalize | platform/relay test | NG:plugin-platform | N | R5/R6 | W2/PY-EXT | scoped-out |
| `tests/e2e/test_relay_native_anthropic_stream.py` | replace | gateway/deployment E2E test | AG | BSECP | R6 | W4/PY-GATEWAY | planned |
| `tests/fakes/__init__.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/fakes/fake_ha_server.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/fixtures/plugins/example-dashboard/dashboard/plugin_api.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/gateway/__init__.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/_plugin_adapter_loader.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/conftest.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/feishu_helpers.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/platforms/__init__.py` | externalize | platform/relay test | NG:plugin-platform | N | R5/R6 | W2/PY-EXT | scoped-out |
| `tests/gateway/platforms/test_yuanbao_recall_db_only.py` | externalize | platform/relay test | NG:plugin-platform | N | R5/R6 | W2/PY-EXT | scoped-out |
| `tests/gateway/platforms/test_yuanbao_state_cleanup.py` | externalize | platform/relay test | NG:plugin-platform | N | R5/R6 | W2/PY-EXT | scoped-out |
| `tests/gateway/relay/__init__.py` | externalize | platform/relay test | NG:plugin-platform | N | R5/R6 | W2/PY-EXT | scoped-out |
| `tests/gateway/relay/stub_connector.py` | externalize | platform/relay test | NG:plugin-platform | N | R5/R6 | W2/PY-EXT | scoped-out |
| `tests/gateway/relay/test_auth.py` | externalize | platform/relay test | NG:plugin-platform | N | R5/R6 | W2/PY-EXT | scoped-out |
| `tests/gateway/relay/test_channel_context_consume.py` | externalize | platform/relay test | NG:plugin-platform | N | R5/R6 | W2/PY-EXT | scoped-out |
| `tests/gateway/relay/test_contract_doc_conformance.py` | externalize | platform/relay test | NG:plugin-platform | N | R5/R6 | W2/PY-EXT | scoped-out |
| `tests/gateway/relay/test_descriptor.py` | externalize | platform/relay test | NG:plugin-platform | N | R5/R6 | W2/PY-EXT | scoped-out |
| `tests/gateway/relay/test_descriptor_from_entry.py` | externalize | platform/relay test | NG:plugin-platform | N | R5/R6 | W2/PY-EXT | scoped-out |
| `tests/gateway/relay/test_handoff_relay_aliasing.py` | externalize | platform/relay test | NG:plugin-platform | N | R5/R6 | W2/PY-EXT | scoped-out |
| `tests/gateway/relay/test_identity_token_resolver.py` | externalize | platform/relay test | NG:plugin-platform | N | R5/R6 | W2/PY-EXT | scoped-out |
| `tests/gateway/relay/test_no_stub_leak.py` | externalize | platform/relay test | NG:plugin-platform | N | R5/R6 | W2/PY-EXT | scoped-out |
| `tests/gateway/relay/test_relay_adapter.py` | externalize | platform/relay test | NG:plugin-platform | N | R5/R6 | W2/PY-EXT | scoped-out |
| `tests/gateway/relay/test_relay_follow_up.py` | externalize | platform/relay test | NG:plugin-platform | N | R5/R6 | W2/PY-EXT | scoped-out |
| `tests/gateway/relay/test_relay_going_idle.py` | externalize | platform/relay test | NG:plugin-platform | N | R5/R6 | W2/PY-EXT | scoped-out |
| `tests/gateway/relay/test_relay_interactive.py` | externalize | platform/relay test | NG:plugin-platform | N | R5/R6 | W2/PY-EXT | scoped-out |
| `tests/gateway/relay/test_relay_interrupt.py` | externalize | platform/relay test | NG:plugin-platform | N | R5/R6 | W2/PY-EXT | scoped-out |
| `tests/gateway/relay/test_relay_media.py` | externalize | platform/relay test | NG:plugin-platform | N | R5/R6 | W2/PY-EXT | scoped-out |
| `tests/gateway/relay/test_relay_multiplatform.py` | externalize | platform/relay test | NG:plugin-platform | N | R5/R6 | W2/PY-EXT | scoped-out |
| `tests/gateway/relay/test_relay_passthrough.py` | externalize | platform/relay test | NG:plugin-platform | N | R5/R6 | W2/PY-EXT | scoped-out |
| `tests/gateway/relay/test_relay_per_platform_caps.py` | externalize | platform/relay test | NG:plugin-platform | N | R5/R6 | W2/PY-EXT | scoped-out |
| `tests/gateway/relay/test_relay_policy_send.py` | externalize | platform/relay test | NG:plugin-platform | N | R5/R6 | W2/PY-EXT | scoped-out |
| `tests/gateway/relay/test_relay_registration.py` | externalize | platform/relay test | NG:plugin-platform | N | R5/R6 | W2/PY-EXT | scoped-out |
| `tests/gateway/relay/test_relay_roundtrip.py` | externalize | platform/relay test | NG:plugin-platform | N | R5/R6 | W2/PY-EXT | scoped-out |
| `tests/gateway/relay/test_relay_roundtrip_telegram.py` | externalize | platform/relay test | NG:plugin-platform | N | R5/R6 | W2/PY-EXT | scoped-out |
| `tests/gateway/relay/test_relay_sheds_crypto.py` | externalize | platform/relay test | NG:plugin-platform | N | R5/R6 | W2/PY-EXT | scoped-out |
| `tests/gateway/relay/test_relay_slack_dm_streaming.py` | externalize | platform/relay test | NG:plugin-platform | N | R5/R6 | W2/PY-EXT | scoped-out |
| `tests/gateway/relay/test_relay_slack_prompt_dm_root.py` | externalize | platform/relay test | NG:plugin-platform | N | R5/R6 | W2/PY-EXT | scoped-out |
| `tests/gateway/relay/test_relay_threads.py` | externalize | platform/relay test | NG:plugin-platform | N | R5/R6 | W2/PY-EXT | scoped-out |
| `tests/gateway/relay/test_self_provision.py` | externalize | platform/relay test | NG:plugin-platform | N | R5/R6 | W2/PY-EXT | scoped-out |
| `tests/gateway/relay/test_wire_user_identity.py` | externalize | platform/relay test | NG:plugin-platform | N | R5/R6 | W2/PY-EXT | scoped-out |
| `tests/gateway/relay/test_ws_transport.py` | externalize | platform/relay test | NG:plugin-platform | N | R5/R6 | W2/PY-EXT | scoped-out |
| `tests/gateway/restart_test_helpers.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_10710_auto_reset_evicts_cached_agent.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_13121_shutdown_inflight_transcript_flush.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_25107_stale_base_url_api_mode.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_35809_auto_reset_clean_context.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_35994_reset_button_deadlock.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_42039_duplicate_user_message.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_48031_model_switch_after_auto_reset.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_53175_cleanup_off_loop.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_64674_multiplex_primary_token_scope.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_7100_transient_failure_transcript.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_71671_faulthandler_no_stderr.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_73297_memory_flush_on_reset.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_73771_media_resend_dedup.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_75349_whatsapp_multiplex_secret_scope.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_abandoned_turn_process_cleanup.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_active_session_text_merge.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_adapter_connect_is_reconnect_contract.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_adapter_startup_secret_scope.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_agent_cache.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_agents_command_delegations.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_aiohttp_body_caps.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_allowed_channels_widening.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_allowlist_startup_check.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_api_server.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_api_server_active_work_drain.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_api_server_bind_guard.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_api_server_jobs.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_api_server_media_data_urls.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_api_server_multimodal.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_api_server_multiplex_secret_scope.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_api_server_normalize.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_api_server_runs.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_api_server_toolset.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_approval_prompt_redaction.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_approvals_command.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_approve_deny_commands.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_async_delegation_session_binding.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_async_delivery_capability.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_async_session_db.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_async_session_store.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_audio_cache.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_auth_fallback.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_auto_continue.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_auto_voice_reply_format.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_background_command.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_background_process_notifications.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_base_auto_tts_output_format.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_base_topic_sessions.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_bluebubbles.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_bounded_adapter_teardown.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_bundles_command.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_busy_session_ack.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_busy_session_auth_bypass.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_buzz_adapter.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_buzz_websocket.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_cached_agent_max_iterations.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_cancel_background_drain.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_cgroup_cleanup.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_channel_continuity_hint.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_channel_directory.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_channel_directory_connected_only.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_channel_overrides.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_checkpoint_config.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_choice_picker.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_cjk_fts_config_bridge.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_clarify_active_session_bypass.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_clarify_progress_leak.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_clarify_thread_followup_not_swallowed.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_clean_shutdown_marker.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_code_fence_tracking.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_command_bypass_active_session.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_complete_path_at_filter.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_completion_delivery.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_compress_command.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_compress_focus.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_compress_plugin_engine.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_compress_preview.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_compression_concurrent_sessions.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_compression_deferred_soft_result.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_compression_failure_session_sync.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_compression_in_flight_check.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_compression_interrupt_demotion_56391.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_compression_progress_notices.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_compression_session_id_persistence.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_config.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_config_cwd_bridge.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_config_driven_access_policy.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_config_env_bridge_authority.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_context_ref_expansion_runtime.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_conversation_scope_funnel.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_cron_active_work_drain.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_cron_fire_webhook.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_cron_shutdown_drain.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_cwd_placeholder.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_dead_targets.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_debug_command.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_dedupe_user_turns.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_delegation_session_id_leak.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_delivery.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_delivery_ledger.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_delivery_ledger_fd_leak.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_delivery_ledger_producer.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_delivery_silence_filter.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_destructive_slash_always_persist_report.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_destructive_slash_confirm.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_diff_command.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_dingtalk.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_discord_allowed_channels.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_discord_allowed_mentions.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_discord_approval_mentions.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_discord_attachment_download.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_discord_bot_auth_bypass.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_discord_bot_filter.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_discord_channel_controls.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_discord_channel_prompts.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_discord_channel_skills.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_discord_clarify_buttons.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_discord_component_auth.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_discord_connect.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_discord_document_handling.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_discord_double_dispatch.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_discord_edit_message_overflow.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_discord_exec_approval_content.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_discord_fail_closed_feedback.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_discord_format.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_discord_free_response.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_discord_imports.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_discord_lazy_install_views.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_discord_liveness.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_discord_media_metadata.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_discord_missed_message_backfill.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_discord_model_picker.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_discord_opus.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_discord_pending_text_batch_shutdown.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_discord_plugin_setup.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_discord_prompt_content_siblings.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_discord_prompt_timeout_config.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_discord_race_polish.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_discord_reactions.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_discord_reply_mode.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_discord_roles_dm_scope.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_discord_send.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_discord_slash_auth.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_discord_slash_commands.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_discord_sync_limit.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_discord_system_messages.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_discord_thread_persistence.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_discord_thread_slash_expired_defer.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_discord_voice_mixer.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_display_config.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_dm_topics.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_document_cache.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_document_context_note.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_duplicate_reply_suppression.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_email.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_email_robustness.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_email_secret_scope.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_empty_model_recovery.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_env_flag_truthy.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_ephemeral_reply.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_escape_reasoning_fences.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_external_drain_control.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_extract_local_files.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_fallback_chain_reload.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_fallback_eviction.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_fast_command.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_feishu.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_feishu_approval_buttons.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_feishu_bot_admission.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_feishu_bot_auth_bypass.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_feishu_channel_prompts.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_feishu_comment.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_feishu_comment_rules.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_feishu_lazy_import.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_feishu_meeting_invite.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_feishu_onboard.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_feishu_sdk_executor.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_feishu_table_markdown.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_feishu_voice_message_type.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_fence_chunker.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_first_turn_session_meta_rebaseline.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_footer_command_mid_run.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_fresh_reset_skill_injection.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_gateway_command_dispatch_minimal.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_gateway_command_help.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_gateway_command_line_matcher.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_gateway_inactivity_timeout.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_gateway_process_exit.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_gateway_shutdown.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_gateway_silence_tokens.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_gateway_utf8_encoding.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_goal_continuation_drain.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_goal_max_turns_config.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_goal_status_notice.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_goal_verdict_send.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_google_chat.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_google_chat_oauth_dependencies.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_handoff_thread_session_key.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_handoff_watcher_async_db.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_history_media_current_turn.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_home_target_env_var.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_homeassistant.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_hooks.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_image_input_routing_runtime.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_incomplete_gateway_turns.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_insights_unicode_flags.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_interactive_prompt_base.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_internal_event_bypass_pairing.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_internal_event_never_interrupts_busy_session.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_interrupt_key_match.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_irc_adapter.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_kanban_auto_decompose_live.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_kanban_notifier.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_kanban_notifier_apiserver_wake.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_kanban_notifier_watcher_dispatch_gate.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_kanban_notifier_zero_sub_gate.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_kanban_watchers_mixin.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_keep_typing_timeout.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_lifecycle_ledger.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_line_plugin.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_load_transcript_db_only.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_loop_exception_handler.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_loop_liveness_watchdog.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_matrix.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_matrix_approval_reaction_fail_closed.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_matrix_dm_invite_recording.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_matrix_exec_approval.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_matrix_mention.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_matrix_message_length.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_matrix_plugin_setup.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_matrix_project_context_isolation.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_matrix_recovery_key_scope.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_matrix_voice.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_mattermost.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_mattermost_plugin_setup.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_max_concurrent_sessions.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_max_tokens_propagation.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_mcp_reload_refreshes_cached_agents.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_media_cache.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_media_download_retry.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_media_extraction.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_media_metadata_contract.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_media_spaced_paths_and_history_dedupe.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_media_tag_cleanup.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_media_tag_formatting_variants.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_media_tag_separator.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_memory_monitor.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_memory_trim_housekeeping.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_message_deduplicator.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_message_timestamps.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_mirror.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_mixed_attachment_routing.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_moa_one_shot_restore.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_model_command_async_offload.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_model_command_context_offload.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_model_command_custom_providers.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_model_command_expensive_confirm.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_model_command_flat_string_config.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_model_picker_persist.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_model_switch_persistence.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_msgraph_webhook.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_multiplex_adapter_registry.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_multiplex_api_server_routing.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_multiplex_background_task_scope.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_multiplex_credential_isolation.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_multiplex_http_routing.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_multiplex_lifecycle.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_multiplex_pairing_stores.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_multiplex_phase0.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_multiplex_profile_authz.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_native_image_buffer_isolation.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_new_clears_last_resolved_model.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_notice_delivery.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_notice_rendering.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_ntfy_plugin.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_own_policy_startup_gate.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_pairing.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_pairing_allowlist_bypass.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_pending_drain_no_recursion.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_pending_drain_race.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_pending_event_none.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_per_platform_streaming_defaults.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_pii_redaction.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_plaintext_approval_routing.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_planned_stop_watcher.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_platform_base.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_platform_connected_checkers.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_platform_http_client_limits.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_platform_reconnect.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_platform_reconnect_fd_leak.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_platform_registry.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_plugin_platform_interface.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_post_delivery_callback_chaining.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_post_stream_media_delivery.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_pre_gateway_dispatch.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_priority_path_compression_demotion_56391.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_profile_resolution.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_profile_routing.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_prompt_tail_freeze.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_proxy_mode.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_qqbot.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_qqbot_credential_isolation.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_qqbot_scope_paths.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_queue_command.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_queue_consumption.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_queued_native_image_session_key.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_raft_adapter.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_readiness.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_reasoning_command.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_reasoning_config_per_model.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_relay_capability_surface.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_relay_upstream_authz.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_reload_skills_command.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_reload_skills_discord_resync.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_replace_child_reap.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_replay_entry_fields.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_reply_to_injection.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_response_filters.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_restart_after_turn.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_restart_drain.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_restart_notification.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_restart_redelivery_dedup.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_restart_resume_pending.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_restart_service_detection.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_resume_command.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_retry_replacement.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_retry_response.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_routing_save_fast_path.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_run_cleanup_progress.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_run_progress_interrupt.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_run_progress_topics.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_run_tool_media_re.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_runner_fatal_adapter.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_runner_startup_failures.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_running_agent_session_toggles.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_runtime_config_env_expansion.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_runtime_env_reload_config_authority.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_runtime_footer.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_runtime_migration.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_safe_adapter_disconnect.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_scale_to_zero.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_scale_to_zero_watcher.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_send_error_classification.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_send_image_file.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_send_multiple_images.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_send_retry.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_send_voice_reply_notify.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_session.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_session_api.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_session_boundary_hooks.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_session_boundary_security_state.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_session_context_inheritance.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_session_dm_thread_seeding.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_session_env.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_session_hygiene.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_session_id_cache_coherence.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_session_info.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_session_list_allowed_sources.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_session_load_bool.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_session_messages_shutdown_preserve.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_session_model_override_credential_pool.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_session_model_override_persistence.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_session_model_override_routing.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_session_model_reset.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_session_override_thread_recovery.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_session_race_guard.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_session_reset_notify.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_session_split_brain_11016.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_session_stall_watchdog.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_session_state_cleanup.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_session_store_expiry_finalized.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_session_store_lock_io.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_session_store_prune.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_session_store_runtime_stale_guard.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_session_store_stale_prune.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_setup_feishu.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_shared_group_sender_prefix.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_shutdown_cache_cleanup.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_shutdown_flush.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_shutdown_forensics.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_shutdown_memory_provider_messages.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_shutdown_watchdog.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_signal.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_signal_format.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_signal_rate_limit.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_simplex_plugin.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_skip_context_files_wiring.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_slack.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_slack_approval_buttons.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_slack_block_kit.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_slack_block_kit_adapter.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_slack_bot_auth_bypass.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_slack_channel_session_scope.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_slack_channel_skills.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_slack_clarify_buttons.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_slack_cron_continuable_surface.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_slack_dedup_ttl.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_slack_download_ssrf.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_slack_group_dm_scope_warning.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_slack_ignore_other_user_mentions.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_slack_log_noise.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_slack_mention.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_slack_mention_humanization.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_slack_peer_agent_smoke.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_slack_plugin_action_handlers.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_slack_plugin_setup.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_slack_relay_parent_command.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_slack_require_mention_channels.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_slack_runner_ignored_channels.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_slack_send_retry.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_slack_socket_reconnect_heal.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_slack_status_update.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_slack_user_token_warning.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_slack_wake_external_bot_messages.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_slash_access.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_slash_access_dispatch.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_sms.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_sse_agent_cancel.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_sse_frame.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_ssl_cert_detection.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_ssl_certs.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_stacked_skill_platform_disabled.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_stale_confirmation_expiry.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_stale_finalize_suppression.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_stale_platform_lock_retryable.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_stale_self_heal_agent_cache_eviction.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_startup_no_eager_platform_install.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_startup_restart_race.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_status.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_status_command.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_status_phrases.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_steer_command.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_steer_fifo_overwrite.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_step_callback_compat.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_sticker_cache.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_stop_thread_sibling.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_stream_consumer.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_stream_consumer_draft.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_stream_consumer_fresh_final.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_stream_consumer_silence.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_stream_consumer_thread_routing.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_stream_events.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_streaming_tts_consumer.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_streaming_tts_gateway_regression.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_stt_config.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_stt_transcript_echo_config.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_stuck_loop.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_subagent_protection_30170.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_systemd_notify.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_systemd_watchdog_lifecycle.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_table_helpers.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_teams.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_teams_dotenv_isolation.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_teams_pipeline_runtime_wiring.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_telegram_approval_buttons.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_telegram_audio_vs_voice.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_telegram_auth_check.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_telegram_bot_auth_bypass.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_telegram_callback_auth_fail_closed.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_telegram_caption_merge.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_telegram_channel_posts.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_telegram_clarify_buttons.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_telegram_closewait_limits_31599.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_telegram_conflict.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_telegram_connect.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_telegram_documents.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_telegram_error_redaction.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_telegram_fallback_pool_release_71593.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_telegram_final_delivery.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_telegram_format.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_telegram_forum_commands.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_telegram_group_gating.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_telegram_init_deadline.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_telegram_long_command_batching.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_telegram_max_doc_bytes.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_telegram_media_read_timeout.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_telegram_mention_boundaries.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_telegram_model_picker.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_telegram_network.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_telegram_network_reconnect.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_telegram_noise_filter.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_telegram_overflow_partial.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_telegram_pending_update_probe.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_telegram_photo_interrupts.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_telegram_polling_progress.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_telegram_progress_edit_transient.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_telegram_prune_stale_topic_binding_31501.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_telegram_reactions.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_telegram_reply_mode.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_telegram_reply_quote.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_telegram_rich_messages.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_telegram_rich_newlines.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_telegram_send_draft_format.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_telegram_send_path_health.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_telegram_slash_confirm.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_telegram_start_polling_timeout.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_telegram_status_indicator.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_telegram_status_update.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_telegram_text_batch_perf.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_telegram_text_batching.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_telegram_thread_fallback.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_telegram_topic_mode.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_telegram_typing_backoff.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_telegram_username_chat_id.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_telegram_voice_caption_markdown.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_telegram_voice_duration.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_telegram_voice_v0_regressions.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_telegram_webhook_secret.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_text_batching.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_title_command.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_tool_log_mode.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_tool_response_drop_recovery.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_transcript_offset.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_tts_media_routing.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_tui_approval_redaction.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_turn_context.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_turn_lease.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_typing_indicator_toggle.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_unauthorized_dm_behavior.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_unavailable_skill_hint.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_undo_rewind_session.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_unknown_command.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_update_command.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_update_cron_drain.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_update_streaming.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_usage_command.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_verbose_command.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_version_command.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_video_context_note.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_vision_memory_leak.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_voice_command.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_voice_mode_platform_isolation.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_wake_delivery.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_watchdog_review_76354.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_weak_credential_guard.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_webhook_adapter.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_webhook_deliver_only.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_webhook_dynamic_routes.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_webhook_integration.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_webhook_session_close.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_webhook_signature_rate_limit.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_wecom.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_wecom_callback.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_wecom_plugin_setup.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_weixin.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_weixin_secret_scope.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_weixin_typing.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_whatsapp_allowlist_lid_resolution.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_whatsapp_bridge_dir_resolution.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_whatsapp_bridge_pidfile.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_whatsapp_cloud.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_whatsapp_cloud_allowed_users.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_whatsapp_connect.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_whatsapp_formatting.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_whatsapp_from_owner.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_whatsapp_group_gating.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_whatsapp_identity.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_whatsapp_media_path_profile.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_whatsapp_native_delivery.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_whatsapp_plugin_setup.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_whatsapp_reply_prefix.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_whatsapp_stale_bridge.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_whatsapp_text_batching.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_whatsapp_to_jid.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_ws_auth_retry.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_yolo_command.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_yuanbao_forwarded_heartbeat.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/gateway/test_yuanbao_media_ssrf.py` | replace | gateway behavior test | AG | BSEC | R6 | W4/PY-GATEWAY | planned |
| `tests/hermes_cli/__init__.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/conftest.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/conftest_dashboard_auth.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_25106_global_switch_persists_base_url_api_mode.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_active_sessions.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_agent_import.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_ai_gateway_models.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_anthropic_model_flow_stale_oauth.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_anthropic_oauth_flow.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_anthropic_oauth_routes_to_messages_api.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_anthropic_picker_curated.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_anthropic_provider_persistence.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_api_key_providers.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_apply_model_switch_result_context.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_apply_profile_override.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_approvals_command.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_approvals_suggest.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_arcee_provider.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_argparse_flag_propagation.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_at_context_completion_filter.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_atomic_json_write.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_atomic_yaml_write.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_auth_codex_provider.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_auth_codex_quota_probe.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_auth_codex_self_heal.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_auth_commands.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_auth_loopback_ssh_hint.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_auth_nous_provider.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_auth_profile_fallback.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_auth_provider_gate.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_auth_qwen_provider.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_auth_ssl_macos.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_auth_store_read_failure.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_auth_toctou_file_modes.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_auth_usable_secret.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_auth_xai_oauth_provider.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_authenticated_providers_exhausted_pool.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_aux_config.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_aux_picker_inventory.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_azure_detect.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_azure_foundry_entra.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_backup.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_backup_stability.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_banner.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_banner_git_state.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_banner_skills.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_banner_skills_width.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_bedrock_model_picker.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_bedrock_region_scoped_picker.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_billing_cli.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_billing_portal_url.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_billing_scope_stepup.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_bitwarden_status.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_browser_connect_dual_stack.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_build_info.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_bundles.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_busy_policy_invariants.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_bytecode_sweep.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_canonical_custom_identity.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_certifi_repair.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_chat_skills_flag.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_checkout_mutation_guards.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_checkpoints_prune.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_claw.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_clear_stale_base_url.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_cli_active_session_limit.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_cli_custom_provider_vision.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_cli_model_once.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_cli_output.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_clipboard_text_write.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_cmd_update.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_cmd_update_docker.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_coalesce_session_args.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_codex_cli_model_picker.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_codex_models.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_codex_runtime_plugin_migration.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_codex_runtime_switch.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_commands.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_commands_execute.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_completion.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_config.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_config_env_expansion.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_config_env_ref_parity.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_config_env_refs.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_config_loader_e2e.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_config_read_guard.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_config_validation.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_configured_builtin_models.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_console_engine.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_container_aware_cli.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_container_boot.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_context_switch_guard.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_copilot_auth.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_copilot_catalog_oauth_fallback.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_copilot_context.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_copilot_in_model_list.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_copilot_model_api_mode.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_copilot_runtime_api_mode.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_copilot_token_exchange.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_credential_lifecycle.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_cron.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_cron_dashboard_off_loop.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_cron_fire_dashboard.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_cron_parser_builder.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_ctrlg_editor_submit.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_curator_archive_prune.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_curator_recent_run_notice.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_curator_run.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_curator_status.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_curator_usage.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_curses_arrow_keys.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_curses_color_compat.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_curses_ui_fuzzy_rank.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_curses_ui_search.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_custom_provider_context_length.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_custom_provider_extra_headers.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_custom_provider_identity.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_custom_provider_model_switch.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_custom_provider_normalize_no_mutate.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_custom_provider_tls.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_dashboard_admin_endpoints.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_dashboard_auth_401_reauth.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_dashboard_auth_audit.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_dashboard_auth_cookies.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_dashboard_auth_gate.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_dashboard_auth_middleware.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_dashboard_auth_native_flow.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_dashboard_auth_password_login.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_dashboard_auth_plugin_hook.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_dashboard_auth_prefix.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_dashboard_auth_provider_base.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_dashboard_auth_self_hosted.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_dashboard_auth_status_endpoint.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_dashboard_auth_stub_provider.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_dashboard_auth_ws_auth.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_dashboard_auth_ws_tickets.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_dashboard_basic_auth_plugin_enable.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_dashboard_browser_safe_imports.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_dashboard_lifecycle_flags.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_dashboard_oauth_endpoints_server_gate.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_dashboard_param_clamps.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_dashboard_profiles_nav_label.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_dashboard_register.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_dashboard_token_auth.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_dashboard_unified_launch.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_dashboard_web_dist_validation.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_debug.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_default_interface_resolution.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_dep_ensure.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_deprecated_cwd_warning.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_desktop_repo_discovery_config.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_destructive_slash_confirm_gate.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_detect_api_mode_for_url.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_determine_api_mode_hostname.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_diagnostics_upload.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_diff_command.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_dingtalk_auth.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_discord_skill_clamp_warning.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_doctor.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_doctor_command_install.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_doctor_dedicated_provider_skip.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_dump_env_visibility.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_dump_git_commit.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_dump_terminal_backend.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_early_recovery.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_ensure_acp_launcher.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_ensure_hermes_home_memo.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_ensure_hermes_home_uid_34107.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_ensure_utf8_locale.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_env_custom_keys.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_env_export_line_lifecycle.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_env_export_prefix.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_env_load_cache.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_env_loader.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_env_sanitize_on_load.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_fallback_cmd.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_fallback_config.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_fireworks_provider.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_gateway.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_gateway_external_supervisor.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_gateway_linger.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_gateway_platform_gating.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_gateway_proc_fallback.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_gateway_restart_loop.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_gateway_run_hard_exit.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_gateway_runtime_health.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_gateway_s6_dispatch.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_gateway_service.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_gateway_service_paths.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_gateway_windows.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_gateway_wsl.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_gemini_free_tier_setup_block.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_gemini_provider.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_get_env_value_scope.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_gmi_provider.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_goals.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_gpt56_registration.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_graphical_browser_detection.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_hooks_cli.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_ignore_user_config_flags.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_image_gen_picker.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_init_command.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_input_sanitize.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_install_cua_driver.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_inventory.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_inventory_pricing.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_jobs_json_utf8_bom.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_journey_render.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_kanban_block_kinds.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_kanban_blocked_sticky.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_kanban_board_project.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_kanban_boards.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_kanban_cli.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_kanban_cli_dispatch_passthrough.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_kanban_comment_queries.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_kanban_core_functionality.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_kanban_count_notify_subs.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_kanban_db.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_kanban_db_init.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_kanban_db_repair.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_kanban_decompose.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_kanban_decompose_db.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_kanban_default_assignee.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_kanban_diagnostics.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_kanban_dispatch_lock.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_kanban_goal_mode.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_kanban_init_lock_bounded.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_kanban_lifecycle_hooks.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_kanban_notify.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_kanban_per_profile_cap.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_kanban_project_link.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_kanban_promote.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_kanban_reclaim_claim_lock_guard.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_kanban_specify.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_kanban_specify_db.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_kanban_swarm.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_kanban_worker_image_extraction.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_kanban_worker_session_source.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_kanban_worker_spawn_toolsets.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_kanban_worker_terminal_cwd.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_kanban_worktree_isolation.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_kanban_write_guard.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_kanban_write_txn_busy_retry.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_kimi_cn_provider_listing.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_launcher.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_lazy_refresh_venv_repair.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_lifecycle.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_list_picker_providers.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_lmstudio_context_policy.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_logs.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_main_model_custom_provider_normalization.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_managed_installs.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_managed_scope.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_managed_scope_cli_config.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_managed_scope_config.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_managed_scope_env.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_managed_scope_loaders.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_managed_scope_overlay.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_managed_scope_regression.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_managed_scope_surfacing.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_managed_scope_writeguard.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_managed_uv.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_mcp_add_command_dest.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_mcp_catalog.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_mcp_config.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_mcp_dashboard_oauth.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_mcp_discovery_timing.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_mcp_reload_confirm_gate.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_mcp_security.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_mcp_startup.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_mcp_tools_config.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_mem_trim.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_memory_reset.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_memory_setup.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_memory_setup_provider_arg.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_memory_status.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_migrate_xai.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_moa_config.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_moa_set_models_preserves_extra_keys.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_model_cache_swr.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_model_catalog.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_model_cost_guard.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_model_flow_pooled_credentials.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_model_normalize.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_model_picker_excluded_providers.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_model_picker_expensive_confirm.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_model_picker_viewport.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_model_provider_persistence.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_model_search.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_model_search_alias_dedup.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_model_switch_configured_provider_routing.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_model_switch_context_display.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_model_switch_context_offload.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_model_switch_copilot_api_mode.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_model_switch_custom_providers.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_model_switch_filter_unresolved.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_model_switch_once_flags.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_model_switch_openai_api_mode.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_model_switch_opencode_anthropic.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_model_switch_parsing.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_model_switch_persist_default.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_model_switch_variant_tags.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_model_validation.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_models.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_models_dev_preferred_merge.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_non_ascii_credential.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_noninteractive_git.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_normalize_main_model_assignment.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_nous_account.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_nous_auth_keepalive.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_nous_auth_status_cache.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_nous_billing_request.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_nous_hermes_non_agentic.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_nous_inference_url_validation.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_nous_portal_staging_allowlist.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_nous_session_validity.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_nous_subscription.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_npm_engine.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_official_openai_host.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_ollama_cloud_auth.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_ollama_cloud_provider.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_oneshot_usage_file.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_openai_codex_model_validation_fallback.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_openai_discovery_endpoint.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_openai_listing_authority.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_openai_picker_curated.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_opencode_go_flat_namespace.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_opencode_go_in_model_list.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_opencode_go_validation_fallback.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_opencode_zen_model_limit.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_overlay_slug_resolution.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_pairing.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_path_completion.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_pet_toggle.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_picker_prewarm.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_pin_kanban_board_env.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_pip_install_detection.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_placeholder_usage.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_plugin_auxiliary_tasks.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_plugin_cli_registration.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_plugin_runtime_disable_gate.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_plugin_scanner_recursion.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_plugins.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_plugins_cmd.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_plugins_cmd_category_discovery.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_plugins_cmd_enable_disable_nested.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_plugins_cmd_list.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_plugins_hub_perf_guard.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_plugins_transcription_registration.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_plugins_tts_registration.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_post_setup_gating.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_profile_describer.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_profile_distribution.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_profile_export_credentials.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_profile_install_env_encoding.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_profiles.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_profiles_s6_hooks.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_project_plugin_rce_bypass.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_projects_cli.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_projects_db.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_prompt_api_key.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_prompt_compose_command.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_prompt_size.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_provider_catalog.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_provider_config_validation.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_provider_groups.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_provider_live_curated_merge.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_provider_parity.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_provider_precedence.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_provider_section3_grouping.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_proxy.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_psutil_android_extract.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_pty_bridge.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_quarantine_forensic_logging.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_read_raw_config_readonly.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_reasoning_effort_menu.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_reasoning_full_command.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_redact_config_bridge.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_regression_16767.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_relaunch.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_relay_shared_metrics.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_relay_shared_metrics_runtime.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_remote_spending_gate_contract.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_resolve_last_session.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_resolve_provider_openrouter_pool.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_resolve_token_memo.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_run_with_idle_timeout.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_runtime_provider_resolution.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_runtime_transport_precedence.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_safe_mode.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_sale_pricing.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_scan_venv_blockers.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_secret_prompt.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_secrets_bitwarden_non_tty.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_secrets_token_rotation.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_security_advisories.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_security_audit.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_security_audit_startup.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_send_cmd.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_serve_command.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_service_manager.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_session_browse.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_session_export.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_session_export_html.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_session_export_html_escape.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_session_export_md.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_session_filters.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_session_handoff.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_session_listing.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_session_recap.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_session_recovery.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_sessions_delete.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_sessions_export_md_cli.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_sessions_size_delta_label.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_set_config_value.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_setup.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_setup_agent_settings.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_setup_blank_slate.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_setup_hermes_script.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_setup_hidden_env.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_setup_irc.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_setup_matrix_e2ee.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_setup_menu_curses_migration.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_setup_model_provider.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_setup_noninteractive.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_setup_openclaw_migration.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_setup_prompt_menus.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_setup_reconfigure.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_setup_summary_provider_warning.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_setup_telemetry.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_setup_tts_xai_oauth.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_signal_handler_kanban_worker.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_skills_config.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_skills_hub.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_skills_install_flags.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_skills_skip_confirm.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_skills_subparser.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_skin_cmd.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_skin_engine.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_skin_palettes.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_slack_cli.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_spotify_auth.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_sqlite_runtime.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_ssh_ownership_endpoint.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_ssh_session_token_parser.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_startup_fast_guards.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_startup_plugin_gating.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_state_db_guard.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_status.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_status_model_provider.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_status_provider_label.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_stt_picker.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_subcommands_batch.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_subcommands_followup.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_subcommands_profile_gateway.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_subparser_routing_fallback.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_subpolar_activity.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_subpolar_agents.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_subpolar_clones.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_subpolar_integrations.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_subpolar_schedules.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_subpolar_source_control.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_subpolar_store.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_subpolar_terminals.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_subprocess_timeouts.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_subscription_cli.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_suppress_eio_on_interrupt.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_system_stats_platform.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_systemd_optional_directives.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_systemd_watchdog_unit.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_teams_pipeline_plugin_cli.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_telegram_managed_bot.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_tencent_tokenhub_provider.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_terminal_menu_fallbacks.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_timeouts.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_timestamps_command.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_tips.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_tool_token_estimation.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_tools_config.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_tools_disable_enable.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_toolset_validation.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_tts_picker.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_uninstall_dry_run.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_uninstall_node_symlinks.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_update_autostash.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_update_check.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_update_concurrent_quarantine.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_update_config_clears_custom_fields.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_update_eol_churn.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_update_fleet_restart_timeout.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_update_gateway_launcher_refresh.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_update_hangup_protection.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_update_import_guard.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_update_interrupted_recovery.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_update_lock.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_update_modified_notice.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_update_post_pull_syntax_guard.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_update_stale_dashboard.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_update_venv_health.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_update_yes_flag.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_update_zip_symlink_reject.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_upstage_provider.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_urllib_security.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_user_providers_model_switch.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_verify_console_scripts.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_verify_core_dependencies.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_vertex_model_picker.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_vertex_provider.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_video_gen_picker.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_voice_wrapper.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_web_oauth_dispatch.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_web_server.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_web_server_boot_handshake.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_web_server_console_ws.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_web_server_cron_profiles.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_web_server_files.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_web_server_fs.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_web_server_gateway_topology.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_web_server_git.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_web_server_host_header.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_web_server_messaging_profiles.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_web_server_oauth_write.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_web_server_profile_unification.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_web_server_pty_import.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_web_server_pty_reconnect.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_web_server_session_search.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_web_server_skill_editor.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_web_server_skills_profiles.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_web_server_speak_stream.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_web_ui_build.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_webhook_cli.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_whatsapp_cloud_setup.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_whatsapp_onboarding.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_whatsapp_setup_ordering.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_win_pty_bridge.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_windows_native_docs.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_xai_curated_models.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_xai_model_flow.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_xai_oauth_profile_auth.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_xai_oauth_refresh.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_xai_oauth_writethrough.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_xai_provider_labels.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_xai_retirement.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_xiaomi_provider.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_cli/test_yolo_startup_order.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/hermes_state/test_append_messages_batch.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/hermes_state/test_aux_usage_accounting.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/hermes_state/test_conversation_root.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/hermes_state/test_get_anchored_view.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/hermes_state/test_get_messages_around.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/hermes_state/test_resolve_resume_session_id.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/hermes_state/test_restore_alternation_repair.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/hermes_state/test_session_archiving.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/hermes_state/test_session_md_export.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/honcho_plugin/__init__.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/honcho_plugin/conftest.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/honcho_plugin/test_async_memory.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/honcho_plugin/test_cli.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/honcho_plugin/test_client.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/honcho_plugin/test_empty_profile_hint.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/honcho_plugin/test_network_isolation.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/honcho_plugin/test_oauth.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/honcho_plugin/test_oauth_flow.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/honcho_plugin/test_pin_peer_name.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/honcho_plugin/test_query_rewrite.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/honcho_plugin/test_session.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/integration/__init__.py` | replace | gateway/deployment E2E test | AG | BSECP | R6 | W4/PY-GATEWAY | planned |
| `tests/integration/test_batch_runner.py` | replace | gateway/deployment E2E test | AG | BSECP | R6 | W4/PY-GATEWAY | planned |
| `tests/integration/test_checkpoint_resumption.py` | replace | gateway/deployment E2E test | AG | BSECP | R6 | W4/PY-GATEWAY | planned |
| `tests/integration/test_daytona_terminal.py` | replace | gateway/deployment E2E test | AG | BSECP | R6 | W4/PY-GATEWAY | planned |
| `tests/integration/test_ha_integration.py` | replace | gateway/deployment E2E test | AG | BSECP | R6 | W4/PY-GATEWAY | planned |
| `tests/integration/test_modal_terminal.py` | replace | gateway/deployment E2E test | AG | BSECP | R6 | W4/PY-GATEWAY | planned |
| `tests/integration/test_vision_docker_resolve.py` | replace | gateway/deployment E2E test | AG | BSECP | R6 | W4/PY-GATEWAY | planned |
| `tests/integration/test_voice_channel_flow.py` | replace | gateway/deployment E2E test | AG | BSECP | R6 | W4/PY-GATEWAY | planned |
| `tests/integration/test_web_tools.py` | replace | gateway/deployment E2E test | AG | BSECP | R6 | W4/PY-GATEWAY | planned |
| `tests/manual/cron_inchannel_dm_e2e.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/manual/cron_inchannel_e2e.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/migration/test_python_runtime_bridge_worker.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/migration/test_python_tool_bridge_worker.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/monitoring/__init__.py` | replace | gateway/deployment E2E test | AG | BSECP | R6 | W4/PY-GATEWAY | planned |
| `tests/monitoring/test_cron_health_export.py` | replace | gateway/deployment E2E test | AG | BSECP | R6 | W4/PY-GATEWAY | planned |
| `tests/monitoring/test_emitter.py` | replace | gateway/deployment E2E test | AG | BSECP | R6 | W4/PY-GATEWAY | planned |
| `tests/monitoring/test_export_redaction.py` | replace | gateway/deployment E2E test | AG | BSECP | R6 | W4/PY-GATEWAY | planned |
| `tests/monitoring/test_gateway_health_export.py` | replace | gateway/deployment E2E test | AG | BSECP | R6 | W4/PY-GATEWAY | planned |
| `tests/monitoring/test_otlp_exporter.py` | replace | gateway/deployment E2E test | AG | BSECP | R6 | W4/PY-GATEWAY | planned |
| `tests/openviking_plugin/test_openviking.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/plugins/__init__.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/browser/__init__.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/browser/check_parity_vs_main.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/browser/test_browser_provider_plugins.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/dashboard_auth/test_basic_provider.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/dashboard_auth/test_drain_provider.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/dashboard_auth/test_nous_provider.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/dashboard_auth/test_self_hosted_provider.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/image_gen/__init__.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/image_gen/check_parity_vs_main.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/image_gen/test_deepinfra_provider.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/image_gen/test_fal_provider.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/image_gen/test_krea_provider.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/image_gen/test_openai_codex_provider.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/image_gen/test_openai_provider.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/image_gen/test_openrouter_compat_provider.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/image_gen/test_xai_provider.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/memory/__init__.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/memory/test_byterover_provider.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/memory/test_config_schema.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/memory/test_hindsight_config_schema.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/memory/test_hindsight_env_perms.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/memory/test_hindsight_provider.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/memory/test_holographic_auto_extract.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/memory/test_holographic_retrieval.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/memory/test_holographic_shutdown_closes_db.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/memory/test_holographic_store.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/memory/test_honcho_config_schema.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/memory/test_mem0_backend.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/memory/test_mem0_providers.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/memory/test_mem0_setup.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/memory/test_mem0_v3.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/memory/test_memory_lazy_install.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/memory/test_openviking_endpoint_always_blocked.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/memory/test_openviking_provider.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/memory/test_openviking_shutdown.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/memory/test_retaindb_provider.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/memory/test_supermemory_provider.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/model_providers/test_copilot_profile.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/model_providers/test_custom_profile.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/model_providers/test_deepseek_profile.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/model_providers/test_fireworks_profile.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/model_providers/test_gemini_profile.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/model_providers/test_kimi_profile.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/model_providers/test_minimax_profile.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/model_providers/test_ollama_cloud_profile.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/model_providers/test_opencode_go_profile.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/model_providers/test_upstage_profile.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/model_providers/test_zai_profile.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/platforms/photon/test_auth.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/platforms/photon/test_check_requirements_risks.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/platforms/photon/test_fatal_notify_self_cancel.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/platforms/photon/test_inbound.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/platforms/photon/test_markdown.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/platforms/photon/test_mention_gating.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/platforms/photon/test_npm_error_log_regression.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/platforms/photon/test_outbound_media.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/platforms/photon/test_overflow_recovery.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/platforms/photon/test_poll_clarify.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/platforms/photon/test_presence_watchdog.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/platforms/photon/test_reactions.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/platforms/photon/test_rich_links.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/platforms/photon/test_runtime_record.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/platforms/photon/test_setup_access.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/platforms/photon/test_sidecar_deps_stale.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/platforms/photon/test_sidecar_lifecycle.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/platforms/photon/test_sidecar_paths.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/platforms/photon/test_spectrum_patch.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/platforms/photon/test_streaming.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/platforms/photon/test_url_send_path.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/platforms/photon/test_zombie_stream_watchdog.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/platforms/test_discord_gate_isolation.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/test_a2a_phase23.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/test_a2a_plugin.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/test_achievements_plugin.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/test_chronos_cron.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/test_chronos_verify.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/test_discord_runtime_failure.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/test_disk_cleanup_plugin.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/test_google_meet_audio.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/test_google_meet_node.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/test_google_meet_plugin.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/test_google_meet_realtime.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/test_hindsight_health_grace_timeout.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/test_hindsight_root_guard.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/test_holographic_vector_storage.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/test_kanban_attachments.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/test_kanban_board_project_api.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/test_kanban_dashboard_plugin.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/test_kanban_estimate.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/test_kanban_model_override.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/test_kanban_worker_runs.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/test_langfuse_plugin.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/test_nemo_relay_plugin.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/test_plugin_dashboard_auth_contract.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/test_raft_check_fn_silent.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/test_retaindb_plugin.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/test_security_guidance_plugin.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/test_teams_pipeline_plugin.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/transcription/__init__.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/transcription/check_parity_vs_main.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/tts/__init__.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/tts/check_parity_vs_main.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/video_gen/__init__.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/video_gen/test_deepinfra_provider.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/video_gen/test_fal_plugin.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/video_gen/test_xai_plugin.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/video_gen/test_xai_plugin_integration.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/web/__init__.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/plugins/web/test_web_search_provider_plugins.py` | externalize | plugin behavior test | NG:plugin | N | R6 | W2/PY-EXT | scoped-out |
| `tests/providers/__init__.py` | replace | provider/transport test | CP | BSC | R6 | W4/PY-PROVIDER | planned |
| `tests/providers/test_e2e_wiring.py` | replace | provider/transport test | CP | BSC | R6 | W4/PY-PROVIDER | planned |
| `tests/providers/test_fetch_models_base_url.py` | replace | provider/transport test | CP | BSC | R6 | W4/PY-PROVIDER | planned |
| `tests/providers/test_plugin_discovery.py` | replace | provider/transport test | CP | BSC | R6 | W4/PY-PROVIDER | planned |
| `tests/providers/test_profile_wiring.py` | replace | provider/transport test | CP | BSC | R6 | W4/PY-PROVIDER | planned |
| `tests/providers/test_provider_profiles.py` | replace | provider/transport test | CP | BSC | R6 | W4/PY-PROVIDER | planned |
| `tests/providers/test_provider_registry.py` | replace | provider/transport test | CP | BSC | R6 | W4/PY-PROVIDER | planned |
| `tests/providers/test_transport_parity.py` | replace | provider/transport test | CP | BSC | R6 | W4/PY-PROVIDER | planned |
| `tests/run_agent/__init__.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/conftest.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/repro_48013_image_shrink_brick.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_1630_context_overflow_loop.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_18028_content_policy_blocked.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_24996_fallback_exhaustion_cooldown.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_28161_anthropic_stream_pool_cleanup.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_31273_402_not_retried.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_32646_fallback_429_after_timeout.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_413_compression.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_63425_credential_pool_auto_detect.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_66267_multimodal_interim.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_70773_shared_client_fd_corruption.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_860_dedup.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_agent_guardrails.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_anthropic_prompt_cache_policy.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_anthropic_response_header_capture.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_anthropic_third_party_oauth_guard.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_anthropic_truncation_continuation.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_api_max_retries_config.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_async_httpx_del_neuter.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_auth_provider_failover.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_background_review.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_background_review_cache_parity.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_background_review_cost_controls.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_background_review_summary.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_background_review_toolset_restriction.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_callable_api_key.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_codex_app_server_compaction.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_codex_app_server_integration.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_codex_app_server_lifecycle.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_codex_multimodal_tool_result.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_codex_no_tools_nonetype.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_codex_silent_hang_hint.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_codex_xai_oauth_recovery.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_commit_memory_session_context_engine.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_compress_focus_plugin_fallback.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_compression_abort_state_reset.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_compression_boundary.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_compression_boundary_hook.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_compression_feasibility.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_compression_lock_defer.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_compression_persistence.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_compression_trigger_excludes_reasoning.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_compressor_fallback_update.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_concurrent_interrupt.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_context_token_tracking.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_conversation_fallback_state.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_copilot_native_vision_headers.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_create_openai_client_disables_sdk_retries.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_create_openai_client_kwargs_isolation.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_create_openai_client_proxy_env.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_create_openai_client_reuse.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_create_openai_client_ssl_verify.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_credential_pool_interrupt.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_credential_rotation_route_settings.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_credits_notices_toggle.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_custom_provider_extra_headers_client.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_deepseek_reasoning_content_echo.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_deepseek_v4_thinking_live.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_dict_tool_call_args.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_dropped_tool_call_recovery.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_empty_response_recovery_persistence.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_empty_terminal_reasoning_surface.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_exit_cleanup_interrupt.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_fallback_credential_isolation.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_fallback_reasoning_override.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_file_mutation_verifier.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_fireworks_live.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_identity_flush.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_image_generate_parallel.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_image_rejection_fallback.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_image_shrink_recovery.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_in_place_compaction.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_infinite_compaction_loop.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_init_fallback_on_exhausted_pool.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_interactive_interrupt.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_interrupt_propagation.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_invalid_context_length_warning.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_iteration_budget_race.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_jsondecodeerror_retryable.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_last_reasoning_per_turn.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_lmstudio_load_mode.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_long_context_tier_429.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_malformed_tool_arguments.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_materialize_data_url_cleanup.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_memory_nudge_counter_hydration.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_memory_provider_init.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_memory_sync_interrupted.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_message_sequence_repair.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_moa_fanout_cadence.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_moa_loop_mode.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_moa_privacy_filter.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_moa_streaming.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_multimodal_tool_content_recovery.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_nonretryable_error_html_summary.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_notice_spine.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_nous_429_fallback_reentry.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_nous_fallback_unavailable.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_openai_client_lifecycle.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_overflow_overhead_aware_tokens.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_partial_stream_finish_reason.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_per_model_compression_threshold.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_per_model_threshold_init_ordering.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_percentage_clamp.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_plugin_context_engine_init.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_post_tool_compression_attempt_cap.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_pre_compress_memory_context.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_preflight_compression_cap_e2e.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_primary_runtime_restore.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_proactive_prune_loop_wiring.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_provider_attribution_headers.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_provider_fallback.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_provider_parity.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_repair_tool_call_arguments.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_repair_tool_call_name.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_request_client_reuse_abort_races.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_reset_aware_primary_restore.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_retry_status_buffer.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_review_prompt_class_first.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_run_agent.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_run_agent_codex_responses.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_run_agent_multimodal_prologue.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_sequential_chats_live.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_session_activity_persist.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_session_id_env.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_session_meta_filtering.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_session_reset_fix.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_session_source.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_steer.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_stream_drop_logging.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_stream_interrupt_retry.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_stream_single_writer_65991.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_stream_stale_breaker_reset.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_stream_stale_circuit_breaker.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_streaming.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_streaming_tool_call_repair.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_strict_api_validation.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_strip_reasoning_tags_cli.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_summarize_api_error.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_switch_model_context.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_switch_model_fallback_prune.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_switch_model_pool_reload_52727.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_switch_model_reapplies_headers.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_switch_model_reasoning_override.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_switch_model_rollback.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_switch_model_stale_base_url.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_thinking_only_sanitizer.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_thinking_sig_recovery_persistence.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_tls_fd_recycle_corruption.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_token_persistence_non_cli.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_tool_arg_coercion.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_tool_batch_segmentation.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_tool_call_args_sanitizer.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_tool_call_guardrail_runtime.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_tool_call_incremental_persistence.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_tool_executor_contextvar_propagation.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_tool_name_db_persistence.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_turn_completion_explainer.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_unicode_ascii_codec.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_verification_continuation_budget.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_vision_aware_preprocessing.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_vision_tool_messages.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_agent/test_wait_state_visibility.py` | replace | agent lifecycle test | H | BCEP | R6 | W3/PY-RUNTIME | planned |
| `tests/run_interrupt_test.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/scripts/test_contributor_map.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/scripts/test_footgun_subprocess_encoding.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/scripts/test_smoke_nemo_relay_shared_metrics.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/secret_sources/__init__.py` | replace | credential/secret test | DL | BSP | R6 | W4/PY-SECURITY | planned |
| `tests/secret_sources/conformance.py` | replace | credential/secret test | DL | BSP | R6 | W4/PY-SECURITY | planned |
| `tests/secret_sources/test_error_remediation.py` | replace | credential/secret test | DL | BSP | R6 | W4/PY-SECURITY | planned |
| `tests/secret_sources/test_profile_secrets.py` | replace | credential/secret test | DL | BSP | R6 | W4/PY-SECURITY | planned |
| `tests/secret_sources/test_secret_source_registry.py` | replace | credential/secret test | DL | BSP | R6 | W4/PY-SECURITY | planned |
| `tests/skills/test_cloudflare_temporary_deploy_skill.py` | externalize | skill behavior test | NG:skill | N | R6 | W2/PY-EXT | scoped-out |
| `tests/skills/test_darwinian_evolver_skill.py` | externalize | skill behavior test | NG:skill | N | R6 | W2/PY-EXT | scoped-out |
| `tests/skills/test_fetch_transcript.py` | externalize | skill behavior test | NG:skill | N | R6 | W2/PY-EXT | scoped-out |
| `tests/skills/test_github_credential_token.py` | externalize | skill behavior test | NG:skill | N | R6 | W2/PY-EXT | scoped-out |
| `tests/skills/test_google_workspace_api.py` | externalize | skill behavior test | NG:skill | N | R6 | W2/PY-EXT | scoped-out |
| `tests/skills/test_google_workspace_credential_files.py` | externalize | skill behavior test | NG:skill | N | R6 | W2/PY-EXT | scoped-out |
| `tests/skills/test_google_workspace_setup.py` | externalize | skill behavior test | NG:skill | N | R6 | W2/PY-EXT | scoped-out |
| `tests/skills/test_google_workspace_setup_deps.py` | externalize | skill behavior test | NG:skill | N | R6 | W2/PY-EXT | scoped-out |
| `tests/skills/test_grounded_citations_skill.py` | externalize | skill behavior test | NG:skill | N | R6 | W2/PY-EXT | scoped-out |
| `tests/skills/test_hyperliquid_skill.py` | externalize | skill behavior test | NG:skill | N | R6 | W2/PY-EXT | scoped-out |
| `tests/skills/test_mcp_oauth_remote_gateway_skill.py` | externalize | skill behavior test | NG:skill | N | R6 | W2/PY-EXT | scoped-out |
| `tests/skills/test_memento_cards.py` | externalize | skill behavior test | NG:skill | N | R6 | W2/PY-EXT | scoped-out |
| `tests/skills/test_openclaw_migration.py` | externalize | skill behavior test | NG:skill | N | R6 | W2/PY-EXT | scoped-out |
| `tests/skills/test_openclaw_migration_hardening.py` | externalize | skill behavior test | NG:skill | N | R6 | W2/PY-EXT | scoped-out |
| `tests/skills/test_pinecone_research_skill.py` | externalize | skill behavior test | NG:skill | N | R6 | W2/PY-EXT | scoped-out |
| `tests/skills/test_telephony_skill.py` | externalize | skill behavior test | NG:skill | N | R6 | W2/PY-EXT | scoped-out |
| `tests/skills/test_tldraw_offline_skill.py` | externalize | skill behavior test | NG:skill | N | R6 | W2/PY-EXT | scoped-out |
| `tests/skills/test_unbroker_skill.py` | externalize | skill behavior test | NG:skill | N | R6 | W2/PY-EXT | scoped-out |
| `tests/skills/test_xurl_article_ingestion_docs.py` | externalize | skill behavior test | NG:skill | N | R6 | W2/PY-EXT | scoped-out |
| `tests/skills/test_xurl_x_search_routing.py` | externalize | skill behavior test | NG:skill | N | R6 | W2/PY-EXT | scoped-out |
| `tests/skills/test_youtube_quiz.py` | externalize | skill behavior test | NG:skill | N | R6 | W2/PY-EXT | scoped-out |
| `tests/state/test_compression_lineage_guard.py` | replace | state/persistence test | DL | BSP | R6 | W4/PY-STATE | planned |
| `tests/state/test_disk_full_error.py` | replace | state/persistence test | DL | BSP | R6 | W4/PY-STATE | planned |
| `tests/state/test_fts_runtime_rebuild.py` | replace | state/persistence test | DL | BSP | R6 | W4/PY-STATE | planned |
| `tests/state/test_no_more_rows_retry.py` | replace | state/persistence test | DL | BSP | R6 | W4/PY-STATE | planned |
| `tests/state/test_session_model_usage_pk_heal.py` | replace | state/persistence test | DL | BSP | R6 | W4/PY-STATE | planned |
| `tests/state/test_write_lock_patience.py` | replace | state/persistence test | DL | BSP | R6 | W4/PY-STATE | planned |
| `tests/stress/_fake_worker.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/stress/conftest.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/stress/test_atypical_scenarios.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/stress/test_benchmarks.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/stress/test_concurrency.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/stress/test_concurrency_mixed.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/stress/test_concurrency_parent_gate.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/stress/test_concurrency_reclaim_race.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/stress/test_property_fuzzing.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/stress/test_subprocess_e2e.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_account_usage.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_atomic_replace_symlinks.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_audio_playback_guard.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_background_review_list_shapes.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_background_review_session_isolation.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_base_url_hostname.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_batch_runner_checkpoint.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_batch_runner_durability.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_bitwarden_secrets.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_cli_manual_compress.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_cli_skin_integration.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_code_skew.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_command_secret_source.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_conftest_wal_gate.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_copilot_initiator.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_credential_file_permissions.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_ctx_halving_fix.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_delegate_cascade_49148.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_dispatch_session_id.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_empty_model_fallback.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_empty_session_hygiene.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_engines_satisfiable.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_env_loader_applied_homes.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_env_loader_op_bootstrap.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_env_loader_secret_sources.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_evidence_store.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_fast_safe_load.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_fts_cjk_bigram.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_fts_update_of_narrowing.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_gateway_streaming_nested_config.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_get_tool_definitions_cache_isolation.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_hermes_bootstrap.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_hermes_constants.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_hermes_home_profile_warning.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_hermes_logging.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_hermes_state.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_hermes_state_compression_busy_retry.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_hermes_state_compression_locks.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_hermes_state_readonly_preflight.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_hermes_state_wal_fallback.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_hermetic_side_effect_guards.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_honcho_client_concurrency.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_honcho_client_config.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_honcho_session_context.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_honcho_startup_fail_open.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_install_autostash_conflict_recovery.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_install_commit_pin_rollback.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_install_diverged_update.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_install_lockfile_churn.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_install_macos_launcher.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_install_no_initial_commit.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_install_ps1_ascii_only.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_install_ps1_native_stderr_eap.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_install_ps1_node_path_for_npm.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_install_ps1_python_fallback_venv.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_install_ps1_uv_powershell_host.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_install_ps1_web_server_syntax_probe.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_install_sh_acp_launcher.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_install_sh_bootstrap_marker.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_install_sh_browser_install.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_install_sh_install_method_stamp.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_install_sh_node_global_prefix.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_install_sh_pythonpath_sanitization.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_install_sh_root_fhs_uv_python_path.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_install_sh_setup_wizard_tty_probe.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_install_sh_symlink_stomp.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_install_sh_termux_network_prereqs.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_install_unmerged_index.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_ipv4_preference.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_iron_proxy.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_iron_proxy_cli.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_iron_proxy_e2e.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_journal_mode_config.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_lazy_session_regressions.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_live_system_guard.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_live_system_guard_self_test.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_log_isolation.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_managed_runtime_resolution.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_mcp_serve.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_message_reactions.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_mini_swe_runner.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_minimax_model_validation.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_minimax_oauth.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_minisweagent_path.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_model_forces_max_completion_tokens.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_model_picker_scroll.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_model_tools.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_model_tools_async_bridge.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_no_shadowed_test_definitions.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_ollama_num_ctx.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_onepassword_secrets.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_output_cap_parsing.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_packaging_build_guard.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_packaging_metadata.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_plugin_skills.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_plugin_utils.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_process_loop_event_loop_warning.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_profile_isolation_runtime.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_project_metadata.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_pty_keepalive_ws.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_pty_session.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_retry_utils.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_run_tests_parallel.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_run_tests_parallel_stdio.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_sanitize_tool_error.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_search_slow_query_log.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_secret_scope_plugin_families.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_session_db_read_path_split.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_session_skill_previews.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_session_system_prompt_dedup.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_session_vacuum_config.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_session_workspace_binding.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_slack_thread_require_mention.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_slash_worker_watchdog.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_sql_injection.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_sqlite_lock_safe_inspection.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_sqlite_wal_reset_gate.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_stale_tool_call_marker_session_repair.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_stale_utils_module_import.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_state_db_malformed_repair.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_subprocess_home_isolation.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_telegram_polling_progress_ptb.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_termux_all_extra_compat.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_timezone.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_tini_shim.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_toolset_distributions.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_toolsets.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_trajectory_compressor.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_trajectory_compressor_async.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_transform_llm_output_hook.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_transform_tool_result_hook.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_tui_entry_mcp_owner.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_tui_gateway_loop_noise.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_tui_gateway_queue_on_busy.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_tui_gateway_server.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_tui_gateway_ws.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_tui_mcp_late_refresh.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_utils_truthy_values.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_voice_max_recording_seconds.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_wal_checkpoint_strategy.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_web_server.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_web_server_sessiondb_eventloop.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_web_server_status_topology_cache.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_windows_subprocess_no_window_flags.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_yaml_indent_consistency_31999.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_yuanbao_integration.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_yuanbao_markdown.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_yuanbao_pipeline.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_yuanbao_proto.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_yuanbao_reconnect_set_active.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_yuanbao_shutdown.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/test_zeroed_state_db.py` | replace | compatibility test | H | BSC | R6 | W3/PY-RUNTIME | planned |
| `tests/tools/__init__.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/conftest.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_accretion_caps.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_ansi_strip.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_approval.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_approval_config_readonly.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_approval_deny_rules.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_approval_interrupt.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_approval_mode_parity.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_approval_plugin_hooks.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_approved_command_clean_slate.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_async_delegation.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_async_delegation_fd_leak.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_audio_container.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_base_environment.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_blocked_command_guidance.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_blueprints.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_browser_camofox.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_browser_camofox_auth.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_browser_camofox_ensure_tab.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_browser_camofox_persistence.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_browser_camofox_private_page_guard.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_browser_camofox_state.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_browser_camofox_timeout.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_browser_cdp_override.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_browser_cdp_tool.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_browser_chromium_autoinstall.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_browser_chromium_check.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_browser_cleanup.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_browser_cloud_fallback.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_browser_cloud_provider_cache.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_browser_command_timeout_race.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_browser_console.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_browser_console_ssrf.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_browser_content_none_guard.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_browser_eval_ssrf.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_browser_eval_supervisor_path.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_browser_get_images_ssrf.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_browser_hardening.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_browser_headed_mode.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_browser_homebrew_paths.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_browser_hybrid_routing.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_browser_lightpanda.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_browser_open_timeout.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_browser_orphan_reaper.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_browser_private_page_action_guard.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_browser_secret_exfil.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_browser_snapshot_ssrf.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_browser_ssrf_local.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_browser_supervisor.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_browser_supervisor_healthcheck.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_browser_type_redaction.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_browser_use_session_expiry.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_budget_config.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_build_subprocess_env.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_checkpoint_manager.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_clarify_gateway.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_clarify_tool.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_clipboard.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_code_execution.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_code_execution_modes.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_code_execution_windows_env.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_command_guards.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_computer_use.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_computer_use_approval_isolation.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_computer_use_capture_routing.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_computer_use_cua_0_10_permissions.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_computer_use_cua_0_9.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_computer_use_cua_backend_linux.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_computer_use_delivery_ladder.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_computer_use_null_pid_windows.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_computer_use_vision_routing.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_config_null_guard.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_container_cwd_sanitize.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_credential_files.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_credential_pool_env_fallback.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_cron_approval_mode.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_cron_prompt_injection.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_cronjob_run_immediate.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_cronjob_tools.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_cross_profile_guard.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_daemon_pool.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_daytona_environment.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_debug_helpers.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_delegate.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_delegate_apiserver_background.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_delegate_composite_toolsets.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_delegate_kanban_isolation.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_delegate_subagent_timeout_diagnostic.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_delegate_summary_budget.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_delegate_toolset_scope.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_delegation_live_log.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_denial_circuit_breaker.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_desktop_ui.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_discord_send_message_caption.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_discord_tool.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_docker_cgroup_limits.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_docker_config_migrate.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_docker_daemon_redirect.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_docker_environment.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_docker_find.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_docker_network_config.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_docker_orphan_reaper_integration.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_docker_rebootstrap_nous_session.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_dockerfile_immutable_install.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_dockerfile_pid1_reaping.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_env_passthrough.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_env_probe.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_execute_code_approval_cluster.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_execution_flag_detection.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_fal_common.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_feishu_tools.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_file_operations.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_file_operations_edge_cases.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_file_ops_cwd_tracking.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_file_read_guards.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_file_staleness.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_file_state_registry.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_file_sync.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_file_sync_back.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_file_sync_perf.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_file_sync_sigint.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_file_tools.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_file_tools_container_config.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_file_tools_cwd_resolution.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_file_tools_live.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_file_tools_tilde_profile.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_file_write_safety.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_find_shell.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_flux3_video_tool.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_focus_pane_tool.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_force_dangerous_override.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_fuzzy_match.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_gateway_cwd_contract.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_gnu_long_option_abbreviation_bypass.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_hardline_blocklist.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_heartbeat_stale_thresholds.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_hermes_subprocess_env.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_hidden_dir_filter.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_homeassistant_tool.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_hook_output_spill.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_hub_lock_non_utf8_68053.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_image_generation.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_image_generation_artifacts.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_image_generation_env.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_image_generation_image_to_image.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_image_generation_plugin_dispatch.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_image_source.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_init_session_cwd_respect.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_interrupt.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_kanban_comment_injection.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_kanban_redaction.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_kanban_tools.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_lazy_deps.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_lazy_deps_durable_target.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_lazy_deps_managed.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_line_ending_preservation.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_llm_content_none_guard.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_local_background_child_hang.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_local_cwd_permission_fallback.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_local_env_blocklist.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_local_env_cwd_recovery.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_local_env_relative_cwd.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_local_env_session_leak.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_local_env_windows_msys.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_local_interrupt_cleanup.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_local_shell_init.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_local_tempdir.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_managed_browserbase_and_modal.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_managed_media_gateways.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_managed_modal_environment.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_managed_tool_gateway.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_mcp_bridge_single_failure.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_mcp_cancelled_error_propagation.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_mcp_capability_gating.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_mcp_circuit_breaker.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_mcp_client_cert.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_mcp_config_whitespace_warning.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_mcp_dashboard_oauth.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_mcp_discovery_cross_process.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_mcp_dynamic_discovery.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_mcp_elicitation.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_mcp_empty_error_message.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_mcp_failure_classification.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_mcp_image_content.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_mcp_initial_connect_shutdown.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_mcp_invalid_url.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_mcp_lazy_start.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_mcp_list_pagination.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_mcp_loop_profile_override.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_mcp_oauth.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_mcp_oauth_bidirectional.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_mcp_oauth_cold_load_expiry.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_mcp_oauth_integration.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_mcp_oauth_manager.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_mcp_oauth_metadata.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_mcp_parked_self_probe.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_mcp_poll_loop_oom_integration.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_mcp_preflight_content_type.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_mcp_probe.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_mcp_rapid_drop_budget.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_mcp_reconnect_log_hygiene.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_mcp_reconnect_retry_reset.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_mcp_reconnect_signal.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_mcp_register_wakes_stale.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_mcp_resource_content.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_mcp_schema_cache.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_mcp_server_log_notifications.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_mcp_sse_transport.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_mcp_stability.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_mcp_stdio_encoding_handler.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_mcp_stdio_init_timeout.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_mcp_stdio_watchdog.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_mcp_structured_content.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_mcp_tool.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_mcp_tool_401_handling.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_mcp_tool_issue_948.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_mcp_tool_session_expired.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_mcp_transport_group_reconnect.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_mcp_utility_capability_gating.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_media_caption_split.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_memory_tool.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_memory_tool_import_fallback.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_memory_tool_schema.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_microsoft_graph_auth.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_microsoft_graph_client.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_modal_bulk_upload.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_modal_sandbox_fixes.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_modal_snapshot_isolation.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_notify_on_complete.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_open_preview_tool.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_osv_check.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_parse_env_var.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_patch_already_applied.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_patch_failure_tracking.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_patch_multimatch_locations.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_patch_parser.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_patch_ws_diagnosis.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_pr_6656_regressions.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_process_registry.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_process_wait_clarity.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_read_extract.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_read_loop_detection.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_refresh_agent_mcp_tools.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_registry.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_request_tool_approval.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_resolve_path.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_restored_delegation_ownership.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_sandbox_failure_hints.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_schema_sanitizer.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_search_auto_multiline.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_search_budget_truncation.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_search_error_guard.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_search_hidden_dirs.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_search_zero_match_and_multipath.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_send_message_missing_platforms.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_send_message_react.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_send_message_slack.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_send_message_target_parse.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_send_message_telegram_proxy.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_send_message_tool.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_session_cwd_store.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_session_search.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_shared_container_task_id.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_shell_bypass_denylist.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_signal_media.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_singularity_preflight.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_skill_bundle_provenance.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_skill_env_passthrough.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_skill_improvements.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_skill_manager_tool.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_skill_provenance.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_skill_size_limits.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_skill_usage.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_skill_view_dedup.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_skill_view_path_check.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_skill_view_traversal.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_skills_ast_audit.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_skills_guard.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_skills_hub.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_skills_hub_browse_sh.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_skills_hub_clawhub.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_skills_list_modified_diff.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_skills_sync.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_skills_sync_client.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_skills_tool.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_skills_tool_discovery_cache.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_skills_tool_profile_scope.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_slack_send_message_media.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_slash_confirm.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_smart_approval_injection.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_smart_approval_policy.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_snapshot_multiline_session_env_injection.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_snapshot_session_id_leak.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_spotify_client.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_ssh_bulk_upload.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_ssh_environment.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_stage2_hook_seed_one_symlinks.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_stage2_hook_symlink_chown.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_stt_default_language.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_stt_language_resolution.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_stt_silence_hallucinations.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_subprocess_stdin_guard.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_subprocess_utf8_encoding.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_symlink_prefix_confusion.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_sync_back_backends.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_telegram_send_message_caption.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_terminal_compound_background.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_terminal_config_env_sync.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_terminal_cwd_echo.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_terminal_env_bridge.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_terminal_exit_semantics.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_terminal_foreground_timeout_cap.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_terminal_hints.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_terminal_none_command_guard.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_terminal_output_transform_hook.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_terminal_requirements.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_terminal_task_cwd.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_terminal_timeout_output.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_terminal_tool.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_terminal_tool_pty_fallback.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_terminal_tool_requirements.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_terminal_truncation_spill.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_termux_api_detection.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_threaded_process_handle.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_threat_patterns.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_tirith_security.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_todo_tool.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_todo_tool_type_coercion.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_tool_backend_helpers.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_tool_output_limits.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_tool_result_storage.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_tool_search.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_tool_search_context_provider.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_transcription.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_transcription_command_providers.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_transcription_deepinfra.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_transcription_dotenv_fallback.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_transcription_plugin_dispatch.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_transcription_tools.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_tts_command_providers.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_tts_container_repair.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_tts_deepinfra.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_tts_dotenv_fallback.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_tts_gemini.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_tts_instructions.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_tts_kittentts.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_tts_macos_output.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_tts_max_text_length.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_tts_minimax_region.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_tts_mistral.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_tts_model_cache_lru.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_tts_openai_config.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_tts_opus_routing.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_tts_output_timestamp.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_tts_path_traversal.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_tts_piper.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_tts_plugin_dispatch.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_tts_prepare_spoken.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_tts_provider_base_urls.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_tts_pythonpath_fallback.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_tts_response_body_cap.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_tts_speed.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_tts_streaming.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_tts_streaming_e2e.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_tts_text_normalize.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_tts_xai_speech_tags.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_url_safety.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_vercel_sandbox_environment.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_video_analyze.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_video_generation_dispatch.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_video_generation_dynamic_schema.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_video_generation_tool_surface_matrix.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_vision_native_fast_path.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_vision_tools.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_voice_cli_integration.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_voice_credential_pool_resolution.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_voice_mode.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_voice_mode_playback_env_scrub.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_voice_stop_phrase.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_voice_thinking_sound.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_voice_wsl_pipewire.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_wake_word.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_watch_patterns.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_web_extract_robustness.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_web_providers.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_web_providers_brave_free.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_web_providers_ddgs.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_web_providers_searxng.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_web_providers_xai.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_web_tools_config.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_web_tools_dict_urls.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_web_tools_tavily.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_web_tools_truncate.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_website_policy.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_whatsapp_send_message_media.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_windows_compat.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_windows_native_support.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_working_diff.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_write_approval.py` | replace | tool contract/security test | TX | BSC | R6 | W3/PY-TOOLS | planned |
| `tests/tools/test_write_deny.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_write_file_syntax_gate.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_write_verification.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_x_search_tool.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_xai_http_credentials.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_xai_http_storage.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_yolo_mode.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tools/test_zombie_process_cleanup.py` | remove | unsupported tool test | NG:unsupported-tool | N | R5 | W1/PY-TEST | scoped-out |
| `tests/tui_gateway/__init__.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/tui_gateway/test_auto_continue.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/tui_gateway/test_billing_rpc.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/tui_gateway/test_change_watcher.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/tui_gateway/test_codex_app_server_live_events.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/tui_gateway/test_cold_start_gil_stall.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/tui_gateway/test_compaction_status.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/tui_gateway/test_compress_lock_skip.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/tui_gateway/test_compute_host.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/tui_gateway/test_compute_host_phase1.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/tui_gateway/test_custom_provider_session_persistence.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/tui_gateway/test_delegation_session_lifecycle.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/tui_gateway/test_entry_import_off_main_thread.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/tui_gateway/test_entry_picker_prewarm.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/tui_gateway/test_entry_sys_path.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/tui_gateway/test_failed_turn_retention.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/tui_gateway/test_fast_session_scope.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/tui_gateway/test_finalize_session_persist.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/tui_gateway/test_gateway_owned_session_reap.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/tui_gateway/test_goal_command.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/tui_gateway/test_image_routing_stale_model.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/tui_gateway/test_inline_rpc_gil_starvation.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/tui_gateway/test_interim_assistant_callback.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/tui_gateway/test_iso_certify_seam.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/tui_gateway/test_kanban_notify_poller.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/tui_gateway/test_make_agent_provider.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/tui_gateway/test_mcp_late_refresh_thread_owner.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/tui_gateway/test_mcp_reload_rev.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/tui_gateway/test_moa_reference_emit.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/tui_gateway/test_model_switch_marker_role.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/tui_gateway/test_pet_generate_rpc.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/tui_gateway/test_project_tree.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/tui_gateway/test_projects_rpc.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/tui_gateway/test_protocol.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/tui_gateway/test_reasoning_config_per_model.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/tui_gateway/test_reasoning_session_scope.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/tui_gateway/test_render.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/tui_gateway/test_review_summary_callback.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/tui_gateway/test_session_cwd_follow.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/tui_gateway/test_session_id_injection.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/tui_gateway/test_session_images_dir.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/tui_gateway/test_session_platform_resolution.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/tui_gateway/test_session_reclaim_notify.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/tui_gateway/test_slash_worker_ansi.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/tui_gateway/test_slash_worker_mcp_discovery.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/tui_gateway/test_slash_worker_profile_home.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/tui_gateway/test_slash_worker_sys_path.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/tui_gateway/test_subagent_child_mirror.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/tui_gateway/test_subprocess_encoding.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/tui_gateway/test_undo_command.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tests/tui_gateway/test_wait_for_mcp_discovery.py` | remove | unsupported interface test | NG:unsupported-interface | N | R5/R6 | W1/PY-TEST | scoped-out |
| `tools/__init__.py` | replace | tool runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/ansi_strip.py` | replace | tool runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/approval.py` | replace | tool runtime/security | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/async_delegation.py` | replace | tool runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/audio_container.py` | remove | unsupported integration tool | NG:unsupported-tool | N | R5 | W1/PY-CLAIMS | scoped-out |
| `tools/binary_extensions.py` | replace | tool runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/blueprints.py` | replace | tool runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/browser_camofox.py` | remove | unsupported integration tool | NG:unsupported-tool | N | R5 | W1/PY-CLAIMS | scoped-out |
| `tools/browser_camofox_state.py` | remove | unsupported integration tool | NG:unsupported-tool | N | R5 | W1/PY-CLAIMS | scoped-out |
| `tools/browser_cdp_tool.py` | remove | unsupported integration tool | NG:unsupported-tool | N | R5 | W1/PY-CLAIMS | scoped-out |
| `tools/browser_dialog_tool.py` | remove | unsupported integration tool | NG:unsupported-tool | N | R5 | W1/PY-CLAIMS | scoped-out |
| `tools/browser_supervisor.py` | remove | unsupported integration tool | NG:unsupported-tool | N | R5 | W1/PY-CLAIMS | scoped-out |
| `tools/browser_tool.py` | remove | unsupported integration tool | NG:unsupported-tool | N | R5 | W1/PY-CLAIMS | scoped-out |
| `tools/budget_config.py` | replace | tool runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/checkpoint_manager.py` | replace | tool runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/clarify_gateway.py` | replace | tool runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/clarify_tool.py` | replace | tool runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/close_terminal_tool.py` | replace | tool runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/code_execution_tool.py` | replace | tool runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/computer_use/__init__.py` | remove | unsupported integration tool | NG:unsupported-tool | N | R5 | W1/PY-CLAIMS | scoped-out |
| `tools/computer_use/backend.py` | remove | unsupported integration tool | NG:unsupported-tool | N | R5 | W1/PY-CLAIMS | scoped-out |
| `tools/computer_use/browser_route.py` | remove | unsupported integration tool | NG:unsupported-tool | N | R5 | W1/PY-CLAIMS | scoped-out |
| `tools/computer_use/cua_backend.py` | remove | unsupported integration tool | NG:unsupported-tool | N | R5 | W1/PY-CLAIMS | scoped-out |
| `tools/computer_use/doctor.py` | remove | unsupported integration tool | NG:unsupported-tool | N | R5 | W1/PY-CLAIMS | scoped-out |
| `tools/computer_use/permissions.py` | remove | unsupported integration tool | NG:unsupported-tool | N | R5 | W1/PY-CLAIMS | scoped-out |
| `tools/computer_use/schema.py` | remove | unsupported integration tool | NG:unsupported-tool | N | R5 | W1/PY-CLAIMS | scoped-out |
| `tools/computer_use/tool.py` | remove | unsupported integration tool | NG:unsupported-tool | N | R5 | W1/PY-CLAIMS | scoped-out |
| `tools/computer_use/vision_routing.py` | remove | unsupported integration tool | NG:unsupported-tool | N | R5 | W1/PY-CLAIMS | scoped-out |
| `tools/computer_use_tool.py` | remove | unsupported integration tool | NG:unsupported-tool | N | R5 | W1/PY-CLAIMS | scoped-out |
| `tools/credential_files.py` | replace | tool runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/cronjob_tools.py` | replace | tool runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/daemon_pool.py` | replace | tool runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/debug_helpers.py` | replace | tool runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/delegate_tool.py` | replace | tool runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/delegation_live_log.py` | replace | tool runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/desktop_ui.py` | replace | tool runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/discord_tool.py` | remove | unsupported integration tool | NG:unsupported-tool | N | R5 | W1/PY-CLAIMS | scoped-out |
| `tools/env_passthrough.py` | replace | tool runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/env_probe.py` | replace | tool runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/environments/__init__.py` | remove | unsupported integration tool | NG:unsupported-tool | N | R5 | W1/PY-CLAIMS | scoped-out |
| `tools/environments/base.py` | remove | unsupported integration tool | NG:unsupported-tool | N | R5 | W1/PY-CLAIMS | scoped-out |
| `tools/environments/daytona.py` | remove | unsupported integration tool | NG:unsupported-tool | N | R5 | W1/PY-CLAIMS | scoped-out |
| `tools/environments/docker.py` | remove | unsupported integration tool | NG:unsupported-tool | N | R5 | W1/PY-CLAIMS | scoped-out |
| `tools/environments/file_sync.py` | remove | unsupported integration tool | NG:unsupported-tool | N | R5 | W1/PY-CLAIMS | scoped-out |
| `tools/environments/local.py` | remove | unsupported integration tool | NG:unsupported-tool | N | R5 | W1/PY-CLAIMS | scoped-out |
| `tools/environments/managed_modal.py` | remove | unsupported integration tool | NG:unsupported-tool | N | R5 | W1/PY-CLAIMS | scoped-out |
| `tools/environments/modal.py` | remove | unsupported integration tool | NG:unsupported-tool | N | R5 | W1/PY-CLAIMS | scoped-out |
| `tools/environments/modal_utils.py` | remove | unsupported integration tool | NG:unsupported-tool | N | R5 | W1/PY-CLAIMS | scoped-out |
| `tools/environments/singularity.py` | remove | unsupported integration tool | NG:unsupported-tool | N | R5 | W1/PY-CLAIMS | scoped-out |
| `tools/environments/ssh.py` | remove | unsupported integration tool | NG:unsupported-tool | N | R5 | W1/PY-CLAIMS | scoped-out |
| `tools/environments/vercel_sandbox.py` | remove | unsupported integration tool | NG:unsupported-tool | N | R5 | W1/PY-CLAIMS | scoped-out |
| `tools/fal_common.py` | replace | tool runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/feishu_doc_tool.py` | remove | unsupported integration tool | NG:unsupported-tool | N | R5 | W1/PY-CLAIMS | scoped-out |
| `tools/feishu_drive_tool.py` | remove | unsupported integration tool | NG:unsupported-tool | N | R5 | W1/PY-CLAIMS | scoped-out |
| `tools/file_operations.py` | replace | tool runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/file_state.py` | replace | tool runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/file_tools.py` | replace | tool runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/flux3_video_tool.py` | remove | unsupported integration tool | NG:unsupported-tool | N | R5 | W1/PY-CLAIMS | scoped-out |
| `tools/focus_pane_tool.py` | replace | tool runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/fuzzy_match.py` | replace | tool runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/homeassistant_tool.py` | remove | unsupported integration tool | NG:unsupported-tool | N | R5 | W1/PY-CLAIMS | scoped-out |
| `tools/hook_output_spill.py` | replace | tool runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/image_generation_tool.py` | remove | unsupported integration tool | NG:unsupported-tool | N | R5 | W1/PY-CLAIMS | scoped-out |
| `tools/image_source.py` | remove | unsupported integration tool | NG:unsupported-tool | N | R5 | W1/PY-CLAIMS | scoped-out |
| `tools/interrupt.py` | replace | tool runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/kanban_tools.py` | remove | unsupported integration tool | NG:unsupported-tool | N | R5 | W1/PY-CLAIMS | scoped-out |
| `tools/lazy_deps.py` | replace | tool runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/managed_tool_gateway.py` | replace | tool runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/mcp_dashboard_oauth.py` | replace | tool runtime/security | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/mcp_oauth.py` | replace | tool runtime/security | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/mcp_oauth_manager.py` | replace | tool runtime/security | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/mcp_schema_cache.py` | replace | tool runtime/security | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/mcp_stdio_watchdog.py` | replace | tool runtime/security | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/mcp_tool.py` | replace | tool runtime/security | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/memory_tool.py` | replace | tool runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/microsoft_graph_auth.py` | replace | tool runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/microsoft_graph_client.py` | replace | tool runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/neutts_synth.py` | remove | unsupported integration tool | NG:unsupported-tool | N | R5 | W1/PY-CLAIMS | scoped-out |
| `tools/open_preview_tool.py` | replace | tool runtime/security | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/openrouter_client.py` | replace | tool runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/osv_check.py` | replace | tool runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/patch_parser.py` | replace | tool runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/path_security.py` | replace | tool runtime/security | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/process_registry.py` | replace | tool runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/project_tools.py` | replace | tool runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/react_to_message_tool.py` | replace | tool runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/read_extract.py` | replace | tool runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/read_terminal_tool.py` | replace | tool runtime/security | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/registry.py` | replace | tool runtime/security | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/schema_sanitizer.py` | replace | tool runtime/security | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/send_message_tool.py` | remove | unsupported integration tool | NG:unsupported-tool | N | R5 | W1/PY-CLAIMS | scoped-out |
| `tools/session_search_tool.py` | replace | tool runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/skill_manager_tool.py` | replace | tool runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/skill_provenance.py` | replace | tool runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/skill_usage.py` | replace | tool runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/skills_ast_audit.py` | replace | tool runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/skills_guard.py` | replace | tool runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/skills_hub.py` | replace | tool runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/skills_sync.py` | replace | tool runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/skills_sync_client.py` | replace | tool runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/skills_tool.py` | replace | tool runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/slash_confirm.py` | replace | tool runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/terminal_hints.py` | replace | tool runtime/security | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/terminal_tool.py` | replace | tool runtime/security | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/thread_context.py` | replace | tool runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/threat_patterns.py` | replace | tool runtime/security | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/tirith_security.py` | replace | tool runtime/security | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/todo_tool.py` | replace | tool runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/tool_backend_helpers.py` | replace | tool runtime/security | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/tool_output_limits.py` | replace | tool runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/tool_result_storage.py` | replace | tool runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/tool_search.py` | replace | tool runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/transcription_tools.py` | remove | unsupported integration tool | NG:unsupported-tool | N | R5 | W1/PY-CLAIMS | scoped-out |
| `tools/tts_streaming.py` | remove | unsupported integration tool | NG:unsupported-tool | N | R5 | W1/PY-CLAIMS | scoped-out |
| `tools/tts_text_normalize.py` | remove | unsupported integration tool | NG:unsupported-tool | N | R5 | W1/PY-CLAIMS | scoped-out |
| `tools/tts_tool.py` | remove | unsupported integration tool | NG:unsupported-tool | N | R5 | W1/PY-CLAIMS | scoped-out |
| `tools/url_safety.py` | replace | tool runtime/security | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/video_generation_tool.py` | remove | unsupported integration tool | NG:unsupported-tool | N | R5 | W1/PY-CLAIMS | scoped-out |
| `tools/vision_tools.py` | replace | tool runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/voice_mode.py` | remove | unsupported integration tool | NG:unsupported-tool | N | R5 | W1/PY-CLAIMS | scoped-out |
| `tools/wake_word.py` | replace | tool runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/web_tools.py` | remove | unsupported integration tool | NG:unsupported-tool | N | R5 | W1/PY-CLAIMS | scoped-out |
| `tools/website_policy.py` | replace | tool runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/working_diff.py` | replace | tool runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/write_approval.py` | replace | tool runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/x_search_tool.py` | remove | unsupported integration tool | NG:unsupported-tool | N | R5 | W1/PY-CLAIMS | scoped-out |
| `tools/xai_http.py` | replace | tool runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `tools/xai_video_tools.py` | remove | unsupported integration tool | NG:unsupported-tool | N | R5 | W1/PY-CLAIMS | scoped-out |
| `tools/yuanbao_tools.py` | replace | tool runtime | TX | BSC | R3 | W3/PY-TOOLS | planned |
| `toolset_distributions.py` | replace | runtime module | H | BSC | R1 | W3/PY-RUNTIME | planned |
| `toolsets.py` | replace | tool registry/toolset runtime | TR | BSC | R3 | W3/PY-TOOLS | planned |
| `trajectory_compressor.py` | externalize | research/evaluation runtime | NG:research | N | R5 | W2/PY-EXT | scoped-out |
| `utils.py` | replace | runtime module | H | BSC | R1 | W3/PY-RUNTIME | planned |

**Validation**

Tracked baseline: **3,425** paths. Validate exact coverage with:

```sh
git ls-files '*.py' | sort > /tmp/python-tracked
awk -F'`' '/^\| `/{print $2}' docs/migration/python-retirement-ledger.md | sort > /tmp/python-ledger
test "$(wc -l < /tmp/python-tracked)" -eq "$(wc -l < /tmp/python-ledger)"
test "$(uniq -d /tmp/python-ledger | wc -l)" -eq 0
test "$(comm -23 /tmp/python-tracked /tmp/python-ledger | wc -l)" -eq 0
test "$(comm -13 /tmp/python-tracked /tmp/python-ledger | wc -l)" -eq 0
```

The count, duplicate check, and both directional `comm` checks must all pass.
