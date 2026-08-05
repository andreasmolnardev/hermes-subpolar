# Python to TypeScript Harness Migration

## Goal

Move Hermes agent-runtime behavior from the existing Python implementation into `packages/harness` without changing user-visible behavior, persisted data, provider semantics, tool policy, or gateway contracts.

This is a behavioral migration, not a file-for-file translation. `packages/harness` becomes the runtime orchestrator. Existing package boundaries remain authoritative:

- `packages/harness`: agent loop, turn state, retries, tool-call orchestration, cancellation, context management, and lifecycle events.
- `packages/chat-provider-interface`: provider-neutral request, response, streaming, usage, and tool-call contracts.
- `packages/tool-resolver`: tool discovery and policy resolution. It must not execute tools.
- `packages/data-layer`: persistence contracts and implementations for sessions, messages, tool results, usage, and migration metadata.
- `packages/api-gateway`: transport adapter only. It validates inbound requests, invokes `harness`, and maps harness events to public API/JSON-RPC responses.
- `packages/shared`: genuinely cross-surface wire types only. Runtime implementation does not move here.

## Current State

`packages/harness/src/index.ts` now owns a tested injected turn-loop foundation with explicit retries, fallback, tools, approvals, cancellation, budgets, and typed lifecycle events. `packages/api-gateway` adapts requests/events and `packages/data-layer` provides contract-native in-memory and Bun SQLite adapters. Python still owns production behavior across `agent/`, `tools/`, `providers/`, `gateway/`, `tui_gateway/`, `hermes_cli/`, and top-level runtime modules such as `run_agent.py`, `hermes_state.py`, and `toolsets.py` until parity and cutover gates pass.

Python behavior that must be inventoried before implementation includes:

- Message construction, stable system prompts, role alternation, prompt caching, image/content normalization, and context references.
- Provider selection, provider-specific codecs, streaming, reasoning content, fallback chains, credentials, rate-limit handling, and usage accounting.
- Tool schema conversion, toolset resolution, policy (`allow`, `ask`, `auto`, `deny`), approvals, execution, truncation, secret scoping, and result insertion.
- Iteration budgets, retry classification, bounded responses, cancellation, timeouts, and partial-turn recovery.
- Context compression, memory injection, session persistence, titles, trajectories, insights, billing, monitoring, and lifecycle hooks.
- Plugin, MCP, skills, subagent, sandbox, browser, and platform integration seams.

## Migration Principles

1. Preserve behavior before improving design. Refactors happen after TypeScript reaches parity.
2. Keep Python as reference and fallback until each capability passes contract and differential tests.
3. Move domain logic into `harness`; keep I/O behind injected interfaces.
4. Preserve stable system prompts, prompt-cache boundaries, and message-role alternation exactly.
5. Keep persisted formats readable by both runtimes during rollout. Use additive schema changes only until Python removal.
6. Never let `harness` import gateway, UI, CLI, or concrete provider modules.
7. Make cancellation, retries, and tool execution explicit state transitions rather than recursive control flow.
8. Use temporary `HERMES_HOME` directories for all migration E2E tests.

## Phase 0: Freeze Contracts and Build Inventory

- [x] Inventory the TypeScript package surface and dependency direction. Evidence: `packages/*/package.json` and `scripts/check-package-boundaries.mjs`.
- [x] Audit the current TypeScript seam. Evidence: `chat-provider-interface` exposes non-streaming `ChatProvider.complete`; `harness.execute` forwards one completion; `tool-resolver.resolveTools` filters denied tools; `api-gateway.executeRequest` adapts policy before invoking `harness`.
- [x] Create an exhaustive migration matrix mapping every production Python capability to owner, Python source, target package, tests, dependencies, and migration status. The matrix below is the Phase 0 audit baseline; a `move` row is not implementation evidence.
- [x] Trace the primary Python turn from CLI/gateway entry through provider call, tool execution, persistence, and emitted events. The source-backed trace is below.
- [x] Record golden invariants for:
  - Exact outbound message order and roles.
  - System-prompt sections and cache markers.
  - Tool schemas, policy decisions, and approval behavior.
  - Provider request/response normalization.
  - Retry and fallback decisions by error class.
  - Usage, billing, session, and trajectory writes.
  - Gateway event names, order, and payload shape.
- [x] Classify Python modules as `move`, `adapter`, `retain`, or `delete`. Platform-specific launchers, installers, native integrations, and CLI presentation remain Python when they are outside agent-runtime scope.
- [x] Define target first-cut scope: one non-streaming OpenAI-compatible provider through an injected adapter, deterministic local tools, existing Python SQLite persistence, and Python gateway fallback. This defines intended scope; current TS contracts do not yet implement it and no parity is claimed.

### Exhaustive Phase 0 Capability Inventory

This is an audit baseline, not parity evidence. `move`, `adapter`, `retain`, and `delete` classify intended ownership. `Current evidence` names inspected production source and existing tests. A row stays Python-authoritative until its tests and gate pass. `TS owner` means package and seam, not an existing implementation unless explicitly stated.

| Domain / capability | Python source area (current evidence) | TS owner | Tests (existing + required parity) | Dependencies | Status | Fallback / deletion gate |
| --- | --- | --- | --- | --- | --- | --- |
| Prompt: inbound text, image, audio, file, resource normalization | `cli.py`; `agent/message_content.py`; `agent/image_routing.py`; `acp_adapter/server.py` | `harness` context port; `data-layer` content types; provider adapter codecs | `tests/agent/test_api_content_sidecar.py`, `tests/gateway/test_send_multiple_images.py`, `tests/acp_adapter/`; add multimodal fixture | `chat-provider-interface` content parts; media download and SSRF policy | adapter | Route non-text or unsupported content to Python; delete Python normalizer only after byte/semantic request fixtures pass for each content kind. |
| Prompt: user persistence/display sidecars and synthetic turns | `agent/turn_context.py`; `agent/conversation_loop.py`; `gateway/turn_context.py` | `harness` turn input; `data-layer` message metadata | `tests/agent/test_gateway_turn_sidecar.py`, `tests/gateway/test_model_command_context_offload.py`; add sidecar differential test | Session/message schema; role alternation | move | Keep Python writer for any `api_content`, `display_kind`, or synthetic command; delete after resumed and gateway transcripts preserve display/API separation. |
| Prompt: stable system-prompt assembly and section ordering | `agent/prompt_builder.py`; `agent/turn_context.py`; `agent/agent_init.py`; `agent/coding_context.py` | `harness` `contextAssembler` and prompt fixture builder | `tests/agent/test_engine_preflight_wire.py`, `tests/agent/test_prompt_caching.py`; add exact system-prompt fixture | Config, cwd, skills, tool snapshot, memory, cache policy | move | Python remains selected when any section or ordering differs; delete builder after exact section bytes and allowed dynamic fields match across representative sessions. |
| Prompt: role alternation and malformed-history repair | `agent/conversation_loop.py`; `agent/agent_runtime_helpers.py`; `agent/agent_runtime_helpers.py::repair_message_sequence_with_cursor` | `harness` message state machine | `tests/agent/`; `tests/run_agent/test_dict_tool_call_args.py`; add role-repair differential cases | Provider message contract; persistence sequence validation | move | Reject or route malformed histories to Python; delete repair path after adjacent-role, tool-result, and resume fixtures pass for all supported providers. |
| Context: cwd, session, context references, external prefetch | `agent/runtime_cwd.py`; `agent/context_references.py`; `agent/turn_context.py`; `gateway/session_context.py` | `harness` injected context sources and request/session config | `tests/test_session_workspace_binding.py`, `tests/agent/test_gateway_turn_sidecar.py`; add cross-session isolation E2E | `HERMES_HOME`, workspace binding, memory providers, scoped context vars | adapter | Keep Python context injection for unsupported gateway/ACP sessions; delete only after concurrent session and cwd isolation E2E passes. |
| Context: token estimation, context window, bounded response | `agent/context_engine.py`; `agent/context_breakdown.py`; `agent/bounded_response.py`; `agent/model_metadata.py` | `harness` context budget and provider-neutral model metadata port | `tests/agent/`; `tests/gateway/test_cached_agent_max_iterations.py`; add long-context budget fixtures | Provider model limits; prompt assembly; compression | move | Python chooses turn when model metadata or token estimate unavailable; delete after boundary cases produce same truncation and bounded-response behavior. |
| Context: compression, summaries, overflow recovery | `agent/context_compressor.py`; `agent/conversation_compression.py`; `agent/manual_compression_feedback.py` | `harness` context assembler, initially Python compression adapter | `tests/agent/test_idle_compaction_lock_and_guards.py`, `tests/gateway/test_undo_rewind_session.py`; add compression/restart differential E2E | SessionDB, token estimates, summary provider, checkpointing | adapter | Route compression-triggered turns to Python and never retry both runtimes; delete Python compressor after lineage, summary, cache-boundary, and recovery fixtures pass. |
| Context: memory injection, learning, insights, context review | `agent/memory_provider.py`; `tools/memory_tool.py`; `agent/insights.py`; `agent/learning_graph.py`; `agent/curator.py` | `harness` memory/context-source port; providers remain external adapters | `tests/agent/`; `tests/tools/test_memory_tool.py`; add no-duplicate-injection differential test | External memory services, persistence, privacy/redaction | adapter | Keep Python memory hooks for configured providers outside first cut; delete only after provider-specific contract tests and opt-out/timeout behavior pass. |
| Cache: Anthropic/OpenRouter cache policy and marker placement | `agent/prompt_caching.py`; `agent/agent_runtime_helpers.py`; `agent/moa_loop.py`; `agent/auxiliary_client.py` | `chat-provider-interface` `ProviderCacheHints`; provider adapter cache codec; `harness` request assembly | `tests/agent/test_prompt_caching.py`, `tests/agent/test_failover_identity.py`, `tests/agent/test_cache_disabled_on_stubs.py`; add golden marker fixture | Stable prompt bytes, provider destination, tool schema, cache TTL config | adapter | Disable TS caching and use Python for unknown destinations; delete Python marker logic only after enabled/disabled, native/non-native, fallback, and tool-cache fixtures match. |
| Provider: selection, model routing, catalog, runtime override | `hermes_cli/auth.py`; `hermes_cli/models.py`; `hermes_cli/provider_catalog.py`; `hermes_cli/runtime_provider.py`; `hermes_cli/providers.py` | `harness` provider-selection policy; `shared` provider config types; adapters own codecs | `tests/hermes_cli/test_provider_catalog.py`, `tests/hermes_cli/test_provider_parity.py`, `tests/cron/test_cron_provider_pin.py`; add selection differential matrix | Config YAML, provider registry/plugins, credential availability | adapter | Unsupported provider/model/runtime routes to Python before any request; delete Python runtime selection only when every supported config has a deterministic TS route and rejection test. |
| Provider: OpenAI-compatible non-streaming first cut | `agent/chat_completion_helpers.py`; `agent/relay_runtime.py`; `tools/openrouter_client.py`; `agent/conversation_loop.py::_perform_api_call` | New injected adapter implementing `chat-provider-interface::ChatProvider` | `tests/agent/`; `tests/hermes_cli/test_api_key_providers.py`; add recorded request/response conformance suite | `chat-provider-interface`, fetch, credentials, error classifier | move | First cut uses Python provider if adapter absent or response unsupported; delete Python path after recorded fixtures, malformed-response, tool-call, usage, and opt-in live tests pass. |
| Provider: Anthropic native/messages and cache dialect | `agent/anthropic_adapter.py`; `agent/prompt_caching.py`; `agent/gemini_schema.py` where shared | `chat-provider-interface` adapter, not `harness` | `tests/agent/test_anthropic_adapter.py`, `tests/agent/test_failover_identity.py`; add native cache/tool conformance | Anthropic content/tool schema, cache controls, credentials | adapter | Retain Python native adapter and route native requests there; delete only after native blocks, cache markers, stop reasons, and usage fields match. |
| Provider: Gemini, Bedrock, Azure, LM Studio and other native codecs | `agent/gemini_native_adapter.py`; `agent/bedrock_adapter.py`; `agent/azure_identity_adapter.py`; `agent/lmstudio_reasoning.py` | Separate provider adapters behind common interface | `tests/agent/test_bedrock_integration.py`, `tests/hermes_cli/test_api_key_providers.py`; add recorded codec suites per adapter | SDKs, regional credentials, provider-specific schemas | adapter | All non-first-cut native providers route to Python; delete each adapter independently after its recorded-response suite and credential/error tests pass. |
| Provider: Codex, Copilot, external process and relay runtimes | `agent/codex_responses_adapter.py`; `agent/codex_runtime.py`; `agent/copilot_acp_client.py`; `agent/relay_runtime.py` | Provider adapter or retained external-process bridge; never core `harness` | `tests/agent/`; `tests/acp/`; `tests/gateway/relay/`; add process crash/cancel fixtures | ACP, subprocess lifecycle, auth, platform process support | adapter | Keep Python/external process route for `codex_*`, Copilot, and relay modes; delete only after protocol, cancellation, auth, and no-orphan-process E2E passes. |
| Provider: streaming, reasoning, multimodal response normalization | `agent/conversation_loop.py`; `agent/stream_diag.py`; `agent/think_scrubber.py`; provider adapters | `chat-provider-interface` stream events; `harness` event consumer | `tests/agent/`; `tests/gateway/test_stream_events.py`; add delta/reasoning/tool interleave fixture | Async stream, cancellation, provider finish reasons, gateway event mapping | adapter | First cut is non-streaming only; route streaming/reasoning/multimodal turns to Python until event ordering and cancellation fixtures pass. |
| Provider: credentials, OAuth, identity and rotation | `hermes_cli/auth.py`; `hermes_cli/credential_sources.py`; `agent/credential_pool.py`; `hermes_cli/auth.py` | Injected credential provider used by adapters; `shared` carries no secrets | `tests/hermes_cli/test_api_key_providers.py`, `tests/hermes_cli/test_auth_xai_oauth_provider.py`, `tests/hermes_cli/test_web_oauth_dispatch.py`; add redacted rotation cases | Secret stores, OAuth flows, provider selection, per-turn refresh cap | adapter | Never copy secrets into TS core; route OAuth/external credentials to Python; delete Python credential path only after redaction, rotation, and concurrent-session isolation tests pass. |
| Provider: response/error normalization and usage accounting | `agent/error_classifier.py`; `agent/errors.py`; `agent/usage_pricing.py`; `agent/billing_usage.py`; `agent/credits_tracker.py` | `chat-provider-interface` error/usage types; `harness` policy; `data-layer` usage records | `tests/run_agent/test_conversation_fallback_state.py`; `tests/agent/`; add provider error/usage conformance | Provider codecs, retry/fallback policy, billing config, persistence | move | Python owns any unclassified error or usage field; delete Python normalization only after category, token, cache, reasoning, billing, and zero/partial-usage fixtures match. |
| Tools: discovery, toolsets, skills and schemas | `toolsets.py`; `tools/registry.py`; `hermes_cli/tools_config.py`; `agent/skill_commands.py`; `tools/schema_sanitizer.py` | `tool-resolver` descriptors and schema validation; `harness` receives resolved descriptors | `tests/tools/`; `tests/skills/`; `packages/tool-resolver/test/resolver.test.ts`; add complete tool snapshot fixture | Plugin/MCP discovery, config, JSON Schema, enabled/disabled state | adapter | Resolve only deterministic supported tools in TS; route dynamic/plugin/MCP snapshots to Python; delete Python resolver only after collision, schema, ordering, and disabled-tool tests pass. |
| Tools: policy precedence and deny/allow/ask/auto decisions | `tools/approval.py`; `tools/registry.py`; `gateway/config.py`; `hermes_cli/tools_config.py` | `tool-resolver` policy resolution; `harness` enforces final decision | `tests/tools/`; `tests/gateway/test_own_policy_startup_gate.py`; `packages/tool-resolver/test/resolver.test.ts` | Config layering, session overrides, tool metadata, approval context | move | Python decision remains authoritative on policy disagreement; delete after precedence, disabled, session override, and deny-by-default fixtures pass. |
| Tools: approval requests and interactive routing | `tools/approval.py`; `tools/write_approval.py`; `tools/terminal_tool.py`; `acp_adapter/edit_approval.py`; `gateway/run.py` approval queues | `harness` approval port; `api-gateway`/ACP adapters implement UI callbacks | `tests/tools/`; `tests/acp_adapter/`; `tests/gateway/`; add concurrent approval isolation fixture | Context vars, session IDs, gateway queues, terminal/write policy | adapter | Any interactive tool without a safe callback routes whole session to Python; delete Python approval routing only after allow/deny/timeout/cancel and cross-session isolation E2E passes. |
| Tools: deterministic local execution and result insertion | `agent/tool_executor.py`; `agent/conversation_loop.py`; `tools/file_operations.py`; `tools/file_tools.py` | `harness` execution coordinator; `tool-resolver` never executes | `tests/tools/`; `tests/run_agent/test_dict_tool_call_args.py`; add black-box Python/TS tool suite | Tool descriptors, JSON arguments, message ordering, cancellation | move | First cut permits only deterministic local allowlisted tools; bridge or Python fallback for all others; delete Python executor after result/error/correlation parity passes. |
| Tools: output bounds, truncation, spill and malformed arguments | `tools/tool_output_limits.py`; `tools/hook_output_spill.py`; `agent/tool_executor.py`; `agent/bounded_response.py` | `harness` coordinator result limits and structured errors | `tests/tools/`; `tests/agent/`; add oversized-output and malformed-JSON fixtures | Config limits, filesystem spill, provider context budget | move | Oversized or malformed results use Python and persist an error, never retry side effects; delete Python limits after byte-limit and spill cleanup tests pass. |
| Tools: Python subprocess/JSON bridge | `tools/managed_tool_gateway.py`; `tools/tool_backend_helpers.py`; `tools/process_registry.py` | Versioned bridge adapter owned by `api-gateway`/`harness` boundary | `tests/tools/`; `tests/stress/test_subprocess_e2e.py`; add protocol mismatch/crash/cancel E2E | Scoped env, cwd, deadline, request/call IDs, process cleanup | adapter | Bridge is mandatory for non-migrated tools; fallback entire turn to Python on protocol mismatch; delete bridge only after every bridged tool is moved or explicitly retained. |
| Tools: terminal, sandbox, cwd and environment backends | `tools/terminal_tool.py`; `tools/environments/*.py`; `tools/env_passthrough.py`; `agent/secret_scope.py` | Retained Python executor behind bridge; TS only sends validated requests | `tests/tools/`; `tests/stress/test_subprocess_e2e.py`; `tests/gateway/test_session_workspace_binding.py`; add secret-scope fixture | Docker/SSH/Modal/Daytona/Singularity, process registry, path policy | retain | No TS direct shell or secret access in first cut; delete only after each backend has an owned replacement and security/recovery E2E, otherwise retain permanently. |
| Tools: path, URL, SSRF, SSL and dangerous-command security | `tools/path_security.py`; `tools/url_safety.py`; `tools/tirith_security.py`; `agent/ssl_guard.py`; `tools/website_policy.py` | Retained Python security authority; TS validates contract only | `tests/tools/`; `tests/gateway/test_yuanbao_media_ssrf.py`; `tests/hermes_cli/test_security_audit.py`; add deny/allow corpus | Filesystem/network policy, config, threat corpus | retain | Security checks cannot fall back to allow; route uncertain requests to Python/deny. Delete a Python check only after equivalent adversarial corpus and independent review pass. |
| Loop: turn state, iteration and tool-call budgets | `agent/conversation_loop.py`; `agent/iteration_budget.py`; `tools/budget_config.py` | `harness` explicit loop and `HarnessBudgets` | `tests/gateway/test_cached_agent_max_iterations.py`, `tests/gateway/test_stuck_loop.py`; `packages/harness/test/harness.test.ts`; add state-transition suite | Context assembly, provider calls, tool calls, config | move | Python remains for budget modes not represented in TS; delete Python loop budget logic after exhaustive terminal/budget/grace-call fixtures pass. |
| Loop: retry classification, backoff and turn retry state | `agent/error_classifier.py`; `agent/turn_retry_state.py`; `agent/conversation_loop.py` | `harness` retry policy with injected clock/sleeper | `tests/run_agent/test_conversation_fallback_state.py`; `tests/gateway/test_gateway_inactivity_timeout.py`; `packages/harness/test/harness.test.ts`; add error-class matrix | Provider error mapping, deadline, credential refresh, iteration budget | move | Retry only idempotent provider calls; Python handles unknown classes. Delete Python retry state after bounded-attempt, delay, deadline, and no-duplicate-write fixtures pass. |
| Loop: provider fallback chains and fallback identity | `agent/conversation_loop.py::_try_activate_fallback`; `agent/relay_runtime.py`; `agent/credential_pool.py`; `run_agent.py` | `harness` provider list and explicit fallback policy | `tests/run_agent/test_conversation_fallback_state.py`, `tests/agent/test_failover_identity.py`; add deterministic fault-injection matrix | Provider selection, credentials, cache redecorating, usage, persistence | adapter | Unsupported fallback or cache destination routes to Python before request; delete Python fallback only after identity, retry budget, usage, and side-effect uniqueness fixtures pass. |
| Loop: cancellation, interrupt, timeout and active-turn steer | `tools/interrupt.py`; `agent/conversation_loop.py`; `gateway/turn_lease.py`; `acp_adapter/server.py` | `harness` `AbortSignal`; transport adapters map cancel/steer | `tests/gateway/test_active_session_text_merge.py`, `tests/gateway/test_pending_drain_race.py`, `tests/acp_adapter/`; add provider/tool cancellation E2E | Provider stream, subprocess kill, approval callback, session locks | adapter | Cancelled or steered sessions stay Python-authoritative until one terminal event and recoverable checkpoint are proven; delete Python path after no-orphan/no-duplicate-terminal tests pass. |
| Loop: terminal outcomes, callbacks and partial responses | `agent/conversation_loop.py`; `agent/thread_scoped_output.py`; `agent/stream_diag.py`; `agent/title_generator.py` | `harness` terminal outcome/events; gateway adapters render | `tests/gateway/test_stream_events.py`, `tests/gateway/test_stale_finalize_suppression.py`; add one-terminal-event fixture | Event sink, persistence, streaming, title/trajectory hooks | move | On event sink failure persist and route response through Python; delete Python finalizer only after completed/cancelled/failure/partial-response parity passes. |
| Persistence: session, ordered messages and tool records | `hermes_state.py`; `agent/conversation_loop.py::_persist_session`; `gateway/session.py`; SessionDB modules | `data-layer` repository ports, initially Python SQLite implementation | `tests/agent/`; `tests/gateway/test_session_messages_shutdown_preserve.py`; `packages/data-layer/test/`; add legacy SQLite E2E | SQLite schema, `HERMES_HOME`, role/tool correlation, transactions | adapter | Python SQLite remains read/write authority; delete readers/writers only after Python-created and TS-created data cross-resume, ordering, and rollback tests pass. |
| Persistence: checkpoints, undo/rewind and before-tool recovery | `tools/checkpoint_manager.py`; `gateway/run.py`; `tests/tools/test_checkpoint_manager.py` evidence | `data-layer` checkpoint repository; `harness` checkpoint policy | `tests/tools/test_checkpoint_manager.py`, `tests/gateway/test_undo_rewind_session.py`; add interrupted-tool restart E2E | Filesystem snapshots, SQLite, tool side-effect policy | adapter | Checkpoint before non-idempotent tool and route recovery to Python; delete Python checkpoint code only after restore/retention/security and crash-recovery tests pass. |
| Persistence: compression/session rotation/resume lineage | `agent/conversation_compression.py`; `agent/session_activity.py`; `acp_adapter/server.py` | `data-layer` migration metadata; `harness` resume policy | `tests/gateway/test_session_model_reset.py`, `tests/gateway/test_resume_command.py`, `tests/acp/`; add rotation lineage fixture | Schema version, session IDs, prompt cache, ACP provenance | adapter | Sessions with unknown schema or rotated lineage route to Python; delete compatibility readers only after retention window and rollback tests pass. |
| Persistence: usage, billing, trajectories and verification evidence | `agent/usage_pricing.py`; `agent/billing_usage.py`; `agent/trajectory.py`; `agent/verification_evidence.py`; `agent/insights.py` | `data-layer` usage/event repositories; `harness` lifecycle hooks | `tests/agent/`; `tests/gateway/test_usage_command.py`; add exact write-set fixture | Provider usage, pricing config, session transaction, redaction | adapter | Python records remain authoritative when usage is partial; delete writers only after totals, billing, trajectory, and failed-turn write-set parity passes. |
| Gateway: request ingress, session routing, queue, leases and fallback | `gateway/run.py`; `gateway/session.py`; `gateway/session_state.py`; `gateway/turn_lease.py`; `gateway/profile_routing.py` | `api-gateway` transport adapter; `harness` owns turn only | `tests/gateway/test_session_race_guard.py`, `tests/gateway/test_conversation_scope_funnel.py`, `tests/gateway/test_pending_drain_race.py`; add runtime-selection E2E | Auth, config, session store, leases, Python fallback | adapter | Feature flag pins implementation per session/turn; unsupported or mixed-runtime session routes to Python; delete fallback after release-window rollback test and zero Python routes. |
| Gateway: stream dispatch, event names/order/payloads | `gateway/stream_events.py`; `gateway/stream_dispatch.py`; `gateway/stream_consumer.py`; `packages/shared/src/json-rpc-gateway.ts` | `harness` typed events -> `api-gateway`; `shared` wire types | `tests/gateway/test_stream_events.py`, `tests/gateway/test_stream_consumer_draft.py`, `packages/web-ui/src/lib/gatewayClient.test.ts`; add event golden fixture | Existing JSON-RPC/API contracts, terminal dedupe, UI client | adapter | Python event mapper remains default on any payload mismatch; delete only after event sequence/property tests and `openapi.json` review pass. |
| Gateway: ACP, TUI, CLI and dashboard adapters | `acp_adapter/server.py`; `tui_gateway/`; `cli.py`; `plugins/kanban/dashboard/plugin_api.py` | Retain transport-specific adapters; invoke `harness` through `api-gateway` ports | `tests/acp/`, `tests/acp_adapter/`, `tests/gateway/`, `tests/cli/`; add cross-transport turn fixture | Auth, session context, approvals, streaming, UI-specific metadata | retain | Transport behavior stays Python while runtime migrates; delete only if a replacement client contract is versioned and all transport E2E suites pass. |
| Integrations: plugins, MCP discovery/OAuth and tool lifecycle | `hermes_cli/plugins/`; `tools/mcp_oauth.py`; `acp_adapter/`; `tools/skills_sync.py`; `tools/registry.py` | Versioned tool/plugin bridge; `tool-resolver` consumes descriptors only | `tests/acp_adapter/test_acp_mcp_discovery.py`, `tests/gateway/test_matrix_plugin_setup.py`, `tests/tools/`; add plugin protocol fixture | Plugin discovery, OAuth, subprocess/JSON bridge, policy | adapter | Dynamic integrations route to Python and are never double-discovered; delete bridge per plugin after protocol, auth, and cleanup tests pass. |
| Integrations: skills, skill manager, provenance and learning hooks | `agent/skill_commands.py`; `tools/skill_manager_tool.py`; `tools/skill_provenance.py`; `tools/skills_guard.py`; `tools/skills_ast_audit.py` | `tool-resolver` descriptors plus `harness` context hook; skill implementation retained | `tests/skills/`, `tests/tools/test_skills_ast_audit.py`, `tests/gateway/test_reload_skills_command.py`; add prompt/provenance fixture | Filesystem skills, policy, prompt assembly, security audit | adapter | Skills not represented in TS context route to Python; delete Python hook only after prompt provenance, reload, guard, and audit fixtures pass. |
| Integrations: subagents, delegation, MoA and background review | `tools/delegate_tool.py`; `tools/async_delegation.py`; `agent/subagent_lifecycle.py`; `agent/moa_loop.py`; `agent/background_review.py` | `harness` delegation port; Python workers behind bridge | `tests/agent/`, `tests/gateway/test_moa_one_shot_restore.py`, `tests/stress/`; add nested-session isolation E2E | Separate sessions, provider budgets, persistence, process lifecycle | adapter | Any delegated or MoA turn routes wholly to Python; delete Python orchestration only after nested cancellation, billing, and no-shared-state fixtures pass. |
| Integrations: browser, computer use, LSP, code execution and sandboxes | `tools/browser_*.py`; `tools/computer_use_tool.py`; `agent/lsp/`; `tools/code_execution_tool.py`; `tools/environments/` | Retained Python tools behind bridge; TS core has no OS/UI imports | `tests/tools/`, `tests/stress/test_subprocess_e2e.py`, `tests/gateway/`; add bridge capability matrix | OS/UI dependencies, sandbox backends, secrets, path/URL security | retain | Unsupported capability routes to Python before tool call; delete only after a separately owned implementation and security/cancel/recovery E2E exists. |
| Integrations: messaging platforms, media, voice and notifications | `gateway/platforms/*.py`; `gateway/streaming_tts_consumer.py`; `tools/transcription_tools.py`; `tools/tts_tool.py`; `agent/video_gen_provider.py` | Retain platform/media adapters; `api-gateway` maps only runtime events | `tests/gateway/` platform suites, `tests/tools/test_transcription_plugin_dispatch.py`; add media/event fixture | Network SDKs, media cache, platform auth, event chunking | retain | All platform-specific turns stay Python in first cut; deletion requires explicit replacement contract and full platform E2E, not core harness parity. |
| Integrations: cron, Kanban, lifecycle hooks and notifications | `cron/`; `gateway/hooks.py`; `gateway/lifecycle_ledger.py`; `tools/cronjob_tools.py`; `tools/kanban_tools.py` | Retain schedulers/workers; invoke selected runtime through pinned session route | `tests/cron/`, `tests/gateway/test_lifecycle_ledger.py`, `tests/gateway/test_kanban_notifier.py`; add cron-to-harness E2E | Scheduler DB, claims/leases, webhook delivery, session isolation | retain | Cron/background sessions default to Python unless explicitly allowlisted; delete runtime coupling only after claim, shutdown, delivery, and resume tests pass. |
| Diagnostics: logs, metrics, OTLP, health and redaction | `agent/monitoring/*.py`; `agent/stream_diag.py`; `agent/redact.py`; `gateway/readiness.py`; `gateway/platforms/*` logging | `harness` logger/event ports; existing exporters retained | `tests/gateway/`, `tests/hermes_cli/test_security_audit.py`; add redacted parity diagnostics test | Event sink, config, OTLP, secret/message redaction | adapter | Export only redacted counters and categories; Python diagnostics remain for fallback. Delete a path only after no prompt/tool args/results leak in corpus tests. |
| Security: authn/authz, pairing, dashboard and gateway secrets | `gateway/pairing.py`; `gateway/authz_mixin.py`; `gateway/platforms/api_server.py`; `hermes_cli/dashboard_auth/` | Retain Python transport security; TS receives authenticated request context | `tests/gateway/test_pairing.py`, `tests/gateway/test_auth_fallback.py`, `tests/hermes_cli/test_dashboard_auth_audit.py`; add unauthorized-runtime-selection E2E | Token scope, WS auth, session routing, config | retain | Never fall back from failed authorization into execution; delete only after independently reviewed auth contract and negative tests pass. |
| Security: secret scope, environment isolation and credential non-leakage | `agent/secret_scope.py`; `gateway/session_context.py`; `tools/env_passthrough.py`; `tools/credential_files.py` | `harness` receives opaque scoped handles, never process globals | `tests/gateway/test_75349_whatsapp_multiplex_secret_scope.py`, `tests/stress/test_concurrency_parent_gate.py`; add concurrent secret isolation fixture | Context vars, subprocess env, provider credentials, HERMES_HOME | adapter | Use Python for any unscoped secret or legacy global; delete only after concurrency, subprocess, log-redaction, and rollback tests pass. |
| Recovery: startup, shutdown, watchdog and crash reclamation | `agent/process_bootstrap.py`; `gateway/shutdown_watchdog.py`; `gateway/shutdown_flush.py`; `gateway/restart_loop_guard.py`; `gateway/cgroup_cleanup.py` | Retain Python process supervisor; `harness` exposes cancellable lifecycle only | `tests/cron/test_shutdown_interrupt.py`, `tests/gateway/test_startup_restart_race.py`, `tests/gateway/test_session_stall_watchdog.py`; add killed-turn recovery E2E | OS signals, child processes, leases, persistence checkpoints | retain | Python supervisor remains required for first cut; delete only after replacement owns signal/process/reclaim behavior and killed-turn E2E passes. |
| Packaging: config, paths, Python home, install and launchers | `hermes_cli/config.py`; `hermes_cli/paths.py`; `hermes_cli/setup.py`; `scripts/`; `install*.sh/ps1` | `packages/*` build outputs; Python CLI/installers retained | `tests/test_project_metadata.py`, `tests/test_install_ps1_uv_powershell_host.py`, `tests/hermes_cli/`; add clean-install runtime selection test | `config.yaml`, `get_hermes_home()`, uv/bun packaging, optional dependencies | retain | Do not move behavioral settings to `.env`; delete Python runtime dependencies only after clean install, platform launcher, and `HERMES_HOME` E2E pass. |
| Packaging: package boundaries, contracts, lockfiles and API schema | `scripts/check-package-boundaries.mjs`; `openapi.json`; `pyproject.toml`; package manifests | `shared`, `chat-provider-interface`, `tool-resolver`, `data-layer`, `harness`, `api-gateway` | `bun run check:monorepo`, `bun run typecheck:runtime`, package tests, Python contract suites | Acyclic imports, generated lockfiles, public API compatibility | move | Keep boundary violations and API drift blocking; delete Python dependency/package only after `uv.lock`, `openapi.json`, package checks, and compatibility tests are updated. |
| Rollout: feature flag, shadow mode, per-session pin and rollback | No current TS cutover implementation; Python gateway/runtime selection in `gateway/run.py`, `hermes_cli/config.py` | `api-gateway` flag and session migration metadata; `harness` runtime version | `tests/gateway/test_config_env_bridge_authority.py`, `tests/gateway/test_session_race_guard.py`; add shadow/no-duplicate E2E | Config YAML, persistence metadata, metrics, Python fallback | adapter | Disabled-by-default; shadow mode cannot call provider or tools twice. Delete flag/fallback after release window, zero supported Python routes, and rollback-without-repair test. |
| Rollout: compatibility window, deletion bookkeeping and release evidence | `PATCH.md`; packaging/docs; retained Python modules from every row above | Repository release process; no runtime owner | `scripts/run_tests.sh`, full `bun test`, migration E2E; add deletion checklist validation | Retention window, migration metadata, docs, lockfiles, support matrix | delete | Delete only capability-by-capability after row gate, persisted-data retention, packaging checks, `PATCH.md`, and final acceptance all pass; never bulk-delete by directory. |

### Primary Turn Trace (Source-Backed)

The trace below is the reference path for the first differential fixture. Alternate ingress paths must converge at the same turn boundary or be explicitly marked retained in the matrix.

1. CLI entry: `cli.main()` resolves config, model/provider, toolsets, skills, images, session/worktree state, then constructs `HermesCLI`; single-query and interactive paths call the agent's `run_conversation()`.
2. Gateway entry: `gateway.run.start_gateway()` receives a platform event, resolves channel/profile/session state, claims a turn lease, and invokes the cached agent; ACP entry `acp_adapter.server.Server.prompt()` sets session context and runs `agent.run_conversation()` in its executor. Both must preserve the same session and cancellation semantics.
3. Turn prologue: `agent.conversation_loop.run_conversation()` decodes turn metadata, resets per-turn state, then calls `agent.turn_context.build_turn_context()`. That prologue sanitizes input, restores/builds system prompt, hydrates context and memory, performs preflight compression, installs hooks, persists the user turn, and returns messages plus turn/session identifiers.
4. Loop gate: `run_conversation()` drains active-turn redirects/steer, starts a checkpoint turn with `tools.checkpoint_manager.new_turn()`, checks interrupt and `agent.iteration_budget`, fires step hooks, repairs tool arguments and role sequence, and strips persistence-only sidecars before transport.
5. Request assembly: the loop builds provider messages/tools, applies destination-specific cache policy through `agent.agent_runtime_helpers.plan_cache_sections_for_destination()` -> `agent.prompt_caching.build_prompt_cache_plan()` -> `apply_anthropic_cache_control()`, then sends through `agent.conversation_loop._perform_api_call()` and relay/middleware. The first TS path replaces only this provider call with one injected non-streaming OpenAI-compatible adapter.
6. Provider result: Python adapter/transport normalizes assistant text, reasoning, tool calls, finish reason, errors, fallback identity, and usage. The TS equivalent must emit one normalized result and preserve request IDs, usage fields, and cache metadata.
7. Tool branch: for each assistant tool call, the loop resolves policy, requests approval when needed, invokes `agent.tool_executor`/the configured Python tool, applies output limits, appends correlated tool results, checkpoints side effects, and emits progress. First-cut TS may execute only deterministic local tools; all other calls use the versioned Python bridge or route the whole turn to Python.
8. Continuation/finalization: the loop retries classified provider failures, selects an eligible fallback, compresses on pressure, or continues until final text, cancellation, timeout, approval rejection, tool failure, or budget exhaustion. It persists assistant/tool messages and usage/trajectory/session metadata, emits exactly one terminal outcome, and lets gateway stream/event adapters map that outcome to existing public events.
9. Recovery boundary: `gateway.session`/ACP state saves the resulting history and runtime metadata. A restart reloads the same session from Python SQLite in first cut; no runtime switch is allowed mid-turn, and unknown schema, unsupported provider, or unsupported integration falls back before provider/tool side effects.

### Golden Invariant Fixtures

Fixtures are behavior-derived JSON inputs plus normalized expected envelopes/write sets/event traces. They must contain synthetic secrets and deterministic IDs/timestamps; they must not snapshot volatile provider catalogs or real user content. Store under `tests-js/migration/fixtures/` and mirror Python expectations under `tests/migration/`.

- `turn-text-only.json`: one user turn; exact system/user role order, stable prompt sections, one provider request, one assistant result, one terminal event.
- `turn-multimodal-normalization.json`: text plus image/audio/file variants; canonical content parts, unsupported media fallback, no persistence sidecar leakage to provider.
- `turn-cache-boundaries.json`: cache enabled/disabled, native/non-native destination, static system prefix, tool cache; exact marker count/locations and unchanged non-cache bytes.
- `turn-role-repair.json`: adjacent user/tool/assistant corruption and orphan tool result; deterministic repair/rejection, contiguous roles, correlated tool IDs.
- `turn-context-budget.json`: near-limit and over-limit histories; same token estimate, bounded response, compression trigger, summary placement, and no duplicate memory injection.
- `turn-one-tool-approval.json`: `allow`, `auto`, `ask` approved, `ask` denied, and `deny`; exact policy decision, approval events, one execution at most, correlated result.
- `turn-parallel-tools.json`: multiple tool calls in provider order; deterministic execution/result insertion order, per-call IDs, bounded output, atomic write set.
- `turn-malformed-tool.json`: unknown tool, invalid JSON arguments, invalid schema, oversized result, tool crash; safe terminal category and no provider continuation after unsafe input.
- `turn-retry-fallback.json`: rate limit, timeout, network, auth, invalid request, context length, and cancellation faults; exact retry count/delay, eligible fallback choice, request identity, and usage accounting.
- `turn-cancellation.json`: cancel during provider, approval, foreground tool, background tool, and queued follow-up; abort propagation, process cleanup, recoverable checkpoint, one terminal event.
- `turn-persistence-recovery.json`: Python-created SQLite session, interrupted before/after tool, restart, resume, and rollback; contiguous sequence, no duplicate side effect, legacy readability, runtime metadata.
- `turn-usage-billing-trajectory.json`: complete, partial, failed, fallback, and cancelled provider usage; exact usage/billing/trajectory/verification write set with redacted diagnostics.
- `gateway-event-trace.json`: CLI, gateway, and ACP ingress for equivalent turn; public event names, order, IDs, payload shape, terminal dedupe, and no transport-specific prompt mutation.
- `turn-unsupported-route.json`: native provider, OAuth credential, MCP/plugin tool, sandbox/browser tool, cron/background turn, and unknown schema; pre-side-effect Python fallback with reason and no duplicate request.
- `turn-concurrency-isolation.json`: two sessions sharing executor/process; session IDs, cwd, approval callbacks, credentials, caches, events, and persistence writes never cross-contaminate.

### Exit Criteria

- Every runtime behavior has an explicit target owner.
- Golden fixtures are generated from behavior, not source text or snapshots of volatile catalogs.
- Unknown or intentionally deferred behavior is listed; no silent omissions.
- Inventory, trace, and fixtures are audit evidence only; Phase 0 is not complete implementation or parity evidence.

### Deferred Scope

- Provider-specific SDKs/codecs and native request features: streaming, reasoning blocks, multimodal encoding, cache controls, provider OAuth, credential rotation, and provider-specific retry/usage mappings.
- Additional providers and local/native model runtimes, including provider-specific fallback chains.
- OS-native, browser, MCP, plugin, skill, subagent, sandbox, voice, image, and platform integrations.
- Python persistence replacement, destructive schema changes, and gateway default cutover before interoperability evidence exists.
- Deferred sessions must route to Python; no partial TypeScript execution or duplicate provider/tool side effects.

### Deletion Gates

- Do not delete a Python capability until TypeScript owns its supported behavior, shared black-box and differential tests pass, and its E2E tests pass with temporary `HERMES_HOME`.
- Do not remove Python persistence readers or writers until legacy Python-created data resumes correctly in TypeScript, TypeScript-created data remains readable during the retention window, and recovery/rollback tests pass.
- Do not remove gateway fallback or its feature flag until the fallback release window ends, no supported configuration routes to Python, and rollback has been exercised without data repair.
- Delete bridge code and provider/tool dependencies capability by capability only after unsupported configurations are explicitly rejected or routed to an approved retained Python concern.
- Remove compatibility readers, flags, and retained runtime code only after the persisted-data retention window, packaging checks, `PATCH.md`, and final acceptance criteria are complete.

## Phase 1: Expand Package Contracts

### `chat-provider-interface`

- Replace string-only messages with typed content parts while retaining text support.
- Add provider-neutral assistant tool calls and tool-result correlation IDs.
- Add normalized finish reasons, reasoning content, usage detail, provider metadata, and retryable error categories.
- Add streaming as an async iterable of typed deltas. Keep non-streaming `complete` available only as an adapter over the same event model.
- Carry `AbortSignal`, timeout/deadline, model options, cache hints, and request identity explicitly.
- Add contract tests using a fake provider; concrete SDK types must not leak across this boundary.

### `tool-resolver`

- Resolve full tool descriptors: name, description, JSON schema, policy, source, capability metadata, and executable handle/reference.
- Keep deny filtering and approval policy deterministic and testable.
- Separate resolution from execution. Introduce execution contracts in `harness` or a dedicated package only when multiple consumers prove need.
- Add collision, invalid-schema, disabled-tool, and policy-precedence tests.

### `data-layer`

- Define repository interfaces for sessions, ordered messages, tool calls/results, checkpoints, usage, and migration state.
- Specify transaction boundaries required to resume interrupted turns without duplicating tool effects.
- Add schema versioning and additive migrations readable by Python and TypeScript.
- Add SQLite integration tests covering ordering, rollback, concurrent readers, recovery, and legacy Python-created databases.

### `harness`

- Introduce injected ports for provider, tool executor, approvals, persistence, clock, ID generation, event sink, memory/context sources, and logger.
- Define a typed harness event stream independent of JSON-RPC.
- Define typed terminal outcomes: completed, cancelled, budget exhausted, provider failure, tool failure, and approval rejected.

### Exit Criteria

- Package dependency checks remain acyclic and pass `bun run check:boundaries`.
- Public contracts cover one complete provider/tool round trip without `unknown` payloads in core paths.
- API gateway can adapt old requests to new contracts without changing public API behavior.

## Phase 2: Implement Deterministic Core Loop

- Model each turn as an explicit state machine:
  1. Load session and checkpoint.
  2. Assemble context and stable system prompt.
  3. Resolve tools and policies.
  4. Dispatch provider request.
  5. Consume text/reasoning/tool-call events.
  6. Request approval where required.
  7. Execute tools with cancellation and timeout propagation.
  8. Persist assistant/tool messages atomically.
  9. Continue until terminal response or iteration budget.
  10. Finalize usage, checkpoint, and lifecycle events.
- Preserve multiple tool calls, deterministic result ordering, correlation IDs, and role alternation.
- Ensure cancellation stops provider streams and pending tools, records recoverable state, and emits one terminal event.
- Implement error classification and bounded retry policy with injected clock/sleeper for deterministic tests.
- Keep fallback-provider selection outside provider adapters and inside explicit harness policy.
- Avoid importing process globals. Runtime config arrives as a validated request/session configuration object.

### Exit Criteria

- Unit tests cover every state transition and terminal outcome.
- Fake-provider scenarios cover text-only, one tool, parallel tools, approval, retry, fallback, cancellation, malformed tool arguments, timeout, and interrupted persistence.
- Core loop has no network, filesystem, process, or SQLite dependency except through injected ports.

## Phase 3: Context, Memory, and Prompt Parity

- Port message normalization and provider-neutral content handling first.
- Port system-prompt assembly section by section, preserving byte stability where prompt caching depends on it.
- Port token estimation and context budgeting behind explicit interfaces.
- Port context references, compression triggers, summaries, and bounded-response behavior.
- Adapt existing memory providers through a narrow context-source interface before rewriting provider implementations.
- Build differential tests that feed identical sessions into Python and TypeScript and compare semantic request envelopes, exact role order, cache boundaries, selected tools, and compression decisions.
- Treat expected provider-specific formatting differences as reviewed fixture metadata, not broad normalization.

### Exit Criteria

- Representative short, long, image, tool-heavy, compressed, and resumed conversations match Python invariants.
- Prompt cacheable prefix remains stable across equivalent turns.
- No invalid adjacent message roles reach any supported provider adapter.

## Phase 4: Tool Execution and Integrations

- Add a harness-owned execution coordinator handling validation, approvals, timeout, cancellation, concurrency limits, output bounds, and event emission.
- Initially call existing Python tools through a versioned subprocess/JSON protocol. This creates a strangler seam without translating every integration at once.
- Include protocol version, request ID, tool-call ID, working directory, scoped environment, deadline, and structured error in every bridge request.
- Never send the full environment or unscoped secrets to tool workers.
- Migrate pure/deterministic tools to TypeScript first. Keep OS-native, browser, MCP, plugin, and optional-dependency tools behind adapters until parity tests exist.
- Make tool side effects idempotent where possible; otherwise checkpoint before execution and require explicit recovery behavior.
- Preserve hooks and plugin contracts through adapters rather than importing Python plugin internals into `harness`.

### Exit Criteria

- TypeScript harness can run production Python tools through bridge with equivalent approval and result semantics.
- Tool crashes, invalid output, protocol mismatch, cancellation, and oversized results fail safely.
- Migrated TypeScript tools pass shared black-box suites against Python equivalents.

## Phase 5: Provider Adapters

- Implement one OpenAI-compatible TypeScript adapter against `chat-provider-interface`.
- Add adapters in usage order, sharing only provider-neutral helpers.
- Preserve provider-specific details: tool schema dialect, reasoning blocks, cache controls, multimodal encoding, finish reasons, usage fields, and error mapping.
- Keep credential discovery and rotation behind injected credential providers.
- Validate fallback behavior with deterministic fault injection; never test against live rate limits.
- Retain Python adapters behind bridge/fallback until each TypeScript adapter passes recorded-response and opt-in live integration tests.

### Exit Criteria

- Each migrated provider passes common adapter conformance tests.
- Recorded fixtures contain no credentials or user content.
- Provider errors map to stable harness categories used by retry/fallback policy.

## Phase 6: Persistence and Gateway Cutover

- Wire `packages/api-gateway` to invoke TypeScript `harness` behind a runtime feature flag in `config.yaml`.
- Translate harness events to existing JSON-RPC/API events without changing names, ordering guarantees, or payloads. Update `openapi.json` for any unavoidable endpoint change.
- Implement shadow mode for safe, side-effect-free cases: Python remains authoritative while TypeScript assembles requests and records parity diagnostics. Never duplicate provider calls or tool side effects.
- Add per-session runtime selection so a session never switches implementation mid-turn.
- Persist runtime version and checkpoint format for diagnosis and rollback.
- Add restart tests proving Python-created sessions resume in TypeScript and, during rollout, TypeScript-created sessions remain readable by Python.

### Exit Criteria

- CLI, TUI, dashboard, and gateway clients require no behavioral changes.
- TypeScript runtime passes E2E chat, tool, cancellation, resume, and failure-recovery tests under temporary `HERMES_HOME`.
- Runtime flag can return new sessions to Python without data repair.

## Phase 7: Rollout

- Roll out by capability: internal development, opt-in users, one provider/tool subset, broader providers, then default-on.
- Compare completion rate, retry rate, tool failures, cancellation latency, token usage, session corruption/recovery, and event-order violations. Export only existing redacted diagnostics; never prompts, messages, tool arguments, or results.
- Stop rollout on invariant failures, persisted-data incompatibility, unexplained usage drift, or elevated tool/provider errors.
- Keep one release window where Python runtime is available as fallback after TypeScript becomes default.
- Document unsupported integrations clearly; route those sessions to Python rather than partially executing them.

## Phase 8: Remove Python Runtime

- Remove a Python path only after TypeScript owns behavior, shared black-box tests pass, and no supported configuration routes to it.
- Delete bridge code capability by capability, not in one repository-wide removal.
- Remove obsolete Python dependencies and regenerate `uv.lock` after each bounded removal.
- Retain Python only for explicitly approved non-runtime concerns such as installation or platform launchers.
- Remove runtime feature flag and compatibility readers only after supported persisted-data retention window ends.
- Update packaging, install scripts, docs, `PATCH.md`, and architecture diagrams.

### Final Acceptance Criteria

- `packages/harness` owns complete supported agent turn lifecycle.
- `bun run check:monorepo`, `bun run typecheck:runtime`, and `bun test` pass.
- Python tests run through `scripts/run_tests.sh`; migration E2E suites use temporary `HERMES_HOME`.
- Existing CLI, TUI, dashboard, gateway, plugin, and MCP contracts remain compatible or have explicit versioned migrations.
- Prompt caching, message-role alternation, stable system prompts, tool policy, retries, fallback, cancellation, usage, and persistence match documented invariants.
- Fresh installs no longer require Python runtime dependencies for migrated execution paths.
- No Python agent-runtime fallback remains before Python runtime code is deleted.

## Wave Checklist

Run every command for its wave; an unchecked test or invariant blocks that wave's exit.

### Wave 0: Audit Baseline

- [ ] `bun run check:monorepo`
- [ ] `bun run typecheck:runtime`
- [ ] `bun test packages/chat-provider-interface/test packages/data-layer/test packages/tool-resolver/test packages/harness/test packages/api-gateway/test`
- [ ] `scripts/run_tests.sh tests/agent tests/gateway tests/tools`
- [ ] Attach source-backed turn trace, golden invariants, exhaustive matrix, and module classification before marking remaining Phase 0 items complete.

### Wave 1: Contracts and Deterministic Seams

- [ ] Add provider, resolver, repository, harness-event, and gateway contract tests; run `bun run check:monorepo`.
- [ ] Run `bun test packages/chat-provider-interface/test packages/data-layer/test packages/tool-resolver/test packages/harness/test packages/api-gateway/test`.
- [ ] Run `scripts/run_tests.sh tests/gateway tests/tools` against unchanged Python behavior.
- [ ] Verify boundary check still passes and `harness` has no gateway, UI, CLI, filesystem, network, or concrete-provider imports.

### Wave 2: First-Cut Core Loop

- [ ] Add fake-provider tests for text-only, one tool, parallel tools, approval, retry, fallback, cancellation, malformed arguments, timeout, and interrupted persistence; run `bun test tests-js/migration`.
- [ ] Run `HERMES_HOME="$(mktemp -d)" bun test tests-js/migration` for persistence and restart cases.
- [ ] Run `scripts/run_tests.sh tests/migration/ tests/agent/ tests/gateway/` with the canonical Python runner.
- [ ] Confirm exact role order, stable system-prompt/cache boundaries, deterministic tool order, one terminal event, and atomic assistant/tool writes.

### Wave 3: Provider, Bridge, and Gateway Parity

- [ ] Add recorded-response conformance tests for non-streaming OpenAI-compatible requests, tool calls, usage, retryable errors, and malformed responses; run `bun test tests-js/migration`.
- [ ] Run `HERMES_HOME="$(mktemp -d)" bun test tests-js/migration` and `HERMES_HOME="$(mktemp -d)" scripts/run_tests.sh tests/migration/` for Python/TypeScript resume and fallback cases.
- [ ] Run `bun run check:monorepo && bun run typecheck:runtime && bun test` before enabling any runtime flag.
- [ ] Verify shadow mode never duplicates provider calls or tool side effects and that unsupported sessions route to Python.

### Wave 4: Rollout and Deletion Review

- [ ] Run `bun run check:monorepo`, `bun run typecheck:runtime`, `bun test`, and `scripts/run_tests.sh` from a clean install.
- [ ] Run migration E2E with a fresh temporary `HERMES_HOME` for chat, tools, cancellation, resume, failure recovery, legacy SQLite data, and gateway event parity.
- [ ] Confirm metrics show no unexplained usage drift, event-order violations, persistence incompatibility, or elevated tool/provider errors.
- [ ] Confirm every applicable deletion gate above and every Final Acceptance Criterion pass before deleting bridge, fallback, compatibility readers, or Python runtime code.

## Recommended Work Slices

Each pull request should migrate one independently testable seam:

1. Contract plus fake implementation.
2. Harness behavior plus deterministic unit tests.
3. Python bridge or TypeScript adapter.
4. Differential/black-box parity tests.
5. Gateway wiring behind disabled-by-default config flag.
6. E2E coverage and `PATCH.md` update.

Avoid PRs that combine contract redesign, several provider ports, persistence migration, and default cutover. Small slices keep rollback possible and make parity failures attributable.
